import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://synthetic-performer-xmp.pages.dev"),
  title: "Synthetic Performer XMP Tag Tool for Amazon Sellers",
  description: "Check or add the contains-synthetic-performer XMP disclosure tag to JPEG and PNG files locally in your browser.",
  alternates: { canonical: "/" },
  openGraph: { title: "Synthetic Performer XMP Tag Tool", description: "Add or verify the XMP disclosure tag locally.", images: ["/og.png"], type: "website" },
  twitter: { card: "summary_large_image", title: "Synthetic Performer XMP Tag Tool", description: "Add or verify the XMP disclosure tag locally.", images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
