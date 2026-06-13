export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  isVisible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RoutePoint = {
  lng: number;
  lat: number;
};

export type RoutePlan = {
  id: string;
  folderId: string | null;
  name: string;
  description: string | null;
  color: string;
  isVisible: boolean;
  mapLng: number | null;
  mapLat: number | null;
  mapZoom: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  points: RoutePoint[];
};

export type User = {
  id: string;
  username: string;
  displayName: string | null;
};

export type TreePayload = {
  folders: Folder[];
  routes: RoutePlan[];
};

export type AuthPayload = {
  user: User;
  token?: string;
};

export type VisibilityState = "visible" | "hidden" | "mixed";

export type TreeFolderNode = Folder & {
  type: "folder";
  children: TreeNode[];
  visibilityState: VisibilityState;
};

export type TreeRouteNode = RoutePlan & {
  type: "route";
  visibilityState: VisibilityState;
};

export type TreeNode = TreeFolderNode | TreeRouteNode;
