// app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // 👈 [핵심] 이 줄이 반드시 있어야 디자인이 적용됩니다!

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI 리더십 코칭",
  description: "당신의 잠재력을 찾아가는 여정",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={inter.className}>{children}</body>
    </html>
  );
}