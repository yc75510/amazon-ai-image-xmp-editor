import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.github.io/amazon-ai-image-xmp-editor/"),
  title: "Amazon AI Image Tagger | 为 Amazon AI 人物图片写入合规标签",
  description: "Amazon AI Image Tagger：面向 Amazon 卖家的本地 XMP 工具，为适用的 JPG/PNG 商品图和 A+ 内容图片写入并验证 contains-synthetic-performer。文件不上传，图片像素不会重新编码。",
  keywords: ["contains-synthetic-performer", "亚马逊AI图片标记", "Amazon AI image tag", "Amazon XMP", "dc:subject", "AI生成的人物"],
  alternates: { canonical: "/" },
  openGraph: { title: "Amazon AI Image Tagger", description: "在浏览器本地处理适用 JPG/PNG 的 contains-synthetic-performer XMP 标签；像素不会重新编码。", images: ["/og.png"], type: "website", locale: "zh_CN" },
  twitter: { card: "summary_large_image", title: "Amazon AI Image Tagger", description: "在浏览器本地处理并验证 contains-synthetic-performer XMP 标签。", images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
