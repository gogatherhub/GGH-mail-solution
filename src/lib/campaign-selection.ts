import { transaction,isDemo } from "./db";
import { lockSendDay,reserveSends,SendBudgetError } from "./send-budget";
import { DAILY_SEND_LIMIT } from "./send-limits";

export async function reserveCampaignSelection(id:number,count:number,start:boolean){
  if(!Number.isSafeInteger(count)||count<1||count>DAILY_SEND_LIMIT)throw new SendBudgetError(`Choose between 1 and ${DAILY_SEND_LIMIT} recipients.`);
  await transaction(async tx=>{
    await lockSendDay(tx);
    const [campaign]=await tx.rows("SELECT id,status,segment FROM campaigns WHERE id=?"+(isDemo?"":" FOR UPDATE"),[id]);
    if(!campaign||campaign.status!==(start?"draft":"queued"))throw new SendBudgetError("This campaign changed. Refresh the page before sending.");
    if(start){
      await tx.run("INSERT IGNORE INTO campaign_recipients (campaign_id,contact_id) SELECT ?,c.id FROM contacts c LEFT JOIN suppressions s ON LOWER(s.email)=LOWER(c.email) WHERE c.kind=? AND c.consent=1 AND c.status='active' AND s.email IS NULL ORDER BY c.id LIMIT ?",[id,String(campaign.segment),count]);
    }
    const join=isDemo?"r.send_key=('campaign:'||cr.id)":"r.send_key=CONCAT('campaign:',cr.id)";
    const selected=await tx.rows(`SELECT cr.id FROM campaign_recipients cr JOIN contacts c ON c.id=cr.contact_id LEFT JOIN email_send_reservations r ON ${join} LEFT JOIN suppressions s ON LOWER(s.email)=LOWER(c.email) WHERE cr.campaign_id=? AND cr.status='queued' AND c.consent=1 AND c.status='active' AND s.email IS NULL AND (r.send_key IS NULL OR r.status='released') ORDER BY cr.id LIMIT ?`,[id,count]);
    if(selected.length!==count)throw new SendBudgetError(`Only ${selected.length} eligible recipients are available. Reduce the selection and try again.`);
    await reserveSends(tx,selected.map(item=>({key:`campaign:${item.id}`,channel:"campaign",count:1})));
    if(start)await tx.run("UPDATE campaigns SET status='queued' WHERE id=?",[id]);
  });
}
