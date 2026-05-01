'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  GlassPanel,
  Button,
  Input,
  Select,
  Badge,
  Whisper,
  SectionLabel,
} from '@/components/ui';

// ─── Types ──────────────────────────────────────────────────────────
interface LegacyCode {
  id: string;
  code: string;
  label: string | null;
  companyId: string | null;
  designId: string | null;
  manualCompanyName: string | null;
  manualLogoUrl: string | null;
  manualLogoExtUrl: string | null;
  manualLogoWhiteUrl: string | null;
  manualPrimaryColor: string | null;
  manualQuote: string | null;
  seats: number | null;
  expiresAt: string | null;
  isActive: boolean;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
  company: { id: string; name: string; slug: string } | null;
  design: { id: string; name: string } | null;
}

interface CompanyOpt { id: string; name: string; slug: string; }
interface DesignOpt { id: string; name: string; companyId: string; }

interface Props {
  initialCodes: LegacyCode[];
  initialTotal: number;
  companies: CompanyOpt[];
  designs: DesignOpt[];
}

// ─── Component ──────────────────────────────────────────────────────
export function LegacyCodesClient({
  initialCodes,
  initialTotal,
  companies,
  designs,
}: Props) {
  const router = useRouter();
  const [codes, setCodes] = useState(initialCodes);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ── Helpers ───────────────────────────────────────────────────────
  async function callApi(method: string, path: string, body?: object) {
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        const text = await res.text().catch(() => '');
        console.error(`[${method} ${path}] non-JSON`, {
          status: res.status,
          bodyPreview: text.slice(0, 300),
        });
        setError(`Server returned ${res.status} ${res.statusText}.`);
        return { ok: false };
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (HTTP ${res.status}).`);
        return { ok: false, data };
      }
      return { ok: true, data };
    } catch (err) {
      console.error(`[${method} ${path}] fetch failed`, err);
      setError(err instanceof Error ? err.message : 'Network error.');
      return { ok: false };
    }
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleDelete(c: LegacyCode) {
    if (!confirm(`Delete code "${c.code}"? This is permanent.`)) return;
    setBusy(c.id);
    const r = await callApi('DELETE', `/api/admin/legacy-codes/${c.id}`);
    setBusy(null);
    if (r.ok) {
      setCodes((prev) => prev.filter((x) => x.id !== c.id));
      refresh();
    }
  }

  async function handleToggleActive(c: LegacyCode) {
    setBusy(c.id);
    const r = await callApi('PATCH', `/api/admin/legacy-codes/${c.id}`, {
      isActive: !c.isActive,
    });
    setBusy(null);
    if (r.ok) {
      setCodes((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, isActive: !x.isActive } : x))
      );
    }
  }

  async function handleCreate(form: CreateForm) {
    setBusy('create');
    const r = await callApi('POST', '/api/admin/legacy-codes', form);
    setBusy(null);
    if (r.ok && r.data?.code) {
      setCodes((prev) => [r.data.code, ...prev]);
      setShowCreate(false);
      refresh();
    }
  }

  async function handleEdit(id: string, patch: Partial<CreateForm>) {
    setBusy(id);
    const r = await callApi('PATCH', `/api/admin/legacy-codes/${id}`, patch);
    setBusy(null);
    if (r.ok && r.data?.code) {
      setCodes((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...r.data.code } : x))
      );
      setEditingId(null);
      refresh();
    }
  }

  // Filter view by search (client-side for the initial 50 — for full
  // search across pages we'd query /api/admin/legacy-codes?search=…).
  const visible = search
    ? codes.filter((c) => {
        const s = search.toLowerCase();
        return (
          c.code.toLowerCase().includes(s) ||
          c.label?.toLowerCase().includes(s) ||
          c.manualCompanyName?.toLowerCase().includes(s) ||
          c.company?.name.toLowerCase().includes(s)
        );
      })
    : codes;

  return (
    <>
      {error && (
        <div className="mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-danger/5 border-danger/20 text-[#ff9a9a]">
          ✕ {error}
        </div>
      )}

      {/* Toolbar ─────────────────────────────────────────────────── */}
      <GlassPanel padding="md" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <Input
              label="Search"
              hint={`${initialTotal} total`}
              placeholder="STELVIO2026, Acme partner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + New code
          </Button>
        </div>
      </GlassPanel>

      {/* Create form (inline panel) ──────────────────────────────── */}
      {showCreate && (
        <GlassPanel padding="lg" className="mb-4" animate>
          <CreateOrEditForm
            mode="create"
            companies={companies}
            designs={designs}
            busy={busy === 'create'}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </GlassPanel>
      )}

      {/* Table ──────────────────────────────────────────────────── */}
      <GlassPanel padding="none">
        {visible.length === 0 ? (
          <div className="p-8 text-center">
            <Whisper>No legacy codes match.</Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Code</th>
                  <th className="text-left label px-4 py-3">Label</th>
                  <th className="text-left label px-4 py-3">Company</th>
                  <th className="text-left label px-4 py-3">Design</th>
                  <th className="text-left label px-4 py-3">Status</th>
                  <th className="text-left label px-4 py-3">Created</th>
                  <th className="text-right label px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const isEditing = editingId === c.id;
                  if (isEditing) {
                    return (
                      <tr key={c.id} className="border-b border-white/5 bg-white/[0.02]">
                        <td colSpan={7} className="p-4">
                          <CreateOrEditForm
                            mode="edit"
                            initial={c}
                            companies={companies}
                            designs={designs}
                            busy={busy === c.id}
                            onSubmit={(form) => handleEdit(c.id, form)}
                            onCancel={() => setEditingId(null)}
                          />
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-ink">{c.code}</td>
                      <td className="px-4 py-3 text-ink-dim">{c.label ?? '—'}</td>
                      <td className="px-4 py-3 text-ink-dim">
                        {c.company?.name ?? c.manualCompanyName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-ink-dim">
                        {c.design?.name ?? <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={c.isActive ? 'success' : 'danger'}>
                          {c.isActive ? 'active' : 'disabled'}
                        </Badge>
                        {c.expiresAt && (
                          <div className="text-[9px] text-ink-faint font-mono mt-1">
                            exp {new Date(c.expiresAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-dim font-mono text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(c.id)}
                            disabled={busy === c.id}
                            className="text-[11px] px-2 py-1 rounded border border-glass-border hover:border-ink-dim text-ink-dim hover:text-ink transition disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(c)}
                            disabled={busy === c.id}
                            className="text-[11px] px-2 py-1 rounded border border-glass-border hover:border-ink-dim text-ink-dim hover:text-ink transition disabled:opacity-50"
                          >
                            {c.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            disabled={busy === c.id}
                            className="text-[11px] px-2 py-1 rounded border border-danger/30 hover:border-danger/60 text-[#ff9a9a] hover:text-danger transition disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </>
  );
}

// ─── Create/edit shared form ─────────────────────────────────────────
interface CreateForm {
  code: string;
  label: string | null;
  companyId: string | null;
  designId: string | null;
  manualCompanyName: string | null;
  manualLogoUrl: string | null;
  manualLogoExtUrl: string | null;
  manualPrimaryColor: string | null;
  manualQuote: string | null;
  seats: number | null;
  expiresAt: string | null;
  isActive: boolean;
}

interface FormProps {
  mode: 'create' | 'edit';
  initial?: LegacyCode;
  companies: CompanyOpt[];
  designs: DesignOpt[];
  busy: boolean;
  onSubmit: (form: CreateForm) => void;
  onCancel: () => void;
}

function CreateOrEditForm({
  mode,
  initial,
  companies,
  designs,
  busy,
  onSubmit,
  onCancel,
}: FormProps) {
  const [code, setCode] = useState(initial?.code ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [companyId, setCompanyId] = useState(initial?.companyId ?? '');
  const [designId, setDesignId] = useState(initial?.designId ?? '');
  const [manualCompanyName, setManualCompanyName] = useState(initial?.manualCompanyName ?? '');
  const [manualLogoUrl, setManualLogoUrl] = useState(initial?.manualLogoUrl ?? '');
  const [manualLogoExtUrl, setManualLogoExtUrl] = useState(initial?.manualLogoExtUrl ?? '');
  const [manualPrimaryColor, setManualPrimaryColor] = useState(initial?.manualPrimaryColor ?? '');
  const [manualQuote, setManualQuote] = useState(initial?.manualQuote ?? '');
  const [seats, setSeats] = useState(initial?.seats?.toString() ?? '');
  const [expiresAt, setExpiresAt] = useState(
    initial?.expiresAt ? initial.expiresAt.slice(0, 10) : ''
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  // Filter designs to the chosen company (or all if no company)
  const designOptions = companyId
    ? designs.filter((d) => d.companyId === companyId)
    : designs;

  function submit() {
    onSubmit({
      code: code.trim().toUpperCase(),
      label: label.trim() || null,
      companyId: companyId || null,
      designId: designId || null,
      manualCompanyName: manualCompanyName.trim() || null,
      manualLogoUrl: manualLogoUrl.trim() || null,
      manualLogoExtUrl: manualLogoExtUrl.trim() || null,
      manualPrimaryColor: manualPrimaryColor.trim() || null,
      manualQuote: manualQuote.trim() || null,
      seats: seats ? parseInt(seats, 10) : null,
      expiresAt: expiresAt ? new Date(expiresAt + 'T00:00:00.000Z').toISOString() : null,
      isActive,
    });
  }

  return (
    <div className="space-y-4">
      <SectionLabel>{mode === 'create' ? 'New legacy code' : `Edit ${initial?.code}`}</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Code"
          placeholder="STELVIO2026"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          mono
          disabled={mode === 'edit'} // codes are immutable once created
          maxLength={64}
        />
        <Input
          label="Label"
          hint="optional"
          placeholder="Stelvio Q4 trade show"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
        />
        <Select
          label="Company link"
          hint="optional — pulls branding"
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value);
            setDesignId(''); // reset design when company changes
          }}
        >
          <option value="">— None —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="Design link"
          hint={companyId ? `${designOptions.length} for company` : 'pick company first'}
          value={designId}
          onChange={(e) => setDesignId(e.target.value)}
          disabled={!companyId}
        >
          <option value="">— None —</option>
          {designOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>

      <SectionLabel>Manual overrides (used if no company/design link)</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Company name"
          placeholder="Acme S.r.l."
          value={manualCompanyName}
          onChange={(e) => setManualCompanyName(e.target.value)}
          maxLength={120}
        />
        <Input
          label="Primary color"
          hint="hex e.g. #1a1a1a"
          placeholder="#1a1a1a"
          value={manualPrimaryColor}
          onChange={(e) => setManualPrimaryColor(e.target.value)}
          mono
          maxLength={7}
        />
        <Input
          label="Logo URL (symbol)"
          hint="https://… on R2"
          placeholder="https://assets.perenne.app/…"
          value={manualLogoUrl}
          onChange={(e) => setManualLogoUrl(e.target.value)}
          mono
        />
        <Input
          label="Logo URL (extended)"
          hint="https://…"
          placeholder="https://assets.perenne.app/…"
          value={manualLogoExtUrl}
          onChange={(e) => setManualLogoExtUrl(e.target.value)}
          mono
        />
        <Input
          label="Quote"
          hint="optional, shown on page 2"
          placeholder="Property of …"
          value={manualQuote}
          onChange={(e) => setManualQuote(e.target.value)}
          maxLength={500}
        />
        <Input
          label="Seats"
          hint="optional cap"
          placeholder="50"
          type="number"
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Expires"
          hint="optional, blank = never"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Active</span>
          </label>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-glass-border">
        <Button variant="primary" onClick={submit} loading={busy} disabled={!code.trim()}>
          {mode === 'create' ? 'Create code' : 'Save changes'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
