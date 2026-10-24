export const DAILY_SEND_LIMIT = 70;
export const PROVIDER_DAILY_LIMIT = 100;
export const PROVIDER_MONTHLY_LIMIT = 3000;

export function recipientCount(cc = "", bcc = "") {
  return 1 + [cc,bcc].reduce((count,list)=>count+list.split(",").map(value=>value.trim()).filter(Boolean).length,0);
}
