/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    
    // 혹시 src 폴더를 쓰신다면 아래 줄도 포함 (없어도 무방)
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      animation: {
        wave: 'wave 1.4s ease-in-out infinite',
      },
      keyframes: {
        wave: {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.6' },
          '30%': { transform: 'translateY(-6px)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}