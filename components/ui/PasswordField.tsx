'use client';

import { useState, useEffect } from 'react';
import { evaluatePassword, generateSecurePassword, type PasswordStrength } from '@/lib/password';

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  email?: string;
  placeholder?: string;
  label?: string;
  showMeter?: boolean;
  showSuggest?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}

const COLOR_MAP = {
  red: { fill: '#ff5e5e', text: '#fca5a5' },
  orange: { fill: '#ff9f4f', text: '#fcd9b6' },
  yellow: { fill: '#ffd43b', text: '#fef3c7' },
  lime: { fill: '#a3e635', text: '#d9f99d' },
  green: { fill: '#34c77c', text: '#86efac' },
  emerald: { fill: '#10b981', text: '#6ee7b7' },
};

export function PasswordField({
  value,
  onChange,
  email,
  placeholder = '••••••••••',
  label = 'Password',
  showMeter = true,
  showSuggest = false,
  required = true,
  autoFocus = false,
  disabled = false,
}: PasswordFieldProps) {
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (value.length === 0) {
      setStrength(null);
    } else {
      setStrength(evaluatePassword(value, email));
    }
  }, [value, email]);

  function handleSuggest() {
    const newPwd = generateSecurePassword(16);
    onChange(newPwd);
    setShow(true);
    // Copy to clipboard
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(newPwd).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] text-ink-dim font-medium">
          {label}
          {required && <span className="text-accent-bright ml-0.5">*</span>}
        </label>
        {showSuggest && (
          <button
            type="button"
            onClick={handleSuggest}
            disabled={disabled}
            className="text-[10px] text-accent-bright hover:text-accent-bright transition font-mono disabled:opacity-50"
          >
            {copied ? '✓ copied' : 'suggest secure →'}
          </button>
        )}
      </div>

      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete="new-password"
          className="w-full px-4 py-3 pr-12 rounded-2xl bg-white/[0.04] border border-glass-border text-ink text-sm font-sans placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] transition-all disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint hover:text-ink transition font-mono"
        >
          {show ? 'hide' : 'show'}
        </button>
      </div>

      {/* Strength meter — only when there's content and meter enabled */}
      {showMeter && strength && value.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {/* Bar */}
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    i <= strength.score && strength.isValid
                      ? COLOR_MAP[strength.color].fill
                      : i <= strength.score && !strength.isValid
                        ? COLOR_MAP.red.fill
                        : 'rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>

          {/* Label */}
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] font-mono uppercase tracking-wider"
              style={{ color: strength.isValid ? COLOR_MAP[strength.color].text : COLOR_MAP.red.text }}
            >
              {strength.label}
            </span>
            <span className="text-[9px] text-ink-faint font-mono">
              {value.length} chars
            </span>
          </div>

          {/* Errors (blocking) */}
          {strength.errors.length > 0 && (
            <ul className="space-y-0.5 pt-1">
              {strength.errors.map((err, i) => (
                <li key={i} className="text-[10px] text-red-300 flex items-start gap-1.5">
                  <span className="text-red-400">⊘</span>
                  <span>{err}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Feedback (non-blocking suggestions) */}
          {strength.errors.length === 0 && strength.feedback.length > 0 && (
            <ul className="space-y-0.5 pt-1">
              {strength.feedback.map((tip, i) => (
                <li key={i} className="text-[10px] text-ink-faint flex items-start gap-1.5">
                  <span>·</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
