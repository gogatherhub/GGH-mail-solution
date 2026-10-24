"use client";

import { useRef, useState } from "react";

export function BulkDeleteForm({action,label,total,children}:{action:(form:FormData)=>void|Promise<void>;label:string;total:number;children:React.ReactNode}){
  const formRef=useRef<HTMLFormElement>(null),[selected,setSelected]=useState(0);
  const boxes=()=>Array.from(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]:not(:disabled)')||[]);
  return <form ref={formRef} action={action} onChange={()=>setSelected(boxes().filter(box=>box.checked).length)} onSubmit={event=>{if(!selected||!window.confirm(`Delete ${selected} selected ${label}?`))event.preventDefault()}}>
    <div className="bulk-toolbar"><label className="select-all"><input type="checkbox" checked={total>0&&selected===total} onChange={event=>{for(const box of boxes())box.checked=event.target.checked;setSelected(event.target.checked?total:0)}}/> Select all on this page</label><span>{selected?`${selected} selected`:"Select rows below"}</span><button type="submit" className="button danger" disabled={!selected}>Delete selected</button></div>
    {children}
  </form>;
}
