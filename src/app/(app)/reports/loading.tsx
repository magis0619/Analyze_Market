export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200" />
      ))}
    </div>
  );
}
