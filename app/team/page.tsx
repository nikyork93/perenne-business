import { redirect } from 'next/navigation';

// The standalone Team page has been folded into Settings as a tab.
// Anyone landing on /team is bounced to /settings?tab=users so old
// bookmarks and emails keep working.
export default function TeamPage() {
  redirect('/settings?tab=users');
}
