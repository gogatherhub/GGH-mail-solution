"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

export function AutoFilterForm({children,className}:{children:React.ReactNode;className?:string}) {
  const router=useRouter(),pathname=usePathname(),timer=useRef<ReturnType<typeof setTimeout>|null>(null),[pending,startTransition]=useTransition();
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
  function apply(form:HTMLFormElement){
    if(timer.current)clearTimeout(timer.current);
    const params=new URLSearchParams();
    for(const [key,value] of new FormData(form))if(typeof value==="string"&&value!=="")params.append(key,value);
    params.delete("page");
    const target=`${pathname}${params.size?`?${params}`:""}`;
    if(target!==`${window.location.pathname}${window.location.search}`)startTransition(()=>router.replace(target,{scroll:false}));
  }
  return <form className={className} method="get" aria-busy={pending} onSubmit={event=>{event.preventDefault();apply(event.currentTarget)}} onChange={event=>{
    const target=event.target as HTMLElement;
    if(target.matches("select,input[type='date'],input[type='checkbox']"))apply(event.currentTarget);
  }} onInput={event=>{
    const target=event.target as HTMLElement;
    if(target.matches("input[type='text'],input[type='search'],input:not([type])")){
      const form=event.currentTarget;
      if(timer.current)clearTimeout(timer.current);
      timer.current=setTimeout(()=>apply(form),250);
    }
  }}>{children}<span className={pending?"filter-status":"sr-only"} role="status">{pending?"Updating results…":""}</span></form>;
}
