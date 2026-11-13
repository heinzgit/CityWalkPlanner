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

export type TravelMode = "walking" | "vehicle";

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
  completedOn: string | null;
  distanceMeters: number | null;
  travelMode: TravelMode | null;
  createdAt: string;
  updatedAt: string;
  points: RoutePoint[];
};

export type TravelStatsItem = {
  routeId: string;
  name: string;
  completedOn: string;
  distanceMeters: number;
  travelMode: TravelMode;
};

export type TravelStatsPayload = {
  summary: {
    tripCount: number;
    totalDistanceMeters: number;
    walkingDistanceMeters: number;
    vehicleDistanceMeters: number;
  };
  daily: Array<{
    date: string;
    tripCount: number;
    walkingDistanceMeters: number;
    vehicleDistanceMeters: number;
  }>;
  monthly: Array<{
    month: string;
    tripCount: number;
    distanceMeters: number;
  }>;
  items: TravelStatsItem[];
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
