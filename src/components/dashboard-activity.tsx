import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import { ActivityChart } from "@/components/email-charts";
import { analyticsOverview, analyticsRange, percent } from "@/lib/analytics";
import type { Row } from "@/lib/db";

export async function DashboardActivity({user}:{user:Row}){
  const end=new Date().toISOString().slice(0,10),start=new Date(new Date(`${end}T00:00:00Z`).getTime()-13*86400000).toISOString().slice(0,10),data=await analyticsOverview(user,analyticsRange(start,end));
  const s=data.summary;
  return <section className="card dashboard-activity"><div className="card-head"><div><h2><ChartNoAxesCombined size={18}/>Email activity</h2><p>{user.role==="admin"?"Your entire workspace":"Your assigned mailbox"} · last 14 days · UTC</p></div><Link className="text-link" href={user.role==="admin"?"/analytics":"/outbox"}>{user.role==="admin"?"Explore analytics":"View outbox"}<ArrowUpRight size={14}/></Link></div><div className="dashboard-activity-layout"><div><ActivityChart data={data.timeline} compact/></div><div className="activity-insights"><span className="eyebrow">ENGAGEMENT SNAPSHOT</span><div><strong>{s.sent}</strong><span>Emails sent</span></div><div><strong>{percent(s.opened,s.sent)}</strong><span>Open rate*</span></div><div><strong>{percent(s.clicked,s.sent)}</strong><span>Click rate</span></div><p>Each email counts once, even if it is opened several times.</p></div></div></section>;
}
