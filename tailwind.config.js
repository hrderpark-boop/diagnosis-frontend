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
      // FindME 리뉴얼 팔레트·서체 (globals.css 의 CSS 변수와 동일 값)
      colors: {
        fm: {
          ink: '#0B0D10',
          panel: '#1C1F24',
          line: '#2C3037',
          gold: '#B08D5C',
          text: '#D5D9DF',
          muted: '#9BA2AC',
          dim: '#6B727C',
        },
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '"Noto Sans KR"', 'system-ui', 'sans-serif'],
        display: ['var(--font-montserrat)', 'Montserrat', 'sans-serif'],
        serif: ['var(--font-instrument)', '"Instrument Serif"', 'Georgia', 'serif'],
      },
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