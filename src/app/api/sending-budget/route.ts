import { currentUser } from "@/lib/auth";
import { privateJson } from "@/lib/http-security";
import { sendingBudget } from "@/lib/send-budget";
export async function GET(){
  if(!await currentUser())return privateJson({error:"Unauthorized"},401);
  return privateJson(await sendingBudget());
}
