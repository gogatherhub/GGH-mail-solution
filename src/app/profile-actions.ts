"use server";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { run, isDemo } from "@/lib/db";

export type AvatarState={error?:string;message?:string;version?:number};
export async function saveAvatar(_previous:AvatarState,form:FormData):Promise<AvatarState>{
  const user=await requireUser();
  if(form.get("intent")==="remove"){
    await run("DELETE FROM user_avatars WHERE user_id=?",[Number(user.id)]);
    revalidatePath("/profile");revalidatePath("/users");
    return {message:"Profile photo removed",version:Date.now()};
  }
  const file=form.get("photo");
  if(!(file instanceof File)||!file.size||file.size>2*1024*1024)return {error:"Choose a JPG, PNG or WebP image under 2 MB."};
  let image:Buffer;
  try{
    const bytes=Buffer.from(await file.arrayBuffer());
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
    if(!png&&!jpeg&&!webp)return {error:"Choose a static JPG, PNG or WebP image."};
    const source=sharp(bytes,{limitInputPixels:16_000_000,animated:false});
    const metadata=await source.metadata();
    if(!["jpeg","png","webp"].includes(metadata.format||"")||(metadata.pages||1)>1)return {error:"Choose a static JPG, PNG or WebP image."};
    image=await source.rotate().resize(256,256,{fit:"cover"}).webp({quality:85}).toBuffer();
  }catch{return {error:"This image could not be read. Use a JPG, PNG or WebP image up to 16 megapixels."};}
  const now=new Date().toISOString().slice(0,23).replace("T"," ");
  await run(isDemo?"INSERT INTO user_avatars (user_id,image_data,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET image_data=excluded.image_data,updated_at=excluded.updated_at":"INSERT INTO user_avatars (user_id,image_data,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE image_data=VALUES(image_data),updated_at=VALUES(updated_at)",[Number(user.id),image.toString("base64"),now]);
  revalidatePath("/profile");revalidatePath("/users");
  return {message:"Profile photo updated",version:Date.now()};
}
