"use client";

import { ChangeEvent, useRef, useState } from "react";

const TAG = "contains-synthetic-performer";
const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const DC_NS = "http://purl.org/dc/elements/1.1/";

type Kind = "jpeg" | "png" | "unsupported";
type XmpLocation = { start: number; end: number; xml: string; compressed?: boolean };
type Result = { kind: "neutral" | "success" | "warning" | "error"; title: string; detail: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const structuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Synthetic Performer XMP Tag Tool",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript. Supports JPEG and PNG files.",
  description: "A browser-only tool that checks or adds the contains-synthetic-performer XMP disclosure tag for eligible Amazon seller media.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  isAccessibleForFree: true,
});

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function kindOf(bytes: Uint8Array): Kind {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes.slice(0, 8).every((value, i) => value === [137, 80, 78, 71, 13, 10, 26, 10][i])) return "png";
  return "unsupported";
}

function findJpegXmp(bytes: Uint8Array): XmpLocation | undefined {
  let p = 2;
  while (p + 4 <= bytes.length && bytes[p] === 0xff) {
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[p + 2] << 8) | bytes[p + 3];
    const end = p + 2 + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 0xe1) {
      const header = decoder.decode(bytes.slice(p + 4, p + 4 + XMP_HEADER.length));
      if (header === XMP_HEADER) return { start: p, end, xml: decoder.decode(bytes.slice(p + 4 + XMP_HEADER.length, end)) };
    }
    p = end;
  }
}

function findPngXmp(bytes: Uint8Array): XmpLocation | undefined {
  let p = 8;
  while (p + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + p, 4).getUint32(0);
    const type = decoder.decode(bytes.slice(p + 4, p + 8));
    const end = p + 12 + length;
    if (end > bytes.length) break;
    if (type === "iTXt") {
      const data = bytes.slice(p + 8, p + 8 + length);
      let n = data.indexOf(0);
      const keyword = n >= 0 ? decoder.decode(data.slice(0, n)) : "";
      if (keyword === "XML:com.adobe.xmp") {
        const compressed = data[n + 1] === 1;
        n += 3;
        while (n < data.length && data[n] !== 0) n++;
        n++;
        while (n < data.length && data[n] !== 0) n++;
        n++;
        return { start: p, end, xml: compressed ? "" : decoder.decode(data.slice(n)), compressed };
      }
    }
    if (type === "IEND") break;
    p = end;
  }
}

