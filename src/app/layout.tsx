import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MoYuFun",
    template: "%s | MoYuFun",
  },
  description: "无需下载安装，打开浏览器即可游玩的 HTML5 小游戏站。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={geist.variable} lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
