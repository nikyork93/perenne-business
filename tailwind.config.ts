import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Background layers (deep neutral)
        'ink-bg': '#0a0a0f',
        'ink-bg-2': '#101015',

        // Text layers
        ink: '#f4f4f5',
        'ink-dim': '#a1a1aa',
        'ink-faint': '#71717a',

        // ─── LIQUID GLASS (true transparency, not opaque) ───
        // Use rgba so backdrop-blur shows through with real glass feel.
        // glass-base = canonical; glass-bg = legacy alias for globals.css.
        'glass-base': 'rgba(20, 20, 25, 0.4)',
        'glass-bg': 'rgba(20, 20, 25, 0.4)',
        'glass-elevated': 'rgba(28, 28, 35, 0.55)',
        'glass-border': 'rgba(255, 255, 255, 0.08)',
        'glass-hairline': 'rgba(255, 255, 255, 0.14)',

        // Accent: teal matching Perenne logo gradient (NO MORE GOLD)
        accent: '#4a7a8c',
        'accent-bright': '#5a92a8',
        'accent-dim': '#3a5f6e',
        'accent-soft': 'rgba(74, 122, 140, 0.15)',

        // Semantic
        success: '#34c77c',
        warning: '#ffb340',
        danger: '#ff5e5e',
        info: '#5ac8fa',
      },
      backgroundImage: {
        'glass-gradient':
          'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
        'accent-gradient':
          'linear-gradient(135deg, #4a7a8c 0%, #2c5868 100%)',
      },
      boxShadow: {
        'glass-sm': '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glass-md':
          '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-lg':
          '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        'accent-glow':
          '0 8px 24px rgba(74, 122, 140, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
      },
      backdropBlur: {
        '2xl': '40px',
        '3xl': '64px',
      },
      backdropSaturate: {
        180: '1.8',
      },
    },
  },
  plugins: [],
};

export default config;
