export function conversationStatus(item:{direction?:unknown;message_status?:unknown;unread?:unknown}) {
  if(item.direction==="outbound"){
    if(item.message_status==="failed")return {label:"Failed",tone:"danger" as const};
    if(item.message_status==="bounced")return {label:"Bounced",tone:"danger" as const};
    if(item.message_status==="complaint")return {label:"Complaint",tone:"danger" as const};
    if(item.message_status==="delivered")return {label:"Delivered",tone:"success" as const};
    if(item.message_status==="sent")return {label:"Sent",tone:"success" as const};
    return {label:"Sending",tone:"neutral" as const};
  }
  return item.unread?{label:"Unread",tone:"warning" as const}:{label:"Read",tone:"success" as const};
}
