import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/*
  구글 폰트를 빌드 시점에 파일로 받아 함께 배포한다(next/font).
  사용자 브라우저가 구글 서버로 나가는 요청 자체가 사라지고,
  폰트 로딩이 실패할 일도 없다. 폴백은 CSS 변수의 시스템 폰트 스택.
*/
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "매도 사다리 — 분할익절 역산 계산기",
  description:
    "매수가·손절가·손익비를 입력하면 분할 매도가격 사다리를 역산해주는 계산기",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
      suppressHydrationWarning: next-themes가 첫 페인트 전에 <html>에
      .dark 클래스를 붙이는데, 서버가 만든 HTML과 잠깐 달라지는 것을
      React가 오류로 오해하지 않도록 하는 표준 패턴이다.
    */
    <html lang="ko" suppressHydrationWarning>
      <body className={`${notoSansKr.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
