export type LngLat = {
  lng: number;
  lat: number;
};

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  isVisible: boolean;
  sortOrder: number;
};

export type RoutePlan = {
  id: string;
  folderId: string | null;
  name: string;
  description: string | null;
  color: string;
  isVisible: boolean;
  sortOrder: number;
  points: LngLat[];
};

export type TreePayload = {
  folders: Folder[];
  routes: RoutePlan[];
};

export type WalkPoint = LngLat & {
  accuracy?: number;
  speed?: number;
  capturedAt: string;
};
