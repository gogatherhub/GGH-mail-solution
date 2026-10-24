import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Shell } from "@/components/shell";
import { DraftComposer } from "@/components/draft-composer";
import { rows } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { draftAllowed, draftFields, emptyDraft, uuidPattern } from "@/lib/drafts";

export default async function Compose({searchParams}:{searchParams:Promise<{forward?:string;to?:string;draft?:string}>}) {
  const user = await requireUser(), p = await searchParams;
  const mailboxes = await rows("SELECT id,email FROM mailboxes WHERE status='active'"+(user.role==="admin"?"":" AND id=?"),user.role==="admin"?[]:[Number(user.assigned_mailbox_id)||-1]);
  let initial = {...emptyDraft,to:(p.to||"").slice(0,255)}, id = randomUUID() as string, revision = 0;
  if (p.draft) {
    if (!uuidPattern.test(p.draft)) notFound();
    const [draft] = await rows("SELECT payload_json,revision FROM email_drafts WHERE id=? AND user_id=?",[p.draft,Number(user.id)]);
    if (!draft) notFound();
    initial = draftFields.parse(JSON.parse(String(draft.payload_json)));
    if (!await draftAllowed(user,initial)) notFound();
    id = p.draft; revision = Number(draft.revision);
  } else if (p.forward) {
    const [conversation] = await rows("SELECT mailbox_id FROM conversations WHERE id=?",[Number(p.forward)]);
    if (!conversation || (user.role!=="admin"&&Number(conversation.mailbox_id)!==Number(user.assigned_mailbox_id))) notFound();
    const [original] = await rows("SELECT subject,body_html FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1",[Number(p.forward)]);
    if (original) { initial.subject=`Fwd: ${String(original.subject)}`; initial.body_html=`<p><br></p><hr><p>Forwarded message:</p>${String(original.body_html)}`; }
  }
  return <Shell title={p.draft?"Continue draft":"New conversation"} subtitle="Write at your pace. Send without waiting."><DraftComposer key={id} id={id} initial={initial} revision={revision} mailboxes={mailboxes.map(mailbox=>({id:Number(mailbox.id),email:String(mailbox.email)}))}/></Shell>;
}