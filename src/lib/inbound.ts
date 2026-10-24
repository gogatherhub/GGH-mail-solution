import sanitizeHtml from "sanitize-html";
import { rows, run } from "./db";

function address(input:string){return (input.match(/<([^<>]+@[^<>]+)>/)?.[1]||input).trim().toLowerCase()}
function topic(input:string){return input.replace(/^(?:(?:re|fw|fwd):\s*)+/gi,"").trim().toLowerCase()}
export async function recordInboundMessage(body:{from:string;to:string;recipients?:string[];subject:string;html?:string|null;text?:string|null;name?:string;messageId?:string}){
  const from=address(body.from),subject=String(body.subject||"(no subject)").slice(0,500);
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from))throw new Error("Invalid sender");
  const recipients=[body.to,...(body.recipients||[])].map(address).filter(Boolean);
  let mailbox:null|{id:string|number;email:string}=null;
  for(const recipient of recipients){const found=(await rows("SELECT id,email FROM mailboxes WHERE email=? AND status='active' LIMIT 1",[recipient]))[0];if(found){mailbox={id:found.id as string|number,email:String(found.email)};break}}
  if(!mailbox)for(const recipient of recipients){const domain=recipient.split("@")[1];if(!domain)continue;const found=(await rows("SELECT id,email FROM mailboxes WHERE catch_all=1 AND status='active' AND email LIKE ? ORDER BY id LIMIT 1",[`%@${domain}`]))[0];if(found){mailbox={id:found.id as string|number,email:String(found.email)};break}}
  if(!mailbox)throw new Error("Mailbox not found");
  const messageId=String(body.messageId||"").slice(0,255);
  if(messageId){const existing=(await rows("SELECT conversation_id FROM messages WHERE provider_id=? AND direction='inbound' LIMIT 1",[messageId]))[0];if(existing)return Number(existing.conversation_id)}
  const html=body.html?.trim()?sanitizeHtml(body.html,{allowedTags:sanitizeHtml.defaults.allowedTags,allowedAttributes:sanitizeHtml.defaults.allowedAttributes}):sanitizeHtml(body.text||"",{allowedTags:[],allowedAttributes:{}}).replace(/\r?\n/g,"<br>");
  let contact=(await rows("SELECT id FROM contacts WHERE email=?",[from]))[0];if(!contact){try{const result=await run("INSERT INTO contacts (name,email,kind) VALUES (?,?,?)",[String(body.name||from).slice(0,200),from,"client"]);contact={id:Number(result.lastInsertRowid)}}catch(error){if((error as {code?:string}).code!=="ER_DUP_ENTRY")throw error;contact=(await rows("SELECT id FROM contacts WHERE email=?",[from]))[0]}}
  const recent=await rows("SELECT id,subject FROM conversations WHERE mailbox_id=? AND contact_id=? ORDER BY id DESC LIMIT 30",[Number(mailbox.id),Number(contact.id)]);
  const existing=recent.find(item=>topic(String(item.subject))===topic(subject));
  let conversationId=Number(existing?.id||0);
  if(!conversationId){const result=await run("INSERT INTO conversations (mailbox_id,contact_id,subject,unread) VALUES (?,?,?,1)",[Number(mailbox.id),Number(contact.id),subject]);conversationId=Number(result.lastInsertRowid)}
  await run("INSERT INTO messages (conversation_id,direction,sender,recipient,subject,body_html,status,provider_id) VALUES (?,'inbound',?,?,?,?, 'received',?)",[conversationId,from,mailbox.email,subject,html||"<p>(empty message)</p>",messageId||null]);
  await run("UPDATE conversations SET unread=1,last_message_at=CURRENT_TIMESTAMP WHERE id=?",[conversationId]);
  return conversationId;
}
