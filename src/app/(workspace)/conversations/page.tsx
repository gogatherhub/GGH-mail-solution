import { HoverFilter } from "@/components/hover-filter";
import { ConversationTabs } from "@/components/conversation-tabs";
import { Input } from "@/components/ui/input";
import { AutoFilterForm } from "@/components/auto-filter-form";
import Link from "next/link";
import { Shell, Empty, Badge } from "@/components/shell";
import { rows, isDemo } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { conversationStatus, conversationReadFilterSql, latestEngagedSql } from "@/lib/conversation-status";
import { ConversationBulkForm } from "@/components/conversation-bulk-form";

export default async function Conversations({searchParams}:{searchParams:Promise<{q?:string;filter?:string;mailbox?:string;status?:string;time?:string;sort?:string;page?:string;send_status?:string}>}){
  const user=await requireUser(),p=await searchParams,q=(p.q||"").trim().slice(0,120),filter=["inbox","unread","sent"].includes(p.filter||"")?p.filter!:"",sort=p.sort==="oldest"?"ASC":"DESC",page=Math.max(1,Math.min(100000,Number(p.page)||1)),mailbox=Number(p.mailbox)||0,status=["read","unread"].includes(p.status||"")?p.status!:"",time=["today","week","month"].includes(p.time||"")?p.time!:"",size=15;
  const clauses=["(?='' OR c.subject LIKE ? OR ct.name LIKE ? OR ct.email LIKE ? OR EXISTS (SELECT 1 FROM messages sx WHERE sx.conversation_id=c.id AND sx.body_html LIKE ?))"];const args:(string|number)[]=[q,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`];
  if(user.role!=="admin"){clauses.push("c.mailbox_id=?");args.push(Number(user.assigned_mailbox_id)||-1)} else if(mailbox){clauses.push("c.mailbox_id=?");args.push(mailbox)}
  if(filter==="unread")clauses.push("c.unread=1 AND EXISTS (SELECT 1 FROM messages im WHERE im.conversation_id=c.id AND im.direction='inbound')");
  if(filter==="inbox")clauses.push("EXISTS (SELECT 1 FROM messages im WHERE im.conversation_id=c.id AND im.direction='inbound')");
  if(filter==="sent")clauses.push("EXISTS (SELECT 1 FROM messages sm WHERE sm.conversation_id=c.id AND sm.direction='outbound' AND sm.status IN ('sent','delivered','bounced','complaint'))");
  if(status)clauses.push(filter==="inbox"||filter==="unread"?`c.unread=${status==="unread"?1:0}`:conversationReadFilterSql(status as "read"|"unread"));
  if(time){const days=time==="today"?0:time==="week"?7:30;const [clock]=await rows(isDemo?"SELECT datetime('now') AS now":"SELECT DATE_FORMAT(CURRENT_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS now");const now=String(clock.now).replace(" ","T");clauses.push(days?"c.last_message_at>=?":"DATE(c.last_message_at)=?");args.push(days?new Date(new Date(now).getTime()-days*86400000).toISOString().slice(0,19).replace("T"," "):now.slice(0,10))}
  const where=clauses.join(" AND ");
  const [mailboxes,totalRows,items]=await Promise.all([
    rows("SELECT id,email FROM mailboxes"+(user.role==="admin"?"":" WHERE id=?"),user.role==="admin"?[]:[Number(user.assigned_mailbox_id)||-1]),
    rows(`SELECT COUNT(*) n FROM conversations c LEFT JOIN contacts ct ON ct.id=c.contact_id WHERE ${where}`,args),
    rows(`SELECT c.id,c.subject,c.unread,c.last_message_at,ct.name,ct.email,m.email mailbox,(SELECT substr(body_html,1,120) FROM messages mm WHERE mm.conversation_id=c.id ORDER BY mm.id DESC LIMIT 1) preview,(SELECT mm.direction FROM messages mm WHERE mm.conversation_id=c.id ORDER BY mm.id DESC LIMIT 1) direction,(SELECT mm.status FROM messages mm WHERE mm.conversation_id=c.id ORDER BY mm.id DESC LIMIT 1) message_status,${latestEngagedSql} engaged FROM conversations c LEFT JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN mailboxes m ON m.id=c.mailbox_id WHERE ${where} ORDER BY c.last_message_at ${sort},c.id ${sort} LIMIT ? OFFSET ?`,[...args,size,(page-1)*size]),
  ]);
  const [total]=totalRows;
  const base=`/conversations?${new URLSearchParams({filter,q,mailbox:String(mailbox),status,time,sort:p.sort||"newest"}).toString()}`;
  return <Shell title="Conversations" subtitle="All your team emails in one organized inbox" action={{href:"/conversations/new",label:"Compose email"}}>
    {p.send_status==="processing"&&<p className="form-error">This email is already being sent. Please wait before trying again.</p>}<div className="card"><ConversationTabs current={filter}/>
      <div className="toolbar"><AutoFilterForm className="filters"><input type="hidden" name="filter" value={filter}/><Input name="q" placeholder="Search by name, email, subject or message" defaultValue={q}/><HoverFilter name="mailbox" defaultValue={mailbox}><option value="0">All mailboxes</option>{mailboxes.map(m=><option key={Number(m.id)} value={Number(m.id)}>{String(m.email)}</option>)}</HoverFilter><HoverFilter name="status" defaultValue={status}><option value="">All status</option><option value="read">Read</option><option value="unread">Unread</option></HoverFilter><HoverFilter name="time" defaultValue={time}><option value="">Any time</option><option value="today">Today</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option></HoverFilter><HoverFilter name="sort" defaultValue={sort==="ASC"?"oldest":"newest"}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></HoverFilter></AutoFilterForm><small>{Number(total.n)} conversations</small></div>
      {items.length?<ConversationBulkForm total={items.length}><div className="rows">{items.map(x=>{const incoming=x.direction==="inbound",unread=incoming&&Boolean(Number(x.unread)),state=conversationStatus(x);return <div key={Number(x.id)} className={`conversation-row ${unread?"is-unread":""} ${incoming?"is-inbound":"is-outbound"}`}><input className="row-check" type="checkbox" name="ids" value={Number(x.id)} aria-label={`Select ${String(x.subject)}`}/><Link href={`/conversations/${x.id}`} className="conversation-link"><span className="avatar muted">{String(x.name||x.email||"?").slice(0,1).toUpperCase()}</span><span className="row-grow"><strong>{String(x.name||x.email||"Unknown")}</strong><small>{incoming?"From":"To"} {String(x.email||"Unknown")} · {String(x.subject)}</small><small className="row-preview">{String(x.preview||"").replace(/<[^>]*>/g,"").slice(0,100)}</small><span className="badge-line"><Badge tone={incoming?"blue":"neutral"}>{incoming?"Received":["queued","failed","needs_review","cancelled"].includes(String(x.message_status))?"Outgoing":"Sent"}</Badge><Badge tone={state.tone}>{state.label}</Badge></span></span><span className="row-meta"><small>{String(x.mailbox||"")}</small><small>{String(x.last_message_at).slice(0,16)}</small></span></Link></div>})}</div></ConversationBulkForm>:<Empty title="No conversations found" text="Try a different filter or compose a new message." href="/conversations/new" label="Compose email"/>}
      <div className="pager"><span>Showing {items.length?(page-1)*size+1:0}–{Math.min(page*size,Number(total.n))} of {Number(total.n)}</span><div>{page>1&&<Link href={`${base}&page=${page-1}`}>Previous</Link>}{page*size<Number(total.n)&&<Link href={`${base}&page=${page+1}`}>Next</Link>}</div></div><p className="footnote">* Outbound Read/Unread is estimated from opens or link clicks. Mail apps can block open tracking.</p>
    </div>
  </Shell>;
}
