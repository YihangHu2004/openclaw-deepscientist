import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DeepClaw',
  description: 'DeepClaw AI Agent UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
