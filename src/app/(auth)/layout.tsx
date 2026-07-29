export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-xl font-bold">Salon Area Coach AI</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          美容院向け 商圏監視＋経営コーチAI
        </p>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
