'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface DesignOpt {
  id: string;
  name: string;
  isArchived: boolean;
}

interface BatchDesignPickerProps {
  /** Company id this batch belongs to. Server endpoint validates that the
   * chosen design belongs to the same company. */
  companyId: string;
  /** Batch label — the natural primary key for batch-level mutations. */
  batchLabel: string;
  /** Currently-assigned design id, or null if the batch has no design yet. */
  currentDesignId: string | null;
  /** Display name to show as the trigger label when a design is set. */
  currentDesignName: string | null;
  /** All non-archived designs for this company. The picker filters these
   * client-side; we trust the server to enforce company scoping. */
  options: DesignOpt[];
}

/**
 * Inline design picker for a code batch row.
 *
 * Shows the current assignment as text. Clicking opens a small dropdown
 * with the company's designs. Selecting one POSTs to
 * /api/admin/codes/assign-design and then refreshes the page so the
 * server-rendered table picks up the new value.
 *
 * Why the design might change AFTER codes are issued: the typical sales
 * flow is "company buys a code pack → days/weeks pass while the design
 * is finalized → admin links the design to the batch → company
 * distributes". So we need a UI to do the late binding.
 *
 * What about codes that have ALREADY been claimed? They keep being
 * served the latest design assigned to the batch. iOS refreshes from
 * /api/team/{CODE} on every app launch, so a design change propagates
 * to all activated devices on next launch. This matches the rule
 * "design follows the batch — if it changes, it changes for everyone
 * who activated".
 */
export function BatchDesignPicker({
  companyId,
  batchLabel,
  currentDesignId,
  currentDesignName,
  options,
}: BatchDesignPickerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function assign(designId: string | null) {
    setError(null);
    if (designId === currentDesignId) {
      setIsOpen(false);
      return;
    }

    // We can't represent "unassign" in the assign-design endpoint
    // (it requires a designId). Pragmatic: an explicit /unassign would
    // be cleaner, but in practice "unassign" is a rare operation —
    // skip it for now and surface a small note to the admin.
    if (!designId) {
      setError('To remove a design, contact engineering — unassign is not yet exposed in the UI.');
      return;
    }

    try {
      const res = await fetch('/api/admin/codes/assign-design', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchLabel, companyId, designId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (HTTP ${res.status})`);
        return;
      }
      setIsOpen(false);
      // Refresh the server component so the table re-fetches with the
      // new design name. Faster than a hard reload and keeps scroll
      // position.
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  // Keep only non-archived options. Archived designs would be confusing
  // to assign (their snapshot still works, but they're hidden from the
  // /designs library, so future edits won't surface).
  const visible = options.filter((d) => !d.isArchived);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={pending}
        className={`group inline-flex items-center gap-2 px-2 py-1 -ml-2 rounded-md text-xs transition ${
          currentDesignName
            ? 'text-ink-dim hover:text-ink hover:bg-surface-hover'
            : 'text-ink-faint hover:text-ink-dim hover:bg-surface-hover italic'
        }`}
      >
        <span>{currentDesignName ?? 'no design — click to assign'}</span>
        <span className="text-[9px] text-ink-faint opacity-60 group-hover:opacity-100">
          ▾
        </span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop catches outside clicks */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] max-w-[320px] py-1 rounded-lg border border-border-subtle bg-surface shadow-xl">
            {visible.length === 0 ? (
              <div className="px-3 py-2 text-xs text-ink-faint">
                This company has no designs yet. Create one in /designs first.
              </div>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {visible.map((d) => {
                  const isCurrent = d.id === currentDesignId;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => assign(d.id)}
                        disabled={pending}
                        className={`w-full text-left px-3 py-2 text-xs transition ${
                          isCurrent
                            ? 'bg-accent/10 text-accent'
                            : 'hover:bg-surface-hover text-ink-dim hover:text-ink'
                        }`}
                      >
                        {isCurrent && <span className="mr-1">✓</span>}
                        {d.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {error && (
              <div className="px-3 py-2 text-[11px] text-danger border-t border-border-subtle">
                {error}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
