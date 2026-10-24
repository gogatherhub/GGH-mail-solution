"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import sanitizeHtml from "sanitize-html";
import Papa from "papaparse";
import { authenticate, logout, requireAdmin, requireUser } from "@/lib/auth";
import { rows, run, isDemo } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { dispatchCampaignBatch } from "@/lib/campaign-dispatch";

const val = (form: FormData, key: string) => String(form.get(key) || "").trim();
const clean = (html: string) => sanitizeHtml(html, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]), allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ["href", "target", "rel"], img: ["src", "alt"] }, allowedSchemes: ["https", "http", "mailto"] });

export async function loginAction(form: FormData) {
  let valid=false;
  try{valid=await authenticate(val(form, "username"), val(form, "password"))}catch(error){
    const issue=error as {code?:unknown;message?:unknown};
    const safeMessage=typeof issue.message==="string"&&(/^(DATABASE_URL|Set MYSQL_CA_CERT)/).test(issue.message)?issue.message:undefined;
    console.error("Login database error:",typeof issue.code==="string"?issue.code:safeMessage||"UNKNOWN");
    redirect("/login?unavailable=1")
  }
  if (!valid) redirect("/login?error=1");
  redirect("/dashboard");
}
export async function logoutAction() { await logout(); redirect("/login"); }

export async function saveContact(form: FormData) {
  await requireAdmin();
  const id = Number(val(form, "id"));
  const name = val(form, "name"), email = val(form, "email").toLowerCase();
  const kind = val(form, "kind");
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !["client", "vendor", "planner"].includes(kind)) throw new Error("Invalid contact");
  const args = [name, email, val(form, "company"), kind, val(form, "phone"), val(form, "tags"), form.get("consent") ? 1 : 0];
  if (id) await run("UPDATE contacts SET name=?,email=?,company=?,kind=?,phone=?,tags=?,consent=? WHERE id=?", [...args, id]);
  else await run("INSERT INTO contacts (name,email,company,kind,phone,tags,consent) VALUES (?,?,?,?,?,?,?)", args);
  revalidatePath("/contacts"); redirect("/contacts");
}

export async function importContacts(form:FormData){
  await requireAdmin();const file=form.get("file");if(!(file instanceof File)||file.size>2*1024*1024)throw new Error("Upload a CSV under 2 MB");
  const parsed=Papa.parse<Record<string,string>>(await file.text(),{header:true,skipEmptyLines:true});
  if(parsed.errors.length||parsed.data.length>5000)throw new Error("Invalid CSV or more than 5000 rows");
  for(const item of parsed.data){const email=(item.email||"").trim().toLowerCase(),kind=(item.kind||"").trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!["client","vendor","planner"].includes(kind))continue;const consent=["yes","true","1"].includes((item.consent||"").trim().toLowerCase())?1:0;
    await run(isDemo?"INSERT INTO contacts (name,email,company,kind,phone,tags,consent) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,company=excluded.company,kind=excluded.kind,phone=excluded.phone,tags=excluded.tags,consent=CASE WHEN excluded.consent=1 THEN 1 ELSE contacts.consent END":"INSERT INTO contacts (name,email,company,kind,phone,tags,consent) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),company=VALUES(company),kind=VALUES(kind),phone=VALUES(phone),tags=VALUES(tags),consent=CASE WHEN VALUES(consent)=1 THEN 1 ELSE contacts.consent END",[(item.name||email).trim().slice(0,200),email,(item.company||"").trim(),kind,(item.phone||"").trim(),(item.tags||"").trim(),consent]);
  }
  revalidatePath("/contacts");redirect("/contacts");
}

export async function saveUser(form: FormData) {
  await requireAdmin();
  const id = Number(val(form, "id")), username = val(form, "username"), password = val(form, "password");
  const role = val(form, "role");
  if (!username || !["admin", "employee"].includes(role) || (!id && !password)) throw new Error("Invalid user");
  const args = [username, val(form, "name"), val(form, "email"), val(form, "phone"), val(form, "department"), val(form, "job_role"), role, Number(val(form, "assigned_mailbox_id")) || null];
  if (id) {
    await run("UPDATE users SET username=?,name=?,email=?,phone=?,department=?,job_role=?,role=?,assigned_mailbox_id=?,session_version=session_version+1 WHERE id=?", [...args, id]);
    if (password) await run("UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?", [await hash(password, 12), id]);
  } else await run("INSERT INTO users (username,name,email,phone,department,job_role,role,assigned_mailbox_id,password_hash) VALUES (?,?,?,?,?,?,?,?,?)", [...args, await hash(password, 12)]);
  revalidatePath("/users"); redirect("/users");
}

