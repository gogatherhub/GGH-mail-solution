import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell, Badge, Empty } from "@/components/shell";
import { rows } from "@/lib/db";
import { saveContact } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";

export default async function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id=Number((await params).id);const c=(await rows("SELECT * FROM contacts WHERE id=?",[id]))[0];if(!c)notFound();
  const history=await rows("SELECT cr.*,ca.name campaign,ca.subject FROM campaign_recipients cr JOIN campaigns ca ON ca.id=cr.campaign_id WHERE cr.contact_id=? ORDER BY ca.created_at DESC",[id]);
  const direct=(await rows("SELECT COUNT(DISTINCT CASE WHEN m.status IN ('sent','delivered') THEN m.id END) sent,COUNT(DISTINCT CASE WHEN ev.type='open' THEN m.id END) opened,COUNT(DISTINCT CASE WHEN ev.type='click' THEN m.id END) clicked,COUNT(DISTINCT CASE WHEN m.status='delivered' THEN m.id END) delivered FROM messages m JOIN conversations co ON co.id=m.conversation_id LEFT JOIN email_events ev ON ev.message_id=m.id WHERE co.contact_id=? AND m.direction='outbound'",[id]))[0];
  const campaignSent=history.filter(h=>h.sent_at).length,opened=history.filter(h=>h.opened_at).length+Number(direct.opened||0),clicked=history.filter(h=>h.clicked_at).length+Number(direct.clicked||0),delivered=history.filter(h=>h.delivered_at).length+Number(direct.delivered||0),sent=campaignSent+Number(direct.sent||0);
  return <Shell title={String(c.name)} subtitle={`${String(c.kind)} · ${String(c.email)}`}>
    <div className="stat-grid contact-stats"><Metric label="Total emails sent" value={sent}/><Metric label="Campaign emails" value={campaignSent}/><Metric label="Unique opens*" value={opened}/><Metric label="Click rate" value={`${(delivered||sent)?((clicked/(delivered||sent))*100).toFixed(1):"0.0"}%`}/></div>
    <div className="two-col"><section className="card form-card"><div className="card-head"><h2>Contact details</h2></div><form action={saveContact} className="stack"><input type="hidden" name="id" value={id}/><div className="form-grid"><label>Name<input name="name" defaultValue={String(c.name)} required/></label><label>Email<input name="email" type="email" defaultValue={String(c.email)} required/></label><label>Category<select name="kind" defaultValue={String(c.kind)}><option value="client">Client</option><option value="vendor">Vendor</option><option value="planner">Planner</option></select></label><label>Company<input name="company" defaultValue={String(c.company||"")}/></label><label>Phone<input name="phone" defaultValue={String(c.phone||"")}/></label><label>Tags<input name="tags" defaultValue={String(c.tags||"")}/></label></div><label className="check"><input type="checkbox" name="consent" defaultChecked={Boolean(c.consent)}/> Opted in to campaign emails</label><button className="button primary">Save changes</button></form></section>
    <section className="card"><div className="card-head"><div><h2>Email activity</h2><p>Campaign history for this contact</p></div></div>{history.length?<div className="rows">{history.map(h=><Link href={`/campaigns/${h.campaign_id}`} className="activity-row" key={Number(h.id)}><strong>{String(h.campaign)}</strong><small>{String(h.subject)}</small><div className="badge-line"><Badge tone={h.sent_at?"success":"neutral"}>{h.sent_at?"Sent":"Queued"}</Badge>{h.opened_at&&<Badge tone="blue">Opened*</Badge>}{h.clicked_at&&<Badge tone="success">Clicked</Badge>}</div></Link>)}</div>:<Empty title="No campaign emails yet" text="Email activity will appear when this contact receives a campaign."/>}<p className="footnote pad">* Opens are estimates because some mail apps preload images.</p></section></div>
  </Shell>;
}
function Metric({label,value}:{label:string;value:number|string}){return <div className="stat-card compact"><span className="stat-value">{value}</span><strong>{label}</strong></div>}
