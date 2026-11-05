import type { Folder, RoutePlan } from "./types";
import { bd09ToWgs84, wgs84ToBd09 } from "./coord";

export type ImportedKmzRoute = {
  name: string;
  description: string | null;
  color: string;
  points: { lng: number; lat: number }[];
};

export type ImportedKmzFolder = {
  name: string;
  routes: ImportedKmzRoute[];
  children: ImportedKmzFolder[];
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeFileName(value: string) {
  const safe = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return safe || "route";
}

function toKmlColor(color: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(color) ? color.slice(1) : "1677ff";
  const rr = normalized.slice(0, 2);
  const gg = normalized.slice(2, 4);
  const bb = normalized.slice(4, 6);
  return `ff${bb}${gg}${rr}`;
}

function buildRoutePlacemark(route: RoutePlan, styleId: string) {
  const coordinates = route.points
    .map((point) => {
      const converted = bd09ToWgs84(point);
      return `${converted.lng},${converted.lat},0`;
    })
    .join(" ");
  const safeName = escapeXml(route.name);
  const safeDescription = route.description ? escapeXml(route.description) : "";
  return `    <Placemark>
      <name>${safeName}</name>
      ${safeDescription ? `<description>${safeDescription}</description>` : ""}
      <styleUrl>#${styleId}</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordinates}</coordinates>
      </LineString>
    </Placemark>`;
}

function buildKml(route: RoutePlan) {
  const safeName = escapeXml(route.name);
  const safeDescription = route.description ? escapeXml(route.description) : "";
  const styleId = "route-0";

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${safeName}</name>
    ${safeDescription ? `<description>${safeDescription}</description>` : ""}
    <Style id="${styleId}">
      <LineStyle>
        <color>${toKmlColor(route.color)}</color>
        <width>2.0</width>
      </LineStyle>
    </Style>
${buildRoutePlacemark(route, styleId)}
  </Document>
</kml>
`;
}

function buildFolderKml(rootFolder: Folder, folders: Folder[], routes: RoutePlan[]) {
  const folderChildren = new Map<string, Folder[]>();
  folders.forEach((folder) => {
    if (!folder.parentId) return;
    const children = folderChildren.get(folder.parentId) ?? [];
    children.push(folder);
    folderChildren.set(folder.parentId, children);
  });

  const routesByFolder = new Map<string, RoutePlan[]>();
  routes.forEach((route) => {
    if (!route.folderId) return;
    const siblings = routesByFolder.get(route.folderId) ?? [];
    siblings.push(route);
    routesByFolder.set(route.folderId, siblings);
  });

  const sortByOrder = <T extends { sortOrder: number; name: string }>(items: T[]) =>
    [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
  const exportedRoutes: RoutePlan[] = [];
  const collectRoutes = (folder: Folder) => {
    sortByOrder(routesByFolder.get(folder.id) ?? []).forEach((route) => exportedRoutes.push(route));
    sortByOrder(folderChildren.get(folder.id) ?? []).forEach(collectRoutes);
  };
  collectRoutes(rootFolder);

  const styleIds = new Map(exportedRoutes.map((route, index) => [route.id, `route-${index}`]));
  const renderFolder = (folder: Folder, indent: string): string => {
    const folderRoutes = sortByOrder(routesByFolder.get(folder.id) ?? []);
    const childFolders = sortByOrder(folderChildren.get(folder.id) ?? []);
    const routeMarkup = folderRoutes
      .map((route) => `${indent}  ${buildRoutePlacemark(route, styleIds.get(route.id)! ).trimStart()}`)
      .join("\n");
    const childMarkup = childFolders.map((child) => renderFolder(child, `${indent}  `)).join("\n");
    const contents = [routeMarkup, childMarkup].filter(Boolean).join("\n");
    return `${indent}<Folder>
${indent}  <name>${escapeXml(folder.name)}</name>${contents ? `\n${contents}` : ""}
${indent}</Folder>`;
  };

  const styles = exportedRoutes
    .map(
      (route) => `    <Style id="${styleIds.get(route.id)}">
      <LineStyle>
        <color>${toKmlColor(route.color)}</color>
        <width>2.0</width>
      </LineStyle>
    </Style>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(rootFolder.name)}</name>
${styles ? `${styles}\n` : ""}${renderFolder(rootFolder, "    ")}
  </Document>
</kml>
`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32LE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function buildZip(entries: { name: string; data: Uint8Array }[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  entries.forEach((entry) => {
    const nameBytes = encodeUtf8(entry.name);
    const crc = crc32(entry.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32LE(localView, 0, 0x04034b50);
    writeUint16LE(localView, 4, 20);
    writeUint16LE(localView, 6, 0x0800);
    writeUint16LE(localView, 8, 0);
    writeUint16LE(localView, 10, 0);
    writeUint16LE(localView, 12, 0);
    writeUint32LE(localView, 14, crc);
    writeUint32LE(localView, 18, entry.data.length);
    writeUint32LE(localView, 22, entry.data.length);
    writeUint16LE(localView, 26, nameBytes.length);
    writeUint16LE(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32LE(centralView, 0, 0x02014b50);
    writeUint16LE(centralView, 4, 20);
    writeUint16LE(centralView, 6, 20);
    writeUint16LE(centralView, 8, 0x0800);
    writeUint16LE(centralView, 10, 0);
    writeUint16LE(centralView, 12, 0);
    writeUint16LE(centralView, 14, 0);
    writeUint32LE(centralView, 16, crc);
    writeUint32LE(centralView, 20, entry.data.length);
    writeUint32LE(centralView, 24, entry.data.length);
    writeUint16LE(centralView, 28, nameBytes.length);
    writeUint16LE(centralView, 30, 0);
    writeUint16LE(centralView, 32, 0);
    writeUint16LE(centralView, 34, 0);
    writeUint16LE(centralView, 36, 0);
    writeUint32LE(centralView, 38, 0);
    writeUint32LE(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    localOffset += localHeader.length + entry.data.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const localSize = localParts.reduce((total, part) => total + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32LE(endView, 0, 0x06054b50);
  writeUint16LE(endView, 4, 0);
  writeUint16LE(endView, 6, 0);
  writeUint16LE(endView, 8, entries.length);
  writeUint16LE(endView, 10, entries.length);
  writeUint32LE(endView, 12, centralSize);
  writeUint32LE(endView, 16, localSize);
  writeUint16LE(endView, 20, 0);

  return new Blob([...localParts, ...centralParts, endRecord].map(toArrayBuffer), {
    type: "application/vnd.google-earth.kmz"
  });
}

export function createRouteKmz(route: RoutePlan) {
  const kml = buildKml(route);
  const zip = buildZip([{ name: "doc.kml", data: encodeUtf8(kml) }]);
  const fileName = `${sanitizeFileName(route.name)}.kmz`;
  return { blob: zip, fileName };
}

export function createFolderKmz(rootFolder: Folder, folders: Folder[], routes: RoutePlan[]) {
  const kml = buildFolderKml(rootFolder, folders, routes);
  const zip = buildZip([{ name: "doc.kml", data: encodeUtf8(kml) }]);
  const fileName = `${sanitizeFileName(rootFolder.name)}.kmz`;
  return { blob: zip, fileName };
}

function childElements(element: Element, name: string) {
  return Array.from(element.children).filter((child) => child.localName === name);
}

function childText(element: Element, name: string) {
  return childElements(element, name)[0]?.textContent?.trim() ?? "";
}

function kmlColorToHex(value: string) {
  const normalized = value.trim().replace(/^#/, "");
  if (/^[\da-f]{8}$/i.test(normalized)) {
    return `#${normalized.slice(6, 8)}${normalized.slice(4, 6)}${normalized.slice(2, 4)}`.toUpperCase();
  }
  if (/^[\da-f]{6}$/i.test(normalized)) return `#${normalized}`.toUpperCase();
  return "#1677FF";
}

