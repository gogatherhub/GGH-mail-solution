"use client";

import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Props=SelectHTMLAttributes<HTMLSelectElement>;
export function HoverFilter(props:Props){
  return <HoverFilterControl key={`${props.name}:${String(props.defaultValue??"")}`} {...props}/>;
}
function HoverFilterControl({name,defaultValue,children,disabled,"aria-label":ariaLabel}:Props){
  const options=Children.toArray(children).filter(isValidElement).map(child=>{
    const option=child as ReactElement<{value?:string|number;children?:React.ReactNode;disabled?:boolean}>;
    return {value:String(option.props.value??option.props.children??""),label:option.props.children,disabled:option.props.disabled};
  });
  const [value,setValue]=useState(String(defaultValue??options[0]?.value??"")),[open,setOpen]=useState(false);
  const hidden=useRef<HTMLInputElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),pointerOpened=useRef(false);
  const selected=options.find(option=>option.value===value);
  function enter(){pointerOpened.current=true;if(timer.current)clearTimeout(timer.current);if(!disabled)setOpen(true);}
  function leave(){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setOpen(false),140);}
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  function choose(next:string){
    setValue(next);setOpen(false);
    if(hidden.current){hidden.current.value=next;hidden.current.closest("form")?.requestSubmit();}
  }
  return <div className="hover-filter" onPointerLeave={event=>{if(event.pointerType!=="touch")leave();}}>
    <input ref={hidden} type="hidden" name={name} value={value} disabled={disabled}/>
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={disabled} className="hover-filter-trigger" aria-label={ariaLabel} onKeyDown={()=>{pointerOpened.current=false;}} onPointerEnter={event=>{if(event.pointerType!=="touch")enter();}}><span>{selected?.label||"Choose filter"}</span><ChevronDown size={13} className={open?"rotate-180":""}/></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={5} className="hover-filter-menu" onPointerEnter={enter} onPointerLeave={leave} onKeyDown={()=>{pointerOpened.current=false;}} onCloseAutoFocus={event=>{if(pointerOpened.current)event.preventDefault();}}>
        <DropdownMenuRadioGroup value={value} onValueChange={choose}>{options.map((option,index)=><DropdownMenuRadioItem key={`${option.value}-${index}`} value={option.value} disabled={option.disabled}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