export async function saveMailbox(form: FormData) {
  await requireAdmin();
  const id = Number(val(form, "id"));
  const email = val(form, "email").toLowerCase();
  if (!id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid mailbox email");
  const args = [val(form, "display_name"), val(form, "type"), Number(val(form, "quota_mb")) || 5120, form.get("catch_all") ? 1 : 0, val(form, "status") || "active"];
  if (id) await run("UPDATE mailboxes SET display_name=?,type=?,quota_mb=?,catch_all=?,status=? WHERE id=?", [...args, id]);
  else await run("INSERT INTO mailboxes (email,display_name,type,quota_mb,catch_all,status) VALUES (?,?,?,?,?,?)", [email, ...args]);
  revalidatePath("/email-accounts"); redirect("/email-accounts");
}

export async function saveCampaign(form: FormData) {
  const user = await requireAdmin();
  const name = val(form, "name"), subject = val(form, "subject"), segment = val(form, "segment"), body = clean(val(form, "body_html"));
  const mailbox = Number(val(form, "mailbox_id"));
  if (!name || !subject || !body || !["client", "vendor", "planner"].includes(segment) || !mailbox) throw new Error("Complete all campaign fields");
  if (user.role !== "admin" && Number(user.assigned_mailbox_id) !== mailbox) throw new Error("Mailbox access denied");
  await run("INSERT INTO campaigns (name,subject,body_html,segment,mailbox_id,created_by) VALUES (?,?,?,?,?,?)", [name, subject, body, segment, mailbox, Number(user.id)]);
  revalidatePath("/campaigns"); redirect("/campaigns");
}

export async function queueCampaign(form: FormData) {
  const user = await requireAdmin();
  const id = Number(val(form, "id"));
  const campaign = (await rows("SELECT * FROM campaigns WHERE id=?", [id]))[0];
  if (!campaign || campaign.status !== "draft" || (user.role !== "admin" && Number(user.assigned_mailbox_id) !== Number(campaign.mailbox_id))) throw new Error("Campaign unavailable");
  await run(`INSERT IGNORE INTO campaign_recipients (campaign_id,contact_id) SELECT ?,c.id FROM contacts c LEFT JOIN suppressions s ON s.email=c.email WHERE c.kind=? AND c.consent=1 AND c.status='active' AND s.email IS NULL`, [id, String(campaign.segment)]);
  const count = (await rows("SELECT COUNT(*) AS n FROM campaign_recipients WHERE campaign_id=?", [id]))[0];
  if (!Number(count.n)) throw new Error("No eligible opted-in contacts in this segment");
  await run("UPDATE campaigns SET status='queued' WHERE id=?", [id]);
  revalidatePath("/campaigns"); redirect(`/campaigns/${id}`);
}

export async function pauseCampaign(form: FormData) {
  const user = await requireAdmin(); const id = Number(val(form, "id"));
  const campaign = (await rows("SELECT mailbox_id,status FROM campaigns WHERE id=?", [id]))[0];
  if (!campaign || (user.role !== "admin" && Number(user.assigned_mailbox_id) !== Number(campaign.mailbox_id))) throw new Error("Access denied");
  await run("UPDATE campaigns SET status=? WHERE id=?", [campaign.status === "paused" ? "queued" : "paused", id]);
  revalidatePath(`/campaigns/${id}`);
}

export async function sendCampaignNow(form:FormData){
  await requireAdmin();const id=Number(val(form,"id"));
  if(!Number.isSafeInteger(id)||id<1)throw new Error("Invalid campaign");
  const campaign=(await rows("SELECT status FROM campaigns WHERE id=?",[id]))[0];
  if(!campaign||campaign.status!=="queued")throw new Error("Campaign is not queued");
  await dispatchCampaignBatch(id);
  revalidatePath(`/campaigns/${id}`);revalidatePath("/campaigns");redirect(`/campaigns/${id}`);
}

export async function sendConversation(form: FormData) {
  const user = await requireUser();
  const mailboxId = Number(val(form, "mailbox_id"));
  if (user.role !== "admin" && Number(user.assigned_mailbox_id) !== mailboxId) throw new Error("Mailbox access denied");
  const mailbox = (await rows("SELECT email FROM mailboxes WHERE id=? AND status='active'", [mailboxId]))[0];
  if (!mailbox) throw new Error("Select an active mailbox");
  const to = val(form, "to").toLowerCase(), subject = val(form, "subject"), body = clean(val(form, "body_html"));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !subject || !body) throw new Error("Complete message fields");
  const files=form.getAll("attachments").filter((f):f is File=>f instanceof File&&f.size>0);
  if(files.length>5||files.some(f=>f.size>10*1024*1024)||files.reduce((n,f)=>n+f.size,0)>20*1024*1024)throw new Error("Attach up to 5 files, 10 MB each and 20 MB total");
  const attachments=await Promise.all(files.map(async f=>({filename:f.name.replace(/[^\w. -]/g,"_").slice(0,120),content:Buffer.from(await f.arrayBuffer()),contentType:f.type||"application/octet-stream"})));
  const contact = (await rows("SELECT id FROM contacts WHERE email=?", [to]))[0];
  let contactId = contact?.id;
  if (!contactId) { const created = await run("INSERT INTO contacts (name,email,kind) VALUES (?,?,?)", [val(form,"name").slice(0,200)||to, to, "client"]); contactId = Number(created.lastInsertRowid); }
  const existingId = Number(val(form, "conversation_id"));
  let conversationId = existingId;
  if (existingId) {
    const existing = (await rows("SELECT co.mailbox_id,ct.email contact_email FROM conversations co JOIN contacts ct ON ct.id=co.contact_id WHERE co.id=?", [existingId]))[0];
    if (!existing || Number(existing.mailbox_id) !== mailboxId) throw new Error("Conversation unavailable");
    if(String(existing.contact_email).toLowerCase()!==to)throw new Error("Reply recipient does not match this conversation");
  } else { const created = await run("INSERT INTO conversations (mailbox_id,contact_id,subject) VALUES (?,?,?)", [mailboxId, Number(contactId), subject]); conversationId = Number(created.lastInsertRowid); }
  const message = await run("INSERT INTO messages (conversation_id,direction,sender,recipient,cc,bcc,subject,body_html) VALUES (?,?,?,?,?,?,?,?)", [conversationId, "outbound", String(mailbox.email), to, val(form, "cc"), val(form, "bcc"), subject, body]);
  let providerId: string | undefined;
  try {
    providerId = await sendMail({ from: String(mailbox.email), to, cc: val(form, "cc"), bcc: val(form, "bcc"), subject, html: body,attachments });
  } catch (error) {
    console.error("Email provider send failed:", error instanceof Error ? error.name : "UNKNOWN");
    await run("UPDATE messages SET status='failed' WHERE id=?", [Number(message.lastInsertRowid)]);
    revalidatePath("/conversations");
    const reason=String(mailbox.email).toLowerCase().endsWith("@gmail.com")?"gmail_sender":"provider";
    redirect(`/conversations/${conversationId}?send_error=${reason}`);
  }
  await run("UPDATE messages SET status='sent',provider_id=? WHERE id=?", [providerId, Number(message.lastInsertRowid)]);
  await run("UPDATE conversations SET last_message_at=CURRENT_TIMESTAMP,unread=0 WHERE id=?", [conversationId]);
  revalidatePath("/conversations"); redirect(`/conversations/${conversationId}`);
}

