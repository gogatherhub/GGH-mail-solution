"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { Gauge,RefreshCw } from "lucide-react";
import type { SendingBudget } from "@/lib/send-budget";

export function useSendingBudget(initial?:SendingBudget){
  const [budget,setBudget]=useState<SendingBudget|null>(initial||null),[error,setError]=useState("");
  const request=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;
    try{const response=await fetch("/api/sending-budget",{cache:"no-store",signal:controller.signal});if(!response.ok)throw new Error("Capacity could not be refreshed");const data=await response.json();if(!controller.signal.aborted){setBudget(data);setError("");}}
    catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:"Capacity unavailable");}
  },[]);
  useEffect(()=>{const initial=window.setTimeout(()=>{void refresh();},0);const tick=()=>{if(document.visibilityState==="visible")void refresh();};const timer=window.setInterval(tick,5000);window.addEventListener("focus",tick);return()=>{clearTimeout(initial);clearInterval(timer);window.removeEventListener("focus",tick);request.current?.abort();};},[refresh]);
  return {budget,error,refresh};
}
export function BudgetSummary({budget,error}:{budget:SendingBudget|null;error?:string}){
  return <section className="sending-budget" aria-label="Shared daily sending capacity"><div className="budget-heading"><span><Gauge size={18}/>Today’s shared sending budget</span><strong>{budget?`${budget.remaining} available`:"Checking capacity…"}</strong></div>{budget&&<><div className="budget-metrics"><div><strong>{budget.individual}</strong><span>Individual recipient sends</span></div><div><strong>{budget.campaign}</strong><span>Campaign sends</span></div><div><strong>{budget.reserved}</strong><span>Reserved / awaiting confirmation</span></div><div><strong>{budget.limit}</strong><span>Daily sending cap</span></div></div><div className="budget-track" role="meter" aria-label="Daily recipient capacity used or reserved" aria-valuemin={0} aria-valuemax={budget.limit} aria-valuenow={Math.min(budget.limit,budget.sent+budget.reserved)}><span style={{width:`${Math.min(100,(budget.sent+budget.reserved)/budget.limit*100)}%`}}/></div><p>{budget.received} incoming emails recorded today. Each To, Cc or Bcc recipient uses one slot. Resets at 05:30 IST / 00:00 UTC.</p></>}{error&&<p className="budget-warning" role="status"><RefreshCw size={12}/>{error}. Sending is checked again on the server.</p>}</section>;
}
export function SendingBudgetPanel(){const {budget,error}=useSendingBudget();return <BudgetSummary budget={budget} error={error}/>;}
