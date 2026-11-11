import { degrees, PDFDocument, rgb } from "pdf-lib";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type Rotation = 0 | 90 | 180 | 270;

export type Sheet = {
  id: string;
  sourceId: string;
  kind: "pdf" | "image";
  fileName: string;
  /** Zero-based page inside a PDF. Pictures are always 0. */
  pageIndex: number;
  rotation: Rotation;
  thumbUrl: string;
};

type ImageRecord = {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
};

const pdfStore = new Map<string, Uint8Array>();
const imageStore = new Map<string, ImageRecord>();
const liveThumbs = new Set<string>();

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const IMAGE_MAX_EDGE = 2400;
const PAGE_LONG_EDGE = 792;

let pdfjsReady: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs() {
  if (!pdfjsReady) {
    pdfjsReady = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    });
  }
  return pdfjsReady;
}

export function turn(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

function explain(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name: string }).name);
    if (name === "PasswordException") {
      return "that PDF is password-protected. Remove the password and try again";
    }
    if (name === "InvalidPDFException") {
      return "that file isn't a readable PDF";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "could not read that file";
}

function kindOf(file: File): "pdf" | "image" | "skip" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".svg") || type === "image/svg+xml") return "skip";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/.test(name)) {
    return "image";
  }
  return "skip";
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("could not draw that page"))),
      type,
      quality,
    );
  });
}

async function thumbFromCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await canvasBlob(canvas, "image/jpeg", 0.82);
  const url = URL.createObjectURL(blob);
  liveThumbs.add(url);
  return url;
}

async function readPdf(
  file: File,
  onSheet: (sheet: Sheet) => void,
  onStatus: (message: string) => void,
) {
  const pdfjs = await loadPdfjs();
  const sourceId = crypto.randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The worker takes ownership of the buffer it is given, so hand it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  pdfStore.set(sourceId, bytes);

  try {
    for (let i = 1; i <= pdf.numPages; i += 1) {
      onStatus(`Reading ${file.name} · page ${i} of ${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(480 / base.width, 640 / base.height);
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(1.5, window.devicePixelRatio || 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      await page.render({
        canvas,
        viewport,
        transform: [outputScale, 0, 0, outputScale, 0, 0],
        background: "#ffffff",
      }).promise;
      const thumbUrl = await thumbFromCanvas(canvas);
      onSheet({
        id: crypto.randomUUID(),
        sourceId,
        kind: "pdf",
        fileName: file.name,
        pageIndex: i - 1,
        rotation: 0,
        thumbUrl,
      });
      page.cleanup();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    await pdf.cleanup();
    await pdf.loadingTask.destroy();
  }
}

async function readImage(file: File, onSheet: (sheet: Sheet) => void) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("could not read that picture");
  }
  const keepAlpha = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
  const mime: ImageRecord["mime"] = keepAlpha ? "image/png" : "image/jpeg";
  if (!keepAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await canvasBlob(canvas, mime, 0.92);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sourceId = crypto.randomUUID();
  imageStore.set(sourceId, { bytes, mime });
  const thumbUrl = URL.createObjectURL(blob);
  liveThumbs.add(thumbUrl);
  onSheet({
    id: crypto.randomUUID(),
    sourceId,
    kind: "image",
    fileName: file.name,
    pageIndex: 0,
    rotation: 0,
    thumbUrl,
  });
}

export async function readFiles(
  files: File[],
  hooks: {
    onSheet: (sheet: Sheet) => void;
    onStatus: (message: string) => void;
  },
): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name} is over 100 MB`);
      continue;
    }
    const kind = kindOf(file);
    if (kind === "skip") {
      errors.push(
        file.name.toLowerCase().endsWith(".svg")
          ? `${file.name}: export a PNG instead of SVG`
          : `${file.name}: use a PDF or a picture`,
      );
      continue;
    }
    try {
      if (kind === "pdf") await readPdf(file, hooks.onSheet, hooks.onStatus);
      else await readImage(file, hooks.onSheet);
    } catch (err) {
      errors.push(`${file.name}: ${explain(err)}`);
    }
  }
  return errors;
}

/** Drop bytes and thumbnail URLs nothing in `lists` still points at. */
export function retain(lists: Sheet[][]) {
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const list of lists) {
    for (const sheet of list) {
      ids.add(sheet.sourceId);
      urls.add(sheet.thumbUrl);
    }
  }
  for (const id of pdfStore.keys()) {
    if (!ids.has(id)) pdfStore.delete(id);
  }
  for (const id of imageStore.keys()) {
    if (!ids.has(id)) imageStore.delete(id);
  }
  for (const url of liveThumbs) {
    if (!urls.has(url)) {
      URL.revokeObjectURL(url);
      liveThumbs.delete(url);
    }
  }
}

async function rotatedImage(record: ImageRecord, rotation: Rotation): Promise<ImageRecord> {
  if (rotation === 0) return record;
  const bitmap = await createImageBitmap(new Blob([record.bytes.slice()], { type: record.mime }));
  const swap = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("could not rotate a picture");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  const blob = await canvasBlob(canvas, "image/jpeg", 0.92);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg" };
}

export async function buildPdf(sheets: Sheet[], title: string): Promise<Uint8Array> {
  if (sheets.length === 0) throw new Error("Add at least one page first");
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setCreator("Sheaf");
  out.setProducer("Sheaf");

  const loaded = new Map<string, PDFDocument>();

  for (const sheet of sheets) {
    if (sheet.kind === "pdf") {
      const bytes = pdfStore.get(sheet.sourceId);
      if (!bytes) throw new Error(`Missing source for ${sheet.fileName}`);
      let src = loaded.get(sheet.sourceId);
      if (!src) {
        src = await PDFDocument.load(bytes.slice());
        loaded.set(sheet.sourceId, src);
      }
      const [copied] = await out.copyPages(src, [sheet.pageIndex]);
      const angle = ((copied.getRotation().angle || 0) + sheet.rotation) % 360;
      copied.setRotation(degrees(angle));
      out.addPage(copied);
      continue;
    }

    const record = imageStore.get(sheet.sourceId);
    if (!record) throw new Error(`Missing picture ${sheet.fileName}`);
    const baked = await rotatedImage(record, sheet.rotation);
    const image =
      baked.mime === "image/png" ? await out.embedPng(baked.bytes) : await out.embedJpg(baked.bytes);
    const fit = PAGE_LONG_EDGE / Math.max(image.width, image.height);
    const width = image.width * fit;
    const height = image.height * fit;
    const page = out.addPage([width, height]);
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  return out.save();
}

export function savePdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
