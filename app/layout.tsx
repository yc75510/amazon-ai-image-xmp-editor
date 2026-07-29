import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://synthetic-performer-xmp.pages.dev"),
  title: "Amazon AI Image Tagger: Add contains-synthetic-performer XMP",
  description: "Check or add Amazon's contains-synthetic-performer XMP tag to final JPG and PNG product listing or A+ images. Process locally in your browser.",
  alternates: { canonical: "/" },
  openGraph: { title: "Amazon AI Image Tagger", description: "Add or verify Amazon's contains-synthetic-performer XMP tag locally.", images: ["/og.png"], type: "website" },
  twitter: { card: "summary_large_image", title: "Amazon AI Image Tagger", description: "Add or verify Amazon's contains-synthetic-performer XMP tag locally.", images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
