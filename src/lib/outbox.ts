import { rows, run, transaction, isDemo, type Row } from "./db";
import { MailRejectedError, sendMail } from "./mail";
import { sendingConfigError } from "./campaign-dispatch";
import { trackedDirectHtml } from "./tracking";
import { reserveSends, renewSend, settleSend } from "./send-budget";
import { recipientCount } from "./send-limits";

type Attachment = { filename: string; content: string; contentType: string };
type QueueInput = { user: Row; mailboxId: number; to: string; name: string; subject: string; body: string; cc: string; bcc: string; conversationId: number; key: string; draftId: string; attachments: Attachment[] };

export async function enqueueEmail(input: QueueInput) {
  return transaction(async tx => {
    if (input.draftId) {
      const [draft] = await tx.rows("SELECT user_id FROM email_drafts WHERE id=?",[input.draftId]);
      if (draft && Number(draft.user_id)!==Number(input.user.id)) throw new Error("Draft unavailable");
    }
    // The key, message and durable job commit together. A repeated submit cannot create another message.
    const claim = await tx.run(isDemo ? "INSERT OR IGNORE INTO send_attempts (idempotency_key,user_id) VALUES (?,?)" : "INSERT IGNORE INTO send_attempts (idempotency_key,user_id) VALUES (?,?)", [input.key, Number(input.user.id)]);
    if (!claim.rowsAffected) {
      const [existing] = await tx.rows("SELECT conversation_id FROM send_attempts WHERE idempotency_key=? AND user_id=?", [input.key, Number(input.user.id)]);
      if (!existing?.conversation_id) throw new Error("Email request unavailable");
      return { conversationId: Number(existing.conversation_id), jobId: 0, repeated: true };
    }
    const [mailbox] = await tx.rows("SELECT email FROM mailboxes WHERE id=? AND status='active'", [input.mailboxId]);
    if (!mailbox) throw new Error("Select an active mailbox");
    let conversationId = input.conversationId;
    if (conversationId) {
      const [existing] = await tx.rows("SELECT co.mailbox_id,ct.email FROM conversations co JOIN contacts ct ON ct.id=co.contact_id WHERE co.id=?", [conversationId]);
      if (!existing || Number(existing.mailbox_id) !== input.mailboxId || String(existing.email).trim().toLowerCase() !== input.to) throw new Error("Conversation unavailable");
    } else {
      let [contact] = await tx.rows("SELECT id FROM contacts WHERE LOWER(TRIM(email))=? ORDER BY id LIMIT 1", [input.to]);
      if (!contact) {
        await tx.run("INSERT IGNORE INTO contacts (name,email,kind) VALUES (?,?,?)", [input.name || input.to, input.to, "client"]);
        [contact] = await tx.rows("SELECT id FROM contacts WHERE LOWER(TRIM(email))=? ORDER BY id LIMIT 1", [input.to]);
      }
      if (!contact) throw new Error("Contact unavailable");
      const created = await tx.run("INSERT INTO conversations (mailbox_id,contact_id,subject) VALUES (?,?,?)", [input.mailboxId, Number(contact.id), input.subject]);
      conversationId = created.lastInsertRowid;
    }
    const message = await tx.run("INSERT INTO messages (conversation_id,direction,sender,recipient,cc,bcc,subject,body_html,status) VALUES (?,'outbound',?,?,?,?,?,?,'queued')", [conversationId, String(mailbox.email), input.to, input.cc, input.bcc, input.subject, input.body]);
    await reserveSends(tx,[{key:`direct:${message.lastInsertRowid}`,channel:"direct",count:recipientCount(input.cc,input.bcc)}]);
    const job = await tx.run("INSERT INTO email_outbox (message_id,user_id,idempotency_key,payload_json) VALUES (?,?,?,?)", [message.lastInsertRowid, Number(input.user.id), input.key, JSON.stringify({ attachments: input.attachments })]);
    await tx.run("UPDATE send_attempts SET conversation_id=?,message_id=?,status='queued' WHERE idempotency_key=?", [conversationId, message.lastInsertRowid, input.key]);
    if (input.draftId) await tx.run("DELETE FROM email_drafts WHERE id=? AND user_id=?", [input.draftId, Number(input.user.id)]);
    return { conversationId, jobId: job.lastInsertRowid, repeated: false };
  });
}

