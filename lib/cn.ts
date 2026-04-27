/**
 * Minimal className joiner. Accepts strings, falsy values, conditional objects.
 * Example: cn('foo', isActive && 'active', { 'hidden': !visible })
 */
export function cn(...inputs: Array<string | false | null | undefined | Record<string, boolean>>): string {
  const parts: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      parts.push(input);
    } else if (typeof input === 'object') {
      for (const [k, v] of Object.entries(input)) {
        if (v) parts.push(k);
      }
    }
  }
  return parts.join(' ');
}
