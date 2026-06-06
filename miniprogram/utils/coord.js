const xPi = (Math.PI * 3000.0) / 180.0;

function bd09ToGcj02(point) {
  const x = point.lng - 0.0065;
  const y = point.lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * xPi);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * xPi);

  return {
    lng: z * Math.cos(theta),
    lat: z * Math.sin(theta)
  };
}

function gcj02ToBd09(point) {
  const z = Math.sqrt(point.lng * point.lng + point.lat * point.lat) + 0.00002 * Math.sin(point.lat * xPi);
  const theta = Math.atan2(point.lat, point.lng) + 0.000003 * Math.cos(point.lng * xPi);

  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006
  };
}

function toMapPoint(point) {
  return {
    longitude: point.lng,
    latitude: point.lat
  };
}

module.exports = { bd09ToGcj02, gcj02ToBd09, toMapPoint };

