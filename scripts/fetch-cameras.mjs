import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public", "data");
const outFile = join(outDir, "cameras.json");

const res = await fetch("https://webcams.nyctmc.org/api/cameras");
if (!res.ok) throw new Error(`cameras API ${res.status}`);
const raw = await res.json();
const cameras = raw
  .filter((c) => c.isOnline === "true" || c.isOnline === true)
  .map((c) => ({
    id: c.id,
    name: String(c.name || "").trim(),
    latitude: Number(c.latitude),
    longitude: Number(c.longitude),
  }))
  .filter((c) => c.id && Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify(cameras, null, 0), "utf8");
console.log(`Wrote ${cameras.length} cameras to ${outFile}`);
