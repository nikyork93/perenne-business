import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getOrCreateDefaultDesign } from '@/lib/design';

/**
 * Backward-compat redirect.
 *
 * /cover was the old single-design editor route. Post-Session-2 the
 * canonical editor lives at /designs/[id]/edit and the library list
 * at /designs. We keep /cover linkable so old bookmarks, emails,
 * audit-log references etc. still work — they land on the company's
 * default design's editor.
 *
 * The Shell sidebar has been updated to point at /designs, so the
 * only routes that hit this redirect are direct URL visits.
 */
export default async function CoverPage() {
  const session = await requireSession();

  if (!session.companyId) {
    redirect('/onboarding');
  }

  const design = await getOrCreateDefaultDesign(session.companyId);
  redirect(`/designs/${design.id}/edit`);
}
