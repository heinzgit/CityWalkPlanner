const minDistanceMeters = 5;

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function shouldAppendTrackPoint(points, nextPoint) {
  const previous = points[points.length - 1];
  if (!previous) return true;
  if (nextPoint.accuracy !== undefined && nextPoint.accuracy > 80) return false;

  return distanceMeters(previous, nextPoint) >= minDistanceMeters;
}

module.exports = { distanceMeters, shouldAppendTrackPoint };

