import Link from "next/link";
import { Mail } from "lucide-react";

const pages = [
  ["/dashboard", "Dashboard"],
  ["/conversations", "Conversations"],
  ["/contacts", "Contacts"],
  ["/campaigns", "Campaigns"],
  ["/users", "Users"],
  ["/email-accounts", "Email accounts"],
] as const;

export function PageLoading({ title }: { title: string }) {
  return <div className="app-shell" aria-busy="true">
    <aside className="sidebar">
      <Link className="brand" href="/dashboard"><span className="brand-mark"><Mail size={20}/></span><span>Welfog<span className="brand-muted">mail</span></span></Link>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav">{pages.map(([href,label])=><Link href={href} key={href}>{label}</Link>)}</nav>
    </aside>
    <main className="main">
      <header className="topbar"><span>Welfog / <strong>{title}</strong></span></header>
      <div className="page page-loading" role="status" aria-label={`Loading ${title}`}>
        <div className="loading-line loading-title"/>
        <div className="loading-line loading-subtitle"/>
        <div className="loading-cards">{[0,1,2,3].map(x=><div className="loading-card" key={x}/>)}</div>
        <div className="loading-table">{[0,1,2,3,4].map(x=><div className="loading-line loading-row" key={x}/>)}</div>
      </div>
    </main>
  </div>;
}
