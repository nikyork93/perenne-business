import { prisma } from './prisma';

/**
 * Bank transfer details for manual order payments.
 *
 * Source of truth is the AdminSettings singleton row in the database
 * (managed via /admin/settings UI). Empty fields fall back to env vars
 * for portability across environments. Empty everything falls back to
 * a generic placeholder so the popup never explodes.
 */
export interface BankDetails {
  beneficiary: string;
  beneficiaryAddress: string;
  beneficiaryVat: string;
  bank: string;
  iban: string;
  bic: string;
  notice: string;
}

const DEFAULTS: BankDetails = {
  beneficiary:        '— Configure in /admin/settings —',
  beneficiaryAddress: '',
  beneficiaryVat:     '',
  bank:               '',
  iban:               '',
  bic:                '',
  notice:             'Please use the payment reference shown above exactly as written.',
};

function pick(dbValue: string | null | undefined, envValue: string | undefined, fallback: string): string {
  if (dbValue && dbValue.trim() !== '') return dbValue;
  if (envValue && envValue.trim() !== '') return envValue;
  return fallback;
}

/**
 * Resolve the active BankDetails. Precedence: DB → env var → default.
 * Reads from AdminSettings row with id="default", creating it lazily
 * with empty fields if it doesn't exist.
 */
export async function getBankDetails(): Promise<BankDetails> {
  const row = await prisma.adminSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  return {
    beneficiary:        pick(row.bankBeneficiary, process.env.PERENNE_BANK_BENEFICIARY, DEFAULTS.beneficiary),
    beneficiaryAddress: pick(row.bankAddress,     process.env.PERENNE_BANK_ADDRESS,     DEFAULTS.beneficiaryAddress),
    beneficiaryVat:     pick(row.bankVat,         process.env.PERENNE_BANK_VAT,         DEFAULTS.beneficiaryVat),
    bank:               pick(row.bankName,        process.env.PERENNE_BANK_NAME,        DEFAULTS.bank),
    iban:               pick(row.bankIban,        process.env.PERENNE_BANK_IBAN,        DEFAULTS.iban),
    bic:                pick(row.bankBic,         process.env.PERENNE_BANK_BIC,         DEFAULTS.bic),
    notice:             pick(row.bankNotice,      process.env.PERENNE_BANK_NOTICE,      DEFAULTS.notice),
  };
}

/**
 * Generate a short, human-friendly payment reference that the customer
 * writes in the wire's description field. Deterministic + collision-
 * free without needing a counter.
 *
 * Format: PRN-ORD-{first6charsOfCuid}.toUpperCase()
 * e.g. "PRN-ORD-CMA1B2"
 */
export function paymentReferenceFor(orderId: string): string {
  return `PRN-ORD-${orderId.slice(0, 6).toUpperCase()}`;
}

/**
 * Generate a sequential, human-friendly invoice number. Uses a year
 * prefix + total-paid-orders-this-year + 1 so invoices read like
 * INV-2026-0001, INV-2026-0002, etc.
 */
export function invoiceNumberFromCount(year: number, paidThisYearBefore: number): string {
  return `INV-${year}-${String(paidThisYearBefore + 1).padStart(4, '0')}`;
}
