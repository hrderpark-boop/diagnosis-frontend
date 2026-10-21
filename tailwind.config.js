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
        // (2026-10 라이트 리디자인) 참가자 화면 팔레트. 값은 app/fm-light.css 의 --fm-* 토큰과 동일.
        // 구 키(gold·line·muted·text·dim·panel·ink)는 남은 사용처가 깨지지 않도록 라이트 값으로 매핑해 둔다.
        fm: {
          paper: '#FFFFFF',
          'paper-soft': '#FBFBFB',
          'paper-mute': '#F2F2F2',
          ink: '#000000',
          'ink-body': '#404040',
          'gray-500': '#7F7F7F',
          'gray-300': '#A6A6A6',
          'gray-100': '#D9D9D9',
          accent: '#1C2B4A',
          'accent-hover': '#13203A',
          'accent-tint': '#E9EDF4',
          'blue-mid': '#2E4A85',
          'blue-bright': '#4F86F7',
          'blue-light': '#8FB2FB',
          danger: '#B4232C',
          gold: '#1C2B4A',
          line: '#D9D9D9',
          text: '#404040',
          muted: '#7F7F7F',
          dim: '#A6A6A6',
          panel: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '"Noto Sans KR"', 'system-ui', 'sans-serif'],
        wordmark: ['var(--font-outfit)', 'Outfit', 'sans-serif'],
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