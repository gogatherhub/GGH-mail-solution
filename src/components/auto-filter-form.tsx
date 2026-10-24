"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function AutoFilterForm({children,className}:{children:React.ReactNode;className?:string}) {
  const router=useRouter(),pathname=usePathname(),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
  function apply(form:HTMLFormElement){
    if(timer.current)clearTimeout(timer.current);
    const params=new URLSearchParams();
    for(const [key,value] of new FormData(form))if(typeof value==="string"&&value!=="")params.append(key,value);
    params.delete("page");
    const target=`${pathname}${params.size?`?${params}`:""}`;
    if(target!==`${window.location.pathname}${window.location.search}`)router.replace(target,{scroll:false});
    else router.refresh();
  }
  return <form className={className} method="get" onSubmit={event=>{event.preventDefault();apply(event.currentTarget)}} onChange={event=>{
    const target=event.target as HTMLElement;
    if(target.matches("select,input[type='date'],input[type='checkbox']"))apply(event.currentTarget);
  }} onInput={event=>{
    const target=event.target as HTMLElement;
    if(target.matches("input[type='text'],input[type='search'],input:not([type])")){
      const form=event.currentTarget;
      if(timer.current)clearTimeout(timer.current);
      timer.current=setTimeout(()=>apply(form),350);
    }
  }}>{children}</form>;
}
