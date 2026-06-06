import type { Folder, RoutePlan, RoutePoint, TreePayload } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getTree: () => request<TreePayload>("/api/tree"),
  createFolder: (payload: { name: string; parentId?: string | null }) =>
    request<Folder>("/api/folders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateFolder: (id: string, payload: { name?: string; parentId?: string | null }) =>
    request<Folder>(`/api/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteFolder: (id: string) => request<void>(`/api/folders/${id}`, { method: "DELETE" }),
  setFolderVisibility: (id: string, isVisible: boolean) =>
    request<{ folderIds: string[]; isVisible: boolean }>(`/api/folders/${id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ isVisible })
    }),
  createRoute: (payload: { name: string; folderId?: string | null; color?: string }) =>
    request<RoutePlan>("/api/routes", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateRoute: (
    id: string,
    payload: Partial<Pick<RoutePlan, "name" | "folderId" | "description" | "color" | "mapLng" | "mapLat" | "mapZoom" | "sortOrder">>
  ) =>
    request<RoutePlan>(`/api/routes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  reorderRoutes: (payload: { folderId: string | null; routeIds: string[] }) =>
    request<RoutePlan[]>("/api/routes/reorder", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  setRouteVisibility: (id: string, isVisible: boolean) =>
    request<RoutePlan>(`/api/routes/${id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ isVisible })
    }),
  copyRoute: (id: string) => request<RoutePlan>(`/api/routes/${id}/copy`, { method: "POST" }),
  deleteRoute: (id: string) => request<void>(`/api/routes/${id}`, { method: "DELETE" }),
  saveRoutePoints: (id: string, points: RoutePoint[]) =>
    request<RoutePlan>(`/api/routes/${id}/points`, {
      method: "PUT",
      body: JSON.stringify({
        points: points.map((point) => ({
          lng: point.lng,
          lat: point.lat
        }))
      })
    })
};
