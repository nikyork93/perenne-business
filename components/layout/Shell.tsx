import type { ReactNode } from 'react';
import { requireSession } from '@/lib/auth';
import { ShellClient } from './ShellClient';

interface ShellProps {
  children: ReactNode;
  /**
   * Optional pre-fetched session. If provided, used directly.
   * If omitted, Shell fetches the session itself via requireSession().
   * This makes Shell work regardless of how the layout invokes it.
   */
  user?: {
    email: string;
    name: string | null;
    role: string;
    companyId: string | null;
  };
}

/**
 * Shell — Server Component wrapper. Fetches session if not provided,
 * then delegates to ShellClient for interactive UI (drawer, pathname).
 */
export async function Shell({ children, user }: ShellProps) {
  let resolvedUser = user;

  if (!resolvedUser) {
    const session = await requireSession();
    resolvedUser = {
      email: session.email,
      name: session.name,
      role: session.role,
      companyId: session.companyId,
    };
  }

  return <ShellClient user={resolvedUser}>{children}</ShellClient>;
}
