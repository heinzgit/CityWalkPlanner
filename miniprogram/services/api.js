const API_BASE_URL = "http://192.168.71.191:43101";

function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url,
      header: {
        "content-type": "application/json",
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
  getTree: () => request("/api/tree"),
  createRouteFromWalk: (payload) =>
    request("/api/routes/from-walk", {
      method: "POST",
      data: payload
    })
};

module.exports = { api };

