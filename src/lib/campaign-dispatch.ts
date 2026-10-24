import { rows, run } from "./db";
import { sendMail } from "./mail";
import { trackedHtml } from "./tracking";

export function sendingConfigError() {
  if(!process.env.RESEND_API_KEY&&!process.env.AWS_REGION&&!(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD))return "Configure Resend, SES or SMTP before sending";
  let publicUrl:URL;try{publicUrl=new URL(process.env.APP_URL||"")}catch{return "Set APP_URL to a public HTTPS address"}
  if(publicUrl.protocol!=="https:"||["localhost","127.0.0.1"].includes(publicUrl.hostname))return "Set APP_URL to a public HTTPS address";
  return null;
}

export async function dispatchCampaignBatch(campaignId?:number){
  const error=sendingConfigError();if(error)throw new Error(error);
  const scope=campaignId?" AND ca.id=?":"";
  const pending=await rows(`SELECT cr.id,cr.campaign_id,c.email,c.name,ca.subject,ca.body_html,m.email sender FROM campaign_recipients cr JOIN campaigns ca ON ca.id=cr.campaign_id JOIN contacts c ON c.id=cr.contact_id JOIN mailboxes m ON m.id=ca.mailbox_id LEFT JOIN suppressions s ON s.email=c.email WHERE cr.status='queued' AND ca.status='queued' AND c.consent=1 AND c.status='active' AND s.email IS NULL AND m.status='active'${scope} ORDER BY cr.id LIMIT 20`,campaignId?[campaignId]:[]);
  let sent=0,failed=0;
  for(const item of pending){
    const claim=await run("UPDATE campaign_recipients SET status='processing' WHERE id=? AND status='queued'",[Number(item.id)]);
    if(!claim.rowsAffected)continue;
    try{
      const recipientId=Number(item.id),id=Number(item.campaign_id);
      const html=trackedHtml(String(item.body_html).replaceAll("{{name}}",String(item.name)),recipientId);
      const providerId=await sendMail({from:String(item.sender),to:String(item.email),subject:String(item.subject),html,campaignId:id,recipientId});
      await run("UPDATE campaign_recipients SET status='sent',provider_id=?,sent_at=CURRENT_TIMESTAMP WHERE id=?",[providerId,recipientId]);
      await run("INSERT INTO email_events (recipient_id,type) VALUES (?,'sent')",[recipientId]);sent++;
    }catch{await run("UPDATE campaign_recipients SET status='failed' WHERE id=?",[Number(item.id)]);failed++}
  }
  const active=await rows("SELECT ca.id FROM campaigns ca WHERE ca.status='queued' AND NOT EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.campaign_id=ca.id AND cr.status IN ('queued','processing'))"+(campaignId?" AND ca.id=?":""),campaignId?[campaignId]:[]);
  for(const c of active)await run("UPDATE campaigns SET status='completed' WHERE id=?",[Number(c.id)]);
  return {sent,failed};
}
