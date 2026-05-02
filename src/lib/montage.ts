import type { RollEntry } from "./roll";

const W = 1080;
const H = 1920;
const DURATION_MS = 15_000;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  label: string,
  when: Date,
) {
  ctx.fillStyle = "#faf6ef";
  ctx.fillRect(0, 0, W, H);

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;

  const scale = Math.min(W / iw, H / ih);
  const dw = Math.floor(iw * scale);
  const dh = Math.floor(ih * scale);
  const dx = Math.floor((W - dw) / 2);
  const dy = Math.floor((H - dh) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);

  const ts = when.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    month: "short",
    day: "numeric",
  });

  ctx.font = "28px ui-monospace, monospace";
  ctx.fillStyle = "rgba(11, 59, 140, 0.12)";
  const lines = [ts, label].filter(Boolean);
  const pad = 20;
  const lineH = 34;
  const boxH = lines.length * lineH + pad * 2;
  const boxY = H - boxH - 32;
  ctx.fillRect(24, boxY, W - 48, boxH);
  ctx.fillStyle = "#0b3b8c";
  lines.forEach((line, i) => {
    ctx.fillText(line, 40, boxY + pad + 26 + i * lineH);
  });
}

export async function buildMontageBlob(entries: RollEntry[]): Promise<Blob> {
  if (entries.length === 0) throw new Error("Nothing on your roll yet.");

  const mime = pickMime();
  if (!mime) throw new Error("Recording not supported in this browser.");

  const images = await Promise.all(entries.map((e) => loadImage(e.imageDataUrl)));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (ev) => {
    if (ev.data.size) chunks.push(ev.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    rec.onerror = () => reject(new Error("Recorder error"));
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      resolve(blob);
    };
  });

  const sliceMs = Math.max(280, DURATION_MS / entries.length);

  rec.start(100);
  const start = performance.now();

  const tick = () => {
    const elapsed = performance.now() - start;
    const idx = Math.min(
      entries.length - 1,
      Math.floor(elapsed / sliceMs),
    );
    drawFrame(ctx, images[idx], entries[idx].label, new Date(entries[idx].capturedAt));
    if (elapsed >= DURATION_MS) {
      if (rec.state === "recording") {
        rec.requestData();
        rec.stop();
      }
      return;
    }
    requestAnimationFrame(tick);
  };
  tick();

  return done;
}
