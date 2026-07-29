const API_BASE_URLS = ["http://192.168.0.105:43101", "http://127.0.0.1:43101", "http://localhost:43101"];
const TOKEN_STORAGE_KEY = "citywalk_session_token";

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
  return API_BASE_URLS.reduce(
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
    })
};

module.exports = { api, getToken, setToken };
