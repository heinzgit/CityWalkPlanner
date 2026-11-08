const earthRadiusMeters = 6371000;
const defaultTrackOptions = {
  minIntervalMs: 20000,
  minDistanceMeters: 5,
  stationaryDistanceMeters: 8,
  stationarySpeedMetersPerSecond: 0.6,
  maxAccuracyMeters: 80,
  accuracyNoiseRatio: 0.15,
  maxAccuracyDistanceMeters: 12
};

function distanceMeters(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function shouldAppendTrackPoint(points, nextPoint, options = {}) {
  const config = { ...defaultTrackOptions, ...options };

  if (!isValidPoint(nextPoint)) return false;
  if (isFiniteNumber(nextPoint.accuracy) && nextPoint.accuracy > config.maxAccuracyMeters) return false;

  const previous = points[points.length - 1];
  if (!previous) return true;

  const previousTime = Date.parse(previous.capturedAt);
  const nextTime = Date.parse(nextPoint.capturedAt);
  if (Number.isFinite(previousTime) && Number.isFinite(nextTime) && nextTime - previousTime < config.minIntervalMs) {
    return false;
  }

  const accuracy = Math.max(
    isFiniteNumber(previous.accuracy) ? previous.accuracy : 0,
    isFiniteNumber(nextPoint.accuracy) ? nextPoint.accuracy : 0
  );
  let requiredDistance = Math.max(
    config.minDistanceMeters,
    Math.min(config.maxAccuracyDistanceMeters, accuracy * config.accuracyNoiseRatio)
  );

  if (
    isFiniteNumber(nextPoint.speed) &&
    nextPoint.speed >= 0 &&
    nextPoint.speed < config.stationarySpeedMetersPerSecond
  ) {
    requiredDistance = Math.max(requiredDistance, config.stationaryDistanceMeters);
  }

  return distanceMeters(previous, nextPoint) >= requiredDistance;
}

function simplifyTrackPoints(points, options = {}) {
  const maxPoints = Math.max(2, options.maxPoints || 400);
  const toleranceMeters = Math.max(0, options.toleranceMeters || 3);

  if (points.length <= maxPoints) return points.slice();

  const simplified = simplifyWithTolerance(points, toleranceMeters);
  if (simplified.length <= maxPoints) return simplified;
  return sampleEvenly(simplified, maxPoints);
}

function simplifyWithTolerance(points, toleranceMeters) {
  if (points.length <= 2 || toleranceMeters <= 0) return points.slice();

  const latitudeOriginRadians = (points[0].lat * Math.PI) / 180;
  const projected = points.map((point) => ({
    x: (point.lng * Math.PI * earthRadiusMeters * Math.cos(latitudeOriginRadians)) / 180,
    y: (point.lat * Math.PI * earthRadiusMeters) / 180
  }));
  const retained = new Set([0, points.length - 1]);
  const segments = [[0, points.length - 1]];

  while (segments.length > 0) {
    const [start, end] = segments.pop();
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

function perpendicularDistance(point, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const segmentLengthSquared = deltaX ** 2 + deltaY ** 2;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / segmentLengthSquared)
  );
  return Math.hypot(
    point.x - (start.x + projection * deltaX),
    point.y - (start.y + projection * deltaY)
  );
}

function sampleEvenly(points, maxPoints) {
  const sampled = [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let index = 1; index < maxPoints - 1; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }

  sampled.push(points[points.length - 1]);
  return sampled;
}

function isValidPoint(point) {
  return point && isFiniteNumber(point.lng) && isFiniteNumber(point.lat);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

module.exports = { distanceMeters, shouldAppendTrackPoint, simplifyTrackPoints };

