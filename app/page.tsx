"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

const TAG = "contains-synthetic-performer";
const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const DC_NS = "http://purl.org/dc/elements/1.1/";

type Kind = "jpeg" | "png" | "unsupported";
type XmpLocation = { start: number; end: number; xml: string; compressed?: boolean };
type FileStatus = "ready" | "already" | "unsupported" | "protected" | "done" | "error";
type FileItem = { id: string; file: File; bytes: Uint8Array; format: Kind; location?: XmpLocation; status: FileStatus; detail: string; output?: Uint8Array };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const structuredData = JSON.stringify({ "@context": "https://schema.org", "@graph": [
  { "@type": "SoftwareApplication", name: "Amazon AI Image Tagger", applicationCategory: "BusinessApplication", operatingSystem: "Web", browserRequirements: "Requires JavaScript. Supports JPG and PNG files.", description: "A browser-only tool that checks or adds Amazon's contains-synthetic-performer XMP tag to eligible product listing and A+ images.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isAccessibleForFree: true },
  { "@type": "FAQPage", mainEntity: [
    { "@type": "Question", name: "Does every AI-generated Amazon image need this metadata tag?", acceptedAnswer: { "@type": "Answer", text: "No. Amazon's stated condition is a photorealistic person generated entirely by AI. Images with no person, non-photorealistic people, or real people edited with AI do not fall within that condition." } },
    { "@type": "Question", name: "Will the tag appear on the visible image?", acceptedAnswer: { "@type": "Answer", text: "No. It is XMP metadata inside the file. The tool does not draw a label, watermark, or text onto image pixels." } },
    { "@type": "Question", name: "Does the tool change image quality or dimensions?", acceptedAnswer: { "@type": "Answer", text: "No pixels are decoded and re-encoded. JPG XMP APP1 and PNG XMP iTXt metadata are updated while visual image data is left intact." } },
    { "@type": "Question", name: "Can the tool decide whether my image is covered by Amazon's rule?", acceptedAnswer: { "@type": "Answer", text: "No. It only checks and writes the exact XMP value. You remain responsible for applying Amazon's current policy to the final image." } }
  ] }
] });

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

function zipFiles(entries: Array<{ name: string; bytes: Uint8Array }>) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const local: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name); const checksum = crc32(entry.bytes);
    const header = new Uint8Array(30 + name.length); const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(10, dosTime, true); view.setUint16(12, dosDate, true); view.setUint32(14, checksum, true); view.setUint32(18, entry.bytes.length, true); view.setUint32(22, entry.bytes.length, true); view.setUint16(26, name.length, true); header.set(name, 30);
    local.push(header, entry.bytes);
    const directory = new Uint8Array(46 + name.length); const dir = new DataView(directory.buffer);
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(12, dosTime, true); dir.setUint16(14, dosDate, true); dir.setUint32(16, checksum, true); dir.setUint32(20, entry.bytes.length, true); dir.setUint32(24, entry.bytes.length, true); dir.setUint16(28, name.length, true); dir.setUint32(42, offset, true); directory.set(name, 46); central.push(directory); offset += header.length + entry.bytes.length;
  }
  const centralBytes = concat(central); const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true); endView.setUint32(12, centralBytes.length, true); endView.setUint32(16, offset, true);
  return concat([...local, centralBytes, end]);
}

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();
  const [items, setItems] = useState<FileItem[]>([]);
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [toast, setToast] = useState<string>();
  const t = (en: string, zh: string) => language === "zh" ? zh : en;
  const ready = items.filter(item => item.status === "ready").length;
  const completed = items.filter(item => item.output).length;

  useEffect(() => { folderInput.current?.setAttribute("webkitdirectory", ""); folderInput.current?.setAttribute("directory", ""); }, []);

  async function addFiles(files: File[]) {
    const incoming = await Promise.all(files.map(async file => {
      const id = `${file.name}-${file.lastModified}-${Math.random()}`;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer()); const format = kindOf(bytes);
        if (format === "unsupported") return { id, file, bytes, format, status: "unsupported" as const, detail: "Unsupported format" };
        const location = format === "jpeg" ? findJpegXmp(bytes) : findPngXmp(bytes);
        if (location?.compressed) return { id, file, bytes, format, location, status: "protected" as const, detail: "Compressed PNG XMP" };
        if (location?.xml.toLowerCase().includes(TAG)) return { id, file, bytes, format, location, status: "already" as const, detail: "Tag already found" };
        return { id, file, bytes, format, location, status: "ready" as const, detail: location ? "Ready to append tag" : "Ready to add XMP" };
      } catch {
        return { id, file, bytes: new Uint8Array(), format: "unsupported" as const, status: "error" as const, detail: "File could not be read. Choose it again." };
      }
    }));
    setItems(current => [...current, ...incoming]);
    const readable = incoming.filter(item => item.status !== "error").length;
    if (readable) {
      setToast(t(`${readable} file${readable === 1 ? "" : "s"} added. Continue with Write and download.`, `已加入 ${readable} 个文件。请继续“写入并下载”。`));
      window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(undefined), 5000);
      window.setTimeout(() => document.getElementById("write-download")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }
  }
  async function selectFiles(event: ChangeEvent<HTMLInputElement>) { const files = Array.from(event.target.files ?? []); if (files.length) await addFiles(files); event.target.value = ""; }
  function dropFiles(event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); const files = Array.from(event.dataTransfer.files); if (files.length) void addFiles(files); }
  function processAll() {
    setItems(current => current.map(item => {
      if (item.status === "unsupported" || item.status === "protected" || item.status === "error") return item;
      try {
        const next = addTag(item.location?.xml ?? ""); const output = next.changed ? replace(item.bytes, item.location, item.format === "jpeg" ? jpegSegment(next.xml) : pngXmp(next.xml), item.format) : item.bytes;
        const verification = item.format === "jpeg" ? findJpegXmp(output) : findPngXmp(output);
        if (!verification?.xml.toLowerCase().includes(TAG)) throw new Error("Write verification failed");
        return { ...item, status: "done" as const, detail: next.changed ? "Tagged and verified" : "Already tagged and verified", output };
      } catch (error) { return { ...item, status: "error" as const, detail: error instanceof Error ? error.message : "Unable to write tag" }; }
    }));
  }
  function download(item: FileItem) {
    if (!item.output) return; const extension = item.format === "jpeg" ? "jpg" : "png"; const name = `${item.file.name.replace(/\.[^.]+$/, "")}-synthetic-performer.${extension}`;
    const url = URL.createObjectURL(new Blob([item.output], { type: item.format === "jpeg" ? "image/jpeg" : "image/png" })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  }
  function downloadZip() { const files = items.filter((item): item is FileItem & { output: Uint8Array } => Boolean(item.output)); if (!files.length) return; const names = new Map<string, number>(); const zip = zipFiles(files.map(item => { const base = `${item.file.name.replace(/\.[^.]+$/, "")}-synthetic-performer.${item.format === "jpeg" ? "jpg" : "png"}`; const count = names.get(base) ?? 0; names.set(base, count + 1); return { name: count ? base.replace(/(\.[^.]+)$/, `-${count + 1}$1`) : base, bytes: item.output }; })); const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" })); const link = document.createElement("a"); link.href = url; link.download = "amazon-synthetic-performer-tagged.zip"; link.click(); URL.revokeObjectURL(url); }
  const statusLabel = (status: FileStatus) => ({ ready: t("Ready", "待处理"), already: t("Already tagged", "已存在标签"), unsupported: t("Unsupported", "不支持"), protected: t("Protected XMP", "受保护的 XMP"), done: t("Verified", "已验证"), error: t("Error", "错误") })[status];
  const fileDetail = (item: FileItem) => ({ ready: t("Ready to add the Amazon tag", "待写入 Amazon 标签"), already: t("Amazon tag already found", "已检测到 Amazon 标签"), unsupported: t("This format is not supported", "不支持此文件格式"), protected: t("Compressed PNG XMP is not changed", "不会修改压缩 PNG XMP"), done: t("Tag written and read back successfully", "标签写入后已成功读回验证"), error: t("File could not be read. Choose it again.", "无法读取文件，请重新选择。") })[item.status];

  return <main>
    <header className="site-header"><a href="#tool" className="brand">AMZ <span>Tagger</span></a><nav><a href="#guide">{t("Guide", "说明")}</a><a href="#faq">FAQ</a><button className="language" onClick={() => setLanguage(language === "en" ? "zh" : "en")}>{language === "en" ? "中文" : "EN"}</button></nav></header>
    <section className="hero hero-batch"><p className="eyebrow">{t("AMAZON COMPLIANCE METADATA · LOCAL PROCESSING", "AMAZON 合规元数据 · 本地处理")}</p><h1>{t("Batch-add contains-synthetic-performer", "批量写入 contains-synthetic-performer")}</h1><p className="lead">{t("Add Amazon's exact XMP disclosure keyword to final JPG and PNG listing or A+ images.", "为最终 JPG / PNG 商品图或 A+ 图片写入 Amazon 指定的 XMP 披露关键词。")}</p><div className="format-row"><span>JPG</span><span>PNG</span><span>{t("Batch processing", "批量处理")}</span></div><div className="privacy-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg><span>{t("Your files stay entirely in this browser", "文件全程留在本地浏览器")}</span><em>{t("Never uploaded to any server", "不上传任何服务器")}</em></div></section>
    <section id="tool" className="workflow" aria-labelledby="workflow-heading"><div className="workflow-intro"><p className="eyebrow">{t("ONE AMAZON-SPECIFIC WORKFLOW", "单一 AMAZON 合规流程")}</p><h2 id="workflow-heading">{t("Write one exact tag. Verify every result.", "写入一个精确标签，逐个验证结果。")}</h2><p>{t("This is not a general metadata editor. It is purpose-built for the Amazon synthetic-performer disclosure workflow.", "这不是通用元数据编辑器；它只服务于 Amazon synthetic-performer 披露流程。")}</p></div>
      <section className="workspace-panel"><div className="panel-head"><b>01</b><h3>{t("Tag settings", "标签设置")}</h3></div><div className="tag-settings"><label className="keyword-field"><span>{t("Keyword to write (separate multiple values with commas)", "要写入的标记（多个用英文逗号分隔）")}</span><input value={TAG} readOnly aria-label="Amazon XMP keyword" /></label><p>{t("Keep the default value. ", "建议保持默认值。")}<strong>{t("A single wrong character can prevent Amazon from reading it.", "写错一个字符，Amazon 就可能无法读取。")}</strong></p><label className="preserve-setting"><input type="checkbox" checked readOnly /><span>{t("Keep existing tags and append the new one", "保留原有的标记，只追加新的")}</span></label></div></section>
      <section className="workspace-panel"><div className="panel-head"><b>02</b><h3>{t("Choose images", "选择图片")}</h3><span className="count">{items.length ? t(`${items.length} file${items.length === 1 ? "" : "s"} selected`, `已选择 ${items.length} 个文件`) : t("No files selected", "未选择文件")}</span></div><input ref={input} onChange={selectFiles} accept="image/jpeg,image/png,.jpg,.jpeg,.png" type="file" multiple hidden /><input ref={folderInput} onChange={selectFiles} accept="image/jpeg,image/png,.jpg,.jpeg,.png" type="file" multiple hidden /><div className="batch-dropzone" onDragOver={event => event.preventDefault()} onDrop={dropFiles}><span className="upload-mark">↑</span><strong>{t("Drop final images or a folder here", "将最终图片或整个文件夹拖到这里")}</strong><small>{t("JPG or PNG · select multiple files or a folder · files are never uploaded", "JPG 或 PNG · 支持选择多文件或整个文件夹 · 文件不会上传")}</small><div className="choose-row"><button className="choose-file" onClick={() => input.current?.click()}>{t("Choose files", "选择文件")}</button><button className="choose-file" onClick={() => folderInput.current?.click()}>{t("Choose folder", "选择文件夹")}</button></div></div><p className="fine-print">{t("Use the final exported files, after cropping, compression, or retouching is complete.", "请使用最终导出的文件，在裁剪、压缩或修图全部完成后再添加标签。")}</p></section>
      <section id="write-download" className="workspace-panel"><div className="panel-head"><b>03</b><h3>{t("Write and download", "写入并下载")}</h3><span className="count">{ready ? t(`${ready} ready to tag`, `${ready} 个待写入`) : t(`${completed} verified`, `已验证 ${completed} 个`)}</span></div><div className="action-row"><button className="primary" onClick={processAll} disabled={!items.length || !ready}>{t("Write tags and verify", "写入并验证")}</button><button className="secondary" onClick={downloadZip} disabled={!completed}>{t("Download ZIP", "下载 ZIP")}</button><button className="text-button" onClick={() => setItems([])} disabled={!items.length}>{t("Clear", "清空")}</button></div><div className="file-list" aria-live="polite">{items.length ? items.map(item => <div className="file-row" key={item.id}><div><strong>{item.file.name}</strong><small>{fileDetail(item)}</small></div><span className={`file-status ${item.status}`}>{statusLabel(item.status)}</span>{item.output && <button className="download-one" onClick={() => download(item)}>{t("Download", "下载")}</button>}</div>) : <p className="empty-state">{t("Add a batch of final JPG or PNG images to inspect their existing XMP before anything is written.", "添加一批最终 JPG 或 PNG 图片；写入前会先检查现有 XMP。")}</p>}</div></section>
      <section className="workspace-panel"><div className="panel-head"><b>04</b><h3>{t("Check the tag", "检查标签")}</h3></div><p className="check-copy">{t("Every processed file is read back before it is marked verified. You can also re-add a downloaded file above to inspect it again locally.", "每个处理后的文件都会被读回验证后才标记为“已验证”。也可以把下载后的文件重新添加到上方，再次在本地检查。")}</p></section>
    </section>
    <section id="guide" className="rule-section"><div><p className="eyebrow">{t("USE THE TAG ONLY WHEN IT APPLIES", "仅在适用时添加标签")}</p><h2>{t("Which Amazon images need the tag?", "哪些 Amazon 图片需要此标签？")}</h2><p>{t("Amazon describes a metadata disclosure for images that feature a photorealistic person generated entirely by AI. This tool cannot decide whether an image meets that condition.", "Amazon 对“包含逼真且完全由 AI 生成的人物”的图片规定了元数据披露。本工具无法判断图片是否满足该条件。")}</p><a className="text-link" href="https://sellercentral.amazon.com/seller-forums/discussions/t/aa0aee06-aff4-497a-a4b6-9b2ebe06f715" target="_blank" rel="noreferrer">{t("Read Amazon's current guidance", "查看 Amazon 最新指引")} ↗</a></div><div className="decision-table"><div className="decision-head"><span>{t("Image situation", "图片情况")}</span><span>{t("Add tag?", "需要添加？")}</span></div><div><span>{t("Photorealistic person generated entirely by AI", "逼真且完全由 AI 生成人物")}</span><b className="yes">{t("Yes", "是")}</b></div><div><span>{t("Real person altered with AI tools", "使用 AI 修改的真实人物")}</span><b>{t("No", "否")}</b></div><div><span>{t("AI-generated product or background with no person", "无人像的 AI 商品或背景图")}</span><b>{t("No", "否")}</b></div><div><span>{t("Cartoon, illustration, or non-photorealistic person", "卡通、插画或非写实人物")}</span><b>{t("No", "否")}</b></div></div></section>
    <section id="faq" className="faq"><p className="eyebrow">FAQ</p><h2>{t("Questions sellers ask before tagging", "卖家在打标前常问的问题")}</h2><details open><summary>{t("Will the tag appear on the visible image?", "标签会出现在图片画面里吗？")}</summary><p>{t("No. It is XMP metadata inside the file. The tool does not draw a label, watermark, or text onto the image pixels.", "不会。标签是文件内的 XMP 元数据；工具不会在图片像素上绘制标签、水印或文字。")}</p></details><details><summary>{t("Does batch tagging change image quality or dimensions?", "批量打标会改变画质或尺寸吗？")}</summary><p>{t("No pixels are decoded and re-encoded. Only JPG XMP APP1 and PNG XMP iTXt metadata are updated.", "不会重新解码或编码像素；只会更新 JPG 的 XMP APP1 或 PNG 的 XMP iTXt 元数据。")}</p></details><details><summary>{t("Why are video, WebP, HEIC, GIF, and AVIF unavailable?", "为什么不支持视频、WebP、HEIC、GIF 与 AVIF？")}</summary><p>{t("This version deliberately supports only JPG and PNG, where the browser writer can make a safe and verifiable metadata update.", "当前版本刻意只支持 JPG 和 PNG，以确保浏览器能够安全写入并验证元数据。")}</p></details></section>
    <section id="sources" className="sources"><p className="eyebrow">{t("SOURCES", "来源")}</p><h2>{t("Policy and technical references", "规则与技术参考")}</h2><ul><li><a href="https://sellercentral.amazon.com/seller-forums/discussions/t/aa0aee06-aff4-497a-a4b6-9b2ebe06f715" target="_blank" rel="noreferrer">Amazon Seller Forums — disclosure announcement</a><span>{t("Official disclosure scope and workflow.", "官方披露范围与流程说明。")}</span></li><li><a href="https://sellercentral.amazon.fr/help/hub/reference/external/GFXHCHYZRGJRBZA5?locale=fr-FR" target="_blank" rel="noreferrer">Amazon Seller Central — technical instructions</a><span>{t("Public help-page mirror describing the XMP structure.", "说明 XMP 结构的公开帮助页镜像。")}</span></li><li><a href="https://www.adobe.com/devnet/xmp.html" target="_blank" rel="noreferrer">Adobe — Extensible Metadata Platform</a><span>{t("XMP technical reference.", "XMP 技术参考。")}</span></li></ul></section>
    <footer><span>{t("Independent Amazon seller utility. Not affiliated with or endorsed by Amazon.", "独立的 Amazon 卖家工具；与 Amazon 不存在隶属或授权关系。")}</span><a href="#tool">{t("Back to tool", "返回工具")} ↑</a></footer>{toast && <div className="toast" role="status"><span>✓</span>{toast}<button onClick={() => setToast(undefined)} aria-label="Dismiss notification">×</button></div>}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
  </main>;
}
