import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider, type Theme } from '@/components/theme/ThemeProvider';
import './globals.css';

const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const geist = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = {
  // Title template lets each page override `title` and have the
  // resulting <title> automatically suffixed with the brand name,
  // e.g. "Codes" → "Codes · Perenne Business".
  title: {
    default: 'Perenne Business',
    template: '%s · Perenne Business',
  },
  description: 'Branded notebooks for your team — Perenne Note B2B portal.',
  icons: {
    // Next 15 auto-serves /app/icon.svg, but we declare it
    // explicitly so older browsers + apple-touch-icon are covered.
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icon.svg',
  },
};

async function resolveCookieTheme(): Promise<Theme> {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get('perenne_theme')?.value as Theme | undefined;
  return cookieTheme === 'light' ? 'light' : 'dark';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await resolveCookieTheme();
  return (
    <html
      lang="en"
      data-theme={theme}
      style={{ colorScheme: theme }}
      className={`${fraunces.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.match(/perenne_theme=(dark|light)/);var t=c?c[1]:"${theme}";document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
