import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // ────────────────────────────────────────────────────────────
      // COLORS — all driven by CSS variables for theme switching
      // ────────────────────────────────────────────────────────────
      colors: {
        // Surfaces
        'bg-base':         'var(--bg-base)',
        'bg-deep':         'var(--bg-deep)',
        'bg-mid':          'var(--bg-mid)',

        'glass-bg':        'var(--glass-bg)',
        'glass-bg-hi':     'var(--glass-bg-hi)',
        'glass-border':    'var(--glass-border)',
        'glass-hairline':  'var(--glass-hairline)',

        'surface-faint':   'var(--surface-faint)',
        'surface-hover':   'var(--surface-hover)',
        'border-subtle':   'var(--border-subtle)',

        'sidebar-bg':      'var(--sidebar-bg)',
        'sidebar-border':  'var(--sidebar-border)',

        // Text
        'ink':             'var(--text)',
        'ink-dim':         'var(--text-dim)',
        'ink-faint':       'var(--text-faint)',

        // Accents (teal — replaces gold)
        'accent':          'var(--accent)',
        'accent-glow':     'var(--accent-glow)',
        'accent-soft':     'var(--accent-soft)',

        // Status
        'danger':          'var(--danger)',
        'danger-soft':     'var(--danger-soft)',
        'success':         'var(--success)',
      },
      fontFamily: {
        sans:    ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
        mono:    ['var(--font-mono)', 'monospace'],
      },
      backgroundColor: {
        'glass-bg': 'var(--glass-bg)',
      },
      borderColor: {
        'glass-border':   'var(--glass-border)',
        'glass-hairline': 'var(--glass-hairline)',
      },
    },
  },
  plugins: [],
};

export default config;
