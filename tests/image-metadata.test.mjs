import assert from "node:assert/strict";
import test from "node:test";

import { inspectImageMetadata } from "../app/image-metadata.ts";

const encoder = new TextEncoder();
const jpegStart = new Uint8Array([0xff, 0xd8]);
const jpegEnd = new Uint8Array([0xff, 0xd9]);
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function join(...parts) {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function jpegWithXmp(xml) {
  const payload = join(encoder.encode("http://ns.adobe.com/xap/1.0/\0"), encoder.encode(xml));
  return join(jpegStart, new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload, jpegEnd);
}

function pngChunk(type, data) {
  const chunk = new Uint8Array(data.length + 12);
  new DataView(chunk.buffer).setUint32(0, data.length);
  chunk.set(encoder.encode(type), 4);
  chunk.set(data, 8);
  return chunk;
}

function pngWithXmp(xml, compressed = false) {
  const xmp = join(encoder.encode("XML:com.adobe.xmp"), new Uint8Array([0, compressed ? 1 : 0, 0, 0, 0]), encoder.encode(xml));
  return join(pngSignature, pngChunk("iTXt", xmp), pngChunk("IEND", new Uint8Array()));
}

const existingTagXmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:subject><rdf:Bag><rdf:li>contains-synthetic-performer</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>';
const missingTagXmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:subject><rdf:Bag><rdf:li>other-tag</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>';

test("classifies JPEG and PNG uploads by the fixed target tag", () => {
  assert.equal(inspectImageMetadata(jpegWithXmp(existingTagXmp)).status, "existing");
  assert.equal(inspectImageMetadata(pngWithXmp(existingTagXmp)).status, "existing");
  assert.equal(inspectImageMetadata(jpegWithXmp(missingTagXmp)).status, "pending");
  assert.equal(inspectImageMetadata(pngWithXmp(missingTagXmp)).status, "pending");
});

test("marks unsupported, compressed, and unreadable metadata unavailable", () => {
  assert.equal(inspectImageMetadata(new Uint8Array([71, 73, 70, 56])).status, "unavailable");
  assert.equal(inspectImageMetadata(pngWithXmp(existingTagXmp, true)).status, "unavailable");
  assert.equal(inspectImageMetadata(jpegWithXmp("not XML")).status, "unavailable");
});
