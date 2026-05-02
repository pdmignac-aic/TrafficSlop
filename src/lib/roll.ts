export type RollEntry = {
  key: string;
  /** Set when row exists in Supabase `captures` */
  dbId?: string;
  cameraId: string;
  label: string;
  capturedAt: number;
  /** Data URL (offline / demo) or public https URL from Storage */
  imageDataUrl: string;
};

const STORAGE_KEY = "caught_roll_v1";

export function loadRoll(): RollEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RollEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRoll(entries: RollEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function addRollEntry(prev: RollEntry[], entry: RollEntry, max = 200): RollEntry[] {
  const next = [entry, ...prev].slice(0, max);
  saveRoll(next);
  return next;
}

export function replaceRoll(entries: RollEntry[]) {
  saveRoll(entries);
  return entries;
}
