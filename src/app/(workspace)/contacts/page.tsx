import { HoverFilter } from "@/components/hover-filter";
import { emailFactsSql } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { BulkDeleteForm } from "@/components/bulk-delete-form";
import Link from "next/link";
import { Shell, Empty, Badge } from "@/components/shell";
import { rows } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bulkDeleteContacts, importContacts } from "@/app/actions";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string;consent?:string;sort?:string;page?:string;bulk_notice?:string;imported?:string;duplicates?:string;invalid?:string }> }) {
  await requireAdmin(); const p = await searchParams; const q = (p.q || "").trim().slice(0,120); const kind = ["client","vendor","planner"].includes(p.kind || "") ? p.kind! : "",consent=["yes","no"].includes(p.consent||"")?p.consent!:"",sort=p.sort==="oldest"?"ASC":"DESC",page=Math.max(1,Math.min(100000,Number(p.page)||1)),size=20;
  const where="WHERE (?='' OR c.kind=?) AND (?='' OR c.consent=?) AND (?='' OR c.name LIKE ? OR c.email LIKE ? OR c.company LIKE ?)";
  const args:(string|number)[]=[kind,kind,consent,consent==="yes"?1:0,q,`%${q}%`,`%${q}%`,`%${q}%`];
  const [countRows,contacts] = await Promise.all([
    rows(`SELECT COUNT(*) n FROM contacts c ${where}`,args),
    rows(`SELECT c.*,COALESCE(activity.sent,0) sent,COALESCE(activity.opened,0) opened,COALESCE(activity.clicked,0) clicked FROM contacts c LEFT JOIN (SELECT contact_id,SUM(sent) sent,SUM(CASE WHEN sent=1 THEN opened ELSE 0 END) opened,SUM(CASE WHEN sent=1 THEN clicked ELSE 0 END) clicked FROM (${emailFactsSql}) facts GROUP BY contact_id) activity ON activity.contact_id=c.id ${where} ORDER BY c.created_at ${sort},c.id ${sort} LIMIT ? OFFSET ?`, [...args,size,(page-1)*size]),
  ]);
  const [count]=countRows;
  const base=`/contacts?${new URLSearchParams({q,kind,consent,sort:p.sort||"newest"}).toString()}`;
  return <Shell title="Contacts" subtitle="Organize clients, vendors and planners in one place" action={{ href:"/contacts/new",label:"Add contact" }}>
    {p.imported!==undefined&&<p className="import-result" role="status">{Math.max(0,Number(p.imported)||0)} contacts added · {Math.max(0,Number(p.duplicates)||0)} duplicates skipped · {Math.max(0,Number(p.invalid)||0)} invalid rows skipped. Existing records and email history were preserved.</p>}
    {p.bulk_notice==="in_use"&&<p className="form-error">Contacts with conversation or campaign history were kept to preserve analytics.</p>}
    <div className="card"><div className="list-title"><strong>All contacts</strong><span>{Number(count.n)} total</span></div><div className="toolbar"><AutoFilterForm className="filters"><Input name="q" placeholder="Search name, email or company" defaultValue={q}/><HoverFilter name="kind" defaultValue={kind}><option value="">All contacts</option><option value="client">Clients</option><option value="vendor">Vendors</option><option value="planner">Planners</option></HoverFilter><HoverFilter name="consent" defaultValue={consent}><option value="">Any consent</option><option value="yes">Opted in</option><option value="no">Not opted in</option></HoverFilter><HoverFilter name="sort" defaultValue={sort==="ASC"?"oldest":"newest"}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></HoverFilter></AutoFilterForm></div>
      {contacts.length ? <BulkDeleteForm action={bulkDeleteContacts} label="contacts" total={contacts.length}><div className="table-wrap"><table><thead><tr><th>Select</th><th>Contact</th><th>Category</th><th>Company</th><th>Emails sent</th><th>Opens</th><th>Clicks</th><th>Consent</th></tr></thead><tbody>{contacts.map(c=><tr key={Number(c.id)}><td><input className="bulk-row-check" type="checkbox" name="ids" value={Number(c.id)} aria-label={`Select ${String(c.name)}`}/></td><td><Link className="table-person" href={`/contacts/${c.id}`}><span className="avatar muted">{String(c.name).slice(0,1).toUpperCase()}</span><span><strong>{String(c.name)}</strong><small>{String(c.email)}</small></span></Link></td><td><Badge tone="blue">{String(c.kind)}</Badge></td><td>{String(c.company || "—")}</td><td>{Number(c.sent)}</td><td>{Number(c.opened)}</td><td>{Number(c.clicked)}</td><td>{Number(c.consent) ? <Badge tone="success">Opted in</Badge> : <Badge>Not opted in</Badge>}</td></tr>)}</tbody></table></div></BulkDeleteForm> : <Empty title="No contacts found" text="Add your first contact or change the filters." href="/contacts/new" label="Add contact"/>}
      <div className="pager"><span>Showing {contacts.length?(page-1)*size+1:0}–{Math.min(page*size,Number(count.n))} of {Number(count.n)}</span><div>{page>1&&<Link href={`${base}&page=${page-1}`}>Previous</Link>}{page*size<Number(count.n)&&<Link href={`${base}&page=${page+1}`}>Next</Link>}</div></div></div>
    <section className="card import-card"><div><h2>Import contacts in bulk</h2><p>CSV columns: name, email, kind, company, phone, tags, consent. Matching emails are skipped; existing details, consent and send history stay intact. New email addresses are added once.</p></div><form action={importContacts}><input type="file" name="file" accept=".csv,text/csv" required/><SubmitButton pendingLabel="Importing…" className="button secondary">Import CSV</SubmitButton></form></section>
  </Shell>;
}
