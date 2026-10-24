"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import sanitizeHtml from "sanitize-html";
import { importContactCsv } from "@/lib/contact-import";
import { authenticate, logout, requireAdmin, requireUser } from "@/lib/auth";
import { rows, run } from "@/lib/db";
import { after } from "next/server";
import { enqueueEmail, dispatchOutbox } from "@/lib/outbox";
import { dispatchCampaignBatch,campaignReservationJoin } from "@/lib/campaign-dispatch";
import { reserveCampaignSelection } from "@/lib/campaign-selection";
import { SendBudgetError,preserveDeletedEmailBudget } from "@/lib/send-budget";

const val = (form: FormData, key: string) => String(form.get(key) || "").trim();
const selectedIds=(form:FormData)=>[...new Set(form.getAll("ids").map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,100);
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
  const [existing] = await rows("SELECT id FROM contacts WHERE LOWER(TRIM(email))=? AND id<>? ORDER BY id LIMIT 1",[email,id||0]);
  if (existing) redirect(id?`/contacts/${id}?contact_error=duplicate`:`/contacts/${existing.id}?notice=contact_exists`);
  const args = [name, email, val(form, "company"), kind, val(form, "phone"), val(form, "tags"), form.get("consent") ? 1 : 0];
  if (id) await run("UPDATE contacts SET name=?,email=?,company=?,kind=?,phone=?,tags=?,consent=? WHERE id=?", [...args, id]);
  else await run("INSERT INTO contacts (name,email,company,kind,phone,tags,consent) VALUES (?,?,?,?,?,?,?)", args);
  revalidatePath("/contacts"); redirect("/contacts?notice=contact_saved");
}

export async function importContacts(form: FormData) {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size>2*1024*1024) throw new Error("Upload a CSV under 2 MB");
  const result = await importContactCsv(await file.text());
  revalidatePath("/contacts");
  redirect(`/contacts?imported=${result.inserted}&duplicates=${result.duplicates}&invalid=${result.invalid}`);
}
export async function saveUser(form: FormData) {
  await requireAdmin();
  const id = Number(val(form, "id")), username = val(form, "username"), password = val(form, "password");
  const role = val(form, "role");
  if (!username || !["admin", "employee"].includes(role) || (!id && !password)) throw new Error("Invalid user");
  if (password && password.length<12) throw new Error("Use a password with at least 12 characters");
  const args = [username, val(form, "name"), val(form, "email"), val(form, "phone"), val(form, "department"), val(form, "job_role"), role, Number(val(form, "assigned_mailbox_id")) || null];
  if (id) {
    await run("UPDATE users SET username=?,name=?,email=?,phone=?,department=?,job_role=?,role=?,assigned_mailbox_id=?,session_version=session_version+1 WHERE id=?", [...args, id]);
    if (password) await run("UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?", [await hash(password, 12), id]);
  } else await run("INSERT INTO users (username,name,email,phone,department,job_role,role,assigned_mailbox_id,password_hash) VALUES (?,?,?,?,?,?,?,?,?)", [...args, await hash(password, 12)]);
  revalidatePath("/users"); redirect(`/users?notice=${id ? "user_updated" : "user_created"}`);
}

