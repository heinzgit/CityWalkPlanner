const DEFAULT_SERVER_IP = "192.168.0.102";
const SERVER_IP_STORAGE_KEY = "citywalk_server_ip";
const TOKEN_STORAGE_KEY = "citywalk_session_token";

function isValidServerIp(value) {
  const parts = String(value || "").trim().split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

function getServerIp() {
  try {
    const stored = wx.getStorageSync(SERVER_IP_STORAGE_KEY);
    return isValidServerIp(stored) ? String(stored).trim() : DEFAULT_SERVER_IP;
  } catch (error) {
    console.warn("[api] read server IP failed", error);
    return DEFAULT_SERVER_IP;
  }
}

function setServerIp(value) {
  const serverIp = String(value || "").trim();
  if (!isValidServerIp(serverIp)) throw new Error("Invalid server IP address");
  wx.setStorageSync(SERVER_IP_STORAGE_KEY, serverIp);
  return serverIp;
}

function getApiBaseUrls() {
  return [...new Set([
    `http://${getServerIp()}:43101`,
    "http://127.0.0.1:43101",
    "http://localhost:43101"
  ])];
}

function getToken() {
  return wx.getStorageSync(TOKEN_STORAGE_KEY) || "";
}

function setToken(token) {
  if (token) {
    wx.setStorageSync(TOKEN_STORAGE_KEY, token);
  } else {
    wx.removeStorageSync(TOKEN_STORAGE_KEY);
  }
}

function requestWithBaseUrl(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const token = getToken();

  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url,
      header: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.header || {})
      },
      timeout: 8000,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }

        console.error("[api] request failed", url, response.statusCode, response.data);
        reject(new Error(`Request failed: ${response.statusCode}`));
      },
      fail(error) {
        console.error("[api] request timeout or network error", url, error);
        reject(error);
      }
    });
  });
}

function request(path, options = {}) {
  return getApiBaseUrls().reduce(
    (promise, baseUrl) => promise.catch(() => requestWithBaseUrl(baseUrl, path, options)),
    Promise.reject()
  );
}

const api = {
  useMiniProgramDefaultUser: () =>
    request("/api/auth/miniprogram/default-user", {
      method: "POST"
    }).then((result) => {
      setToken(result.token);
      return result;
    }),
  getTree: () => request("/api/tree"),
  createRouteFromWalk: (payload) =>
    request("/api/routes/from-walk", {
      method: "POST",
      data: payload
    }),
  updateRoute: (id, payload) =>
    request(`/api/routes/${id}`, {
      method: "PATCH",
      data: payload
    })
};

module.exports = {
  DEFAULT_SERVER_IP,
  api,
  getServerIp,
  getToken,
  isValidServerIp,
  setServerIp,
  setToken
};
