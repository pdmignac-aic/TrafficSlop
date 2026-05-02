export type Camera = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export async function fetchCameraList(): Promise<Camera[]> {
  const res = await fetch("/data/cameras.json", { cache: "force-cache" });
  if (!res.ok) throw new Error("Failed to load cameras");
  return (await res.json()) as Camera[];
}

export function imageProxyUrl(cameraId: string) {
  return `/api/camera-image/${cameraId}`;
}