function parseCoordinates(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((coordinate) => coordinate.split(","))
    .map(([rawLng, rawLat]) => ({ lng: Number(rawLng), lat: Number(rawLat) }))
    .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat) && point.lng >= -180 && point.lng <= 180 && point.lat >= -90 && point.lat <= 90)
    .map((point) => wgs84ToBd09(point));
}

function parseKml(kml: string, fallbackName: string): ImportedKmzFolder[] {
  const document = new DOMParser().parseFromString(kml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("KMZ 中的 KML 文件格式无效");

  const kmlRoot = document.documentElement;
  if (kmlRoot.localName !== "kml") throw new Error("KMZ 中未找到 KML 内容");
  const kmlDocument = childElements(kmlRoot, "Document")[0] ?? kmlRoot;
  const styles = new Map<string, string>();
  Array.from(kmlDocument.getElementsByTagNameNS("*", "Style")).forEach((style) => {
    const id = style.getAttribute("id");
    const color = style.getElementsByTagNameNS("*", "color")[0]?.textContent;
    if (id && color) styles.set(id, kmlColorToHex(color));
  });

  const parsePlacemark = (placemark: Element): ImportedKmzRoute | null => {
    const lineString = placemark.getElementsByTagNameNS("*", "LineString")[0];
    const coordinates = lineString ? childText(lineString, "coordinates") : "";
    const points = parseCoordinates(coordinates);
    if (points.length < 2) return null;
    const styleId = childText(placemark, "styleUrl").replace(/^#/, "");
    return {
      name: childText(placemark, "name") || "未命名路线",
      description: childText(placemark, "description") || null,
      color: styles.get(styleId) ?? "#1677FF",
      points
    };
  };

  const parseFolder = (folder: Element): ImportedKmzFolder => ({
    name: childText(folder, "name") || "未命名文件夹",
    routes: childElements(folder, "Placemark").map(parsePlacemark).filter((route): route is ImportedKmzRoute => route !== null),
    children: childElements(folder, "Folder").map(parseFolder)
  });

  const folders = childElements(kmlDocument, "Folder").map(parseFolder);
  const rootRoutes = childElements(kmlDocument, "Placemark").map(parsePlacemark).filter((route): route is ImportedKmzRoute => route !== null);
  if (rootRoutes.length > 0) {
    folders.unshift({ name: childText(kmlDocument, "name") || fallbackName, routes: rootRoutes, children: [] });
  }
  if (folders.length === 0) throw new Error("KMZ 中没有可导入的路线");
  return folders;
}

async function extractKml(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (flags & 0x0008) throw new Error("该 KMZ 使用了不受支持的 ZIP 数据描述格式");
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = new TextDecoder("utf-8").decode(bytes.slice(nameStart, nameStart + nameLength));
    if (dataStart + compressedSize > bytes.length) throw new Error("KMZ 压缩包不完整");

    if (name.toLowerCase().endsWith(".kml")) {
      const data = bytes.slice(dataStart, dataStart + compressedSize);
      if (method === 0) return new TextDecoder("utf-8").decode(data);
      if (method === 8 && "DecompressionStream" in window) {
        return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
      }
      throw new Error("该 KMZ 的压缩格式不受支持");
    }
    offset = dataStart + compressedSize;
  }

  throw new Error("KMZ 中未找到 KML 文件");
}

export async function parseKmzFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".kmz")) throw new Error("请选择 .kmz 文件");
  const kml = await extractKml(file);
  return parseKml(kml, sanitizeFileName(file.name.replace(/\.kmz$/i, "")));
}
