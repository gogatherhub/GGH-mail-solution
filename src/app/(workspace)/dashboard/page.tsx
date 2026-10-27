import { indiaInboxTimestamp } from "@/lib/india-time";
import { SendingBudgetPanel } from "@/components/sending-budget";
import { HoverFilter } from "@/components/hover-filter";
import { Card } from "@/components/ui/card";
import { Suspense } from "react";
import { DashboardActivity } from "@/components/dashboard-activity";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AutoFilterForm } from "@/components/auto-filter-form";
import Link from "next/link";
import { Inbox, MailOpen, Send, Mail, ArrowUpRight, UserPlus } from "lucide-react";
import { Shell, Empty, Badge } from "@/components/shell";
import { rows, isDemo } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { conversationStatus, conversationReadFilterSql, latestEngagedSql } from "@/lib/conversation-status";

type Params={date?:string;q?:string;mailbox?:string;status?:string;sort?:string;page?:string};

export default async function Dashboard({searchParams}:{searchParams:Promise<Params>}){
  const user=await requireUser(),p=await searchParams;
  const selectedDate=/^\d{4}-\d{2}-\d{2}$/.test(p.date||"")?p.date!:"";
  const q=(p.q||"").trim().slice(0,120),mailbox=Number(p.mailbox)||0,status=["read","unread"].includes(p.status||"")?p.status!:"",sort=p.sort==="oldest"?"ASC":"DESC",page=Math.max(1,Math.min(100000,Number(p.page)||1)),size=7;
  const scope=user.role==="admin"?"":" AND c.mailbox_id=?",scopeArgs=user.role==="admin"?[]:[Number(user.assigned_mailbox_id)||-1];
  const where=["(?='' OR c.subject LIKE ? OR ct.name LIKE ? OR ct.email LIKE ?)"];const args:(string|number)[]=[q,`%${q}%`,`%${q}%`,`%${q}%`];
  if(user.role!=="admin"){where.push("c.mailbox_id=?");args.push(Number(user.assigned_mailbox_id)||-1)}else if(mailbox){where.push("c.mailbox_id=?");args.push(mailbox)}
  if(status)where.push(conversationReadFilterSql(status as "read"|"unread"));
  const clause=where.join(" AND "),todaySql=isDemo?"date('now')":"CURRENT_DATE()";
  const [clock,statsRows,mailboxes,totalRows,recent,directTodayRows,campaignStatsRows,recentCampaigns]=await Promise.all([
    selectedDate?Promise.resolve([{today:selectedDate}]):rows(isDemo?"SELECT DATE('now') AS today":"SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS today"),
    rows(`SELECT COUNT(*) total,SUM(CASE WHEN c.unread=1 THEN 1 ELSE 0 END) unread FROM conversations c WHERE 1=1${scope}`,scopeArgs),
    rows("SELECT id,email,status FROM mailboxes"+(user.role==="admin"?"":" WHERE id=?"),user.role==="admin"?[]:[Number(user.assigned_mailbox_id)||-1]),
    rows(`SELECT COUNT(*) n FROM conversations c LEFT JOIN contacts ct ON ct.id=c.contact_id WHERE ${clause}`,args),
    rows(`SELECT c.id,c.subject,c.unread,c.last_message_at,ct.name,ct.email,m.email mailbox,(SELECT mm.direction FROM messages mm WHERE mm.conversation_id=c.id ORDER BY mm.id DESC LIMIT 1) direction,(SELECT mm.status FROM messages mm WHERE mm.conversation_id=c.id ORDER BY mm.id DESC LIMIT 1) message_status,${latestEngagedSql} engaged FROM conversations c LEFT JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN mailboxes m ON m.id=c.mailbox_id WHERE ${clause} ORDER BY c.last_message_at ${sort},c.id ${sort} LIMIT ? OFFSET ?`,[...args,size,(page-1)*size]),
    rows(`SELECT COUNT(*) n FROM messages mm JOIN conversations c ON c.id=mm.conversation_id WHERE DATE(mm.created_at)=COALESCE(?,${todaySql}) AND mm.direction='outbound' AND mm.status IN ('sent','delivered','bounced','complaint')${scope}`,[selectedDate||null,...scopeArgs]),
    user.role==="admin"?rows(`SELECT COUNT(DISTINCT ca.id) campaigns,SUM(CASE WHEN cr.sent_at IS NOT NULL THEN 1 ELSE 0 END) sent,SUM(CASE WHEN cr.delivered_at IS NOT NULL THEN 1 ELSE 0 END) delivered,SUM(CASE WHEN cr.opened_at IS NOT NULL THEN 1 ELSE 0 END) opened,SUM(CASE WHEN cr.clicked_at IS NOT NULL THEN 1 ELSE 0 END) clicked,SUM(CASE WHEN DATE(cr.sent_at)=COALESCE(?,${todaySql}) THEN 1 ELSE 0 END) selected_day FROM campaigns ca LEFT JOIN campaign_recipients cr ON cr.campaign_id=ca.id`,[selectedDate||null]):Promise.resolve([]),
    user.role==="admin"?rows("SELECT ca.id,ca.name,ca.segment,ca.status,COUNT(cr.id) recipients,SUM(CASE WHEN cr.sent_at IS NOT NULL THEN 1 ELSE 0 END) sent,SUM(CASE WHEN cr.opened_at IS NOT NULL THEN 1 ELSE 0 END) opened,SUM(CASE WHEN cr.clicked_at IS NOT NULL THEN 1 ELSE 0 END) clicked FROM campaigns ca LEFT JOIN campaign_recipients cr ON cr.campaign_id=ca.id GROUP BY ca.id ORDER BY ca.id DESC LIMIT 5"):Promise.resolve([]),
  ]);
  const date=selectedDate||String(clock[0]?.today||"").slice(0,10),stats=statsRows[0],total=totalRows[0],campaign=campaignStatsRows[0];
  const messagesToday=Number(directTodayRows[0]?.n||0)+Number(campaign?.selected_day||0),campaignSent=Number(campaign?.sent||0),campaignDelivered=Number(campaign?.delivered||0),campaignClicked=Number(campaign?.clicked||0);
  const base=`/dashboard?${new URLSearchParams({date,q,mailbox:String(mailbox),status,sort:p.sort||"newest"}).toString()}`;
  return <Shell title="Dashboard" subtitle="Overview of your email conversations and activity">
    <div className="dashboard-date"><AutoFilterForm><Input aria-label="Dashboard date" type="date" name="date" defaultValue={date}/></AutoFilterForm></div>
    <div className="stat-grid">
      <Stat href="/conversations" icon={<Inbox size={20}/>} label="Total conversations" value={Number(stats?.total||0)} note="All email threads in the system" tone="blue"/>
      <Stat href="/conversations?filter=unread" icon={<MailOpen size={20}/>} label="Unread" value={Number(stats?.unread||0)} note="Conversations waiting for you" tone="orange"/>
      <Stat href={user.role==="admin"?"/campaigns":"/conversations?filter=sent"} icon={<Send size={20}/>} label="Messages on selected date" value={messagesToday} note={`${date} · direct + campaign`} tone="green"/>
      <Stat href={user.role==="admin"?"/email-accounts":"/conversations"} icon={<Mail size={20}/>} label="Active mailboxes" value={mailboxes.filter(m=>m.status==="active").length} note="Total active email accounts" tone="purple"/>
    </div>
    <SendingBudgetPanel/><Suspense fallback={<Skeleton className="mb-6 h-80 rounded-xl"/>}><DashboardActivity user={user}/></Suspense>
    {user.role==="admin"&&<Card className="card campaign-dashboard gap-0 py-0"><div className="card-head"><div><h2>Campaign performance</h2><p>{Number(campaign?.campaigns||0)} campaigns · all time</p></div><Link href="/campaigns" className="text-link">View campaigns</Link></div><div className="stat-grid campaign-dashboard-stats"><Metric label="Campaign emails sent" value={campaignSent}/><Metric label="Delivered" value={campaignDelivered}/><Metric label="Unique opens*" value={Number(campaign?.opened||0)}/><Metric label="Clicks / click rate" value={`${campaignClicked} · ${(campaignDelivered||campaignSent)?((campaignClicked/(campaignDelivered||campaignSent))*100).toFixed(1):"0.0"}%`}/></div>{recentCampaigns.length>0&&<div className="table-wrap"><table><thead><tr><th>Recent campaign</th><th>Audience</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Opens</th><th>Clicks</th></tr></thead><tbody>{recentCampaigns.map(c=><tr key={Number(c.id)}><td><Link href={`/campaigns/${c.id}`} className="text-link">{String(c.name)}</Link></td><td>{String(c.segment)}</td><td><Badge tone={c.status==="queued"?"blue":c.status==="paused"?"warning":"neutral"}>{String(c.status)}</Badge></td><td>{Number(c.recipients||0)}</td><td>{Number(c.sent||0)}</td><td>{Number(c.opened||0)}</td><td>{Number(c.clicked||0)}</td></tr>)}</tbody></table></div>}</Card>}
    <div className="two-col dashboard-columns"><Card className="card gap-0 py-0"><div className="card-head"><h2>Recent conversations</h2><Link href="/conversations" className="text-link">View all</Link></div><div className="toolbar"><AutoFilterForm className="filters"><Input name="q" defaultValue={q} placeholder="Search conversations"/><HoverFilter name="mailbox" defaultValue={mailbox}><option value="0">All mailboxes</option>{mailboxes.map(m=><option key={Number(m.id)} value={Number(m.id)}>{String(m.email)}</option>)}</HoverFilter><HoverFilter name="status" defaultValue={status}><option value="">All status</option><option value="read">Read</option><option value="unread">Unread</option></HoverFilter><HoverFilter name="sort" defaultValue={sort==="ASC"?"oldest":"newest"}><option value="newest">Latest first</option><option value="oldest">Oldest first</option></HoverFilter></AutoFilterForm></div>{recent.length?<div className="table-wrap"><table><thead><tr><th>From / To</th><th>Subject</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>{recent.map(x=><tr className="linked-table-row" key={Number(x.id)}><td><span className="table-person"><span className="avatar muted">{String(x.name||x.email||"?").slice(0,1).toUpperCase()}</span><span><strong>{String(x.name||x.email)}</strong><small>via {String(x.mailbox||"")}</small></span></span></td><td>{String(x.subject)}</td><td title={indiaInboxTimestamp(x.last_message_at).title}>{indiaInboxTimestamp(x.last_message_at).label}</td><td><Badge tone={conversationStatus(x).tone}>{conversationStatus(x).label}</Badge></td><td><Link className="text-link stretched-row-link" href={`/conversations/${x.id}`} aria-label={`Open conversation: ${String(x.subject)}`}>View</Link></td></tr>)}</tbody></table></div>:<Empty title="No conversations found" text="Try changing the filters."/>}<div className="pager"><span>Showing {recent.length?(page-1)*size+1:0}–{Math.min(page*size,Number(total?.n||0))} of {Number(total?.n||0)}</span><div>{page>1&&<Link href={`${base}&page=${page-1}`}>Previous</Link>}{page*size<Number(total?.n||0)&&<Link href={`${base}&page=${page+1}`}>Next</Link>}</div></div><p className="footnote">* Open tracking is estimated; mail apps can block or preload images.</p></Card><Card className="card gap-0 py-0"><div className="card-head"><h2>Quick actions</h2></div><div className="quick-links"><Link href="/conversations/new"><Send size={18}/>New conversation<ArrowUpRight size={16}/></Link>{user.role==="admin"&&<><Link href="/users/new"><UserPlus size={18}/>Add user<ArrowUpRight size={16}/></Link><Link href="/email-accounts/new"><Mail size={18}/>Create email account<ArrowUpRight size={16}/></Link><Link href="/contacts"><Inbox size={18}/>Import contacts<ArrowUpRight size={16}/></Link></>}</div></Card></div>
  </Shell>;
}

function Stat({href,icon,label,value,note,tone}:{href:string;icon:React.ReactNode;label:string;value:number;note:string;tone:string}){return <Link href={href} className={`stat-card stat-${tone}`}><div className="stat-top"><span className="stat-icon">{icon}</span><ArrowUpRight size={17}/></div><strong>{label}</strong><span className="stat-value">{value}</span><small>{note}</small></Link>}
function Metric({label,value}:{label:string;value:number|string}){return <div className="stat-card compact"><span className="stat-value">{value}</span><strong>{label}</strong></div>}
