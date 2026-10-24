"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { RefreshCw } from "lucide-react";

export function RefreshData(){
  const router=useRouter(),pathname=usePathname(),[pending,start]=useTransition();
  useEffect(()=>{
    const live=pathname==="/dashboard"||pathname==="/conversations"||/^\/(conversations|contacts|campaigns)\/\d+$/.test(pathname);
    if(!live)return;
    const refresh=()=>{if(document.visibilityState==="visible"&&!document.activeElement?.matches("input,textarea,select,[contenteditable='true']"))router.refresh()};
    const timer=window.setInterval(refresh,20000);
    const onVisibility=refresh;
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility)};
  },[pathname,router]);
  return <button type="button" className="button secondary" disabled={pending} onClick={()=>start(()=>router.refresh())} title="Load latest data" aria-label="Load latest data"><RefreshCw size={15}/>{pending?"Refreshing…":"Refresh"}</button>;
}