export async function setRead(form: FormData) {
  const user = await requireUser(); const id = Number(val(form, "id")); const unread = val(form, "unread") === "1" ? 1 : 0;
  const item = (await rows("SELECT mailbox_id FROM conversations WHERE id=?", [id]))[0];
  if (!item || (user.role !== "admin" && Number(user.assigned_mailbox_id) !== Number(item.mailbox_id))) throw new Error("Access denied");
  await run("UPDATE conversations SET unread=? WHERE id=?", [unread, id]); revalidatePath("/conversations"); revalidatePath(`/conversations/${id}`);
}

export async function bulkConversations(form:FormData){
  const user=await requireUser();const ids=form.getAll("ids").map(Number).filter(Number.isSafeInteger).filter(x=>x>0).slice(0,100);const action=val(form,"action");
  if(!["read","unread","delete"].includes(action)||!ids.length)throw new Error("Select conversations and an action");
  for(const id of ids){const c=(await rows("SELECT mailbox_id FROM conversations WHERE id=?",[id]))[0];if(!c||(user.role!=="admin"&&Number(user.assigned_mailbox_id)!==Number(c.mailbox_id)))continue;
    if(action==="delete"){await run("DELETE FROM messages WHERE conversation_id=?",[id]);await run("DELETE FROM conversations WHERE id=?",[id])}
    else await run("UPDATE conversations SET unread=? WHERE id=?",[action==="unread"?1:0,id]);
  }
  revalidatePath("/conversations");redirect("/conversations");
}

export async function deleteUser(form:FormData){const admin=await requireAdmin(),id=Number(val(form,"id"));if(id===Number(admin.id))throw new Error("You cannot delete your own account");await run("DELETE FROM users WHERE id=?",[id]);revalidatePath("/users");redirect("/users")}
export async function deleteMailbox(form:FormData){await requireAdmin();const id=Number(val(form,"id"));const used=(await rows("SELECT (SELECT COUNT(*) FROM conversations WHERE mailbox_id=?) + (SELECT COUNT(*) FROM campaigns WHERE mailbox_id=?) + (SELECT COUNT(*) FROM users WHERE assigned_mailbox_id=?) AS n",[id,id,id]))[0];if(Number(used.n))throw new Error("This mailbox is in use; deactivate it instead");await run("DELETE FROM mailboxes WHERE id=?",[id]);revalidatePath("/email-accounts");redirect("/email-accounts")}

export async function updateProfile(form:FormData){const user=await requireUser(),name=val(form,"name"),email=val(form,"email"),phone=val(form,"phone"),password=val(form,"password");if(!name)throw new Error("Name is required");await run("UPDATE users SET name=?,email=?,phone=? WHERE id=?",[name,email,phone,Number(user.id)]);if(password){await run("UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?",[await hash(password,12),Number(user.id)]);await logout()}revalidatePath("/profile");redirect(password?"/login":"/profile")}
