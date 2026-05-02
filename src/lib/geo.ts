const R = 6371000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function nearestCamera<T extends { latitude: number; longitude: number }>(
  lat: number,
  lon: number,
  cameras: T[],
): { cam: T; meters: number } | null {
  let best: { cam: T; meters: number } | null = null;
  for (const cam of cameras) {
    const meters = haversineMeters(lat, lon, cam.latitude, cam.longitude);
    if (!best || meters < best.meters) best = { cam, meters };
  }
  return best;
}
