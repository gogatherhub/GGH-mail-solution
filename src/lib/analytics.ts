import { rows, type Row } from "./db";

// One fact per outbound email, rather than one fact per event. Repeated opens cannot inflate rates.
export const emailFactsSql = `
  SELECT m.id record_id,'direct' kind,m.conversation_id target_id,co.mailbox_id,
    LOWER(TRIM(m.recipient)) email,ct.name,ct.id contact_id,m.subject,m.status,
    COALESCE(o.sent_at,m.created_at) occurred_at,
    CASE WHEN m.status IN ('sent','delivered','bounced','complaint') OR o.sent_at IS NOT NULL THEN 1 ELSE 0 END sent,
    CASE WHEN m.status='delivered' OR EXISTS (SELECT 1 FROM email_events e WHERE e.message_id=m.id AND e.type='delivered') THEN 1 ELSE 0 END delivered,
    CASE WHEN EXISTS (SELECT 1 FROM email_events e WHERE e.message_id=m.id AND e.type IN ('open','click')) THEN 1 ELSE 0 END opened,
    CASE WHEN EXISTS (SELECT 1 FROM email_events e WHERE e.message_id=m.id AND e.type='click') THEN 1 ELSE 0 END clicked
  FROM messages m JOIN conversations co ON co.id=m.conversation_id LEFT JOIN contacts ct ON ct.id=co.contact_id LEFT JOIN email_outbox o ON o.message_id=m.id WHERE m.direction='outbound'
  UNION ALL
  SELECT cr.id record_id,'campaign' kind,ca.id target_id,ca.mailbox_id,LOWER(TRIM(ct.email)) email,ct.name,ct.id contact_id,ca.subject,cr.status,
    COALESCE(cr.sent_at,ca.created_at) occurred_at,
    CASE WHEN cr.sent_at IS NOT NULL THEN 1 ELSE 0 END sent,
    CASE WHEN cr.delivered_at IS NOT NULL THEN 1 ELSE 0 END delivered,
    CASE WHEN cr.opened_at IS NOT NULL OR cr.clicked_at IS NOT NULL THEN 1 ELSE 0 END opened,
    CASE WHEN cr.clicked_at IS NOT NULL THEN 1 ELSE 0 END clicked
  FROM campaign_recipients cr JOIN campaigns ca ON ca.id=cr.campaign_id JOIN contacts ct ON ct.id=cr.contact_id`;

export function analyticsRange(from?: string, to?: string, maximumDays = 365) {
  const valid = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);
  const today = new Date().toISOString().slice(0,10);
  const end = valid(to)?to!:today;
  let start = valid(from)?from!:new Date(new Date(`${end}T00:00:00Z`).getTime()-29*86400000).toISOString().slice(0,10);
  if (start>end) start=end;
  if (maximumDays && new Date(end).getTime()-new Date(start).getTime()>maximumDays*86400000) start=new Date(new Date(end).getTime()-maximumDays*86400000).toISOString().slice(0,10);
  return {from:start,to:end,until:new Date(new Date(`${end}T00:00:00Z`).getTime()+86400000).toISOString().slice(0,10)};
}
export type AnalyticsRange = ReturnType<typeof analyticsRange>;

export async function analyticsOverview(user: Row, range: AnalyticsRange, mailbox = 0) {
  const mailboxId = user.role==="admin"?mailbox:Number(user.assigned_mailbox_id)||-1;
  const scope = mailboxId?" AND mailbox_id=?":"";
  const args:(string|number)[]=[`${range.from} 00:00:00`,`${range.until} 00:00:00`,...(mailboxId?[mailboxId]:[])];
  const where=`occurred_at>=? AND occurred_at<?${scope}`;
  const facts=`(${emailFactsSql}) f`;
  const [summary,daily,channels,mailboxes] = await Promise.all([
    rows(`SELECT COUNT(*) total,SUM(sent) sent,SUM(CASE WHEN sent=1 THEN delivered ELSE 0 END) delivered,SUM(CASE WHEN sent=1 THEN opened ELSE 0 END) opened,SUM(CASE WHEN sent=1 THEN clicked ELSE 0 END) clicked,SUM(CASE WHEN status IN ('failed','bounced','complaint','needs_review') THEN 1 ELSE 0 END) attention,COUNT(DISTINCT CASE WHEN sent=1 THEN email END) recipients FROM ${facts} WHERE ${where}`,args),
    rows(`SELECT DATE(occurred_at) day,SUM(sent) sent,SUM(CASE WHEN sent=1 THEN opened ELSE 0 END) opened,SUM(CASE WHEN sent=1 THEN clicked ELSE 0 END) clicked FROM ${facts} WHERE ${where} GROUP BY DATE(occurred_at) ORDER BY day`,args),
    rows(`SELECT kind,SUM(sent) sent,SUM(CASE WHEN sent=1 THEN opened ELSE 0 END) opened,SUM(CASE WHEN sent=1 THEN clicked ELSE 0 END) clicked FROM ${facts} WHERE ${where} GROUP BY kind`,args),
    rows("SELECT id,email FROM mailboxes"+(user.role==="admin"?"":" WHERE id=?"),user.role==="admin"?[]:[Number(user.assigned_mailbox_id)||-1]),
  ]);
  const byDay=new Map(daily.map(row=>[String(row.day),row]));
  const timeline=[];
  for(let time=new Date(`${range.from}T00:00:00Z`).getTime();time<new Date(`${range.until}T00:00:00Z`).getTime();time+=86400000){const date=new Date(time).toISOString().slice(0,10);const row=byDay.get(date);timeline.push({day:date,sent:Number(row?.sent||0),opened:Number(row?.opened||0),clicked:Number(row?.clicked||0)});}
  const s=summary[0]||{};
  return {summary:{sent:Number(s.sent||0),delivered:Number(s.delivered||0),opened:Number(s.opened||0),clicked:Number(s.clicked||0),attention:Number(s.attention||0),recipients:Number(s.recipients||0)},timeline,channels:channels.map(row=>({kind:String(row.kind),sent:Number(row.sent||0),opened:Number(row.opened||0),clicked:Number(row.clicked||0)})),mailboxes};
}

export function percent(part:number,total:number){return `${total?Math.min(100,part/total*100).toFixed(1):"0.0"}%`;}
