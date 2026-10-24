import sanitizeHtml from "sanitize-html";
import { rows, run } from "./db";

function address(input:string){return (input.match(/<([^<>]+@[^<>]+)>/)?.[1]||input).trim().toLowerCase()}
export async function recordInboundMessage(body:{from:string;to:string;subject:string;html?:string|null;text?:string|null;name?:string;messageId?:string}){
  const from=address(body.from),to=address(body.to),subject=String(body.subject||"(no subject)").slice(0,500),html=sanitizeHtml(String(body.html||body.text||""),{allowedTags:sanitizeHtml.defaults.allowedTags,allowedAttributes:sanitizeHtml.defaults.allowedAttributes});
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)||!to||!html)throw new Error("Invalid message");
  const mailbox=(await rows("SELECT id FROM mailboxes WHERE email=? AND status='active'",[to]))[0];if(!mailbox)throw new Error("Mailbox not found");
  if(body.messageId){const existing=(await rows("SELECT conversation_id FROM messages WHERE provider_id=? AND direction='inbound' LIMIT 1",[body.messageId]))[0];if(existing)return Number(existing.conversation_id)}
  let contact=(await rows("SELECT id FROM contacts WHERE email=?",[from]))[0];if(!contact){const result=await run("INSERT INTO contacts (name,email,kind) VALUES (?,?,?)",[String(body.name||from).slice(0,200),from,"client"]);contact={id:Number(result.lastInsertRowid)}}
  const normalized=subject.replace(/^(re:|fwd:)\s*/gi,"").trim();const existing=(await rows("SELECT id FROM conversations WHERE mailbox_id=? AND contact_id=? AND subject LIKE ? ORDER BY id DESC LIMIT 1",[Number(mailbox.id),Number(contact.id),`%${normalized}`]))[0];let conversationId=Number(existing?.id||0);
  if(!conversationId){const result=await run("INSERT INTO conversations (mailbox_id,contact_id,subject,unread) VALUES (?,?,?,1)",[Number(mailbox.id),Number(contact.id),subject]);conversationId=Number(result.lastInsertRowid)}
  await run("INSERT INTO messages (conversation_id,direction,sender,recipient,subject,body_html,status,provider_id) VALUES (?,'inbound',?,?,?,?, 'received',?)",[conversationId,from,to,subject,html,String(body.messageId||"")]);
  await run("UPDATE conversations SET unread=1,last_message_at=CURRENT_TIMESTAMP WHERE id=?",[conversationId]);
  return conversationId;
}
