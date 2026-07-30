export const TARGET_TAG = "contains-synthetic-performer";
export const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";

export type ImageKind = "jpeg" | "png" | "unsupported";
export type XmpLocation = { start: number; end: number; xml: string; compressed?: boolean };
export type MetadataStatus = "pending" | "existing" | "unavailable";
export type MetadataInspection = { format: ImageKind; location?: XmpLocation; status: MetadataStatus; detail: string };

const decoder = new TextDecoder();

export function imageKind(bytes: Uint8Array): ImageKind {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "png";
  return "unsupported";
}

export function findJpegXmp(bytes: Uint8Array): XmpLocation | undefined {
  let position = 2;
  while (position + 4 <= bytes.length && bytes[position] === 0xff) {
    const marker = bytes[position + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[position + 2] << 8) | bytes[position + 3];
    const end = position + 2 + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 0xe1) {
      const header = decoder.decode(bytes.slice(position + 4, position + 4 + XMP_HEADER.length));
      if (header === XMP_HEADER) return { start: position, end, xml: decoder.decode(bytes.slice(position + 4 + XMP_HEADER.length, end)) };
    }
    position = end;
  }
}

export function findPngXmp(bytes: Uint8Array): XmpLocation | undefined {
  let position = 8;
  while (position + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + position, 4).getUint32(0);
    const type = decoder.decode(bytes.slice(position + 4, position + 8));
    const end = position + 12 + length;
    if (end > bytes.length) break;
    if (type === "iTXt") {
      const data = bytes.slice(position + 8, position + 8 + length);
      let textStart = data.indexOf(0);
      const keyword = textStart >= 0 ? decoder.decode(data.slice(0, textStart)) : "";
      if (keyword === "XML:com.adobe.xmp") {
        const compressed = data[textStart + 1] === 1;
        textStart += 3;
        while (textStart < data.length && data[textStart] !== 0) textStart++;
        textStart++;
        while (textStart < data.length && data[textStart] !== 0) textStart++;
        textStart++;
        return { start: position, end, xml: compressed ? "" : decoder.decode(data.slice(textStart)), compressed };
      }
    }
    if (type === "IEND") break;
    position = end;
  }
}

function isWellFormedXml(xml: string) {
  if (!xml.trim().startsWith("<")) return false;
  const stack: string[] = [];
  const tagPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\/?>/g;
  let matchedTag = false;
  let cursor = 0;

  for (const match of xml.matchAll(tagPattern)) {
    if (xml.slice(cursor, match.index).includes("<")) return false;
    cursor = (match.index ?? 0) + match[0].length;
    const token = match[0];
    const name = match[1];
    if (!name) continue;
    matchedTag = true;
    if (token.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else if (!token.endsWith("/>")) {
      stack.push(name);
    }
  }

  return matchedTag && !xml.slice(cursor).includes("<") && stack.length === 0;
}

export function hasTargetTag(xml: string) {
  if (!isWellFormedXml(xml)) return false;
  const subjects = xml.matchAll(/<dc:subject\b[^>]*>([\s\S]*?)<\/dc:subject\s*>/g);
  for (const subject of subjects) {
    const bags = subject[1].matchAll(/<rdf:Bag\b[^>]*>([\s\S]*?)<\/rdf:Bag\s*>/g);
    for (const bag of bags) {
      const values = Array.from(bag[1].matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li\s*>/g), item => item[1].trim());
      if (values.includes(TARGET_TAG)) return true;
    }
  }
  return false;
}

export function inspectImageMetadata(bytes: Uint8Array): MetadataInspection {
  const format = imageKind(bytes);
  if (format === "unsupported") return { format, status: "unavailable", detail: "Unsupported format" };

  const location = format === "jpeg" ? findJpegXmp(bytes) : findPngXmp(bytes);
  if (location?.compressed) return { format, location, status: "unavailable", detail: "Compressed PNG XMP" };
  if (location?.xml && !isWellFormedXml(location.xml)) return { format, location, status: "unavailable", detail: "Unreadable XMP" };
  if (location?.xml && hasTargetTag(location.xml)) return { format, location, status: "existing", detail: "Target tag found" };
  return { format, location, status: "pending", detail: location ? "Ready to append target tag" : "Ready to add XMP" };
}
