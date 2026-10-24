"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CloudUpload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendConversation } from "@/app/actions";
import { RichEditor } from "@/components/rich-editor";
import { SendButton } from "@/components/send-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DraftFields } from "@/lib/drafts";

export function DraftComposer({ id, initial, revision: initialRevision = 0, mailboxes, reply = false }: { id: string; initial: DraftFields; revision?: number; mailboxes: { id: number; email: string }[]; reply?: boolean }) {
  const router = useRouter();
  const [fields,setFields] = useState(initial), [status,setStatus] = useState(initialRevision?"Saved to drafts":"Draft saves automatically"), [saving,setSaving] = useState(false), [blocked,setBlocked] = useState(false);
  const revision = useRef(initialRevision), latest = useRef(initial), saved = useRef(JSON.stringify(initial)), inFlight = useRef<Promise<boolean>|null>(null), mounted = useRef(true), stopped = useRef(false), consumed = useRef(false), form = useRef<HTMLFormElement>(null);
  const save = useCallback(async function saveDraft(): Promise<boolean> {
    if (stopped.current) return false;
    if (inFlight.current) { if (!await inFlight.current) return false; return saveDraft(); }
    const snapshot = JSON.stringify(latest.current);
    if (snapshot === saved.current) return true;
    if (mounted.current) { setSaving(true); setStatus("Saving draft…"); }
    const operation = (async () => {
      try {
        const response = await fetch("/api/drafts", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,revision:revision.current,fields:latest.current}),keepalive:snapshot.length<50_000 });
        const result = await response.json();
        if (!response.ok) {
          if (response.status===409 || response.status===410) { stopped.current = true; consumed.current=response.status===410; if (mounted.current) setBlocked(true); }
          throw new Error(result.error || "Draft could not be saved. Try again.");
        }
        revision.current = Number(result.revision); saved.current = snapshot;
        if (mounted.current) setStatus(JSON.stringify(latest.current)===snapshot?"All changes saved":"Unsaved changes");
        return true;
      } catch (error) { if (mounted.current) setStatus(error instanceof Error?error.message:"Draft could not be saved"); return false; }
      finally { if (mounted.current) setSaving(false); inFlight.current = null; }
    })();
    inFlight.current = operation;
    return operation;
  }, [id]);
  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    const next = {...latest.current,[key]:value}; latest.current = next; setFields(next); setStatus("Unsaved changes");
  }
  useEffect(() => {
    if (JSON.stringify(fields)===saved.current) return;
    const timer = window.setTimeout(()=>{void save();},650);
    return ()=>window.clearTimeout(timer);
  },[fields,save]);
  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!consumed.current && JSON.stringify(latest.current)!==saved.current) { event.preventDefault(); event.returnValue=""; } };
    window.addEventListener("beforeunload",beforeUnload);
    return ()=>{ mounted.current=false; window.removeEventListener("beforeunload",beforeUnload); void save(); };
  },[save]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey||event.metaKey)&&event.key==="Enter"&&form.current?.dataset.draftBlocked!=="true"&&!form.current?.querySelector('button[aria-busy="true"]')) { event.preventDefault(); form.current?.requestSubmit(); } };
    document.addEventListener("keydown",shortcut); return ()=>document.removeEventListener("keydown",shortcut);
  },[]);
  async function keepDraft() { if (!revision.current) saved.current=""; if (await save()) { toast.success("Draft saved"); router.push("/drafts"); router.refresh(); } }
  return <form ref={form} action={sendConversation} data-draft-blocked={blocked} className={reply?"stack":"card compose-card"}>
    <input type="hidden" name="idempotency_key" value={id}/><input type="hidden" name="draft_id" value={id}/><input type="hidden" name="conversation_id" value={fields.conversation_id}/>
    {!reply&&<div className="card-head"><div><h2>Compose email</h2><p>Your draft is private and saves as you write.</p></div><SendButton disabled={blocked} className="button primary">Send</SendButton></div>}
    <div className={reply?"stack":"compose-fields"}>
      {reply?<><input type="hidden" name="mailbox_id" value={fields.mailbox_id}/><input type="hidden" name="to" value={fields.to}/><input type="hidden" name="subject" value={fields.subject}/></>:<>
        <label><span>From</span><select aria-label="From" name="mailbox_id" value={fields.mailbox_id||""} required onChange={e=>update("mailbox_id",Number(e.target.value))}><option value="">Select mailbox</option>{mailboxes.map(m=><option key={m.id} value={m.id}>{m.email}</option>)}</select></label>
        <label><span>To</span><Input name="to" type="email" value={fields.to} onChange={e=>update("to",e.target.value)} placeholder="recipient@example.com" required/></label>
        <label><span>Name</span><Input name="name" value={fields.name} onChange={e=>update("name",e.target.value)} placeholder="Optional contact name"/></label>
        <label><span>Cc</span><Input name="cc" value={fields.cc} onChange={e=>update("cc",e.target.value)} placeholder="Optional, comma separated"/></label>
        <label><span>Bcc</span><Input name="bcc" value={fields.bcc} onChange={e=>update("bcc",e.target.value)} placeholder="Optional, comma separated"/></label>
        <label><span>Subject</span><Input name="subject" value={fields.subject} onChange={e=>update("subject",e.target.value)} placeholder="What is this email about?" required maxLength={500}/></label>
      </>}
      <div className={reply?"":"compose-editor"}><RichEditor key={id} initial={initial.body_html} placeholder={reply?"Write your reply...":"Write your message..."} onChange={value=>update("body_html",value)}/></div>
      <div className="draft-status" role="status">{saving?<Loader2 size={14} className="animate-spin"/>:status.includes("saved")?<Check size={14}/>:<CloudUpload size={14}/>}<span>{status}</span><Link href="/drafts">View drafts</Link></div>
      <label className="compose-attachment"><span>Attachments</span><input type="file" name="attachments" multiple/></label><p className="helper">Up to 5 files, 10 MB each, 20 MB total. Reattach files when reopening a draft.</p>
      <div className="form-actions"><SendButton disabled={blocked} className="button primary">{reply?"Send reply":"Send email"}</SendButton><Button type="button" variant="outline" onClick={keepDraft} disabled={saving||blocked}><FileText size={15}/>Save draft</Button><span className="compose-shortcut">Ctrl / ⌘ + Enter to send</span></div>
    </div>
  </form>;
}
