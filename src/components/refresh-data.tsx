"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";

export function RefreshData(){
  const router=useRouter(),[pending,start]=useTransition();
  return <button type="button" className="button secondary" disabled={pending} onClick={()=>start(()=>router.refresh())} title="Load latest data" aria-label="Load latest data"><RefreshCw size={15}/>{pending?"Refreshing…":"Refresh"}</button>;
}
