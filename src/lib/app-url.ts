function validOrigin(value:string|undefined){
  if(!value)return null;
  try{
    const url=new URL(value);
    const host=url.hostname.toLowerCase();
    if(url.protocol!=="https:"||url.username||url.password||!host.includes(".")||host==="localhost"||host==="127.0.0.1"||host.includes("your-")||host.includes("production-domain")||host.endsWith(".example.com"))return null;
    return url.origin;
  }catch{return null}
}

export function appOrigin(){
  const configured=validOrigin(process.env.APP_URL);
  if(configured)return configured;
  const vercelHost=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const vercel=validOrigin(vercelHost?`https://${vercelHost}`:undefined);
  if(vercel)return vercel;
  throw new Error("APP_URL must be your deployed HTTPS domain, for example https://welfog.vercel.app");
}
