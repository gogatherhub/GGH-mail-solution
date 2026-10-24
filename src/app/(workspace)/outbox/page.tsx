import { SendingBudgetPanel } from "@/components/sending-budget";
import { HoverFilter } from "@/components/hover-filter";
import Link from "next/link";
import { Clock3, Send, TriangleAlert, CircleCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { rows } from "@/lib/db";
import { Shell, Badge, Empty } from "@/components/shell";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { retryOutbox, cancelOutbox } from "@/app/outbox-actions";

export default async function Outbox({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const user = await requireUser(), p = await searchParams;
  const q = (p.q || "").trim().slice(0,120), status = ["queued","processing","sent","failed","needs_review","cancelled"].includes(p.status || "") ? p.status! : "";
  const page = Math.max(1,Math.min(100000,Number(p.page)||1)), size = 25;
  const scope = user.role === "admin" ? "1=1" : "co.mailbox_id=? AND o.user_id=?";
  const args: (string|number)[] = user.role === "admin" ? [] : [Number(user.assigned_mailbox_id)||-1, Number(user.id)];
  const where = `${scope} AND (?='' OR o.status=?) AND (?='' OR m.recipient LIKE ? OR m.subject LIKE ?)`;
  const filters = [...args,status,status,q,`%${q}%`,`%${q}%`];
  const join = "FROM email_outbox o JOIN messages m ON m.id=o.message_id JOIN conversations co ON co.id=m.conversation_id";
  const [items, count, stats] = await Promise.all([
    rows(`SELECT o.id,o.status,o.attempts,o.last_error,o.created_at,o.sent_at,m.subject,m.recipient,m.conversation_id ${join} WHERE ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...filters,size,(page-1)*size]),
    rows(`SELECT COUNT(*) n ${join} WHERE ${where}`,filters),
    rows(`SELECT o.status,COUNT(*) n ${join} WHERE ${scope} GROUP BY o.status`,args),
  ]);
  const number = (statuses: string[]) => stats.filter(row => statuses.includes(String(row.status))).reduce((n,row)=>n+Number(row.n),0);
  const total = Number(count[0]?.n||0), base = new URLSearchParams({q,status});
  return <Shell title="Outbox" subtitle="Every email has a clear status. Queued emails send in the background." action={{ href: "/conversations/new", label: "Compose email" }}>
    <SendingBudgetPanel/><div className="stat-grid"><Summary icon={<Clock3 size={19}/>} label="Waiting / sending" value={number(["queued","processing"])} tone="blue"/><Summary icon={<CircleCheck size={19}/>} label="Provider accepted" value={number(["sent"])} tone="green"/><Summary icon={<TriangleAlert size={19}/>} label="Needs attention" value={number(["failed","needs_review"])} tone="orange"/><Summary icon={<Send size={19}/>} label="Total queued requests" value={stats.reduce((n,row)=>n+Number(row.n),0)} tone="purple"/></div>
    <div className="card"><div className="toolbar"><AutoFilterForm className="filters"><Input name="q" defaultValue={q} aria-label="Search outbox" placeholder="Search recipient or subject"/><HoverFilter name="status" defaultValue={status} aria-label="Outbox status"><option value="">All statuses</option>{["queued","processing","sent","failed","needs_review","cancelled"].map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</HoverFilter></AutoFilterForm></div>
      {items.length ? <div className="table-wrap"><table><thead><tr><th>Recipient / subject</th><th>Status</th><th>Queued</th><th>Details</th><th>Actions</th></tr></thead><tbody>{items.map(item=><tr key={Number(item.id)}><td><Link className="table-person" href={`/conversations/${item.conversation_id}`}><span className="avatar muted"><Send size={16}/></span><span><strong>{String(item.recipient)}</strong><small>{String(item.subject)}</small></span></Link></td><td><Badge tone={item.status==="sent"?"success":item.status==="failed"||item.status==="needs_review"?"danger":"blue"}>{String(item.status).replaceAll("_"," ")}</Badge></td><td>{String(item.created_at).slice(0,16)}</td><td><span className="outbox-detail">{String(item.last_error || (item.status==="sent"?"Accepted by your provider. Delivery is tracked separately.":item.status==="queued"?"Saved safely. Waiting for the worker.":item.status==="processing"?"Your provider is processing this email.":"Request cancelled."))}</span></td><td><div className="button-row"><Link className="text-link" href={`/conversations/${item.conversation_id}`}>View email</Link>{item.status==="failed"&&<form action={retryOutbox}><input type="hidden" name="id" value={Number(item.id)}/><SubmitButton size="sm" variant="outline" pendingLabel="Queuing…">Retry</SubmitButton></form>}{["queued","failed"].includes(String(item.status))&&<form action={cancelOutbox}><input type="hidden" name="id" value={Number(item.id)}/><SubmitButton size="sm" variant="ghost" pendingLabel="Cancelling…">Cancel</SubmitButton></form>}</div></td></tr>)}</tbody></table></div> : <Empty title="Your outbox is clear" text="New emails appear here as soon as they are queued."/>}
      <div className="pager"><span>{total} email requests</span><div>{page>1&&<Link href={`/outbox?${base}&page=${page-1}`}>Previous</Link>}{page*size<total&&<Link href={`/outbox?${base}&page=${page+1}`}>Next</Link>}</div></div><p className="footnote">Unconfirmed sends are never retried automatically. Review your provider before sending another copy.</p>
    </div>
  </Shell>;
}
function Summary({ icon,label,value,tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) { return <div className={`stat-card stat-${tone}`}><div className="stat-top"><span className="stat-icon">{icon}</span></div><strong>{label}</strong><span className="stat-value">{value}</span></div>; }
