/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        field: '#f4f7f6',
        line: '#d9e2df',
        water: '#3978a8',
        forest: '#2f7d55',
        sun: '#d3902f',
      },
      boxShadow: {
        panel: '0 18px 45px rgba(23, 32, 51, 0.12)',
      },
    },
  },
  plugins: [],
}
