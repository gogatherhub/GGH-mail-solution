const dateTime = new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:true});
const dateOnly = new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"});
const inboxTime = new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:true});
const inboxWeekday = new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Kolkata",weekday:"short"});
const inboxDate = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric"});
const inboxFull = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true});
const calendarParts = new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"});

function instant(value:unknown):Date {
  if(value instanceof Date)return value;
  const raw=String(value??"").trim();
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)?raw:raw.replace(" ","T")+"Z");
}

export function indiaDateTime(value:unknown):string {
  const date=instant(value);
  return Number.isNaN(date.getTime())?"—":dateTime.format(date);
}

export function indiaDate(value:unknown):string {
  const date=instant(value);
  return Number.isNaN(date.getTime())?"—":dateOnly.format(date);
}

function calendarDay(value:Date):number {
  const parts=Object.fromEntries(calendarParts.formatToParts(value).map(part=>[part.type,part.value]));
  return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day))/86400000;
}

export function indiaInboxTimestamp(value:unknown,now=new Date()):{label:string;title?:string} {
  const date=instant(value);
  if(Number.isNaN(date.getTime()))return {label:"—"};
  const days=calendarDay(now)-calendarDay(date);
  const time=inboxTime.format(date);
  const label=days===0?time:days===1?"Yesterday":days>=2&&days<=7?`${inboxWeekday.format(date)}, ${time}`:inboxDate.format(date);
  return {label,title:`${inboxFull.format(date).replace(/\b(am|pm)\b/i,match=>match.toUpperCase())}`};
}
