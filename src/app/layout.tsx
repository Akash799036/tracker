import type { Metadata } from 'next';
import '../styles/globals.css';
import { StoreProvider } from '@/lib/store';
import { MarketingProvider } from '@/lib/marketing';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Project Tracker',
  description: 'Dashboard v1.0 (Next.js)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-50 text-slate-800 font-sans antialiased">
        <StoreProvider>
          <MarketingProvider>
            <AppShell>{children}</AppShell>
          </MarketingProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
