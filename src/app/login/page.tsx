import { loginAction } from "@/app/actions";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; unavailable?: string }> }) {
  const params = await searchParams;
  const demo=process.env.DEMO_MODE==="true";
  const configured=demo||Boolean(process.env.DATABASE_URL);
  let unavailable=Boolean(params.unavailable);
  let signedIn=false;
  if(configured){try{signedIn=Boolean(await currentUser())}catch{unavailable=true}}
  if(signedIn)redirect("/dashboard");
  return <main className="login-page"><div className="login-frame"><div className="login-brand"><span className="login-logo" aria-hidden="true">W</span><strong>Welfog</strong></div>{demo&&<p className="demo-note">Local demo database · Real sending needs a Resend API key</p>}{!configured&&<div className="form-error">MySQL is not configured yet. Set DATABASE_URL in the deployment environment to enable sign in.</div>}{unavailable&&configured&&<div className="form-error">Database is unavailable. Check the connection and try again.</div>}{params.error&&<div className="form-error">Invalid username or password.</div>}<form action={loginAction} className="login-form"><label>Username<input name="username" autoComplete="username" required disabled={!configured} placeholder="Enter your username"/></label><label>Password<input name="password" type="password" autoComplete="current-password" required disabled={!configured} placeholder="••••••••"/></label><button className="login-submit" disabled={!configured}>Sign in</button></form></div></main>;
}
