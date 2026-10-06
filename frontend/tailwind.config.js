/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1E1B4B',
        gold: '#C6A15B',
        goldsoft: '#F3E9D2',
      },
      fontFamily: { sans: ['Tajawal', 'system-ui', 'sans-serif'] },
      fontSize: {
        xs: ['0.95rem', { lineHeight: '1.45' }],
        sm: ['1.05rem', { lineHeight: '1.5' }],
        base: ['1.15rem', { lineHeight: '1.6' }],
        lg: ['1.25rem', { lineHeight: '1.55' }],
        xl: ['1.4rem', { lineHeight: '1.4' }],
        '2xl': ['1.6rem', { lineHeight: '1.3' }],
      },
    },
  },
  plugins: [],
};
