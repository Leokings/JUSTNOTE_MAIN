import type { Note } from "@/lib/notes";

export const NOTE_PACKAGE_SCHEMA = "justnote.package.v1";

export type StoredNoteDocument = {
  title: string;
  subtitle: string;
  content: string;
  tags: string[];
  folder: string;
  updatedAt: number;
};

export type NotePackageAsset = {
  path: string;
  type: string;
  mime: string;
  name?: string;
  data: Uint8Array;
};

type ZipEntry = {
  path: string;
  data: Uint8Array;
};

type NotePackageManifest = {
  schema: typeof NOTE_PACKAGE_SCHEMA;
  kind: "note";
  id: string;
  title: string;
  subtitle: string;
  folder: string;
  tags: string[];
  encrypted: boolean;
  updatedAt: number;
  contentFile: "content.html";
  assets: Array<{
    path: string;
    type: string;
    mime: string;
    name?: string;
    size: number;
  }>;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
const writeUint32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);

const concatBytes = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
};

const makeHeader = (length: number) => {
  const buffer = new ArrayBuffer(length);
  return {
    bytes: new Uint8Array(buffer),
    view: new DataView(buffer),
  };
};

const createZip = (entries: ZipEntry[]) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const fileName = textEncoder.encode(entry.path);
    const checksum = crc32(entry.data);

    const local = makeHeader(30);
    writeUint32(local.view, 0, 0x04034b50);
    writeUint16(local.view, 4, 20);
    writeUint16(local.view, 6, 0x0800);
    writeUint16(local.view, 8, 0);
    writeUint16(local.view, 10, 0);
    writeUint16(local.view, 12, 0);
    writeUint32(local.view, 14, checksum);
    writeUint32(local.view, 18, entry.data.length);
    writeUint32(local.view, 22, entry.data.length);
    writeUint16(local.view, 26, fileName.length);
    writeUint16(local.view, 28, 0);

    localParts.push(local.bytes, fileName, entry.data);

    const central = makeHeader(46);
    writeUint32(central.view, 0, 0x02014b50);
    writeUint16(central.view, 4, 20);
    writeUint16(central.view, 6, 20);
    writeUint16(central.view, 8, 0x0800);
    writeUint16(central.view, 10, 0);
    writeUint16(central.view, 12, 0);
    writeUint16(central.view, 14, 0);
    writeUint32(central.view, 16, checksum);
    writeUint32(central.view, 20, entry.data.length);
    writeUint32(central.view, 24, entry.data.length);
    writeUint16(central.view, 28, fileName.length);
    writeUint16(central.view, 30, 0);
    writeUint16(central.view, 32, 0);
    writeUint16(central.view, 34, 0);
    writeUint16(central.view, 36, 0);
    writeUint32(central.view, 38, 0);
    writeUint32(central.view, 42, offset);

    centralParts.push(central.bytes, fileName);
    offset += local.bytes.length + fileName.length + entry.data.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const end = makeHeader(22);
  writeUint32(end.view, 0, 0x06054b50);
  writeUint16(end.view, 4, 0);
  writeUint16(end.view, 6, 0);
  writeUint16(end.view, 8, entries.length);
  writeUint16(end.view, 10, entries.length);
  writeUint32(end.view, 12, centralDirectory.length);
  writeUint32(end.view, 16, offset);
  writeUint16(end.view, 20, 0);

  return concatBytes([...localParts, centralDirectory, end.bytes]);
};

const readZip = (bytes: Uint8Array) => {
  if (bytes.length < 22) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;

  for (let i = bytes.length - 22; i >= minOffset; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endOffset = i;
      break;
    }
  }

  if (endOffset < 0) return null;

  const entryCount = view.getUint16(endOffset + 10, true);
  let centralOffset = view.getUint32(endOffset + 16, true);
  const entries = new Map<string, Uint8Array>();

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) return null;

    const compression = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const nameStart = centralOffset + 46;
    const path = textDecoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));

    if (compression !== 0 || view.getUint32(localOffset, true) !== 0x04034b50) return null;

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(path, bytes.slice(dataStart, dataStart + compressedSize));

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

export const createNotePackage = (note: Note, content: string, updatedAt: number, assets: NotePackageAsset[] = []) => {
  const manifest: NotePackageManifest = {
    schema: NOTE_PACKAGE_SCHEMA,
    kind: "note",
    id: note.id,
    title: note.title || "Untitled",
    subtitle: note.subtitle || "",
    folder: note.folder,
    tags: note.tags,
    encrypted: note.encrypted,
    updatedAt,
    contentFile: "content.html",
    assets: assets.map((asset) => ({
      path: asset.path,
      type: asset.type,
      mime: asset.mime,
      name: asset.name,
      size: asset.data.length,
    })),
  };

  return createZip([
    {
      path: "manifest.json",
      data: textEncoder.encode(JSON.stringify(manifest, null, 2)),
    },
    {
      path: "content.html",
      data: textEncoder.encode(content),
    },
    ...assets.map((asset) => ({
      path: asset.path,
      data: asset.data,
    })),
  ]);
};

export const readNotePackage = (bytes: Uint8Array): StoredNoteDocument | null => {
  const entries = readZip(bytes);
  if (!entries) return null;

  const manifestBytes = entries.get("manifest.json");
  const contentBytes = entries.get("content.html");
  if (!manifestBytes || !contentBytes) return null;

  try {
    const manifest = JSON.parse(textDecoder.decode(manifestBytes)) as Partial<NotePackageManifest>;
    if (manifest.schema !== NOTE_PACKAGE_SCHEMA || manifest.kind !== "note") return null;

    const doc = new DOMParser().parseFromString(textDecoder.decode(contentBytes), "text/html");
    manifest.assets?.forEach((asset) => {
      if (!asset || typeof asset.path !== "string") return;
      const assetBytes = entries.get(asset.path);
      if (!assetBytes) return;

      const url = URL.createObjectURL(new Blob([assetBytes], { type: asset.mime || "application/octet-stream" }));
      doc.querySelectorAll<HTMLElement>("img, video, audio").forEach((el) => {
        const assetPath = el.getAttribute("data-justnote-asset") || el.getAttribute("src");
        if (assetPath !== asset.path) return;
        el.setAttribute("src", url);
        el.setAttribute("data-justnote-asset", asset.path);
        el.setAttribute("data-justnote-mime", asset.mime || "");
      });
    });

    return {
      title: typeof manifest.title === "string" && manifest.title.trim() ? manifest.title : "Untitled",
      subtitle: typeof manifest.subtitle === "string" ? manifest.subtitle : "",
      content: doc.body.innerHTML,
      tags: Array.isArray(manifest.tags) ? manifest.tags.filter((tag): tag is string => typeof tag === "string") : [],
      folder: typeof manifest.folder === "string" && manifest.folder.trim() ? manifest.folder : "Personal",
      updatedAt: typeof manifest.updatedAt === "number" ? manifest.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
};
