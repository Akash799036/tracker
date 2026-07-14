import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe6ff', 200: '#bfd2ff', 300: '#93b3ff',
          400: '#6089ff', 500: '#3a63f5', 600: '#2748e0', 700: '#1f38b8',
          800: '#1c3195', 900: '#1c2e78',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.08)',
        soft: '0 1px 2px rgba(15,23,42,.05)',
      },
    },
  },
  plugins: [],
};
export default config;
