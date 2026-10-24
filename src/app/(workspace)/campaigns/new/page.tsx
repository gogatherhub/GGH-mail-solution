import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Shell } from "@/components/shell";
import { saveCampaign } from "@/app/actions";
import { rows } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { RichEditor } from "@/components/rich-editor";

export default async function NewCampaign() { const user=await requireAdmin(); const mailboxes=await rows("SELECT id,email FROM mailboxes WHERE status='active'"+(user.role==="admin"?"":" AND id=?"),user.role==="admin"?[]:[Number(user.assigned_mailbox_id)||-1]); return <Shell title="New campaign" subtitle="Draft once, send to an opted-in audience"><form action={saveCampaign} className="card form-card"><div className="form-grid"><label>Campaign name<Input name="name" required placeholder="e.g. October vendor update"/></label><label>Audience<select name="segment" required><option value="vendor">Vendors</option><option value="client">Clients</option><option value="planner">Planners</option></select></label><label>From mailbox<select name="mailbox_id" required><option value="">Select mailbox</option>{mailboxes.map(m=><option key={Number(m.id)} value={Number(m.id)}>{String(m.email)}</option>)}</select></label><label>Subject<Input name="subject" required placeholder="Email subject"/></label></div><label>Message<RichEditor initial="<p>Hi {{name}},</p><p></p>"/><p className="helper">For click tracking, add website links with the editor link button.</p></label><p className="helper">Only contacts marked opted in will be included. A campaign is saved as a draft before it can be queued.</p><div className="form-actions"><SubmitButton className="button primary">Save draft</SubmitButton></div></form></Shell>; }
