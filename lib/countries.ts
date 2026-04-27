/**
 * Country list for the onboarding form and billing settings.
 * ISO 3166-1 alpha-2 codes, English labels.
 * Sorted with EU countries first (most likely B2B customers) then alphabetical.
 */
export const COUNTRIES = [
  // EU (common Perenne target markets)
  { code: 'IT', name: 'Italy' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IE', name: 'Ireland' },
  { code: 'FI', name: 'Finland' },
  { code: 'SE', name: 'Sweden' },
  { code: 'DK', name: 'Denmark' },
  // Other common markets
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'JP', name: 'Japan' },
  // Long tail alphabetical
  { code: 'AR', name: 'Argentina' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IN', name: 'India' },
  { code: 'IL', name: 'Israel' },
  { code: 'KR', name: 'South Korea' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NO', name: 'Norway' },
  { code: 'PL', name: 'Poland' },
  { code: 'RO', name: 'Romania' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TR', name: 'Turkey' },
  { code: 'ZA', name: 'South Africa' },
] as const;

export type CountryCode = typeof COUNTRIES[number]['code'];

/** Quick lookup */
export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/** EU countries (for VAT reverse-charge logic later) */
export const EU_COUNTRIES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU',
  'IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK',
]);