export async function saveMailbox(form: FormData) {
  await requireAdmin();
  const id = Number(val(form, "id"));
  const email = val(form, "email").toLowerCase();
  if (!id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid mailbox email");
  const args = [val(form, "display_name"), val(form, "type"), Number(val(form, "quota_mb")) || 5120, form.get("catch_all") ? 1 : 0, val(form, "status") || "active"];
  if (id) await run("UPDATE mailboxes SET display_name=?,type=?,quota_mb=?,catch_all=?,status=? WHERE id=?", [...args, id]);
  else await run("INSERT INTO mailboxes (email,display_name,type,quota_mb,catch_all,status) VALUES (?,?,?,?,?,?)", [email, ...args]);
  revalidatePath("/email-accounts"); redirect("/email-accounts?notice=mailbox_saved");
}

export async function saveCampaign(form: FormData) {
  const user = await requireAdmin();
  const name = val(form, "name"), subject = val(form, "subject"), segment = val(form, "segment"), body = clean(val(form, "body_html"));
  const mailbox = Number(val(form, "mailbox_id"));
  if (!name || !subject || !body || !["client", "vendor", "planner"].includes(segment) || !mailbox) throw new Error("Complete all campaign fields");
  if (user.role !== "admin" && Number(user.assigned_mailbox_id) !== mailbox) throw new Error("Mailbox access denied");
  await run("INSERT INTO campaigns (name,subject,body_html,segment,mailbox_id,created_by) VALUES (?,?,?,?,?,?)", [name, subject, body, segment, mailbox, Number(user.id)]);
  revalidatePath("/campaigns"); redirect("/campaigns?notice=campaign_saved");
}

function startCampaignWorker(id:number){
  after(async()=>{
    try{await dispatchCampaignBatch(id);}catch{console.error("Campaign worker interrupted; reserved recipients remain available for review.");}
    for(const path of ["/campaigns",`/campaigns/${id}`,"/analytics","/dashboard","/contacts"])revalidatePath(path);
  });
}
export async function queueCampaign(form:FormData){
  await requireAdmin();const id=Number(val(form,"id"));
  if(!Number.isSafeInteger(id)||id<1)return {error:"Campaign unavailable"};
  try{await reserveCampaignSelection(id,Number(val(form,"send_count")),true);}
  catch(error){if(error instanceof SendBudgetError)return {error:error.message};throw error;}
  startCampaignWorker(id);revalidatePath("/campaigns");redirect(`/campaigns/${id}?notice=campaign_started`);
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
  if(!Number.isSafeInteger(id)||id<1)return {error:"Campaign unavailable"};
  if(form.get("continue_reserved")){
    const join=campaignReservationJoin;
    const [pending]=await rows(`SELECT COUNT(*) n FROM campaign_recipients cr JOIN campaigns ca ON ca.id=cr.campaign_id JOIN email_send_reservations r ON ${join} WHERE ca.id=? AND ca.status='queued' AND cr.status='queued' AND r.status='reserved'`,[id]);
    if(!Number(pending?.n||0))return {error:"No reserved recipients are waiting. Refresh the page."};
  }else{
    try{await reserveCampaignSelection(id,Number(val(form,"send_count")),false);}
    catch(error){if(error instanceof SendBudgetError)return {error:error.message};throw error;}
  }
  startCampaignWorker(id);revalidatePath(`/campaigns/${id}`);redirect(`/campaigns/${id}?notice=campaign_started`);
}
export async function sendConversation(form: FormData) {
  const user = await requireUser();
  const mailboxId = Number(val(form, "mailbox_id"));
  if (user.role !== "admin" && Number(user.assigned_mailbox_id) !== mailboxId) throw new Error("Mailbox access denied");
  const to = val(form, "to").toLowerCase(), subject = val(form, "subject").slice(0,500), body = clean(val(form, "body_html"));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !subject || !body || body.length > 400_000) throw new Error("Complete message fields");
  for (const field of ["cc", "bcc"]) {
    const addresses = val(form, field).split(",").map(value => value.trim()).filter(Boolean);
    if (addresses.length > 50 || addresses.some(address => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))) throw new Error("Invalid copy recipients");
  }
  const files = form.getAll("attachments").filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length > 5 || files.some(file => file.size > 10*1024*1024) || files.reduce((size,file) => size+file.size,0) > 20*1024*1024) throw new Error("Attach up to 5 files, 10 MB each and 20 MB total");
  const suppliedKey = val(form, "idempotency_key");
  const key = /^[0-9a-f-]{36}$/i.test(suppliedKey) ? suppliedKey : randomUUID();
  const draftId = val(form, "draft_id");
  if (draftId && draftId !== key) throw new Error("Draft request mismatch");
  const attachments = await Promise.all(files.map(async file => ({ filename: file.name.replace(/[^\w. -]/g,"_").slice(0,120), content: Buffer.from(await file.arrayBuffer()).toString("base64"), contentType: file.type || "application/octet-stream" })));
  let queued:Awaited<ReturnType<typeof enqueueEmail>>;
  try{queued = await enqueueEmail({ user, mailboxId, to, name: val(form,"name").slice(0,200), subject, body, cc: val(form,"cc"), bcc: val(form,"bcc"), conversationId: Number(val(form,"conversation_id")) || 0, key, draftId, attachments });}
  catch(error){if(error instanceof SendBudgetError)return {error:error.message};throw error;}
  if (queued.jobId) after(async () => {
    try { await dispatchOutbox(queued.jobId); }
    catch { console.error("Outbox worker interrupted; queued email remains available for review."); }
    revalidatePath("/outbox"); revalidatePath("/contacts"); revalidatePath("/conversations"); revalidatePath(`/conversations/${queued.conversationId}`); revalidatePath("/dashboard"); revalidatePath("/analytics");
  });
  revalidatePath("/outbox"); revalidatePath("/drafts"); revalidatePath("/conversations");
  redirect(`/outbox?notice=${queued.repeated ? "email_already_queued" : "email_queued"}`);
}
export async function setRead(form: FormData) {
  const user = await requireUser(); const id = Number(val(form, "id")); const unread = val(form, "unread") === "1" ? 1 : 0;
  const item = (await rows("SELECT c.mailbox_id,(SELECT m.direction FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_direction FROM conversations c WHERE c.id=?", [id]))[0];
  if (!item || (user.role !== "admin" && Number(user.assigned_mailbox_id) !== Number(item.mailbox_id))) throw new Error("Access denied");
  if(item.last_direction!=="inbound")return;
  await run("UPDATE messages SET status=? WHERE conversation_id=? AND direction='inbound'",[unread?"received":"read",id]);
  await run("UPDATE conversations SET unread=? WHERE id=?", [unread, id]); revalidatePath("/conversations"); revalidatePath(`/conversations/${id}`);revalidatePath("/dashboard");
}

