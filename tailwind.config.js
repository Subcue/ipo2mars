/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{tsx,ts}'],
  theme: {
    extend: {
      colors: {
        space: '#05060a',
        ink: '#0a0d14',
        accent: '#1b9cff',
        haze: '#7db8ff',
      },
      maxWidth: { site: '72rem' },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: { tightest: '-0.04em' },
      animation: {
        'fade-up': 'fadeUp 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
