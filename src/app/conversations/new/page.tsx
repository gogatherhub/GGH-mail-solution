import { Shell } from "@/components/shell";
import { rows } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendConversation } from "@/app/actions";
import { RichEditor } from "@/components/rich-editor";
import Link from "next/link";

export default async function Compose({searchParams}:{searchParams:Promise<{forward?:string;to?:string}>}){
  const user=await requireUser(),p=await searchParams;
  const mailboxes=await rows("SELECT id,email FROM mailboxes WHERE status='active'"+(user.role==="admin"?"":" AND id=?"),user.role==="admin"?[]:[Number(user.assigned_mailbox_id)||-1]);
  let subject="",body="";
  if(p.forward){
    const access=(await rows("SELECT mailbox_id FROM conversations WHERE id=?",[Number(p.forward)]))[0];
    if(access&&(user.role==="admin"||Number(access.mailbox_id)===Number(user.assigned_mailbox_id))){
      const original=(await rows("SELECT subject,body_html FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1",[Number(p.forward)]))[0];
      if(original){subject=`Fwd: ${String(original.subject)}`;body=`<p><br></p><hr><p>Forwarded message:</p>${String(original.body_html)}`}
    }
  }
  return <Shell title="New conversation"><form action={sendConversation} className="card compose-card"><div className="card-head"><div><h2>Compose</h2><p>Send a new email from your mailbox</p></div><button className="button primary">Send</button></div><div className="compose-fields"><label><span>From</span><select name="mailbox_id" required><option value="">Select mailbox</option>{mailboxes.map(m=><option key={Number(m.id)} value={Number(m.id)}>{String(m.email)}</option>)}</select></label><label><span>To</span><input type="email" name="to" defaultValue={p.to||""} required placeholder="recipient@example.com"/></label><label><span>Name</span><input name="name" placeholder="Optional contact name"/></label><label><span>Cc</span><input name="cc" placeholder="Optional, comma separated"/></label><label><span>Bcc</span><input name="bcc" placeholder="Optional, comma separated"/></label><label><span>Subject</span><input name="subject" defaultValue={subject} required placeholder="What is this email about?"/></label><div className="compose-editor"><RichEditor initial={body}/></div><label className="compose-attachment"><span>Attachments</span><input type="file" name="attachments" multiple/></label><p className="helper">Up to 5 files, 10 MB each and 20 MB total.</p><div className="form-actions"><button className="button primary">Send email</button><Link className="button secondary" href="/conversations">Cancel</Link></div></div></form></Shell>
}
