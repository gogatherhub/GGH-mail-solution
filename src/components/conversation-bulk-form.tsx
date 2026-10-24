"use client";

import { useRef, useState } from "react";
import { bulkConversations } from "@/app/actions";

export function ConversationBulkForm({total,children}:{total:number;children:React.ReactNode}) {
  const formRef=useRef<HTMLFormElement>(null),[selected,setSelected]=useState(0);
  return <form ref={formRef} action={bulkConversations} onChange={event=>setSelected(event.currentTarget.querySelectorAll<HTMLInputElement>("input[name='ids']:checked").length)} onSubmit={event=>{if(!selected)event.preventDefault()}}>
    <div className="bulk-toolbar"><label className="select-all"><input type="checkbox" checked={total>0&&selected===total} onChange={event=>{for(const box of formRef.current?.querySelectorAll<HTMLInputElement>("input[name='ids']")||[])box.checked=event.target.checked;setSelected(event.target.checked?total:0)}}/> Select all on this page</label><span>{selected?`${selected} selected`:"Select conversations below"}</span><button name="action" value="read" className="button secondary" disabled={!selected}>Mark read</button><button name="action" value="unread" className="button secondary" disabled={!selected}>Mark unread</button><button name="action" value="delete" className="button danger" disabled={!selected}>Delete</button></div>
    {children}
  </form>;
}
