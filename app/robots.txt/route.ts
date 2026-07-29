export const dynamic = "force-static";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.github.io/synthetic-performer-xmp-tool/").replace(/\/$/, "");

export function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
