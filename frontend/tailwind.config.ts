import type { Config } from 'tailwindcss';

/**
 * Design tokens for ShelfStock.
 *
 * Two overrides here do a lot of work with no markup changes:
 *
 * 1. `gray` is remapped to a warm stone ramp. Tailwind's default gray is
 *    blue-tinted, which fought the brand green everywhere. Every existing
 *    `text-gray-500` / `border-gray-200` picks the warm value up for free.
 * 2. `borderRadius.DEFAULT` moves 4px -> 8px (controls) and `lg` 8px -> 10px
 *    (cards), so the existing `rounded` / `rounded-lg` classes land on the
 *    new radius scale without being rewritten.
 *
 * brand-500/600/700 keep their original hex values - they're what's already
 * deployed and recognizable. The rest of the ramp is filled in around them.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9f4',
          100: '#dbf0e3',
          200: '#bbe0cb',
          300: '#8dc8a8',
          400: '#55a87e',
          500: '#1f8a53',
          600: '#177042',
          700: '#125934',
          800: '#0f4729',
          900: '#0c3620',
          950: '#062014',
        },
        // Warm stone neutrals, aliased over `gray` so existing utilities warm up.
        gray: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09',
        },
      },
      fontFamily: {
        // Set by next/font in app/layout.tsx.
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
      },
      borderRadius: {
        DEFAULT: '0.5rem', // 8px - controls
        lg: '0.625rem', // 10px - cards
      },
      boxShadow: {
        // Softer and warmer than Tailwind's default, which is pure black alpha.
        sm: '0 1px 2px 0 rgb(28 25 23 / 0.05)',
        card: '0 1px 2px 0 rgb(28 25 23 / 0.04), 0 1px 3px 0 rgb(28 25 23 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(28 25 23 / 0.10), 0 2px 6px -2px rgb(28 25 23 / 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
