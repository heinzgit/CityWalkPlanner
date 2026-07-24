const STORAGE_KEY = "citywalk.serverRoutes.v1";

function normalizeTreePayload(payload) {
  return {
    folders: Array.isArray(payload?.folders) ? payload.folders : [],
    routes: Array.isArray(payload?.routes) ? payload.routes : [],
    cachedAt: payload?.cachedAt || new Date().toISOString()
  };
}

function readServerRouteCache() {
  try {
    const cached = wx.getStorageSync(STORAGE_KEY);
    if (!cached || typeof cached !== "object") {
      return normalizeTreePayload(null);
    }

    return normalizeTreePayload(cached);
  } catch (error) {
    console.warn("[serverRouteCache] read failed", error);
    return normalizeTreePayload(null);
  }
}

function writeServerRouteCache(payload) {
  const cache = normalizeTreePayload(payload);
  try {
    wx.setStorageSync(STORAGE_KEY, cache);
  } catch (error) {
    console.warn("[serverRouteCache] write failed", error);
  }
  return cache;
}

function hasCachedServerRoutes(cache = readServerRouteCache()) {
  return cache.routes.length > 0 || cache.folders.length > 0;
}

module.exports = {
  hasCachedServerRoutes,
  readServerRouteCache,
  writeServerRouteCache
};
