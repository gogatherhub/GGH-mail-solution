import Link from "next/link";
import { LayoutDashboard, Inbox, UsersRound, ContactRound, Mail, Megaphone, LogOut, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { RefreshData } from "@/components/refresh-data";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/conversations", label: "Conversations", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: ContactRound, admin: true },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, admin: true },
  { href: "/users", label: "Users", icon: UsersRound, admin: true },
  { href: "/email-accounts", label: "Email accounts", icon: Mail, admin: true },
];

export async function Shell({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/dashboard"><span className="brand-mark"><Mail size={20}/></span><span>Welfog<span className="brand-muted">mail</span></span></Link>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav">{links.filter(x => !x.admin || user.role === "admin").map(x => <Link key={x.href} href={x.href} prefetch={true}><x.icon size={18}/><span>{x.label}</span></Link>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><strong>Stay on top of every reply.</strong><span>One place for inboxes, contacts and outreach.</span></div><div className="user-box"><div className="avatar">{String(user.name || user.username).slice(0,1).toUpperCase()}</div><div><strong>{String(user.name || user.username)}</strong><small>{String(user.role)}</small></div><form action={logoutAction}><button aria-label="Log out" title="Log out"><LogOut size={17}/></button></form></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><span>Welfog / <strong>{title}</strong></span><div className="topbar-right"><RefreshData/><span className="topbar-badge">{String(user.role)}</span><Link href="/profile" className="avatar small" title="Edit profile">{String(user.name || user.username).slice(0,1).toUpperCase()}</Link></div></header>
      <div className="page"><div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <Link className="button primary" href={action.href}><Plus size={17}/>{action.label}</Link>}</div>{children}</div>
    </main>
  </div>;
}

export function Empty({ title, text, href, label }: { title: string; text: string; href?: string; label?: string }) { return <div className="empty"><div className="empty-icon"><Inbox size={28}/></div><h3>{title}</h3><p>{text}</p>{href && label && <Link href={href} className="button primary">{label}</Link>}</div>; }
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "blue" }) { return <span className={`badge ${tone}`}>{children}</span>; }
