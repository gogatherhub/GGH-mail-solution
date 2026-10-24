import { AutoFilterForm } from "@/components/auto-filter-form";
import { BulkDeleteForm } from "@/components/bulk-delete-form";
import Link from "next/link";
import { Shell, Empty, Badge } from "@/components/shell";
import { bulkDeleteMailboxes } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { rows } from "@/lib/db";

type Params={q?:string;type?:string;status?:string;sort?:string;page?:string;bulk_notice?:string};
export default async function Mailboxes({searchParams}:{searchParams:Promise<Params>}){
  await requireAdmin();const p=await searchParams,q=(p.q||"").trim().slice(0,120),type=(p.type||"").slice(0,40),status=["active","inactive"].includes(p.status||"")?p.status!:"",sort=["oldest","email","email_desc"].includes(p.sort||"")?p.sort!:"newest",page=Math.max(1,Math.min(100000,Number(p.page)||1)),size=10;
  const where="WHERE (?='' OR type=?) AND (?='' OR status=?) AND (?='' OR email LIKE ? OR display_name LIKE ?)";
  const args:(string|number)[]=[type,type,status,status,q,`%${q}%`,`%${q}%`];
  const order=sort==="oldest"?"created_at ASC,id ASC":sort==="email"?"email ASC,id ASC":sort==="email_desc"?"email DESC,id DESC":"created_at DESC,id DESC";
  const [countRows,list,types]=await Promise.all([
    rows(`SELECT COUNT(*) n FROM mailboxes ${where}`,args),
    rows(`SELECT * FROM mailboxes ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,[...args,size,(page-1)*size]),
    rows("SELECT DISTINCT type FROM mailboxes WHERE type IS NOT NULL AND type<>'' ORDER BY type"),
  ]);
  const count=Number(countRows[0]?.n||0),query=new URLSearchParams({q,type,status,sort}),href=(n:number)=>`/email-accounts?${query.toString()}&page=${n}`;
  return <Shell title="Email accounts" subtitle="Manage shared mailboxes and account settings" action={{href:"/email-accounts/new",label:"Create email account"}}>
    {p.bulk_notice==="in_use"&&<p className="form-error">Mailboxes with conversations, campaigns or assigned users were kept. Deactivate them if you no longer want to send from them.</p>}
    <div className="card"><div className="list-title"><strong>All email accounts</strong><span>{count} total</span></div>
      <div className="toolbar"><AutoFilterForm className="filters"><input name="q" defaultValue={q} placeholder="Search by email address or display name"/><select name="type" defaultValue={type}><option value="">All types</option>{types.map(x=><option key={String(x.type)} value={String(x.type)}>{String(x.type)}</option>)}</select><select name="status" defaultValue={status}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select name="sort" defaultValue={sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="email">Email A–Z</option><option value="email_desc">Email Z–A</option></select></AutoFilterForm></div>
      {list.length?<BulkDeleteForm action={bulkDeleteMailboxes} label="mailboxes" total={list.length}><div className="table-wrap"><table><thead><tr><th>Select</th><th>Email address</th><th>Display name</th><th>Type</th><th>Quota (MB)</th><th>Status</th><th>Created at</th><th>Actions</th></tr></thead><tbody>{list.map(m=><tr key={Number(m.id)}><td><input className="bulk-row-check" type="checkbox" name="ids" value={Number(m.id)} aria-label={`Select ${String(m.email)}`}/></td><td><Link className="table-person" href={`/email-accounts/${m.id}`}><span className="avatar muted">{String(m.email).slice(0,1).toUpperCase()}</span><strong>{String(m.email)}</strong></Link></td><td>{String(m.display_name)}</td><td><Badge tone="blue">{String(m.type)}</Badge></td><td>{Number(m.quota_mb)}</td><td><Badge tone={m.status==="active"?"success":"warning"}>{String(m.status)}</Badge></td><td>{String(m.created_at).slice(0,10)}</td><td><Link className="text-link" href={`/email-accounts/${m.id}`}>Edit</Link></td></tr>)}</tbody></table></div></BulkDeleteForm>:<Empty title="No mailboxes found" text="Try different filters or add a mailbox." href="/email-accounts/new" label="Add mailbox"/>}
      <div className="pager"><span>Showing {list.length?(page-1)*size+1:0}–{Math.min(page*size,count)} of {count}</span><div>{page>1&&<Link href={href(page-1)}>Previous</Link>}{page*size<count&&<Link href={href(page+1)}>Next</Link>}</div></div>
    </div>
  </Shell>;
}
