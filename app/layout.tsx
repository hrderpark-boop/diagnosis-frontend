// app/layout.tsx

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css"; // 👈 [핵심] 이 줄이 반드시 있어야 디자인이 적용됩니다!
import "./fm-light.css"; // 참가자 화면 라이트 리디자인 공통 토큰·컴포넌트(fm- 접두어)
import "./fm-admin.css"; // 관리자 콘솔(/admin · /master) 공통 스타일(fa- 접두어)

// FindME 리뉴얼 타이포그래피(디자인 캔버스 기준)
//   본문: Pretendard Variable (jsDelivr 동적 서브셋, globals.css 의 font-family 기본값)
//   눈썹 라벨·번호: Montserrat 600
//   "Me" 워드마크: Instrument Serif italic
// (2026-11-03) next/font/google → next/font/local. Vercel 빌드가 Google Fonts 다운로드 실패(네트워크 플레이크)로
//   두 번 깨졌다(NextFontGoogleFontFileReplacer … module-not-found). 쓰는 weight 의 latin woff2 만 저장소(app/fonts)에 둔다.
//   Montserrat·Outfit 은 가변 글꼴이라 파일 하나에 weight 범위로 선언한다. 빌드 시 외부 글꼴 다운로드 0건.
const montserrat = localFont({
  src: [{ path: "./fonts/Montserrat-variable-latin.woff2", weight: "500 600", style: "normal" }],
  variable: "--font-montserrat",
  display: "swap",
});
// 워드마크 "Find Me": Find 300 / Me 600
const outfit = localFont({
  src: [{ path: "./fonts/Outfit-variable-latin.woff2", weight: "300 600", style: "normal" }],
  variable: "--font-outfit",
  display: "swap",
});
// 워드마크 "Me" 전용 둥근 서체
const quicksand = localFont({
  src: [{ path: "./fonts/Quicksand-700-normal-latin.woff2", weight: "700", style: "normal" }],
  variable: "--font-quicksand",
  display: "swap",
});
const instrumentSerif = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-400-normal-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-400-italic-latin.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Find Me · AI 리더십 코칭",
  description: "내 안의 진짜 리더를 찾는 여정",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${montserrat.variable} ${instrumentSerif.variable} ${outfit.variable} ${quicksand.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
