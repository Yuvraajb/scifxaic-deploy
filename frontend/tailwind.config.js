/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        crimson: {
          50:  '#fdf2f4',
          100: '#fce7eb',
          200: '#f9d0d9',
          300: '#f4a8bb',
          400: '#ed7596',
          500: '#e04474',
          600: '#cc2558',
          700: '#ac1847',
          800: '#91173f',
          900: '#7c183b',
          950: '#44071c',
        },
      },
    },
  },
  plugins: [],
};
