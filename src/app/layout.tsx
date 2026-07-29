import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Salon Area Coach AI',
  description: '美容院向け 商圏監視＋経営コーチAI',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
