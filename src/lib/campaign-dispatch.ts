import { randomUUID } from "node:crypto";
import { rows,run,transaction,isDemo } from "./db";
import { mailWasRejected,sendMail,sendCampaignMailBatch } from "./mail";
import { trackedHtml } from "./tracking";
import { appOrigin } from "./app-url";
import { reserveSends,settleSends } from "./send-budget";
import { DAILY_SEND_LIMIT } from "./send-limits";

export function sendingConfigError(){
  if(!process.env.RESEND_API_KEY&&!process.env.AWS_REGION&&!(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD))return "Set RESEND_API_KEY before sending";
  try{appOrigin()}catch{return "Set APP_URL to your deployed HTTPS domain";}
  return null;
}
export const campaignReservationJoin=isDemo?"r.send_key=('campaign:'||cr.id)":"r.send_key=CONCAT('campaign:',cr.id)";

export async function dispatchCampaignBatch(campaignId?:number){
  const error=sendingConfigError();if(error)throw new Error(error);
  const cutoff=new Date(Date.now()-10*60_000).toISOString().slice(0,19).replace("T"," ");
  const stale=await rows(`SELECT cr.id FROM campaign_recipients cr JOIN email_send_reservations r ON ${campaignReservationJoin} WHERE cr.status='processing' AND r.status='reserved' AND r.created_at<?`,[cutoff]);
  if(stale.length)await run(`UPDATE campaign_recipients SET status='needs_review' WHERE id IN (${stale.map(()=>"?").join(",")}) AND status='processing'`,stale.map(item=>Number(item.id)));
  const scope=campaignId?" AND ca.id=?":"",limit=process.env.RESEND_API_KEY?DAILY_SEND_LIMIT:2;
  // Only a sender-approved, reserved recipient can be dispatched. Legacy queued audiences require approval.
  const pending=await rows(`SELECT cr.id FROM campaign_recipients cr JOIN campaigns ca ON ca.id=cr.campaign_id JOIN contacts c ON c.id=cr.contact_id JOIN mailboxes m ON m.id=ca.mailbox_id JOIN email_send_reservations r ON ${campaignReservationJoin} LEFT JOIN suppressions s ON s.email=c.email WHERE cr.status='queued' AND r.status='reserved' AND ca.status='queued' AND c.consent=1 AND c.status='active' AND s.email IS NULL AND m.status='active'${scope} ORDER BY cr.id LIMIT ?`,[...(campaignId?[campaignId]:[]),limit]);
  if(!pending.length)return {sent:0,failed:0};
  const token=`batch:${randomUUID()}`;
  const claimed=await transaction(async tx=>{
    const allowed=await reserveSends(tx,pending.map(item=>({key:`campaign:${item.id}`,channel:"campaign" as const,count:1})),false);
    const ids=pending.filter(item=>allowed.includes(`campaign:${item.id}`)).map(item=>Number(item.id));
    if(!ids.length)return [];
    await tx.run(`UPDATE campaign_recipients SET status='processing',provider_id=? WHERE id IN (${ids.map(()=>"?").join(",")}) AND status='queued' AND campaign_id IN (SELECT id FROM campaigns WHERE status='queued')`,[token,...ids]);
    const items=await tx.rows("SELECT cr.id,cr.campaign_id,c.email,c.name,ca.subject,ca.body_html,m.email sender FROM campaign_recipients cr JOIN campaigns ca ON ca.id=cr.campaign_id JOIN contacts c ON c.id=cr.contact_id JOIN mailboxes m ON m.id=ca.mailbox_id WHERE cr.status='processing' AND cr.provider_id=?",[token]);
    if(items.length)await tx.run(`UPDATE email_send_reservations SET created_at=CURRENT_TIMESTAMP WHERE send_key IN (${items.map(()=>"?").join(",")})`,items.map(item=>`campaign:${item.id}`));
    return items;
  });
  if(!claimed.length)return {sent:0,failed:0};
  let started=false,sent=0,failed=0;
  try{
    const payload=claimed.map(item=>({sender:String(item.sender),to:String(item.email),subject:String(item.subject),html:trackedHtml(String(item.body_html).replaceAll("{{name}}",String(item.name)),Number(item.id)),campaignId:Number(item.campaign_id),recipientId:Number(item.id)}));
    started=true;
    const providerIds=process.env.RESEND_API_KEY
      ?await sendCampaignMailBatch(payload,token)
      :await Promise.all(payload.map(item=>sendMail({from:item.sender,to:item.to,subject:item.subject,html:item.html,campaignId:item.campaignId,recipientId:item.recipientId})));
    await transaction(async tx=>{
      await settleSends(tx,claimed.map(item=>`campaign:${item.id}`),"sent");
      const cases=claimed.map(()=>"WHEN ? THEN ?").join(" ");
      await tx.run(`UPDATE campaign_recipients SET status='sent',sent_at=CURRENT_TIMESTAMP,provider_id=CASE id ${cases} END WHERE status='processing' AND provider_id=?`,[...claimed.flatMap((item,index)=>[Number(item.id),providerIds[index]]),token]);
      await tx.run(`INSERT INTO email_events (recipient_id,type) VALUES ${claimed.map(()=>"(?,'sent')").join(",")}`,claimed.map(item=>Number(item.id)));
    });
    sent=claimed.length;
  }catch(error){
    // SMTP requests can succeed independently; an interrupted multi-send cannot safely be called rejected.
    const rejected=!started||(Boolean(process.env.RESEND_API_KEY)&&mailWasRejected(error));
    await transaction(async tx=>{
      if(rejected)await settleSends(tx,claimed.map(item=>`campaign:${item.id}`),"released");
      await tx.run("UPDATE campaign_recipients SET status=? WHERE status='processing' AND provider_id=?",[rejected?"failed":"needs_review",token]);
      if(!rejected)await tx.run(`UPDATE campaigns SET status='paused' WHERE id IN (${claimed.map(()=>"?").join(",")}) AND status='queued'`,claimed.map(item=>Number(item.campaign_id)));
    });
    failed=claimed.length;
  }
  await run("UPDATE campaigns SET status='completed' WHERE status='queued' AND NOT EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.campaign_id=campaigns.id AND cr.status IN ('queued','processing','needs_review'))"+(campaignId?" AND id=?":""),campaignId?[campaignId]:[]);
  return {sent,failed};
}