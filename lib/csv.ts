/**
 * Minimal RFC 4180 CSV parser.
 * - Handles quoted fields with commas and embedded newlines.
 * - Handles escaped double quotes ("")
 * - Trims whitespace from unquoted fields.
 *
 * Returns an array of rows, each row is an array of strings.
 * First row is treated as header by the caller.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < input.length) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') {
      row.push(field);
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = []; field = ''; i++; continue;
    }

    field += c; i++;
  }

  // Trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.length > 0)) rows.push(row);
  }

  return rows;
}

/**
 * Given parsed rows and a header schema, return typed objects.
 * Columns: email (required), name (optional), department (optional)
 * Case-insensitive header matching; order-independent.
 */
export interface Recipient {
  email: string;
  name?: string;
  department?: string;
  /** Row index in the CSV (for error reporting) — 1-based, excluding header */
  rowIndex: number;
}

export function parseRecipients(csv: string): {
  recipients: Recipient[];
  errors: Array<{ row: number; message: string }>;
} {
  const rows = parseCsv(csv);
  if (rows.length === 0) return { recipients: [], errors: [{ row: 0, message: 'Empty CSV' }] };

  // Header row: normalize names
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const emailIdx = headers.indexOf('email');
  const nameIdx = headers.indexOf('name');
  const deptIdx = headers.indexOf('department');

  if (emailIdx < 0) {
    return { recipients: [], errors: [{ row: 0, message: 'Missing "email" column' }] };
  }

  const recipients: Recipient[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const email = (row[emailIdx] ?? '').trim().toLowerCase();
    if (!email) { errors.push({ row: i + 1, message: 'Missing email' }); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: i + 1, message: `Invalid email: ${email}` }); continue;
    }
    if (seen.has(email)) {
      errors.push({ row: i + 1, message: `Duplicate email: ${email}` }); continue;
    }
    seen.add(email);
    recipients.push({
      email,
      name: nameIdx >= 0 ? (row[nameIdx] ?? '').trim() || undefined : undefined,
      department: deptIdx >= 0 ? (row[deptIdx] ?? '').trim() || undefined : undefined,
      rowIndex: i,
    });
  }

  return { recipients, errors };
}
