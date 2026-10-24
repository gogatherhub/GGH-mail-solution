import Link from "next/link";
import { FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { rows } from "@/lib/db";
import { draftFields, draftAllowed } from "@/lib/drafts";
import { Shell, Empty } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { deleteDraft } from "@/app/draft-actions";

export default async function Drafts({searchParams}:{searchParams:Promise<{page?:string}>}) {
  const user = await requireUser(), p = await searchParams, page = Math.max(1,Math.min(100000,Number(p.page)||1)),size=25;
  const [items,count] = await Promise.all([rows("SELECT id,payload_json,revision,updated_at FROM email_drafts WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?",[Number(user.id),size,(page-1)*size]),rows("SELECT COUNT(*) n FROM email_drafts WHERE user_id=?",[Number(user.id)])]);
  const drafts = (await Promise.all(items.map(async item=>{const parsed=draftFields.safeParse(JSON.parse(String(item.payload_json)));return parsed.success&&await draftAllowed(user,parsed.data)?{id:String(item.id),updated_at:String(item.updated_at),fields:parsed.data}:null;}))).filter(item=>item!==null);
  return <Shell title="Drafts" subtitle="Private to you. Pick up exactly where you left off." action={{href:"/conversations/new",label:"New email"}}><div className="card"><div className="list-title"><FileText size={17}/><strong>Saved drafts</strong><span>{Number(count[0]?.n||0)} total</span></div>{drafts.length?<div className="rows">{drafts.map(draft=><div className="draft-row" key={String(draft.id)}><Link href={`/conversations/new?draft=${draft.id}`} className="conversation-link"><span className="avatar muted"><FileText size={18}/></span><span className="row-grow"><strong>{draft.fields.subject||"Untitled email"}</strong><small>{draft.fields.to||"No recipient yet"} · Saved {String(draft.updated_at).slice(0,16)}</small><small>{draft.fields.body_html.replace(/<[^>]*>/g," ").slice(0,110)||"Keep writing your message…"}</small></span></Link><form action={deleteDraft}><input type="hidden" name="id" value={String(draft.id)}/><SubmitButton variant="ghost" size="sm" pendingLabel="Discarding…">Discard</SubmitButton></form></div>)}</div>:<Empty title="Space for your next idea" text="Start an email. Your draft will save automatically as you write." href="/conversations/new" label="Start writing"/>}<div className="pager"><span>Attachments need to be reattached when reopening a draft.</span><div>{page>1&&<Link href={`/drafts?page=${page-1}`}>Previous</Link>}{page*size<Number(count[0]?.n||0)&&<Link href={`/drafts?page=${page+1}`}>Next</Link>}</div></div></div></Shell>;
}