export async function bulkConversations(form:FormData){
  const user=await requireUser();const ids=form.getAll("ids").map(Number).filter(Number.isSafeInteger).filter(x=>x>0).slice(0,100);const action=val(form,"action");
  if(!["read","unread","delete"].includes(action))throw new Error("Invalid conversation action");
  if(!ids.length)redirect("/conversations");
  for(const id of ids){const c=(await rows("SELECT co.mailbox_id,(SELECT m.direction FROM messages m WHERE m.conversation_id=co.id ORDER BY m.id DESC LIMIT 1) last_direction FROM conversations co WHERE co.id=?",[id]))[0];if(!c||(user.role!=="admin"&&Number(user.assigned_mailbox_id)!==Number(c.mailbox_id)))continue;
    if(action==="delete"){
      await preserveDeletedEmailBudget(id);
      await run("DELETE FROM email_events WHERE message_id IN (SELECT id FROM messages WHERE conversation_id=?)",[id]);
      await run("DELETE FROM send_attempts WHERE conversation_id=?",[id]);
      await run("DELETE FROM email_outbox WHERE message_id IN (SELECT id FROM messages WHERE conversation_id=?)",[id]);
      await run("DELETE FROM messages WHERE conversation_id=?",[id]);
      await run("DELETE FROM conversations WHERE id=?",[id]);
    }
    else if(c.last_direction==="inbound"){await run("UPDATE messages SET status=? WHERE conversation_id=? AND direction='inbound'",[action==="unread"?"received":"read",id]);await run("UPDATE conversations SET unread=? WHERE id=?",[action==="unread"?1:0,id])}
  }
  revalidatePath("/conversations");revalidatePath("/dashboard");redirect("/conversations");
}

