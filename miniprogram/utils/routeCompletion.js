const WALKING_ROUTE_COLOR = "#19a974";
const VEHICLE_ROUTE_COLOR = "#2f54eb";

function currentLocalDate() {
  const now = new Date();
  const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

function completionDateFromRouteName(name, fallbackDate = currentLocalDate()) {
  const dateText = String(name || "").trim().split(/\s+/, 1)[0] || "";
  const currentYear = Number(fallbackDate.slice(0, 4));
  const withYear = dateText.match(/^(\d{4})(?:年|[-./])(\d{1,2})(?:月|[-./])(\d{1,2})(?:日|号)?$/);
  const withoutYear = dateText.match(/^(\d{1,2})(?:月|[-./])(\d{1,2})(?:日|号)?$/);
  const compactWithYear = dateText.match(/^(\d{4})(\d{2})(\d{2})$/);
  const compactWithoutYear = dateText.match(/^(\d{2})(\d{2})$/);

  const parts = withYear
    ? { year: Number(withYear[1]), month: Number(withYear[2]), day: Number(withYear[3]) }
    : withoutYear
      ? { year: currentYear, month: Number(withoutYear[1]), day: Number(withoutYear[2]) }
      : compactWithYear
        ? { year: Number(compactWithYear[1]), month: Number(compactWithYear[2]), day: Number(compactWithYear[3]) }
        : compactWithoutYear
          ? { year: currentYear, month: Number(compactWithoutYear[1]), day: Number(compactWithoutYear[2]) }
          : null;

  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1) return fallbackDate;
  const daysInMonth = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  if (parts.day > daysInMonth) return fallbackDate;

  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function travelModeFromRouteColor(color, fallback = "walking") {
  const normalizedColor = String(color || "").trim().toLowerCase();
  if (normalizedColor === VEHICLE_ROUTE_COLOR) return "vehicle";
  if (normalizedColor === WALKING_ROUTE_COLOR) return "walking";
  return fallback;
}

function routeColorForTravelMode(travelMode) {
  return travelMode === "vehicle" ? VEHICLE_ROUTE_COLOR : WALKING_ROUTE_COLOR;
}

function routeDistanceMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  const earthRadiusMeters = 6371000;
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    const dLat = ((next.lat - previous.lat) * Math.PI) / 180;
    const dLng = ((next.lng - previous.lng) * Math.PI) / 180;
    const previousLat = (previous.lat * Math.PI) / 180;
    const nextLat = (next.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(previousLat) * Math.cos(nextLat) * Math.sin(dLng / 2) ** 2;
    total += earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  return Math.max(1, Math.round(total));
}

module.exports = {
  WALKING_ROUTE_COLOR,
  VEHICLE_ROUTE_COLOR,
  completionDateFromRouteName,
  currentLocalDate,
  routeColorForTravelMode,
  routeDistanceMeters,
  travelModeFromRouteColor
};
