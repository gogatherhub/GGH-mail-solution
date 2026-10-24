import Link from "next/link";
import { ArrowUpRight, Inbox, Mail, Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { WorkspaceHeader } from "@/components/workspace-header";
import { workspaceLinks } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge as StatusBadge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";

export async function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const name = String(user.name || user.username);
  return <div className={`app-shell ${user.role==="admin"?"admin-workspace":"employee-workspace"}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar" aria-label="Workspace navigation">
      <Link className="brand" href="/dashboard" aria-label="Welfog Mail home">
        <span className="brand-mark"><Mail size={19} strokeWidth={1.8}/></span>
        <span>Welfog<span className="brand-muted">mail</span></span>
        <span className="brand-tag">WORKSPACE</span>
      </Link>
      <Button asChild className="sidebar-compose"><Link href="/conversations/new"><Plus size={16}/>Compose email</Link></Button>
      <div className="workspace-label">OVERVIEW</div>
      <nav className="side-nav" aria-label="Main navigation">
        {workspaceLinks.filter(link => !link.admin || user.role === "admin").map(link =>
          <NavLink key={link.href} href={link.href} label={link.label}><link.icon size={18} strokeWidth={1.7}/><span>{link.label}</span></NavLink>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-help"><span className="sidebar-help-icon"><Sparkles size={16}/></span><strong>A little more connected.</strong><span>Your conversations, people and outreach. Together in one place.</span><Link href="/conversations">Open your inbox <ArrowUpRight size={13}/></Link></div>
        <Link href="/profile" className="user-box" aria-label="Edit your profile"><UserAvatar userId={Number(user.id)} name={name} version={user.avatar_updated}/><div><strong>{name}</strong><small>{String(user.role)} workspace</small></div><ArrowUpRight size={16}/></Link>
      </div>
    </aside>
    <div className="main">
      <WorkspaceHeader userId={Number(user.id)} avatarVersion={user.avatar_updated} name={name} role={String(user.role)}/>
      <main id="main-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}

export function Shell({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return <div className="page"><div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <Button asChild><Link href={action.href}><Plus size={16}/>{action.label}</Link></Button>}</div>{children}</div>;
}

export function Empty({ title, text, href, label }: { title: string; text: string; href?: string; label?: string }) {
  return <div className="empty"><div className="empty-icon"><Inbox size={25} strokeWidth={1.5}/></div><h3>{title}</h3><p>{text}</p>{href && label && <Button asChild><Link href={href}><Plus size={15}/>{label}</Link></Button>}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "blue" }) {
  const tones = {
    neutral: "border-[#e5e8ee] bg-[#f7f8fa] text-[#738097]",
    success: "border-[#d5eee0] bg-[#f0faf4] text-[#368462]",
    warning: "border-[#f5e6cb] bg-[#fff9ed] text-[#b08035]",
    danger: "border-[#f5dce1] bg-[#fff3f5] text-[#bf5869]",
    blue: "border-[#e1e3fb] bg-[#f3f3ff] text-[#6769c6]",
  };
  return <StatusBadge variant="outline" className={`badge ${tone} rounded-md px-2 py-1 text-[10px] ${tones[tone]}`}><span className="badge-dot" aria-hidden="true"/>{children}</StatusBadge>;
}
