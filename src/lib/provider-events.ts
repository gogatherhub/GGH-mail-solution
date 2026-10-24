import { rows, run, isDemo } from "./db";

export async function recordProviderEvent(event:"delivered"|"bounce"|"complaint",providerId:string,eventId:string){
  const recipient=(await rows("SELECT cr.id,cr.campaign_id,c.email FROM campaign_recipients cr JOIN contacts c ON c.id=cr.contact_id WHERE cr.provider_id=?",[providerId]))[0];
  if(!recipient)return false;
  const id=Number(recipient.id);
  if(event==="delivered")await run("UPDATE campaign_recipients SET status='delivered',delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP) WHERE id=? AND status NOT IN ('bounced','complaint')",[id]);
  else{
    await run("UPDATE campaign_recipients SET status=? WHERE id=?",[event==="bounce"?"bounced":"complaint",id]);
    await run(isDemo?"INSERT INTO suppressions (email,reason) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET reason=excluded.reason":"INSERT INTO suppressions (email,reason) VALUES (?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason)",[String(recipient.email),event]);
  }
  await run("INSERT IGNORE INTO email_events (recipient_id,type,provider_event_id) VALUES (?,?,?)",[id,event,eventId]);
  if(event!=="delivered"){
    const health=(await rows("SELECT COUNT(*) total,SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) bounced,SUM(CASE WHEN status='complaint' THEN 1 ELSE 0 END) complaints FROM campaign_recipients WHERE campaign_id=? AND sent_at IS NOT NULL",[Number(recipient.campaign_id)]))[0];
    const total=Number(health.total||0),bounced=Number(health.bounced||0),complaints=Number(health.complaints||0);
    if(complaints>0||(total>=20&&bounced/total>=0.05))await run("UPDATE campaigns SET status='paused' WHERE id=? AND status='queued'",[Number(recipient.campaign_id)]);
  }
  return true;
}
