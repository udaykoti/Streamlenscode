/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        safe: '#22c55e',
        unsafe: '#ef4444',
        conditional: '#f59e0b',
        unknown: '#6b7280',
        'stream-blue': '#3b82f6',
        'stream-purple': '#8b5cf6',
        'stream-dark': '#0f172a',
        'stream-darker': '#020617',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
