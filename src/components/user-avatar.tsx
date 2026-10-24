"use client";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function UserAvatar({userId,name,version,className}:{userId:number;name:string;version?:string|number|null;className?:string}){
  return <AvatarImage key={`${userId}:${version||"none"}`} userId={userId} name={name} version={version} className={className}/>;
}
function AvatarImage({userId,name,version,className}:{userId:number;name:string;version?:string|number|null;className?:string}){
  const [failed,setFailed]=useState(false);
  return <span className={cn("avatar",className)}>{version&&!failed?<Image src={`/api/avatars/${userId}?v=${encodeURIComponent(String(version))}`} alt={`${name} profile photo`} fill unoptimized className="object-cover" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{name.slice(0,1).toUpperCase()||"?"}</span>}</span>;
}
