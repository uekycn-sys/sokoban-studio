/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          950: '#0b0f17',
          900: '#111724',
          850: '#161f30',
          800: '#1b263b',
          750: '#223049',
          700: '#2c3e5d',
          600: '#415a77',
          500: '#778da9',
          400: '#a3b1c6',
          300: '#cbd5e1',
          200: '#e2e8f0',
          100: '#f1f5f9',
        },
        amber: {
          450: '#f59e0b',
          550: '#d97706',
        },
        wood: {
          300: '#d4a373',
          400: '#bc6c25',
          500: '#99582a',
          600: '#6f3918',
        }
      },
      fontFamily: {
        game: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'glow-amber': '0 0 20px -3px rgba(245, 158, 11, 0.45)',
        'glow-emerald': '0 0 22px -2px rgba(16, 185, 129, 0.55)',
        'glow-blue': '0 0 20px -3px rgba(59, 130, 246, 0.45)',
        'inner-dark': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-short': 'bounce 0.5s ease-in-out 1',
      }
    },
  },
  plugins: [],
}
