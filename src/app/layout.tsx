import type { Metadata } from 'next';

import { Providers } from '@/app/providers';

import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Tasky',
  description: '감성 투두·일정 관리 웹앱',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="light">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
