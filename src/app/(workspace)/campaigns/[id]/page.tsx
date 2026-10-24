import { SubmitButton } from "@/components/submit-button";
import { CampaignSendControls } from "@/components/campaign-send-controls";
import { notFound } from "next/navigation";
import { Shell,Badge,Empty } from "@/components/shell";
import { rows } from "@/lib/db";
import { pauseCampaign } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { sendingConfigError,campaignReservationJoin } from "@/lib/campaign-dispatch";
import { sendingBudget } from "@/lib/send-budget";

export const maxDuration=60;
export default async function CampaignDetail({params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);await requireAdmin();
  if(!Number.isSafeInteger(id)||id<1)notFound();
  const [campaign]=await rows("SELECT ca.*,m.email mailbox FROM campaigns ca LEFT JOIN mailboxes m ON m.id=ca.mailbox_id WHERE ca.id=?",[id]);
  if(!campaign)notFound();
  const configError=sendingConfigError();
  const [eligible,stats,recipients,budget,queued]=await Promise.all([
    rows("SELECT COUNT(*) n FROM contacts c LEFT JOIN suppressions s ON LOWER(s.email)=LOWER(c.email) WHERE c.kind=? AND c.consent=1 AND c.status='active' AND s.email IS NULL",[String(campaign.segment)]),
    rows("SELECT COUNT(*) total,SUM(CASE WHEN sent_at IS NOT NULL THEN 1 ELSE 0 END) sent,SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) delivered,SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) opened,SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) clicked,SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) bounced,SUM(CASE WHEN status='complaint' THEN 1 ELSE 0 END) complaints FROM campaign_recipients WHERE campaign_id=?",[id]),
    rows("SELECT cr.*,c.name,c.email FROM campaign_recipients cr JOIN contacts c ON c.id=cr.contact_id WHERE cr.campaign_id=? ORDER BY cr.id DESC LIMIT 100",[id]),
    sendingBudget(),
    rows(`SELECT SUM(CASE WHEN r.status='reserved' THEN 1 ELSE 0 END) reserved,SUM(CASE WHEN r.send_key IS NULL OR r.status='released' THEN 1 ELSE 0 END) unreserved FROM campaign_recipients cr JOIN contacts c ON c.id=cr.contact_id LEFT JOIN email_send_reservations r ON ${campaignReservationJoin} LEFT JOIN suppressions s ON LOWER(s.email)=LOWER(c.email) WHERE cr.campaign_id=? AND cr.status='queued' AND c.consent=1 AND c.status='active' AND s.email IS NULL`,[id]),
  ]);
  const summary=stats[0]||{},sent=Number(summary.sent||0),delivered=Number(summary.delivered||0);
  return <Shell title={String(campaign.name)} subtitle={`${String(campaign.segment)} campaign · ${String(campaign.mailbox)}`}>
    <div className="campaign-hero card"><div><Badge tone={campaign.status==="queued"?"blue":campaign.status==="paused"?"warning":"neutral"}>{String(campaign.status)}</Badge><h2>{String(campaign.subject)}</h2><p>Send only to the number of opted-in contacts you select.</p></div>{["queued","paused"].includes(String(campaign.status))&&<form action={pauseCampaign}><input name="id" type="hidden" value={id}/><SubmitButton variant="outline">{campaign.status==="paused"?"Resume":"Pause"} campaign</SubmitButton></form>}</div>
    {configError&&<p className="form-error">{configError}. Campaign sending is unavailable until configured.</p>}
    {campaign.status==="draft"&&!Number(eligible[0]?.n||0)&&<p className="form-error">No eligible opted-in {String(campaign.segment)} contacts. Enable campaign consent for the intended recipients, then refresh.</p>}
    <CampaignSendControls campaignId={id} stage={String(campaign.status)} eligible={campaign.status==="draft"?Number(eligible[0]?.n||0):Number(queued[0]?.unreserved||0)} reserved={Number(queued[0]?.reserved||0)} initial={budget} disabled={Boolean(configError)}/>
    <div className="stat-grid"><Metric label="Selected recipients" value={Number(summary.total||0)}/><Metric label="Sent" value={sent}/><Metric label="Delivered" value={delivered}/><Metric label="Unique opens*" value={Number(summary.opened||0)}/><Metric label="Unique clicks" value={Number(summary.clicked||0)}/><Metric label="Click rate" value={`${(delivered||sent)?((Number(summary.clicked||0)/(delivered||sent))*100).toFixed(1):"0.0"}%`}/></div>
    <div className="two-col"><section className="card"><div className="card-head"><div><h2>Recipients</h2><p>Each selected recipient and their delivery status.</p></div></div>{recipients.length?<div className="table-wrap"><table><thead><tr><th>Contact</th><th>Status</th><th>Opened*</th><th>Clicked</th></tr></thead><tbody>{recipients.map(recipient=><tr key={Number(recipient.id)}><td><strong>{String(recipient.name)}</strong><small className="block">{String(recipient.email)}</small></td><td><Badge tone={["bounced","complaint","failed","needs_review"].includes(String(recipient.status))?"danger":recipient.status==="delivered"?"success":"neutral"}>{String(recipient.status).replaceAll("_"," ")}</Badge></td><td>{recipient.opened_at?"Yes":"—"}</td><td>{recipient.clicked_at?"Yes":"—"}</td></tr>)}</tbody></table></div>:<Empty title="Choose your first recipients" text="Enter a send count above to reserve just that many eligible contacts."/>}</section><section className="card form-card"><div className="card-head"><h2>Message preview</h2></div><div className="email-preview" dangerouslySetInnerHTML={{__html:String(campaign.body_html)}}/><div className="health-row"><span>Bounces: {Number(summary.bounced||0)}</span><span>Complaints: {Number(summary.complaints||0)}</span></div><p className="footnote">* Opens are estimates. Click rate uses delivered recipients when available, otherwise sent recipients.</p></section></div>
  </Shell>;
}
function Metric({label,value}:{label:string;value:number|string}){return <div className="stat-card compact"><span className="stat-value">{value}</span><strong>{label}</strong></div>;}