const API_BASE_URL = "http://192.168.71.191:43101";
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

function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
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

const api = {
  me: () => request("/api/auth/me"),
  login: (payload) =>
    request("/api/auth/login", {
      method: "POST",
      data: payload
    }).then((result) => {
      setToken(result.token);
      return result;
    }),
  register: (payload) =>
    request("/api/auth/register", {
      method: "POST",
      data: payload
    }).then((result) => {
      setToken(result.token);
      return result;
    }),
  logout: () =>
    request("/api/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .then(() => {
        setToken("");
      }),
  getTree: () => request("/api/tree"),
  createRouteFromWalk: (payload) =>
    request("/api/routes/from-walk", {
      method: "POST",
      data: payload
    })
};

module.exports = { api, getToken, setToken };
