import { Skeleton } from "@/components/ui/skeleton";

export function PageLoading({ title }: { title: string }) {
  return <div className="page page-loading" role="status" aria-label={`Loading ${title}`} aria-busy="true">
    <span className="sr-only">Loading {title}…</span>
    <div className="page-heading"><div><Skeleton className="h-8 w-52"/><Skeleton className="mt-3 h-4 w-72 max-w-full"/></div><Skeleton className="h-10 w-32"/></div>
    <div className="loading-cards">{[0,1,2,3].map(x => <Skeleton className="h-36 rounded-xl" key={x}/>)}</div>
    <div className="card loading-table"><Skeleton className="mb-7 h-9 w-64 max-w-full"/>{[0,1,2,3,4].map(x => <div className="loading-table-row" key={x}><Skeleton className="size-9 rounded-xl"/><Skeleton className="h-4 w-1/3"/><Skeleton className="ml-auto h-5 w-20 rounded-full"/></div>)}</div>
  </div>;
}
