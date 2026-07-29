import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logoutAction } from '@/server/auth/actions';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'ダッシュボード' },
  { href: '/competitors', label: '競合' },
  { href: '/reports', label: 'レポート' },
  { href: '/settings', label: '設定' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) redirect('/onboarding');

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white px-4 py-4 md:min-h-screen md:w-56 md:border-r md:border-b-0">
        <div className="mb-6">
          <p className="text-sm font-bold">Salon Area Coach</p>
          <p className="mt-1 truncate text-xs text-slate-500" title={salon.name}>
            {salon.name}
          </p>
        </div>
        <nav className="flex gap-1 md:flex-col">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="mt-6">
          <button type="submit" className="px-3 text-xs text-slate-400 hover:text-slate-700">
            ログアウト
          </button>
        </form>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
