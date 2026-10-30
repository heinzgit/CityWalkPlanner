import type { RoutePoint } from "./types";

const earthRadiusMeters = 6371000;

/**
 * Simplifies a route with the Ramer-Douglas-Peucker algorithm. The tolerance
 * is measured in metres so the result is independent of longitude/latitude
 * degree scales. Endpoints and any point whose deviation exceeds the
 * tolerance are preserved.
 */
export function simplifyRoutePoints(points: RoutePoint[], toleranceMeters = 10): RoutePoint[] {
  if (points.length <= 2 || toleranceMeters <= 0) return points;

  const latitudeOriginRadians = (points[0].lat * Math.PI) / 180;
  const projected = points.map((point) => ({
    x: (point.lng * Math.PI * earthRadiusMeters * Math.cos(latitudeOriginRadians)) / 180,
    y: (point.lat * Math.PI * earthRadiusMeters) / 180
  }));
  const retained = new Set<number>([0, points.length - 1]);
  const segments: Array<[number, number]> = [[0, points.length - 1]];

  while (segments.length) {
    const [start, end] = segments.pop()!;
    let farthestIndex = -1;
    let farthestDistance = toleranceMeters;

    for (let index = start + 1; index < end; index += 1) {
      const distance = perpendicularDistance(projected[index], projected[start], projected[end]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }

    if (farthestIndex >= 0) {
      retained.add(farthestIndex);
      segments.push([start, farthestIndex], [farthestIndex, end]);
    }
  }

  return points.filter((_point, index) => retained.has(index));
}

function perpendicularDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const segmentLengthSquared = deltaX ** 2 + deltaY ** 2;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / segmentLengthSquared));
  return Math.hypot(point.x - (start.x + projection * deltaX), point.y - (start.y + projection * deltaY));
}
