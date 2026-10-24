"use client";

import { useState } from "react";
import { bulkConversations } from "@/app/actions";

export function ConversationBulkForm({children}:{children:React.ReactNode}) {
  const [selected,setSelected]=useState(0);
  return <form action={bulkConversations} onChange={event=>setSelected(event.currentTarget.querySelectorAll<HTMLInputElement>("input[name='ids']:checked").length)} onSubmit={event=>{if(!selected)event.preventDefault()}}>
    <div className="bulk-toolbar"><span>{selected?`${selected} selected`:"Select conversations below"}</span><button name="action" value="read" className="button secondary" disabled={!selected}>Mark read</button><button name="action" value="unread" className="button secondary" disabled={!selected}>Mark unread</button><button name="action" value="delete" className="button danger" disabled={!selected}>Delete</button></div>
    {children}
  </form>;
}