export async function deleteUser(form:FormData){const admin=await requireAdmin(),id=Number(val(form,"id"));if(id===Number(admin.id))throw new Error("You cannot delete your own account");await run("DELETE FROM users WHERE id=?",[id]);revalidatePath("/users");redirect("/users")}
export async function deleteMailbox(form:FormData){await requireAdmin();const id=Number(val(form,"id"));const used=(await rows("SELECT (SELECT COUNT(*) FROM conversations WHERE mailbox_id=?) + (SELECT COUNT(*) FROM campaigns WHERE mailbox_id=?) + (SELECT COUNT(*) FROM users WHERE assigned_mailbox_id=?) AS n",[id,id,id]))[0];if(Number(used.n))throw new Error("This mailbox is in use; deactivate it instead");await run("DELETE FROM mailboxes WHERE id=?",[id]);revalidatePath("/email-accounts");redirect("/email-accounts")}

export async function bulkDeleteUsers(form:FormData){
  const admin=await requireAdmin(),ids=selectedIds(form);
  if(!ids.length)redirect("/users");
  await run(`DELETE FROM users WHERE id IN (${ids.map(()=>"?").join(",")}) AND id<>?`,[...ids,Number(admin.id)]);
  revalidatePath("/users");redirect(ids.includes(Number(admin.id))?"/users?bulk_notice=self_skipped":"/users");
}

export async function bulkDeleteMailboxes(form:FormData){
  await requireAdmin();const ids=selectedIds(form);
  if(!ids.length)redirect("/email-accounts");
  const selected=ids.map(()=>"?").join(",");
  const used=await rows(`SELECT id FROM mailboxes m WHERE m.id IN (${selected}) AND (EXISTS (SELECT 1 FROM conversations c WHERE c.mailbox_id=m.id) OR EXISTS (SELECT 1 FROM campaigns ca WHERE ca.mailbox_id=m.id) OR EXISTS (SELECT 1 FROM users u WHERE u.assigned_mailbox_id=m.id))`,ids);
  const blocked=new Set(used.map(item=>Number(item.id))),deletable=ids.filter(id=>!blocked.has(id));
  if(deletable.length)await run(`DELETE FROM mailboxes WHERE id IN (${deletable.map(()=>"?").join(",")})`,deletable);
  revalidatePath("/email-accounts");redirect(blocked.size?"/email-accounts?bulk_notice=in_use":"/email-accounts");
}

export async function bulkDeleteContacts(form:FormData){
  await requireAdmin();const ids=selectedIds(form);
  if(!ids.length)redirect("/contacts");
  const used=await rows(`SELECT id FROM contacts ct WHERE ct.id IN (${ids.map(()=>"?").join(",")}) AND (EXISTS (SELECT 1 FROM conversations co WHERE co.contact_id=ct.id) OR EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.contact_id=ct.id))`,ids);
  const blocked=new Set(used.map(item=>Number(item.id))),deletable=ids.filter(id=>!blocked.has(id));
  if(deletable.length)await run(`DELETE FROM contacts WHERE id IN (${deletable.map(()=>"?").join(",")})`,deletable);
  revalidatePath("/contacts");redirect(blocked.size?"/contacts?bulk_notice=in_use":"/contacts");
}

export async function updateProfile(form:FormData){const user=await requireUser(),name=val(form,"name"),email=val(form,"email"),phone=val(form,"phone"),password=val(form,"password");if(!name)throw new Error("Name is required");if(password&&password.length<12)throw new Error("Use a password with at least 12 characters");await run("UPDATE users SET name=?,email=?,phone=? WHERE id=?",[name,email,phone,Number(user.id)]);if(password){await run("UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?",[await hash(password,12),Number(user.id)]);await logout()}revalidatePath("/profile");redirect(password?"/login":"/profile?notice=profile_saved")}
