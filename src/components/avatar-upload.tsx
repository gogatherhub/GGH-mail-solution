"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { saveAvatar } from "@/app/profile-actions";
import { SubmitButton } from "@/components/submit-button";
import { UserAvatar } from "@/components/user-avatar";

export function AvatarUpload({userId,name,version}:{userId:number;name:string;version?:string|number|null}){
  const [state,action]=useActionState(saveAvatar,{}),router=useRouter();
  useEffect(()=>{if(state.version)router.refresh();},[state.version,router]);
  return <section className="card profile-photo-card"><div className="card-head"><div><h2><Camera size={17}/>Profile photo</h2><p>Your photo appears in your account and team directory.</p></div></div><form action={action} className="profile-photo-form"><UserAvatar userId={userId} name={name} version={version} className="profile-photo-preview"/><div><label htmlFor="profile-photo">Choose your photo</label><input id="profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"/><p className="helper">JPG, PNG or WebP · up to 2 MB. Photos are cropped to a square.</p><div className="button-row mt-4"><SubmitButton name="intent" value="upload" pendingLabel="Updating…">Upload photo</SubmitButton>{version&&<SubmitButton name="intent" value="remove" variant="outline" pendingLabel="Updating…" formNoValidate>Remove photo</SubmitButton>}</div>{state.error&&<p className="mt-3 text-sm text-destructive" role="alert">{state.error}</p>}{state.message&&<p className="mt-3 text-sm text-[#26704b]" role="status">{state.message}</p>}</div></form></section>;
}
