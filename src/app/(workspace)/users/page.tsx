import { UserAvatar } from "@/components/user-avatar";
import { HoverFilter } from "@/components/hover-filter";
import { Input } from "@/components/ui/input";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { BulkDeleteForm } from "@/components/bulk-delete-form";
import Link from "next/link";
import { Shell, Empty, Badge } from "@/components/shell";
import { bulkDeleteUsers } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { rows } from "@/lib/db";

type Params={q?:string;role?:string;job?:string;department?:string;sort?:string;page?:string;bulk_notice?:string};
export default async function Users({searchParams}:{searchParams:Promise<Params>}){
  const admin=await requireAdmin(),p=await searchParams;
  const q=(p.q||"").trim().slice(0,120),role=["admin","employee"].includes(p.role||"")?p.role!:"",job=(p.job||"").slice(0,100),department=(p.department||"").slice(0,120);
  const sort=["oldest","name","name_desc"].includes(p.sort||"")?p.sort!:"newest";
  const page=Math.max(1,Math.min(100000,Number(p.page)||1)),size=15;
  const where="WHERE (?='' OR u.role=?) AND (?='' OR u.job_role=?) AND (?='' OR u.department=?) AND (?='' OR u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.department LIKE ?)";
  const args:(string|number)[]=[role,role,job,job,department,department,q,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`];
  const order=sort==="oldest"?"u.created_at ASC,u.id ASC":sort==="name"?"u.name ASC,u.id ASC":sort==="name_desc"?"u.name DESC,u.id DESC":"u.created_at DESC,u.id DESC";
  const [countRows,users,jobs,departments]=await Promise.all([
    rows(`SELECT COUNT(*) n FROM users u ${where}`,args),
    rows(`SELECT u.*,m.email mailbox,a.updated_at avatar_updated FROM users u LEFT JOIN mailboxes m ON m.id=u.assigned_mailbox_id LEFT JOIN user_avatars a ON a.user_id=u.id ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,[...args,size,(page-1)*size]),
    rows("SELECT DISTINCT job_role FROM users WHERE job_role IS NOT NULL AND job_role<>'' ORDER BY job_role"),
    rows("SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department<>'' ORDER BY department"),
  ]);
  const count=Number(countRows[0]?.n||0),query=new URLSearchParams({q,role,job,department,sort}),href=(n:number)=>`/users?${query.toString()}&page=${n}`;
  return <Shell title="Users" subtitle="Manage team access and mailbox assignments" action={{href:"/users/new",label:"Add user"}}>
    {p.bulk_notice==="self_skipped"&&<p className="form-error">Your own admin account was kept. Other selected users were deleted.</p>}
    <div className="card"><div className="list-title"><strong>All users</strong><span>{count} total</span></div>
      <div className="toolbar"><AutoFilterForm className="filters"><Input name="q" defaultValue={q} placeholder="Search by name, email, phone or department"/><HoverFilter name="role" defaultValue={role}><option value="">All access roles</option><option value="admin">Admin</option><option value="employee">Employee</option></HoverFilter><HoverFilter name="job" defaultValue={job}><option value="">All job roles</option>{jobs.map(x=><option key={String(x.job_role)} value={String(x.job_role)}>{String(x.job_role)}</option>)}</HoverFilter><HoverFilter name="department" defaultValue={department}><option value="">All departments</option>{departments.map(x=><option key={String(x.department)} value={String(x.department)}>{String(x.department)}</option>)}</HoverFilter><HoverFilter name="sort" defaultValue={sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="name_desc">Name Z–A</option></HoverFilter></AutoFilterForm></div>
      {users.length?<BulkDeleteForm action={bulkDeleteUsers} label="users" total={users.filter(u=>Number(u.id)!==Number(admin.id)).length}><div className="table-wrap"><table><thead><tr><th>Select</th><th>Name</th><th>Department</th><th>Job role</th><th>Phone</th><th>Email</th><th>Access</th><th>Actions</th></tr></thead><tbody>{users.map(u=><tr key={Number(u.id)}><td><input className="bulk-row-check" type="checkbox" name="ids" value={Number(u.id)} aria-label={`Select ${String(u.username)}`} disabled={Number(u.id)===Number(admin.id)}/></td><td><Link className="table-person" href={`/users/${u.id}`}><UserAvatar userId={Number(u.id)} name={String(u.name||u.username)} version={u.avatar_updated} className="muted"/><strong>{String(u.name)}</strong></Link></td><td>{String(u.department||"—")}</td><td>{String(u.job_role||"—")}</td><td>{String(u.phone||"—")}</td><td>{String(u.email||"—")}</td><td><Badge tone={u.role==="admin"?"blue":"neutral"}>{String(u.role)}</Badge></td><td><Link className="text-link" href={`/users/${u.id}`}>Edit</Link></td></tr>)}</tbody></table></div></BulkDeleteForm>:<Empty title="No users found" text="Try different filters or add a user." href="/users/new" label="Add user"/>}
      <div className="pager"><span>Showing {users.length?(page-1)*size+1:0}–{Math.min(page*size,count)} of {count}</span><div>{page>1&&<Link href={href(page-1)}>Previous</Link>}{page*size<count&&<Link href={href(page+1)}>Next</Link>}</div></div>
    </div>
  </Shell>;
}
