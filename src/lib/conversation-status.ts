export function conversationStatus(item:{direction?:unknown;message_status?:unknown;unread?:unknown;engaged?:unknown}) {
  if(item.direction==="outbound"){
    if(item.message_status==="queued")return {label:"Queued",tone:"blue" as const};
    if(item.message_status==="needs_review")return {label:"Needs review",tone:"warning" as const};
    if(item.message_status==="cancelled")return {label:"Cancelled",tone:"neutral" as const};
    if(item.message_status==="failed")return {label:"Failed",tone:"danger" as const};
    if(item.message_status==="bounced")return {label:"Bounced",tone:"danger" as const};
    if(item.message_status==="complaint")return {label:"Complaint",tone:"danger" as const};
    if(item.message_status==="delivered"||item.message_status==="sent")return item.engaged?{label:"Read*",tone:"success" as const}:{label:"Unread*",tone:"warning" as const};
    return {label:"Sending",tone:"neutral" as const};
  }
  return item.unread?{label:"Unread",tone:"warning" as const}:{label:"Read",tone:"success" as const};
}
export const latestMessageIdSql="(SELECT mm.id FROM messages mm WHERE mm.conversation_id=c.id ORDER BY mm.id DESC LIMIT 1)";
export const latestEngagedSql=`EXISTS (SELECT 1 FROM email_events ev WHERE ev.message_id=${latestMessageIdSql} AND ev.type IN ('open','click'))`;
export const readStateSql=`CASE WHEN (SELECT mm.direction FROM messages mm WHERE mm.id=${latestMessageIdSql})='outbound' THEN CASE WHEN (SELECT mm.status FROM messages mm WHERE mm.id=${latestMessageIdSql}) IN ('failed','bounced','complaint','queued','cancelled','needs_review') THEN NULL ELSE ${latestEngagedSql} END ELSE CASE WHEN c.unread=1 THEN 0 ELSE 1 END END`;
export function conversationReadFilterSql(status:"read"|"unread") { return `(${readStateSql})=${status==="read"?1:0}`; }
