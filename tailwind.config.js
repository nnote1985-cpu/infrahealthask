/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#0b0e11',
          900: '#12161b',
          800: '#1a2027',
          700: '#242b34',
          600: '#333c47',
          500: '#5b6570',
          400: '#88919b',
          300: '#b4bcc4',
        },
        signal: {
          healthy: '#3ecf8e',
          slow: '#e8b339',
          failed: '#e8534a',
          paused: '#6b7280',
          unknown: '#3f4750',
        },
        accent: '#4f8cff',
      },
      fontFamily: {
        display: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
