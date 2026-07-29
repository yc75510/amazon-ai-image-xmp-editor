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

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [bytes, setBytes] = useState<Uint8Array>();
  const [kind, setKind] = useState<Kind>("unsupported");
  const [location, setLocation] = useState<XmpLocation>();
  const [result, setResult] = useState<Result>({ kind: "neutral", title: "Ready to check", detail: "Choose a final JPG or PNG image to inspect its XMP metadata." });

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const data = new Uint8Array(await selected.arrayBuffer());
    const detected = kindOf(data);
    setFile(selected); setBytes(data); setKind(detected);
    if (detected === "unsupported") { setLocation(undefined); setResult({ kind: "warning", title: "This format is not supported", detail: "This focused tool safely reads and writes JPG and PNG only. It does not process video, HEIC, WebP, GIF, or AVIF." }); return; }
    const xmp = detected === "jpeg" ? findJpegXmp(data) : findPngXmp(data);
    setLocation(xmp);
    if (xmp?.compressed) setResult({ kind: "warning", title: "Compressed PNG XMP found", detail: "This file has compressed PNG XMP. It will not be rewritten, to avoid damaging existing metadata." });
    else if (xmp?.xml.toLowerCase().includes(TAG)) setResult({ kind: "success", title: "Amazon disclosure tag found", detail: `The XMP packet contains ${TAG}. No duplicate tag is needed.` });
    else setResult({ kind: "warning", title: "Amazon disclosure tag not found", detail: xmp ? "An XMP packet exists, but it does not contain the required keyword." : "No readable XMP packet was found. A new XMP packet can be added." });
  }

  function writeAndDownload() {
    if (!file || !bytes || kind === "unsupported") return;
    try {
      if (location?.compressed) throw new Error("Compressed PNG XMP cannot be safely updated by this version.");
      const next = addTag(location?.xml ?? "");
      if (!next.changed) { setResult({ kind: "success", title: "No update needed", detail: "The exact disclosure tag already exists, so no duplicate was written." }); return; }
      const output = replace(bytes, location, kind === "jpeg" ? jpegSegment(next.xml) : pngXmp(next.xml), kind);
      const extension = kind === "jpeg" ? "jpg" : "png";
      const base = file.name.replace(/\.[^.]+$/, "");
      const url = URL.createObjectURL(new Blob([output], { type: kind === "jpeg" ? "image/jpeg" : "image/png" }));
      const link = document.createElement("a"); link.href = url; link.download = `${base}-synthetic-performer.${extension}`; link.click(); URL.revokeObjectURL(url);
      setResult({ kind: "success", title: "Tag written — download started", detail: "Re-upload the downloaded file here to confirm the tag, or inspect XMP dc:subject with an independent metadata reader." });
    } catch (error) { setResult({ kind: "error", title: "File was not changed", detail: error instanceof Error ? error.message : "An unexpected error occurred." }); }
  }

  return <main>
    <header className="site-header"><a href="#tool" className="brand">AMZ <span>Tag Check</span></a><nav><a href="#when-to-tag">When to tag</a><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a></nav></header>
    <section className="hero">
      <p className="eyebrow">AMAZON SELLER TOOL · LOCAL BROWSER PROCESSING</p>
      <h1>Add Amazon&apos;s AI image disclosure tag.</h1>
      <p className="lead">Check or add <code>{TAG}</code> to final JPG and PNG listing or A+ images that contain a photorealistic person generated entirely by AI.</p>
      <div className="trust-row"><span>JPG + PNG</span><span>Pixels unchanged</span><span>Files never uploaded</span></div>
    </section>
    <section id="tool" className="tool-shell" aria-labelledby="tool-heading">
      <div className="tool-heading"><p className="eyebrow">AMAZON DISCLOSURE WORKFLOW</p><h2 id="tool-heading">Tag the final image. Then verify it.</h2><p>This is a focused Amazon seller tool, not a general metadata editor. It writes one exact keyword without replacing your existing XMP keywords.</p></div>
      <div className="steps">
        <section className="step-panel"><div className="step-title"><b>01</b><h3>Amazon metadata to add</h3></div><div className="tag-spec"><span>Field <strong>dc:subject (XMP)</strong></span><span>Keyword <code>{TAG}</code></span></div><p className="fine-print">Hidden file metadata — not visible text or a watermark. The exact keyword is fixed to avoid an Amazon-reading mismatch.</p></section>
        <section className="step-panel"><div className="step-title"><b>02</b><h3>Choose the final Amazon image</h3></div><input ref={input} onChange={selectFile} accept="image/jpeg,image/png,.jpg,.jpeg,.png" type="file" id="file" hidden /><button className="dropzone" onClick={() => input.current?.click()}><span className="upload-mark">↑</span><strong>{file ? file.name : "Choose JPG or PNG"}</strong><small>Drag and drop is supported · files stay in this browser</small></button><p className="fine-print">Use the final exported image, after any cropping, compression, or retouching.</p></section>
        <section className="step-panel action-panel"><div className="step-title"><b>03</b><h3>Check, tag, and download</h3></div><div className={`result ${result.kind}`} aria-live="polite"><strong>{result.title}</strong><p>{result.detail}</p></div><button onClick={writeAndDownload} className="primary" disabled={!file || kind === "unsupported" || location?.compressed}>Add Amazon disclosure tag <span>→</span></button><p className="fine-print">The downloaded file can be re-uploaded here for a second, local verification.</p></section>
      </div>
    </section>
    <section id="when-to-tag" className="rule-section"><div><p className="eyebrow">USE THE TAG ONLY WHEN IT APPLIES</p><h2>Which Amazon images need the tag?</h2><p>Amazon describes a metadata-based disclosure for images that feature a photorealistic person generated entirely by AI. This tool does not inspect your image or make that compliance decision.</p><a className="text-link" href="https://sellercentral.amazon.com/seller-forums/discussions/t/aa0aee06-aff4-497a-a4b6-9b2ebe06f715" target="_blank" rel="noreferrer">Read Amazon&apos;s current guidance ↗</a></div><div className="decision-table"><div className="decision-head"><span>Image situation</span><span>Add the tag?</span></div><div><span>Photorealistic person generated entirely by AI</span><b className="yes">Yes</b></div><div><span>Real person altered with AI tools</span><b>No</b></div><div><span>AI-generated product or background with no person</span><b>No</b></div><div><span>Cartoon, illustration, or non-photorealistic person</span><b>No</b></div></div></section>
    <section id="how-it-works" className="explain-section"><p className="eyebrow">HOW THE TOOL HANDLES YOUR FILE</p><h2>One exact value. No pixel re-encoding.</h2><div className="benefit-grid"><article><b>1</b><h3>Read existing XMP</h3><p>It checks whether the Amazon keyword is already present and leaves an existing tag alone.</p></article><article><b>2</b><h3>Append, don&apos;t replace</h3><p>It adds <code>{TAG}</code> to the XMP <code>dc:subject</code> keyword list without replacing unrelated metadata.</p></article><article><b>3</b><h3>Download and recheck</h3><p>The image bytes are not recompressed. Re-upload the result to verify the written XMP locally.</p></article></div></section>
    <section className="notice"><strong>Before you upload to Amazon</strong><p>Use this tool only for the final files that meet the policy condition. A later image edit, compression, or format conversion can remove metadata. This independent tool is not affiliated with or endorsed by Amazon and does not provide legal or compliance advice.</p></section>
    <section id="faq" className="faq"><p className="eyebrow">AMAZON AI IMAGE TAGGER FAQ</p><h2>Questions sellers ask before tagging</h2><details open><summary>Does every AI-generated Amazon image need this metadata tag?</summary><p>No. Amazon&apos;s stated condition is a photorealistic person generated entirely by AI. Images with no person, non-photorealistic people, or real people edited with AI do not fall within that condition.</p></details><details><summary>Will the tag appear on the visible image?</summary><p>No. It is XMP metadata inside the file. This tool does not draw a label, watermark, or text onto the image pixels.</p></details><details><summary>Does the tool change image quality or dimensions?</summary><p>No pixels are decoded and re-encoded. JPG XMP APP1 and PNG XMP iTXt metadata are updated while the visual image data is left intact.</p></details><details><summary>Can the tool decide whether my image is covered by Amazon&apos;s rule?</summary><p>No. It only checks and writes the exact XMP value. You remain responsible for applying Amazon&apos;s current policy to the final image.</p></details><details><summary>Why are video, WebP, HEIC, GIF, and AVIF unavailable?</summary><p>Metadata containers and compatibility vary by format. This version deliberately supports only JPG and PNG so it can avoid unsafe or ambiguous writes.</p></details></section>
    <section id="sources" className="sources"><p className="eyebrow">SOURCES</p><h2>Policy and technical references</h2><ul><li><a href="https://sellercentral.amazon.com/seller-forums/discussions/t/aa0aee06-aff4-497a-a4b6-9b2ebe06f715" target="_blank" rel="noreferrer">Amazon Seller Forums — disclosure announcement</a><span>Official announcement covering the disclosure workflow and scope.</span></li><li><a href="https://sellercentral.amazon.fr/help/hub/reference/external/GFXHCHYZRGJRBZA5?locale=fr-FR" target="_blank" rel="noreferrer">Amazon Seller Central — technical tagging instructions</a><span>Public help-page mirror describing the exact XMP structure.</span></li><li><a href="https://www.adobe.com/devnet/xmp.html" target="_blank" rel="noreferrer">Adobe — Extensible Metadata Platform</a><span>XMP metadata framework reference.</span></li></ul></section>
    <footer><span>Independent Amazon seller utility. Not affiliated with or endorsed by Amazon.</span><a href="#tool">Back to tool ↑</a></footer><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
  </main>;
}
