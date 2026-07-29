export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="h-8 w-24 animate-pulse rounded bg-slate-200" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-48 animate-pulse rounded-lg bg-slate-200" />
      ))}
    </div>
  );
}
