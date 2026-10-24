import { loginAction } from "@/app/actions";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; unavailable?: string }> }) {
  const params = await searchParams;
  const demo=process.env.DEMO_MODE==="true";
  const configured=demo||Boolean(process.env.DATABASE_URL);
  let unavailable=Boolean(params.unavailable);
  let signedIn=false;
  if(configured){try{signedIn=Boolean(await currentUser())}catch{unavailable=true}}
  if(signedIn)redirect("/dashboard");
  return <main className="login-page"><div className="login-frame">
    <div className="login-brand"><span className="login-logo" aria-hidden="true"><Mail size={21} strokeWidth={1.7}/></span><strong>Welfog<span className="ml-0.5 font-normal text-muted-foreground">mail</span></strong></div>
    <div className="login-intro"><h1>Welcome back.</h1><p>A clear inbox. A connected team.<br/>Sign in to your workspace.</p></div>
    {demo&&<p className="demo-note">Demo workspace · Real sending requires a configured mail provider.</p>}
    {!configured&&<div className="form-error" role="alert">MySQL is not configured yet. Set DATABASE_URL in the deployment environment to enable sign in.</div>}
    {unavailable&&configured&&<div className="form-error" role="alert">Database is unavailable. Check the connection and try again.</div>}
    {params.error&&<div className="form-error" role="alert">Invalid username or password.</div>}
    <form action={loginAction} className="login-form"><label>Username<Input name="username" autoComplete="username" required disabled={!configured} placeholder="Enter your username"/></label><label>Password<Input name="password" type="password" autoComplete="current-password" required disabled={!configured} placeholder="Enter your password"/></label><SubmitButton className="login-submit" disabled={!configured} pendingLabel="Signing in…">Sign in<ArrowRight size={15}/></SubmitButton></form>
    <p className="login-footer flex items-center justify-center gap-1.5"><ShieldCheck size={12}/>Your team’s space, securely connected.</p>
  </div></main>;
}
