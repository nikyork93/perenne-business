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
        display: ['Fraunces', 'serif'],
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Liquid Glass palette
        ink: {
          DEFAULT: 'rgba(255, 255, 255, 0.96)',
          dim:    'rgba(255, 255, 255, 0.55)',
          faint:  'rgba(255, 255, 255, 0.32)',
          ghost:  'rgba(255, 255, 255, 0.12)',
        },
        glass: {
          bg:       'rgba(255, 255, 255, 0.055)',
          'bg-hi':  'rgba(255, 255, 255, 0.085)',
          border:   'rgba(255, 255, 255, 0.09)',
          hairline: 'rgba(255, 255, 255, 0.18)',
        },
        accent: {
          DEFAULT: '#d4a574',
          soft:    '#b8885c',
          glow:    'rgba(212, 165, 116, 0.35)',
        },
        danger:  '#ff6b6b',
        surface: '#0a0a0f',
        'surface-2': '#0b0b12',
        'surface-3': '#08080e',
      },
      backdropBlur: {
        glass: '40px',
      },
      boxShadow: {
        'glass':       '0 8px 32px rgba(0, 0, 0, 0.35)',
        'glass-deep':  '0 20px 60px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.4)',
        'accent-glow': '0 8px 32px rgba(212, 165, 116, 0.35)',
      },
      animation: {
        'rise-in': 'riseIn 0.6s ease both',
      },
      keyframes: {
        riseIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
