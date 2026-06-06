import type { LngLat } from "../types";

const xPi = (Math.PI * 3000.0) / 180.0;

export function bd09ToGcj02(point: LngLat): LngLat {
  const x = point.lng - 0.0065;
  const y = point.lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * xPi);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * xPi);

  return {
    lng: z * Math.cos(theta),
    lat: z * Math.sin(theta)
  };
}

export function gcj02ToBd09(point: LngLat): LngLat {
  const z = Math.sqrt(point.lng * point.lng + point.lat * point.lat) + 0.00002 * Math.sin(point.lat * xPi);
  const theta = Math.atan2(point.lat, point.lng) + 0.000003 * Math.cos(point.lng * xPi);

  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006
  };
}

export function toMapPoint(point: LngLat) {
  return {
    longitude: point.lng,
    latitude: point.lat
  };
}
