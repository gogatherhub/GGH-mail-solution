import { isDemo, rows, transaction, type DbSession } from "./db";
import { DAILY_SEND_LIMIT, PROVIDER_DAILY_LIMIT, PROVIDER_MONTHLY_LIMIT } from "./send-limits";
import { recipientCount } from "./send-limits";

export class SendBudgetError extends Error {}
export type SendReservation={key:string;channel:"direct"|"campaign";count:number};
const costSql="(1+CASE WHEN TRIM(COALESCE(m.cc,''))='' THEN 0 ELSE LENGTH(m.cc)-LENGTH(REPLACE(m.cc,',',''))+1 END+CASE WHEN TRIM(COALESCE(m.bcc,''))='' THEN 0 ELSE LENGTH(m.bcc)-LENGTH(REPLACE(m.bcc,',',''))+1 END)";

export async function sendingBudget(tx:Pick<DbSession,"rows">={rows},day=new Date().toISOString().slice(0,10)){
  const month=`${day.slice(0,7)}-01`,start=`${day} 00:00:00`,monthStart=`${month} 00:00:00`,end=`${new Date(new Date(`${day}T00:00:00Z`).getTime()+86400000).toISOString().slice(0,10)} 00:00:00`;
  const directKey=isDemo?"('direct:'||m.id)":"CONCAT('direct:',m.id)",campaignKey=isDemo?"('campaign:'||cr.id)":"CONCAT('campaign:',cr.id)";
  const accepted=`m.direction='outbound' AND (m.status IN ('sent','delivered','bounced','complaint') OR o.sent_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM email_send_reservations logged WHERE logged.send_key=${directKey} AND logged.status='sent')`;
  const when="COALESCE(o.sent_at,m.created_at)";
  const [direct,campaign,reservations]=await Promise.all([
    tx.rows(`SELECT SUM(CASE WHEN ${accepted} AND ${when}>=? THEN ${costSql} ELSE 0 END) direct,SUM(CASE WHEN ${accepted} THEN ${costSql} ELSE 0 END) monthly_direct,SUM(CASE WHEN m.direction='inbound' AND m.created_at>=? THEN 1 ELSE 0 END) received,SUM(CASE WHEN m.direction='inbound' THEN 1 ELSE 0 END) monthly_received FROM messages m LEFT JOIN email_outbox o ON o.message_id=m.id WHERE ${when}>=? AND ${when}<?`,[start,start,monthStart,end]),
    tx.rows(`SELECT SUM(CASE WHEN cr.sent_at>=? THEN 1 ELSE 0 END) campaign,COUNT(*) monthly_campaign FROM campaign_recipients cr WHERE cr.sent_at>=? AND cr.sent_at<? AND NOT EXISTS (SELECT 1 FROM email_send_reservations logged WHERE logged.send_key=${campaignKey} AND logged.status='sent')`,[start,monthStart,end]),
    tx.rows("SELECT SUM(CASE WHEN day_key=? AND status='reserved' THEN recipient_count ELSE 0 END) reserved,SUM(CASE WHEN status='reserved' THEN recipient_count ELSE 0 END) monthly_reserved,SUM(CASE WHEN day_key=? AND status='sent' AND channel='direct' THEN recipient_count ELSE 0 END) confirmed_direct,SUM(CASE WHEN status='sent' AND channel='direct' THEN recipient_count ELSE 0 END) monthly_confirmed_direct,SUM(CASE WHEN day_key=? AND status='sent' AND channel='campaign' THEN recipient_count ELSE 0 END) confirmed_campaign,SUM(CASE WHEN status='sent' AND channel='campaign' THEN recipient_count ELSE 0 END) monthly_confirmed_campaign FROM email_send_reservations WHERE status IN ('reserved','sent') AND day_key>=? AND day_key<=?",[day,day,day,month,day]),
  ]);
  const number=(value:unknown)=>Number(value||0),d=direct[0]||{},c=campaign[0]||{},r=reservations[0]||{};
  const individual=number(d.direct)+number(r.confirmed_direct),campaignSent=number(c.campaign)+number(r.confirmed_campaign),reserved=number(r.reserved),sent=individual+campaignSent,received=number(d.received);
  const monthlySent=number(d.monthly_direct)+number(c.monthly_campaign)+number(r.monthly_confirmed_direct)+number(r.monthly_confirmed_campaign),monthlyReceived=number(d.monthly_received),monthlyReserved=number(r.monthly_reserved);
  return {day,limit:DAILY_SEND_LIMIT,individual,campaign:campaignSent,sent,reserved,received,remaining:Math.max(0,Math.min(DAILY_SEND_LIMIT-sent-reserved,PROVIDER_DAILY_LIMIT-sent-reserved-received,PROVIDER_MONTHLY_LIMIT-monthlySent-monthlyReceived-monthlyReserved)),monthlyRemaining:Math.max(0,PROVIDER_MONTHLY_LIMIT-monthlySent-monthlyReceived-monthlyReserved),resetsAt:end.replace(" ","T")+"Z"};
}
export type SendingBudget=Awaited<ReturnType<typeof sendingBudget>>;

