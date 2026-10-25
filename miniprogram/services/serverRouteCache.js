const STORAGE_KEY = "citywalk.serverRoutes.v1";
const CACHE_FILE_NAME = "citywalk-server-routes-v1.json";

function normalizeTreePayload(payload) {
  return {
    folders: Array.isArray(payload?.folders) ? payload.folders : [],
    routes: Array.isArray(payload?.routes) ? payload.routes : [],
    cachedAt: payload?.cachedAt || new Date().toISOString()
  };
}

function getCacheFilePath() {
  if (!wx.env?.USER_DATA_PATH || typeof wx.getFileSystemManager !== "function") return null;
  return `${wx.env.USER_DATA_PATH}/${CACHE_FILE_NAME}`;
}

function readFileCache() {
  const filePath = getCacheFilePath();
  if (!filePath) return null;

  try {
    const content = wx.getFileSystemManager().readFileSync(filePath, "utf8");
    const cached = JSON.parse(content);
    return cached && typeof cached === "object" ? normalizeTreePayload(cached) : null;
  } catch (error) {
    // 首次启动时文件不存在是正常情况；再尝试旧版 storage 缓存。
    return null;
  }
}

function writeFileCache(cache) {
  const filePath = getCacheFilePath();
  if (!filePath) return false;

  try {
    wx.getFileSystemManager().writeFileSync(filePath, JSON.stringify(cache), "utf8");
    return true;
  } catch (error) {
    console.warn("[serverRouteCache] file write failed", error);
    return false;
  }
}

function readServerRouteCache() {
  const fileCache = readFileCache();
  if (fileCache) return fileCache;

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
  const savedToFile = writeFileCache(cache);
  let savedToStorage = false;

  try {
    wx.setStorageSync(STORAGE_KEY, cache);
    savedToStorage = true;
  } catch (error) {
    console.warn("[serverRouteCache] write failed", error);
  }

  if (!savedToFile && !savedToStorage) return null;

  const destinations = [savedToFile && "file", savedToStorage && "storage"].filter(Boolean).join(", ");
  console.info(
    `[serverRouteCache] saved ${cache.routes.length} routes and ${cache.folders.length} folders to ${destinations}`
  );
  return cache;
}

function hasCachedServerRoutes(cache = readServerRouteCache()) {
  return cache.routes.length > 0;
}

module.exports = {
  hasCachedServerRoutes,
  readServerRouteCache,
  writeServerRouteCache
};
