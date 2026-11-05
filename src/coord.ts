export type Coordinate = {
  lng: number;
  lat: number;
};

const xPi = (Math.PI * 3000.0) / 180.0;

export function bd09ToGcj02(point: Coordinate): Coordinate {
  const x = point.lng - 0.0065;
  const y = point.lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * xPi);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * xPi);
  return { lng: z * Math.cos(theta), lat: z * Math.sin(theta) };
}

export function gcj02ToBd09(point: Coordinate): Coordinate {
  const z = Math.sqrt(point.lng * point.lng + point.lat * point.lat) + 0.00002 * Math.sin(point.lat * xPi);
  const theta = Math.atan2(point.lat, point.lng) + 0.000003 * Math.cos(point.lng * xPi);
  return { lng: z * Math.cos(theta) + 0.0065, lat: z * Math.sin(theta) + 0.006 };
}

function outOfChina(point: Coordinate) {
  return point.lng < 72.004 || point.lng > 137.8347 || point.lat < 0.8293 || point.lat > 55.8271;
}

function transformLat(lng: number, lat: number) {
  let result = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  result += ((20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin((lat / 3.0) * Math.PI)) * 2.0) / 3.0;
  result += ((160.0 * Math.sin((lat / 12.0) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30.0)) * 2.0) / 3.0;
  return result;
}

function transformLng(lng: number, lat: number) {
  let result = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  result += ((20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin((lng / 3.0) * Math.PI)) * 2.0) / 3.0;
  result += ((150.0 * Math.sin((lng / 12.0) * Math.PI) + 300.0 * Math.sin((lng / 30.0) * Math.PI)) * 2.0) / 3.0;
  return result;
}

export function gcj02ToWgs84(point: Coordinate): Coordinate {
  if (outOfChina(point)) return point;

  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  const dLat = transformLat(point.lng - 105.0, point.lat - 35.0);
  const dLng = transformLng(point.lng - 105.0, point.lat - 35.0);
  const radLat = (point.lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const convertedLat = point.lat + ((dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI));
  const convertedLng = point.lng + ((dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI));
  return { lng: point.lng * 2 - convertedLng, lat: point.lat * 2 - convertedLat };
}

export function bd09ToWgs84(point: Coordinate): Coordinate {
  return gcj02ToWgs84(bd09ToGcj02(point));
}

export function wgs84ToGcj02(point: Coordinate): Coordinate {
  if (outOfChina(point)) return point;

  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  const dLat = transformLat(point.lng - 105.0, point.lat - 35.0);
  const dLng = transformLng(point.lng - 105.0, point.lat - 35.0);
  const radLat = (point.lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  return {
    lng: point.lng + ((dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI)),
    lat: point.lat + ((dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI))
  };
}

export function wgs84ToBd09(point: Coordinate): Coordinate {
  return gcj02ToBd09(wgs84ToGcj02(point));
}