export async function lockSendDay(tx:DbSession){
  const day=new Date().toISOString().slice(0,10);
  await tx.run("INSERT IGNORE INTO email_budget_days (day_key) VALUES (?)",[day]);
  await tx.rows("SELECT day_key FROM email_budget_days WHERE day_key=?"+(isDemo?"":" FOR UPDATE"),[day]);
  return day;
}

export async function reserveSends(tx:DbSession,requests:SendReservation[],exact=true){
  if(!requests.length)return [] as string[];
  if(requests.some(item=>!Number.isSafeInteger(item.count)||item.count<1||item.count>DAILY_SEND_LIMIT))throw new SendBudgetError(`An email can use at most ${DAILY_SEND_LIMIT} recipient slots. Split large To/Cc/Bcc lists.`);
  const day=await lockSendDay(tx),budget=await sendingBudget(tx,day),month=`${day.slice(0,7)}-01`;
  const existing=await tx.rows(`SELECT send_key,day_key,recipient_count,status FROM email_send_reservations WHERE send_key IN (${requests.map(()=>"?").join(",")})`,requests.map(item=>item.key));
  const byKey=new Map(existing.map(item=>[String(item.send_key),item]));
  let dailyAvailable=Math.max(0,Math.min(DAILY_SEND_LIMIT-budget.sent-budget.reserved,PROVIDER_DAILY_LIMIT-budget.sent-budget.reserved-budget.received)),monthlyAvailable=budget.monthlyRemaining;
  const admitted:SendReservation[]=[];
  for(const request of requests){
    const previous=byKey.get(request.key);
    if(previous?.status==="sent")continue;
    if(previous?.status==="reserved"&&previous.day_key===day){if(Number(previous.recipient_count)!==request.count)throw new SendBudgetError("Recipient list changed after capacity was reserved");if(budget.sent+budget.reserved>DAILY_SEND_LIMIT||budget.sent+budget.reserved+budget.received>PROVIDER_DAILY_LIMIT)continue;admitted.push(request);continue;}
    const monthCost=previous?.status==="reserved"&&String(previous.day_key)>=month?0:request.count;
    if(request.count>dailyAvailable||monthCost>monthlyAvailable){if(exact)throw new SendBudgetError(`Only ${budget.remaining} recipient slots remain today. Reduce the send count or wait for the daily reset.`);continue;}
    dailyAvailable-=request.count;monthlyAvailable-=monthCost;admitted.push(request);
  }
  const writes=admitted.filter(request=>!(byKey.get(request.key)?.status==="reserved"&&byKey.get(request.key)?.day_key===day));
  if(writes.length){const sql=`INSERT INTO email_send_reservations (send_key,day_key,channel,recipient_count,status) VALUES ${writes.map(()=>"(?,?,?,?,'reserved')").join(",")}`;await tx.run(sql+(isDemo?" ON CONFLICT(send_key) DO UPDATE SET day_key=excluded.day_key,channel=excluded.channel,recipient_count=excluded.recipient_count,status='reserved',created_at=CURRENT_TIMESTAMP":" ON DUPLICATE KEY UPDATE day_key=VALUES(day_key),channel=VALUES(channel),recipient_count=VALUES(recipient_count),status='reserved',created_at=CURRENT_TIMESTAMP"),writes.flatMap(request=>[request.key,day,request.channel,request.count]));}
  return admitted.map(item=>item.key);
}
export async function settleSend(tx:DbSession,key:string,status:"sent"|"released"){
  return settleSends(tx,[key],status);
}
export async function settleSends(tx:DbSession,keys:string[],status:"sent"|"released"){
  if(!keys.length)return;
  const day=await lockSendDay(tx);
  await tx.run(`UPDATE email_send_reservations SET status=?${status==="sent"?",day_key=?":""} WHERE send_key IN (${keys.map(()=>"?").join(",")}) AND status='reserved'`,[status,...(status==="sent"?[day]:[]),...keys]);
}
export async function renewSend(request:SendReservation){return transaction(async tx=>(await reserveSends(tx,[request],false)).includes(request.key));}

export async function preserveDeletedEmailBudget(conversationId:number){
  await transaction(async tx=>{
    await lockSendDay(tx);
    const messages=await tx.rows("SELECT m.id,m.status,m.cc,m.bcc,COALESCE(o.sent_at,m.created_at) sent_time,o.status job_status FROM messages m LEFT JOIN email_outbox o ON o.message_id=m.id WHERE m.conversation_id=? AND m.direction='outbound'",[conversationId]);
    for(const message of messages){
      const key=`direct:${message.id}`;
      if(["sent","delivered","bounced","complaint"].includes(String(message.status))||message.job_status==="sent"){
        await tx.run("INSERT IGNORE INTO email_send_reservations (send_key,day_key,channel,recipient_count,status) VALUES (?,?,'direct',?,'sent')",[key,String(message.sent_time).slice(0,10),recipientCount(String(message.cc||""),String(message.bcc||""))]);
        await tx.run("UPDATE email_send_reservations SET status='sent' WHERE send_key=?",[key]);
      }else if(["queued","failed","cancelled"].includes(String(message.job_status)))await settleSend(tx,key,"released");
    }
  });
}
