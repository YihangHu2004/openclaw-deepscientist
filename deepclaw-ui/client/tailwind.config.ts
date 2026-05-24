import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // DeepClaw brand palette
        dc: {
          sidebar:    '#0f172a', // deep slate blue
          sidebarbg:  '#1e293b',
          sidebarhl:  '#334155',
          teal:       '#0a7ea4',
          'teal-light': '#0ea5c9',
          'teal-dark':  '#0369a1',
          cyan:       '#22d3ee',
          chat:       '#f8fafc', // cold white main area
          files:      '#f1f5f9', // light slate file panel
          card:       '#ffffff',
          border:     '#e2e8f0',
          muted:      '#64748b',
          tool:       '#1e293b', // tool call card bg
          'tool-text':'#94a3b8',
        },
      },
      fontFamily: {
        brand: ['Space Grotesk', 'Inter', 'sans-serif'],
        ui:    ['Inter', 'Noto Sans SC', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'monospace'],
        zh:    ['Noto Sans SC', 'sans-serif'],
      },
      animation: {
        'fade-up':    'fadeUp 0.2s ease-out',
        'pulse-dot':  'pulseDot 1.5s ease-in-out infinite',
        'cursor-blink': 'cursorBlink 1s step-end infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.4', transform: 'scale(0.8)' },
        },
        cursorBlink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
