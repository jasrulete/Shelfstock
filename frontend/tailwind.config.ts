import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9f4',
          100: '#dbf0e3',
          500: '#1f8a53',
          600: '#177042',
          700: '#125934',
        },
      },
    },
  },
  plugins: [],
};

export default config;
