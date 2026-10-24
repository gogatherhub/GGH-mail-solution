import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { rows } from "@/lib/db";
import { privateJson } from "@/lib/http-security";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();
  if(!user)return privateJson({error:"Unauthorized"},401);
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<1||(user.role!=="admin"&&Number(user.id)!==id))return privateJson({error:"Image unavailable"},404);
  const [avatar]=await rows("SELECT a.image_data FROM user_avatars a JOIN users u ON u.id=a.user_id WHERE a.user_id=?",[id]);
  if(!avatar)return privateJson({error:"Image unavailable"},404);
  return new NextResponse(Buffer.from(String(avatar.image_data),"base64"),{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Disposition":"inline; filename=profile.webp","Vary":"Cookie"}});
}
