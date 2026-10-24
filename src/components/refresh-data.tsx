"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function RefreshData(){
  const router=useRouter(),pathname=usePathname(),[pending,start]=useTransition();
  useEffect(()=>{
    const live=pathname==="/dashboard"||pathname==="/conversations"||pathname==="/outbox"||pathname==="/analytics"||/^\/(conversations|contacts|campaigns)\/\d+$/.test(pathname);
    if(!live)return;
    const refresh=()=>{if(document.visibilityState==="visible"&&!document.querySelector('form[aria-busy="true"],button[aria-busy="true"]')&&!document.activeElement?.matches("input,textarea,select,[contenteditable='true']"))start(()=>router.refresh())};
    const timer=window.setInterval(refresh,pathname==="/outbox"?5000:20000);
    const onVisibility=refresh;
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility)};
  },[pathname,router]);
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground" disabled={pending} aria-busy={pending} onClick={()=>start(()=>router.refresh())} aria-label="Refresh latest data"><RefreshCw size={14} className={pending?"animate-spin":""}/><span>Refresh</span></Button></TooltipTrigger><TooltipContent>Get the latest workspace activity</TooltipContent></Tooltip>;
}
