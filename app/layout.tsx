import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://synthetic-performer-xmp-tool.yc75510-chan.chatgpt.site"),
  title: "亚马逊 AI 图片合规标记工具 - 批量写入 contains-synthetic-performer",
  description: "给 Amazon 卖家使用的本地 XMP 标记工具：可批量检测或写入 contains-synthetic-performer，支持 JPG/PNG 商品图和 A+ 内容图片。文件不上传，写入后可验证并下载。",
  keywords: ["contains-synthetic-performer", "亚马逊AI图片标记", "Amazon AI image tag", "Amazon XMP", "dc:subject", "AI生成的人物"],
  alternates: { canonical: "/" },
  openGraph: { title: "亚马逊 AI 图片合规标记工具", description: "批量检测或写入 contains-synthetic-performer XMP 标记。仅在浏览器本地处理 JPG/PNG 图片。", images: ["/og.png"], type: "website", locale: "zh_CN" },
  twitter: { card: "summary_large_image", title: "亚马逊 AI 图片合规标记工具", description: "批量检测或写入 contains-synthetic-performer XMP 标记。仅在浏览器本地处理 JPG/PNG 图片。", images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
