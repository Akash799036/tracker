import type { Metadata } from 'next';
import '../styles/globals.css';
import { StoreProvider } from '@/lib/store';
import { MarketingProvider } from '@/lib/marketing';
import { AuthProvider } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import AutoSheetSync from '@/components/AutoSheetSync';

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
        <AuthProvider>
          <StoreProvider>
            <MarketingProvider>
              <AutoSheetSync />
              <AppShell>{children}</AppShell>
            </MarketingProvider>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