function defaultXmp() {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${RDF_NS}"><rdf:Description rdf:about="" xmlns:dc="${DC_NS}"><dc:subject><rdf:Bag><rdf:li>${TAG}</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

function addTag(xml: string) {
  if (xml.toLowerCase().includes(TAG)) return { xml, changed: false };
  if (!xml) return { xml: defaultXmp(), changed: true };
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("现有 XMP 不是可安全修改的 XML 数据包。");
  let description = doc.getElementsByTagNameNS(RDF_NS, "Description")[0];
  if (!description) {
    const rdf = doc.getElementsByTagNameNS(RDF_NS, "RDF")[0];
    if (!rdf) throw new Error("现有 XMP 缺少 RDF 结构，无法安全合并。");
    description = doc.createElementNS(RDF_NS, "rdf:Description");
    rdf.appendChild(description);
  }
  let subject = doc.getElementsByTagNameNS(DC_NS, "subject")[0];
  if (!subject) {
    subject = doc.createElementNS(DC_NS, "dc:subject");
    description.appendChild(subject);
  }
  let bag = subject.getElementsByTagNameNS(RDF_NS, "Bag")[0];
  if (!bag) {
    bag = doc.createElementNS(RDF_NS, "rdf:Bag");
    subject.appendChild(bag);
  }
  const item = doc.createElementNS(RDF_NS, "rdf:li");
  item.textContent = TAG;
  bag.appendChild(item);
  return { xml: new XMLSerializer().serializeToString(doc), changed: true };
}

function jpegSegment(xml: string) {
  const payload = concat([encoder.encode(XMP_HEADER), encoder.encode(xml)]);
  if (payload.length + 2 > 65535) throw new Error("处理后的 XMP 超过 JPEG 可写入的数据段限制。");
  return concat([new Uint8Array([0xff, 0xe1, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255]), payload]);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = encoder.encode(type);
  const out = new Uint8Array(data.length + 12);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(typeBytes, 4); out.set(data, 8);
  new DataView(out.buffer).setUint32(data.length + 8, crc32(concat([typeBytes, data])));
  return out;
}

function pngXmp(xml: string) {
  return pngChunk("iTXt", concat([encoder.encode("XML:com.adobe.xmp"), new Uint8Array([0, 0, 0, 0, 0]), encoder.encode(xml)]));
}

function replace(bytes: Uint8Array, target: XmpLocation | undefined, replacement: Uint8Array, kind: Kind) {
  if (target) return concat([bytes.slice(0, target.start), replacement, bytes.slice(target.end)]);
  if (kind === "jpeg") return concat([bytes.slice(0, 2), replacement, bytes.slice(2)]);
  let p = 8;
  while (p + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + p, 4).getUint32(0);
    if (decoder.decode(bytes.slice(p + 4, p + 8)) === "IEND") return concat([bytes.slice(0, p), replacement, bytes.slice(p)]);
    p += length + 12;
  }
  throw new Error("PNG 文件结构不完整。");
}

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [bytes, setBytes] = useState<Uint8Array>();
  const [kind, setKind] = useState<Kind>("unsupported");
  const [location, setLocation] = useState<XmpLocation>();
  const [result, setResult] = useState<Result>({ kind: "neutral", title: "等待文件", detail: "选择 JPEG 或 PNG 文件开始检测。" });

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const data = new Uint8Array(await selected.arrayBuffer());
    const detected = kindOf(data);
    setFile(selected); setBytes(data); setKind(detected);
    if (detected === "unsupported") { setLocation(undefined); setResult({ kind: "warning", title: "暂不支持此格式", detail: "此版本可安全读写 JPEG 和 PNG。HEIC、WebP、GIF、AVIF 和视频请使用专业工具处理。" }); return; }
    const xmp = detected === "jpeg" ? findJpegXmp(data) : findPngXmp(data);
    setLocation(xmp);
    if (xmp?.compressed) setResult({ kind: "warning", title: "检测到压缩 XMP", detail: "文件含压缩 PNG XMP，本版本不会改写它，以免破坏原有元数据。" });
    else if (xmp?.xml.toLowerCase().includes(TAG)) setResult({ kind: "success", title: "已检测到标签", detail: `该文件的 XMP 数据包包含 ${TAG}。` });
    else setResult({ kind: "warning", title: "未检测到标签", detail: xmp ? "发现 XMP 数据包，但其中没有目标标签。" : "没有发现可读 XMP 数据包；可以添加一个新的数据包。" });
  }

  function writeAndDownload() {
    if (!file || !bytes || kind === "unsupported") return;
    try {
      if (location?.compressed) throw new Error("压缩 PNG XMP 暂不支持安全修改。");
      const next = addTag(location?.xml ?? "");
      if (!next.changed) { setResult({ kind: "success", title: "无需修改", detail: "标签已经存在，不会写入重复值。" }); return; }
      const output = replace(bytes, location, kind === "jpeg" ? jpegSegment(next.xml) : pngXmp(next.xml), kind);
      const extension = kind === "jpeg" ? "jpg" : "png";
      const base = file.name.replace(/\.[^.]+$/, "");
      const url = URL.createObjectURL(new Blob([output], { type: kind === "jpeg" ? "image/jpeg" : "image/png" }));
      const link = document.createElement("a"); link.href = url; link.download = `${base}-synthetic-performer.${extension}`; link.click(); URL.revokeObjectURL(url);
      setResult({ kind: "success", title: "标签已写入并开始下载", detail: "下载后请把新文件重新上传并再次检测；这也是最直接的本地验证方式。" });
    } catch (error) { setResult({ kind: "error", title: "未修改文件", detail: error instanceof Error ? error.message : "发生未知错误。" }); }
  }

  return <main>
    <header className="nav"><a href="#tool" className="brand">XMP <span>Disclosure</span></a><nav><a href="#guide">使用说明</a><a href="#sources">来源</a><a href="#faq">FAQ</a></nav></header>
    <section className="hero"><div><p className="eyebrow">FOR AMAZON SELLERS · BROWSER-ONLY TOOL</p><h1>Prepare <em>Amazon</em> images for the synthetic-performer disclosure.</h1><p className="lead">检查并添加 <code>{TAG}</code>，供 Amazon Listing 或 A+ 最终图片在适用时使用。文件只在您的浏览器中处理。</p><div className="hero-notes"><span>✓ JPEG & PNG</span><span>✓ No upload</span><span>✓ No duplicate tags</span></div></div><aside className="scope"><strong>适用范围</strong><p>仅面向 Amazon 商品图片、视频或 A+ 内容中含有逼真、完全由 AI 生成的人物的情形。</p><a href="#guide">先了解规则范围 ↓</a></aside></section>
    <section id="tool" className="tool-card"><div className="tool-intro"><p className="eyebrow">ONE AMAZON FILE AT A TIME</p><h2>检测、添加、下载</h2><p>这不是通用元数据编辑器。它只检查或写入 Amazon 披露所需的单一标签；请先根据 Amazon 规则完成内容判断。</p></div><div className="workbench"><input ref={input} onChange={selectFile} accept="image/jpeg,image/png,.jpg,.jpeg,.png" type="file" id="file" hidden /><button className="dropzone" onClick={() => input.current?.click()}><span className="plus">+</span><strong>{file ? file.name : "选择 Amazon 最终图片"}</strong><small>JPEG 或 PNG · 仅在此设备处理</small></button><div className={`result ${result.kind}`} aria-live="polite"><strong>{result.title}</strong><p>{result.detail}</p></div><button onClick={writeAndDownload} className="primary" disabled={!file || kind === "unsupported" || location?.compressed}>添加 Amazon 披露标签并下载 <span>→</span></button></div></section>
    <section id="guide" className="content-grid"><article><p className="eyebrow">THE DISCLOSURE</p><h2>什么是这个标签？</h2><p><code>{TAG}</code> 是写进 XMP 元数据的精确文本值。Amazon 的卖家指引要求：在适用情形下，将其作为 XMP <code>dc:subject / rdf:Bag / rdf:li</code> 值，披露逼真、完全由 AI 生成的人物。</p><h3>通常需要考虑添加</h3><ul><li>准备上传到 Listing 或 A+ 内容的图片、视频中，有逼真且完全由 AI 生成的人物。</li><li>您代表品牌或卖家上传的媒体符合 Amazon 所述的披露触发条件。</li></ul><h3>通常不属于该规则</h3><ul><li>没有人物的 AI 生成或 AI 辅助商品图。</li><li>真实人物的 AI 修改、非逼真风格的人物，以及影视、电视或游戏等表达性作品中的角色。</li></ul><p className="caution">Amazon 说明该要求面向其全球站点；实际是否适用仍以您所在站点和账号显示的最新 Seller Central 规则为准。本工具不是 Amazon 官方产品，也不提供合规或法律意见。</p></article><article><p className="eyebrow">WORKFLOW</p><h2>如何验证？</h2><ol><li>选择最终要上传的 JPEG 或 PNG，查看是否已存在标签。</li><li>如未检测到，点击“添加标签并下载”。工具会避免重复写入。</li><li>对下载的新文件重新上传到此页；应显示“已检测到标签”。</li><li>需要独立核验时，用 ExifTool 等元数据查看器检查 XMP <code>dc:subject</code>。</li></ol><h3>隐私与兼容性</h3><p>所有字节解析、XML 修改和下载都在浏览器完成；本页面不设置文件上传接口。当前支持 JPEG XMP APP1 与 PNG XMP iTXt。不会修改像素内容。</p></article></section>
    <section id="faq" className="faq"><p className="eyebrow">FAQ</p><h2>常见问题</h2><details><summary>这个工具会把图片上传到服务器吗？</summary><p>不会。文件由浏览器的本地 JavaScript 读取和生成，页面没有接收图片的上传端点。</p></details><details><summary>为什么检测到标签仍需要人工判断？</summary><p>标签是否存在与规则是否适用是两个问题。工具只能核验元数据，不会识别图片中的人物或判断 Amazon 政策。</p></details><details><summary>为什么不支持 WebP、HEIC 或视频？</summary><p>这些容器的 XMP 写入和兼容性差异更大。为避免在卖家媒体中造成损坏，本版本只提供经过本地可逆结构校验的 JPEG 和 PNG 写入。</p></details><details><summary>这是否保证 Amazon 会接受文件？</summary><p>不保证。上传要求和政策可能按站点、账号或时间变化；请在上传前查阅适用的 Seller Central 指引。</p></details></section>
    <section id="sources" className="sources"><p className="eyebrow">SOURCES & TECHNICAL REFERENCES</p><h2>规则来源与技术依据</h2><ul><li><a href="https://sellercentral.amazon.com/seller-forums/discussions/t/aa0aee06-aff4-497a-a4b6-9b2ebe06f715" target="_blank" rel="noreferrer">Amazon Seller Forums — AI-generated people disclosure announcement</a><span>Amazon 官方公告，涵盖适用媒体、全球范围、豁免情形和目标 XMP 字段。</span></li><li><a href="https://sellercentral.amazon.fr/help/hub/reference/external/GFXHCHYZRGJRBZA5?locale=fr-FR" target="_blank" rel="noreferrer">Amazon Seller Central — technical tagging instructions</a><span>公开 Seller Central 帮助页镜像，说明 dc:subject / rdf:Bag / rdf:li 结构与精确值。</span></li><li><a href="https://www.adobe.com/devnet/xmp.html" target="_blank" rel="noreferrer">Adobe — Extensible Metadata Platform (XMP)</a><span>XMP 数据包与元数据框架技术参考。</span></li><li><a href="https://www.exiftool.org/TagNames/XMP.html" target="_blank" rel="noreferrer">ExifTool — XMP tag reference</a><span>用于独立检查 XMP 字段的技术工具参考。</span></li></ul></section>
    <footer><span>Independent seller utility · Not affiliated with or endorsed by Amazon.</span><a href="#tool">返回工具 ↑</a></footer><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
  </main>;
}
