// app/layout.tsx

import type { Metadata } from "next";
import { Montserrat, Instrument_Serif } from "next/font/google";
import "./globals.css"; // 👈 [핵심] 이 줄이 반드시 있어야 디자인이 적용됩니다!

// FindME 리뉴얼 타이포그래피(디자인 캔버스 기준)
//   본문: Pretendard Variable (jsDelivr 동적 서브셋, globals.css 의 font-family 기본값)
//   눈썹 라벨·번호: Montserrat 600
//   "Me" 워드마크: Instrument Serif italic
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-montserrat",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
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
    <html lang="ko" className={`${montserrat.variable} ${instrumentSerif.variable}`}>
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
