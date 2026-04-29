import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider, type Theme } from '@/components/theme/ThemeProvider';
import { prisma } from '@/lib/prisma';
import { getOptionalSession } from '@/lib/auth';
import './globals.css';

// ────────────────────────────────────────────────────────────────────────
// FONTS
// ────────────────────────────────────────────────────────────────────────
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Perenne Business',
  description: 'Branded notebooks for your team — Perenne Note B2B portal.',
};

// ────────────────────────────────────────────────────────────────────────
// THEME RESOLUTION ORDER (server-side, no flash):
// 1. DB User.themePreference (if signed in)
// 2. Cookie `perenne_theme`
// 3. Default 'dark'
// ────────────────────────────────────────────────────────────────────────
async function resolveInitialTheme(): Promise<{ theme: Theme; authenticated: boolean }> {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get('perenne_theme')?.value as Theme | undefined;

  // Try session
  const session = await getOptionalSession();
  if (session?.userId) {
    try {
      const user = (await prisma.user.findUnique({
        where: { id: session.userId },
      })) as unknown as { themePreference?: string | null };
      const dbTheme = user?.themePreference;
      if (dbTheme === 'dark' || dbTheme === 'light') {
        return { theme: dbTheme, authenticated: true };
      }
    } catch {
      // Schema may not be migrated yet — fall through
    }
    return { theme: cookieTheme ?? 'dark', authenticated: true };
  }

  return { theme: cookieTheme ?? 'dark', authenticated: false };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme, authenticated } = await resolveInitialTheme();

  return (
    <html
      lang="en"
      data-theme={theme}
      style={{ colorScheme: theme }}
      className={`${fraunces.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <head>
        {/* Inline script: fix theme before paint to avoid flash on slow hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.match(/perenne_theme=(dark|light)/);var t=c?c[1]:"${theme}";document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider initialTheme={theme} authenticated={authenticated}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
