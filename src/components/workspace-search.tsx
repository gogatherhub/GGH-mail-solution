"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CornerDownLeft, Loader2, Search } from "lucide-react";
import { workspaceLinks } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, CommandShortcut } from "@/components/ui/command";

type Result={id:string;type:string;title:string;description:string;href:string};
export function WorkspaceSearch({role}:{role:string}){
  const router=useRouter(),[open,setOpen]=useState(false),[query,setQuery]=useState(""),[results,setResults]=useState<Result[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      const typing=(event.target as HTMLElement)?.closest("input,textarea,select,[contenteditable='true']");
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setOpen(value=>!value);}
      else if(!typing&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==="c"&&!open){event.preventDefault();router.push("/conversations/new");}
      else if(!typing&&event.key==="/"&&!open){event.preventDefault();setOpen(true);}
    };
    document.addEventListener("keydown",keydown);return()=>document.removeEventListener("keydown",keydown);
  },[open,router]);
  useEffect(()=>{
    if(!open||query.trim().length<2)return;
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setBusy(true);setError("");
      try{const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`,{signal:controller.signal,cache:"no-store"});if(!response.ok)throw new Error(response.status===401?"Your session expired. Please sign in again.":"Search is unavailable. Try again.");const data=await response.json();setResults(data.results);}
      catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:"Search unavailable");}
      finally{if(!controller.signal.aborted)setBusy(false);}
    },180);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[query,open]);
  function navigate(href:string){setOpen(false);setQuery("");setResults([]);router.push(href);}
  const links=workspaceLinks.filter(link=>(!link.admin||role==="admin")&&(!query||link.label.toLowerCase().includes(query.toLowerCase())));
  const matches=query.trim().length>=2?results:[];
  return <><Button variant="outline" className="search-trigger" aria-label="Search workspace" onClick={()=>setOpen(true)}><Search size={15}/><span>Search anything…</span><kbd>⌘ / Ctrl K</kbd></Button><CommandDialog open={open} onOpenChange={setOpen} title="Search your workspace" description="Find conversations, contacts and pages. Use arrow keys to navigate." showCloseButton={false}>
    <div className="search-dialog-body"><CommandInput value={query} onValueChange={value=>{setQuery(value);setResults([]);setBusy(value.trim().length>=2);setError("");}} placeholder="Search people, emails or pages…"/><CommandList><CommandEmpty>{busy?"Searching…":error||"No matching results."}</CommandEmpty>{busy&&<div className="search-progress" role="status"><Loader2 size={14} className="animate-spin"/>Searching your accessible data…</div>}{error&&<p className="search-progress" role="alert">{error}</p>}{links.length>0&&<CommandGroup heading="Go to">{links.map(link=><CommandItem key={link.href} value={`${link.label} ${query}`} onSelect={()=>navigate(link.href)}><link.icon size={16}/><span>{link.label}</span><ArrowUpRight size={13} className="ml-auto text-muted-foreground"/></CommandItem>)}</CommandGroup>}{matches.length>0&&<CommandSeparator/>}{[...new Set(matches.map(item=>item.type))].map(type=><CommandGroup key={type} heading={type}>{matches.filter(item=>item.type===type).map(item=><CommandItem key={item.id} value={`${item.id} ${item.title} ${query}`} onSelect={()=>navigate(item.href)}><Search size={15}/><div className="search-result"><strong>{item.title}</strong><small>{item.description}</small></div><CommandShortcut><CornerDownLeft size={13}/></CommandShortcut></CommandItem>)}</CommandGroup>)}{!query&&<CommandGroup heading="Quick actions"><CommandItem value="new compose" onSelect={()=>navigate("/conversations/new")}><span>Compose email</span><CommandShortcut>C</CommandShortcut></CommandItem><CommandItem value="saved drafts" onSelect={()=>navigate("/drafts")}><span>Continue a draft</span></CommandItem></CommandGroup>}</CommandList><div className="search-footer"><span>↑ ↓ navigate · Enter open · Esc close</span><span>Only data you can access</span></div></div>
  </CommandDialog></>;
}