export async function dispatchOutbox(jobId?: number) {
  // A stopped worker may have already reached the provider. Never resend an expired lease automatically.
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString().slice(0,19).replace("T", " ");
  const expired=await rows("SELECT id,message_id,idempotency_key FROM email_outbox WHERE status='processing' AND locked_at<?",[cutoff]);
  for(const item of expired) await transaction(async tx=>{
    const changed=await tx.run("UPDATE email_outbox SET status='needs_review',last_error='Worker stopped before confirmation. Check your provider before retrying.' WHERE id=? AND status='processing' AND locked_at<?",[Number(item.id),cutoff]);
    if(changed.rowsAffected){await tx.run("UPDATE messages SET status='needs_review' WHERE id=? AND status='queued'",[Number(item.message_id)]);await tx.run("UPDATE send_attempts SET status='needs_review' WHERE idempotency_key=?",[String(item.idempotency_key)]);}
  });
  const pending = await rows("SELECT id FROM email_outbox WHERE status='queued'" + (jobId ? " AND id=?" : "") + " ORDER BY id LIMIT 2", jobId ? [jobId] : []);
  let sent = 0, failed = 0;
  for (const item of pending) {
    const id = Number(item.id);
    const claim = await run("UPDATE email_outbox SET status='processing',locked_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=? AND status='queued'", [id]);
    if (!claim.rowsAffected) continue;
    const [job] = await rows("SELECT o.*,m.subject,m.sender,m.recipient,m.cc,m.bcc,m.body_html,m.conversation_id,co.mailbox_id,mb.status mailbox_status,mb.email mailbox_email,u.role,u.assigned_mailbox_id FROM email_outbox o JOIN messages m ON m.id=o.message_id JOIN conversations co ON co.id=m.conversation_id JOIN mailboxes mb ON mb.id=co.mailbox_id LEFT JOIN users u ON u.id=o.user_id WHERE o.id=?", [id]);
    if (!job) { await run("UPDATE email_outbox SET status='failed',last_error='Message no longer exists.',payload_json='{}' WHERE id=?", [id]); failed++; continue; }
    let providerStarted = false;
    try {
      if (!job.role || (job.role !== "admin" && Number(job.assigned_mailbox_id) !== Number(job.mailbox_id)) || job.mailbox_status !== "active" || job.sender !== job.mailbox_email) throw new Error("Mailbox access changed. Ask an administrator to review this email.");
      const configError = sendingConfigError();
      if (configError) throw new Error(configError);
      const payload = JSON.parse(String(job.payload_json)) as { attachments?: Attachment[] };
      const html = trackedDirectHtml(String(job.body_html), Number(job.message_id));
      if(!await renewSend({key:`direct:${job.message_id}`,channel:"direct",count:recipientCount(String(job.cc||""),String(job.bcc||""))})){
        await run("UPDATE email_outbox SET status='queued',last_error='Daily capacity is full. This email will wait for the next worker after reset.' WHERE id=?",[id]);
        continue;
      }
      providerStarted = true;
      const providerId = await sendMail({ from: String(job.sender), to: String(job.recipient), subject: String(job.subject), cc: String(job.cc || ""), bcc: String(job.bcc || ""), html, idempotencyKey: String(job.idempotency_key), attachments: (payload.attachments || []).map(a => ({ ...a, content: Buffer.from(a.content, "base64") })) });
      if (!providerId) throw new Error("Provider did not confirm acceptance");
      await transaction(async tx => {
        await settleSend(tx,`direct:${job.message_id}`,"sent");
        await tx.run("UPDATE messages SET status=CASE WHEN status IN ('queued','failed','needs_review') THEN 'sent' ELSE status END,provider_id=? WHERE id=?", [providerId, Number(job.message_id)]);
        await tx.run("UPDATE email_outbox SET status='sent',sent_at=CURRENT_TIMESTAMP,last_error=NULL,payload_json='{}' WHERE id=?", [id]);
        await tx.run("UPDATE send_attempts SET status='sent' WHERE idempotency_key=?", [String(job.idempotency_key)]);
        await tx.run("UPDATE messages SET status='read' WHERE conversation_id=? AND direction='inbound'",[Number(job.conversation_id)]);
        await tx.run("UPDATE conversations SET last_message_at=CURRENT_TIMESTAMP,unread=0 WHERE id=?", [Number(job.conversation_id)]);
      });
      sent++;
    } catch (error) {
      const smtpCode=Number((error as {responseCode?:number})?.responseCode);
      const rejected=error instanceof MailRejectedError||(smtpCode>=400&&smtpCode<=599)||["MessageRejected","BadRequestException","MailFromDomainNotVerifiedException","AccountSuspendedException"].includes(error instanceof Error?error.name:"");
      const status = providerStarted&&!rejected ? "needs_review" : "failed";
      const message = providerStarted ? rejected?"Provider rejected this email. Check the sender, recipient and mail settings before retrying.":"Provider acceptance could not be confirmed. Check the provider before sending again." : error instanceof Error ? error.message.slice(0,400) : "Unable to prepare email";
      await transaction(async tx => {
        if(!providerStarted||rejected)await settleSend(tx,`direct:${job.message_id}`,"released");
        await tx.run("UPDATE email_outbox SET status=?,last_error=? WHERE id=?", [status, message, id]);
        await tx.run("UPDATE messages SET status=? WHERE id=? AND status='queued'", [status, Number(job.message_id)]);
        await tx.run("UPDATE send_attempts SET status=? WHERE idempotency_key=?", [status, String(job.idempotency_key)]);
      });
      failed++;
    }
  }
  return { sent, failed };
}
