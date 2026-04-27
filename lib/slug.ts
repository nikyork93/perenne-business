/**
 * Generate a URL-safe slug from a string.
 * "Acme Corp S.p.A." → "acme-corp-spa"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')     // keep alphanumeric, space, hyphen
    .replace(/\s+/g, '-')              // spaces → hyphens
    .replace(/-+/g, '-')               // collapse multiple hyphens
    .replace(/^-|-$/g, '')             // trim hyphens
    .slice(0, 60);                     // max length
}

/**
 * Ensure a slug is unique in the DB by appending -2, -3, etc.
 * Accepts a function that checks if a slug already exists.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const slug = slugify(base);
  if (!(await exists(slug))) return slug;
  for (let i = 2; i < 100; i++) {
    const candidate = `${slug}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Extremely unlikely; fall back to timestamp suffix
  return `${slug}-${Date.now()}`;
}
