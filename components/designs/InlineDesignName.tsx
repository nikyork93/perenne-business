'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface InlineDesignNameProps {
  designId: string;
  initialName: string;
  /** Optional class on the static (non-editing) text — for size/font */
  className?: string;
  /** Refresh server data after rename. Default true. */
  refresh?: boolean;
  /** Called after successful rename, with new name. Optional callback. */
  onRenamed?: (newName: string) => void;
}

/**
 * InlineDesignName — click-to-edit design name.
 *
 * Visual modes:
 *   - idle:    shows the name; click toggles edit mode
 *   - editing: shows an input pre-filled with the name; Enter saves,
 *              Escape cancels, blur saves
 *   - saving:  greyed out while the PATCH is in flight
 *
 * Errors are surfaced inline in red below the input so the user sees
 * what went wrong without hunting in console. The component refreshes
 * the parent route on success so server-rendered names update too.
 */
export function InlineDesignName({
  designId,
  initialName,
  className,
  refresh = true,
  onRenamed,
}: InlineDesignNameProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [committed, setCommitted] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep `committed` in sync if parent re-renders with a new initialName
  // (e.g. router.refresh after an external rename).
  useEffect(() => {
    setCommitted(initialName);
    setValue(initialName);
  }, [initialName]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      // Empty → revert without saving
      setValue(committed);
      setEditing(false);
      setError(null);
      return;
    }
    if (trimmed === committed) {
      setEditing(false);
      setError(null);
      return;
    }
    if (trimmed.length > 120) {
      setError('Name too long (max 120 characters).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/designs/${designId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        const text = await res.text().catch(() => '');
        console.error('[rename] non-JSON response', {
          status: res.status,
          bodyPreview: text.slice(0, 300),
        });
        setError(`Server returned ${res.status}.`);
        setSaving(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Rename failed.');
        setSaving(false);
        return;
      }
      setCommitted(trimmed);
      setEditing(false);
      onRenamed?.(trimmed);
      if (refresh) router.refresh();
    } catch (err) {
      console.error('[rename] fetch failed', err);
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(committed);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          // Stop propagation so clicking the name on a card doesn't
          // also trigger the card's "Edit" link navigation.
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        className={`text-left hover:underline decoration-dotted underline-offset-4 cursor-text ${className ?? ''}`}
        title="Click to rename"
      >
        {committed}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={saving}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Stop propagation so Enter/Escape don't bubble into other
          // global handlers (e.g. modals, keyboard shortcuts).
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        // Eat clicks too — if this input lives inside a clickable Card,
        // we don't want a click on the input to trigger card navigation.
        onClick={(e) => e.stopPropagation()}
        className={`bg-white/[0.04] border border-glass-border rounded px-2 py-1 text-ink outline-none focus:border-accent/50 disabled:opacity-50 ${className ?? ''}`}
        style={{ minWidth: 0, width: '100%' }}
      />
      {error && (
        <span className="text-[10px] text-[#ff9a9a] font-mono">{error}</span>
      )}
    </div>
  );
}
