import type { RoutePlan, TreePayload, WalkPoint } from "../types";

const API_BASE_URL = "https://example.com";

function request<T>(path: string, options: WechatMiniprogram.RequestOption = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${API_BASE_URL}${path}`,
      header: {
        "content-type": "application/json",
        ...(options.header ?? {})
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }

        reject(new Error(`Request failed: ${response.statusCode}`));
      },
      fail: reject
    });
  });
}

export const api = {
  getTree: () => request<TreePayload>("/api/tree"),
  createRouteFromWalk: (payload: { name: string; description?: string | null; points: WalkPoint[] }) =>
    request<RoutePlan>("/api/routes/from-walk", {
      method: "POST",
      data: payload
    })
};
