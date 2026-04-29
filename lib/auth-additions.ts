/**
 * ════════════════════════════════════════════════════════════════════════
 * ADDITIONS TO lib/auth.ts
 *
 * Add this helper to your existing lib/auth.ts file. It returns the session
 * if present, or null (no redirect). Used by app/layout.tsx to read the
 * theme preference from DB without forcing auth on public pages.
 * ════════════════════════════════════════════════════════════════════════
 */

// PASTE the following function into your existing lib/auth.ts:

/*
export async function getOptionalSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('perenne_session')?.value;
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            companyId: true,
            isActive: true,
          },
        },
      },
    });

    if (!session || !session.user || !session.user.isActive) return null;
    if (session.expiresAt < new Date()) return null;

    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      companyId: session.user.companyId,
    };
  } catch {
    return null;
  }
}
*/

// Make sure to also export it from the file alongside `requireSession`.

export {};
