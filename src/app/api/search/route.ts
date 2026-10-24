import { currentUser } from "@/lib/auth";
import { rows } from "@/lib/db";
import { privateJson } from "@/lib/http-security";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return privateJson({error:"Unauthorized"},401);
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0,120);
  if (q.length<2) return privateJson({results:[]});
  const pattern=`%${q}%`,admin=user.role==="admin",scope=admin?"":" AND c.mailbox_id=?";
  const [conversations,contacts,campaigns,users] = await Promise.all([
    rows(`SELECT c.id,c.subject,ct.email FROM conversations c LEFT JOIN contacts ct ON ct.id=c.contact_id WHERE (c.subject LIKE ? OR ct.name LIKE ? OR ct.email LIKE ?)${scope} ORDER BY c.last_message_at DESC LIMIT 7`,[pattern,pattern,pattern,...(admin?[]:[Number(user.assigned_mailbox_id)||-1])]),
    admin?rows("SELECT id,name,email FROM contacts WHERE name LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 5",[pattern,pattern]):Promise.resolve([]),
    admin?rows("SELECT id,name,subject FROM campaigns WHERE name LIKE ? OR subject LIKE ? ORDER BY id DESC LIMIT 5",[pattern,pattern]):Promise.resolve([]),
    admin?rows("SELECT id,name,username FROM users WHERE name LIKE ? OR username LIKE ? ORDER BY id DESC LIMIT 5",[pattern,pattern]):Promise.resolve([]),
  ]);
  return privateJson({results:[
    ...conversations.map(item=>({id:`conversation-${item.id}`,type:"Conversations",title:String(item.subject),description:String(item.email||""),href:`/conversations/${item.id}`})),
    ...contacts.map(item=>({id:`contact-${item.id}`,type:"Contacts",title:String(item.name),description:String(item.email),href:`/contacts/${item.id}`})),
    ...campaigns.map(item=>({id:`campaign-${item.id}`,type:"Campaigns",title:String(item.name),description:String(item.subject),href:`/campaigns/${item.id}`})),
    ...users.map(item=>({id:`user-${item.id}`,type:"Team members",title:String(item.name),description:String(item.username),href:`/users/${item.id}`})),
  ]});
}
