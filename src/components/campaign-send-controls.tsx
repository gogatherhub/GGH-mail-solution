"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { queueCampaign,sendCampaignNow } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { BudgetSummary,useSendingBudget } from "@/components/sending-budget";
import type { SendingBudget } from "@/lib/send-budget";

export function CampaignSendControls({campaignId,stage,eligible,reserved,initial,disabled}:{campaignId:number;stage:string;eligible:number;reserved:number;initial:SendingBudget;disabled:boolean}){
  const router=useRouter(),{budget,error,refresh}=useSendingBudget(initial),[count,setCount]=useState(String(Math.max(1,Math.min(20,eligible,initial.remaining)))),[sendError,setSendError]=useState("");
  const max=Math.min(eligible,budget?.remaining||0);
  async function submit(form:FormData){setSendError("");const result=await(stage==="draft"?queueCampaign(form):sendCampaignNow(form));if(result?.error){setSendError(result.error);void refresh();}else{router.refresh();void refresh();}}
  return <div className="campaign-send-controls"><BudgetSummary budget={budget} error={error}/>{["draft","queued"].includes(stage)&&<form action={submit} className="campaign-count-form"><input type="hidden" name="id" value={campaignId}/>{eligible>0&&<><div><label htmlFor={`send-count-${campaignId}`}>How many recipients should receive this campaign?</label><p>{eligible} eligible {stage==="draft"?"contacts":"unreserved recipients"} · up to {max} can be reserved now.</p></div><div className="campaign-count-picker"><Input id={`send-count-${campaignId}`} name="send_count" type="number" min={1} max={Math.max(1,max)} value={count} onChange={event=>setCount(event.target.value)} required aria-label="Campaign send count"/><div className="count-presets">{[...new Set([10,25,50,max])].filter(value=>value>0&&value<=max).map(value=><Button key={value} type="button" size="sm" variant="outline" onClick={()=>setCount(String(value))}>{value===max?`All available (${value})`:value}</Button>)}</div><SubmitButton disabled={disabled||max<1} pendingLabel="Reserving…">{stage==="draft"?"Start selected campaign":"Send selected recipients"}</SubmitButton></div></>}{stage==="queued"&&reserved>0&&<SubmitButton name="continue_reserved" value="1" formNoValidate variant="outline" disabled={disabled} pendingLabel="Starting…">Continue {reserved} reserved emails</SubmitButton>}{max===0&&eligible>0&&<p className="budget-warning">No new capacity is available. Existing reservations can still send. Try a smaller selection after capacity is released, or wait for reset.</p>}{sendError&&<p className="form-error" role="alert">{sendError}</p>}</form>}<p className="helper">Only the selected number is reserved. Unselected contacts are not sent this campaign. Capacity is shared with every mailbox and sender in this workspace.</p></div>;
}
