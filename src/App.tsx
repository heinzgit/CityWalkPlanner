import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Download,
  Folder,
  FolderPlus,
  LogOut,
  PanelLeftClose,
  PanelRightClose,
  LocateFixed,
  Minus,
  Plus,
  Satellite,
  Upload,
  Route,
  Save,
  Trash2
} from "lucide-react";
import { api } from "./api";
import { loadBaiduMap } from "./baiduMap";
import { createFolderKmz, createRouteKmz, parseKmzFile } from "./kmz";
import type { ImportedKmzFolder } from "./kmz";
import { buildTree, findRoute, getNextVisibility } from "./tree";
import type { RoutePlan, RoutePoint, TreeNode, User, VisibilityState } from "./types";

const defaultCenter = { lng: 121.4737, lat: 31.2304 };
const colorChoices = [
  "#1677ff",
  "#2f54eb",
  "#722ed1",
  "#eb2f96",
  "#d9363e",
  "#fa541c",
  "#fa8c16",
  "#d4b106",
  "#ffff00",
  "#7cb305",
  "#19a974",
  "#00ffff",
  "#08979c",
  "#2f4858",
  "#5d6876",
  "#8c6d31",
  "#111827"
];
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const currentPointIcon =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="#f6c343" stroke="#8a5a00" stroke-width="2"/></svg>'
  );
const editPointIcon =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="#f04444" stroke="#ffffff" stroke-width="2"/></svg>'
  );
type RouteMode = "view" | "edit";
type MapTypeMode = "normal" | "satellite";

type OverlayBundle = {
  polyline: BMapGL.Polyline;
  markers: BMapGL.Marker[];
};

type RouteDropTarget =
  | { type: "folder"; folderId: string | null }
  | { type: "route"; folderId: string | null; routeId: string; position: "before" | "after" }
  | { type: "folder-order"; parentId: string; folderId: string; position: "before" | "after" };

type AuthMode = "login" | "register";
type TreeContextMenu = { node: TreeNode; x: number; y: number };

function visibilityIcon(state: VisibilityState) {
  if (state === "visible") return <Eye size={16} />;
  if (state === "hidden") return <EyeOff size={16} />;
  return <Minus size={16} />;
}

function AuthScreen({
  mode,
  authError,
  isSubmitting,
  onModeChange,
  onSubmit
}: {
  mode: AuthMode;
  authError: string | null;
  isSubmitting: boolean;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (payload: { username: string; password: string; displayName?: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="auth-screen">
      <form
        className="auth-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            username,
            password,
            displayName: mode === "register" ? displayName || username : undefined
          });
        }}
      >
        <div className="auth-heading">
          <h1>CityWalk Planner</h1>
          <p>{mode === "login" ? "登录后查看你的路线空间" : "创建账号后开始规划路线"}</p>
        </div>
        <label className="auth-field">
          <span>账号</span>
          <input
            value={username}
            autoComplete="username"
            pattern="[a-zA-Z0-9_.-]{3,80}"
            placeholder="heinz"
            required
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        {mode === "register" ? (
          <label className="auth-field">
            <span>显示名称</span>
            <input
              value={displayName}
              autoComplete="name"
              maxLength={120}
              placeholder="我的 CityWalk"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        ) : null}
        <label className="auth-field">
          <span>密码</span>
          <input
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            maxLength={128}
            type="password"
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {authError ? <div className="auth-error">{authError}</div> : null}
        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "处理中" : mode === "login" ? "登录" : "注册"}
        </button>
        <button className="auth-switch" type="button" onClick={() => onModeChange(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "没有账号，去注册" : "已有账号，去登录"}
        </button>
      </form>
    </main>
  );
}

function routeDistance(points: RoutePoint[]) {
  if (points.length < 2) return 0;
  const earthRadius = 6371000;
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    const dLat = ((next.lat - prev.lat) * Math.PI) / 180;
    const dLng = ((next.lng - prev.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((prev.lat * Math.PI) / 180) * Math.cos((next.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    total += earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return total;
}

function formatDistance(points: RoutePoint[]) {
  const meters = routeDistance(points);
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function isLngLat(point: Pick<RoutePoint, "lng" | "lat">) {
  return point.lng >= -180 && point.lng <= 180 && point.lat >= -90 && point.lat <= 90;
}

function getInputColor(color: string) {
  return colorPattern.test(color) ? color : "#1677ff";
}

function createDirectionTexture(color: string) {
  const arrowColor = getInputColor(color);
  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="64" viewBox="0 0 16 64">
        <path d="M8 2v46" fill="none" stroke="${arrowColor}" stroke-width="5" stroke-linecap="round"/>
        <path d="M2 47l6 14 6-14z" fill="${arrowColor}"/>
      </svg>`
    )
  );
}

function TreeView({
  nodes,
  selectedRouteId,
  onSelectRoute,
  onToggleVisibility,
  onCreateFolder,
  onCreateRoute,
  onExportFolderKmz,
  onRenameFolder,
  onDeleteFolder,
  onDeleteRoute,
  expandedFolderIds,
  onToggleFolderExpanded,
  draggedRouteId,
  draggedFolderId,
  draggedFolderParentId,
  dropTarget,
  onRouteDragStart,
  onFolderDragStart,
  onRouteDragEnd,
  onRouteDropTarget,
  onRouteDrop,
  onFolderDrop,
  onFolderReorder,
  onOpenContextMenu,
  level = 0
}: {
  nodes: TreeNode[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  onToggleVisibility: (node: TreeNode) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateRoute: (folderId: string | null) => void;
  onExportFolderKmz: (folderId: string) => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteRoute: (routeId: string) => void;
  expandedFolderIds: Set<string>;
  onToggleFolderExpanded: (folderId: string) => void;
  draggedRouteId: string | null;
  draggedFolderId: string | null;
  draggedFolderParentId: string | null;
  dropTarget: RouteDropTarget | null;
  onRouteDragStart: (routeId: string) => void;
  onFolderDragStart: (folderId: string, parentId: string | null) => void;
  onRouteDragEnd: () => void;
  onRouteDropTarget: (target: RouteDropTarget | null) => void;
  onRouteDrop: (routeId: string, target: RouteDropTarget) => void;
  onFolderDrop: (folderId: string, targetFolderId: string) => void;
  onFolderReorder: (folderId: string, target: Extract<RouteDropTarget, { type: "folder-order" }>) => void;
  onOpenContextMenu: (node: TreeNode, x: number, y: number) => void;
  level?: number;
}) {
  const isTopLevelFolder = level === 0;

  return (
    <div className="tree-list">
      {nodes.map((node) => (
        <div key={`${node.type}-${node.id}`}>
          <div
            className={`tree-row ${node.type === "route" && node.id === selectedRouteId ? "selected" : ""} ${
              (node.type === "route" && draggedRouteId === node.id) || (node.type === "folder" && draggedFolderId === node.id)
                ? "dragging"
                : ""
            } ${
              node.type === "folder" && dropTarget?.type === "folder" && dropTarget.folderId === node.id ? "drop-inside" : ""
            } ${
              ((node.type === "route" && dropTarget?.type === "route" && dropTarget.routeId === node.id) ||
                (node.type === "folder" && dropTarget?.type === "folder-order" && dropTarget.folderId === node.id))
                ? `drop-${dropTarget.position}`
                : ""
            }`}
            style={{ paddingLeft: 10 + level * 18 }}
            draggable={node.type === "route" || (node.type === "folder" && level <= 1)}
            onDragStart={(event) => {
              if (node.type === "folder") {
                if (level > 1) return;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-citywalk-folder", node.id);
                onFolderDragStart(node.id, node.parentId);
                return;
              }
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", node.id);
              onRouteDragStart(node.id);
            }}
            onDragEnd={onRouteDragEnd}
            onDragOver={(event) => {
              if (!draggedRouteId && !draggedFolderId) return;
              if (node.type === "route") {
                if (!draggedRouteId || node.id === draggedRouteId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                onRouteDropTarget({
                  type: "route",
                  folderId: node.folderId,
                  routeId: node.id,
                  position: event.clientY < rect.top + rect.height / 2 ? "before" : "after"
                });
                return;
              }

              if (draggedFolderId) {
                if (node.id === draggedFolderId) return;
                if (isTopLevelFolder && draggedFolderParentId === null) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  onRouteDropTarget({ type: "folder", folderId: node.id });
                  return;
                }
                if (!isTopLevelFolder && node.parentId === draggedFolderParentId && node.parentId) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const rect = event.currentTarget.getBoundingClientRect();
                  onRouteDropTarget({
                    type: "folder-order",
                    parentId: node.parentId,
                    folderId: node.id,
                    position: event.clientY < rect.top + rect.height / 2 ? "before" : "after"
                  });
                }
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              onRouteDropTarget({ type: "folder", folderId: node.id });
            }}
            onDrop={(event) => {
              if (!dropTarget || (dropTarget.type !== "folder" && dropTarget.type !== "folder-order" && !draggedRouteId)) return;
              event.preventDefault();
              const folderId = event.dataTransfer.getData("application/x-citywalk-folder") || draggedFolderId;
              if (folderId && dropTarget.type === "folder" && dropTarget.folderId) {
                onFolderDrop(folderId, dropTarget.folderId);
                return;
              }
              if (folderId && dropTarget.type === "folder-order") {
                onFolderReorder(folderId, dropTarget);
                return;
              }
              const routeId = event.dataTransfer.getData("text/plain") || draggedRouteId;
              if (routeId) onRouteDrop(routeId, dropTarget);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              onOpenContextMenu(node, event.clientX, event.clientY);
            }}
          >
            {node.type === "folder" ? (
              <button
                className="icon-button disclosure"
                type="button"
                title={expandedFolderIds.has(node.id) ? "折叠文件夹" : "展开文件夹"}
                onClick={() => onToggleFolderExpanded(node.id)}
              >
                {expandedFolderIds.has(node.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <span className="tree-spacer" />
            )}
            <button
              className={`icon-button visibility ${node.visibilityState}`}
              type="button"
              title="切换显示"
              onClick={() => onToggleVisibility(node)}
            >
              {visibilityIcon(node.visibilityState)}
            </button>
            <button
              className="node-main"
              type="button"
              onClick={() => {
                if (node.type === "route") onSelectRoute(node.id);
              }}
            >
              {node.type === "folder" ? <Folder size={16} /> : <Route size={16} />}
              <span>{node.name}</span>
            </button>
          </div>
          {node.type === "folder" && expandedFolderIds.has(node.id) && node.children.length > 0 ? (
            <TreeView
              nodes={node.children}
              selectedRouteId={selectedRouteId}
              onSelectRoute={onSelectRoute}
              onToggleVisibility={onToggleVisibility}
              onCreateFolder={onCreateFolder}
              onCreateRoute={onCreateRoute}
              onExportFolderKmz={onExportFolderKmz}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onDeleteRoute={onDeleteRoute}
              expandedFolderIds={expandedFolderIds}
              onToggleFolderExpanded={onToggleFolderExpanded}
              draggedRouteId={draggedRouteId}
              draggedFolderId={draggedFolderId}
              draggedFolderParentId={draggedFolderParentId}
              dropTarget={dropTarget}
              onRouteDragStart={onRouteDragStart}
              onFolderDragStart={onFolderDragStart}
              onRouteDragEnd={onRouteDragEnd}
              onRouteDropTarget={onRouteDropTarget}
              onRouteDrop={onRouteDrop}
              onFolderDrop={onFolderDrop}
              onFolderReorder={onFolderReorder}
              onOpenContextMenu={onOpenContextMenu}
              level={level + 1}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authStatus, setAuthStatus] = useState<"checking" | "ready">("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [folders, setFolders] = useState<Awaited<ReturnType<typeof api.getTree>>["folders"]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);
  const [mapStatus, setMapStatus] = useState("正在加载地图");
  const [isMapReady, setIsMapReady] = useState(false);
  const [dataStatus, setDataStatus] = useState("正在加载路线");
  const [routeMode, setRouteMode] = useState<RouteMode>("view");
  const [mapTypeMode, setMapTypeMode] = useState<MapTypeMode>(() => {
    const stored = window.localStorage.getItem("citywalk-map-type");
    return stored === "satellite" ? "satellite" : "normal";
  });
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [draggedRouteId, setDraggedRouteId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [draggedFolderParentId, setDraggedFolderParentId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<RouteDropTarget | null>(null);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenu | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorDraft, setColorDraft] = useState("");
  const [showRouteDirectionArrows, setShowRouteDirectionArrows] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<BMapGL.Map | null>(null);
  const overlaysRef = useRef<Map<string, OverlayBundle>>(new Map());
  const clickHandlerRef = useRef<((event: BMapGL.MapMouseEvent) => void) | null>(null);
  const skipNextMapClickRef = useRef(false);
  const routesRef = useRef<RoutePlan[]>([]);
  const kmzInputRef = useRef<HTMLInputElement | null>(null);

  const selectedRoute = useMemo(() => findRoute(routes, selectedRouteId), [routes, selectedRouteId]);
  const treeNodes = useMemo(() => buildTree(folders, routes), [folders, routes]);

  const clearWorkspace = useCallback(() => {
    setRoutes([]);
    setFolders([]);
    setSelectedRouteId(null);
    setExpandedFolderIds(new Set());
    setRouteMode("view");
    setSelectedPointIndex(null);
    setDataStatus("请先登录");
    setIsMapReady(false);
    setMapStatus("正在加载地图");
    mapRef.current = null;
    overlaysRef.current.clear();
  }, []);

  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

  useEffect(() => {
    window.localStorage.setItem("citywalk-map-type", mapTypeMode);
  }, [mapTypeMode]);

  useEffect(() => {
    setColorDraft(selectedRoute?.color ?? "");
  }, [selectedRoute?.id, selectedRoute?.color]);

  useEffect(() => {
    if (!treeContextMenu) return;
    const closeMenu = () => setTreeContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [treeContextMenu]);

  useEffect(() => {
    if (!selectedRoute || selectedPointIndex === null) return;
    if (selectedPointIndex >= selectedRoute.points.length) {
      setSelectedPointIndex(selectedRoute.points.length > 0 ? selectedRoute.points.length - 1 : null);
    }
  }, [selectedRoute, selectedPointIndex]);

  const updateRoutePoint = useCallback((routeId: string, pointIndex: number, patch: Partial<RoutePoint>) => {
    setRoutes((currentRoutes) =>
      currentRoutes.map((route) =>
        route.id === routeId
          ? {
              ...route,
              points: route.points.map((point, index) => (index === pointIndex ? { ...point, ...patch } : point))
            }
          : route
      )
    );
  }, []);

  const refreshTree = useCallback(async () => {
    const payload = await api.getTree();
    setFolders(payload.folders);
    setRoutes(payload.routes);
    setSelectedRouteId((current) => current ?? payload.routes[0]?.id ?? null);
    setDataStatus(payload.routes.length ? "已加载路线" : "还没有路线");
  }, []);

  const toggleFolderExpanded = useCallback((folderId: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const reorderRoute = useCallback(
    async (draggedId: string, target: RouteDropTarget) => {
      const draggedRoute = routesRef.current.find((route) => route.id === draggedId);
      if (!draggedRoute) return;

      const targetFolderId = target.type === "folder" ? target.folderId : target.folderId;
      const siblings = routesRef.current
        .filter((route) => route.folderId === targetFolderId && route.id !== draggedId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));

      let insertIndex = siblings.length;
      if (target.type === "route") {
        const targetIndex = siblings.findIndex((route) => route.id === target.routeId);
        if (targetIndex >= 0) {
          insertIndex = target.position === "before" ? targetIndex : targetIndex + 1;
        }
      }

      const nextSiblings = [...siblings];
      nextSiblings.splice(insertIndex, 0, { ...draggedRoute, folderId: targetFolderId });
      const nextIds = nextSiblings.map((route) => route.id);

      setRoutes((currentRoutes) =>
        currentRoutes.map((route) => {
          const nextIndex = nextIds.indexOf(route.id);
          if (nextIndex < 0) return route;
          return { ...route, folderId: targetFolderId, sortOrder: nextIndex };
        })
      );
      setDropTarget(null);
      setDraggedRouteId(null);
      await api.reorderRoutes({ folderId: targetFolderId, routeIds: nextIds });
      await refreshTree();
    },
    [refreshTree]
  );

  const moveFolderToSecondLevel = useCallback(
    async (folderId: string, parentId: string) => {
      if (folderId === parentId) return;
      setDropTarget(null);
      setDraggedFolderId(null);
      setDraggedFolderParentId(null);
      await api.updateFolder(folderId, { parentId });
      await refreshTree();
      setExpandedFolderIds((current) => new Set([...current, parentId]));
    },
    [refreshTree]
  );

  const reorderFolder = useCallback(
    async (draggedId: string, target: Extract<RouteDropTarget, { type: "folder-order" }>) => {
      const siblings = folders
        .filter((folder) => folder.parentId === target.parentId && folder.id !== draggedId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
      const targetIndex = siblings.findIndex((folder) => folder.id === target.folderId);
      if (targetIndex < 0) return;

      siblings.splice(target.position === "before" ? targetIndex : targetIndex + 1, 0, {
        ...folders.find((folder) => folder.id === draggedId)!,
        parentId: target.parentId
      });
      const folderIds = siblings.map((folder) => folder.id);
      setFolders((currentFolders) =>
        currentFolders.map((folder) => {
          const sortOrder = folderIds.indexOf(folder.id);
          return sortOrder < 0 ? folder : { ...folder, sortOrder };
        })
      );
      setDropTarget(null);
      setDraggedFolderId(null);
      setDraggedFolderParentId(null);
      await api.reorderFolders({ parentId: target.parentId, folderIds });
      await refreshTree();
    },
    [folders, refreshTree]
  );

  const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(Math.min(520, Math.max(260, startWidth + moveEvent.clientX - startX)));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [sidebarWidth]);

  useEffect(() => {
    api
      .me()
      .then((payload) => {
        setCurrentUser(payload.user);
      })
      .catch(() => {
        clearWorkspace();
      })
      .finally(() => {
        setAuthStatus("ready");
      });
  }, [clearWorkspace]);

  useEffect(() => {
    if (!currentUser) return;
    refreshTree().catch((caught) => {
      setError(caught instanceof Error ? caught.message : "加载路线失败");
      setDataStatus("加载失败");
    });
  }, [currentUser, refreshTree]);

  useEffect(() => {
    if (!currentUser || authStatus !== "ready") return;
    if (mapRef.current) return;

    const ak = import.meta.env.VITE_BAIDU_MAP_AK as string | undefined;

    if (!ak || ak === "your-baidu-map-ak") {
      setMapStatus("请在 .env 中配置 VITE_BAIDU_MAP_AK");
      return;
    }

    let disposed = false;

    loadBaiduMap(ak)
      .then((BMap) => {
        if (disposed || !mapContainerRef.current) return;
        const map = new BMap.Map(mapContainerRef.current);
        map.centerAndZoom(new BMap.Point(defaultCenter.lng, defaultCenter.lat), 13);
        map.enableScrollWheelZoom(true);
        map.setMapType(mapTypeMode === "satellite" ? BMap.BMAP_SATELLITE_MAP : BMap.BMAP_NORMAL_MAP);
        mapRef.current = map;
        setMapStatus("地图已加载");
        setIsMapReady(true);
      })
      .catch((caught) => {
        setMapStatus("地图加载失败");
        setIsMapReady(false);
        setError(caught instanceof Error ? caught.message : "地图加载失败");
      });

    return () => {
      disposed = true;
    };
  }, [authStatus, currentUser, mapTypeMode]);

  useEffect(() => {
    const map = mapRef.current;
    const BMap = window.BMapGL;
    if (!isMapReady || !map || !BMap) return;
    map.setMapType(mapTypeMode === "satellite" ? BMap.BMAP_SATELLITE_MAP : BMap.BMAP_NORMAL_MAP);
  }, [isMapReady, mapTypeMode]);

  useEffect(() => {
    const map = mapRef.current;
    const BMap = window.BMapGL;
    if (!isMapReady || !map || !BMap) return;

    overlaysRef.current.forEach((bundle, routeId) => {
      const route = routes.find((item) => item.id === routeId);
      if (!route || !route.isVisible) {
        map.removeOverlay(bundle.polyline);
        bundle.markers.forEach((marker) => map.removeOverlay(marker));
        overlaysRef.current.delete(routeId);
      }
    });

    routes
      .filter((route) => route.isVisible && route.points.length > 0)
      .forEach((route) => {
        const existing = overlaysRef.current.get(route.id);
        if (existing) {
          map.removeOverlay(existing.polyline);
          existing.markers.forEach((marker) => map.removeOverlay(marker));
        }

        const points = route.points.map((point) => new BMap.Point(point.lng, point.lat));
        const shouldShowDirectionArrows = showRouteDirectionArrows && route.id === selectedRouteId && points.length > 1;
        const polyline = new BMap.Polyline(points, {
          strokeColor: route.id === selectedRouteId ? route.color : route.color,
          strokeWeight: route.id === selectedRouteId ? 7 : 5,
          strokeOpacity: route.id === selectedRouteId ? 0.95 : 0.72,
          ...(shouldShowDirectionArrows
            ? {
                strokeTexture: {
                  url: createDirectionTexture(route.color),
                  width: 16,
                  height: 64
                }
              }
            : {})
        });
        polyline.addEventListener("click", () => {
          if (skipNextMapClickRef.current) return;
          if (routeMode === "edit" && route.id !== selectedRouteId) return;
          skipNextMapClickRef.current = true;
          window.setTimeout(() => {
            skipNextMapClickRef.current = false;
          }, 0);
          setSelectedRouteId(route.id);
          setSelectedPointIndex(null);
          if (route.id !== selectedRouteId) {
            setRouteMode("view");
          }
        });
        const canEditMarkers = route.id === selectedRouteId && routeMode === "edit";
        const pointIcon = new BMap.Icon(editPointIcon, new BMap.Size(14, 14), {
          anchor: new BMap.Size(7, 7),
          imageSize: new BMap.Size(14, 14)
        });
        const yellowIcon = new BMap.Icon(currentPointIcon, new BMap.Size(18, 18), {
          anchor: new BMap.Size(9, 9),
          imageSize: new BMap.Size(18, 18)
        });
        const markers = canEditMarkers ? points.map((point, index) => {
          const isCurrentPoint = canEditMarkers && index === selectedPointIndex;
          const marker = new BMap.Marker(point, { enableDragging: isCurrentPoint, icon: isCurrentPoint ? yellowIcon : pointIcon });
          if (isCurrentPoint) {
            marker.setIcon(yellowIcon);
          }
          if (canEditMarkers) {
            marker.addEventListener("click", () => {
              skipNextMapClickRef.current = true;
              window.setTimeout(() => {
                skipNextMapClickRef.current = false;
              }, 0);
              setSelectedPointIndex(index);
            });
            marker.addEventListener("rightclick", () => {
              skipNextMapClickRef.current = true;
              window.setTimeout(() => {
                skipNextMapClickRef.current = false;
              }, 0);
              setSelectedPointIndex((current) => {
                if (current === null) return null;
                if (current === index) return null;
                return current > index ? current - 1 : current;
              });
              setRoutes((currentRoutes) =>
                currentRoutes.map((currentRoute) =>
                  currentRoute.id === route.id
                    ? { ...currentRoute, points: currentRoute.points.filter((_routePoint, pointIndex) => pointIndex !== index) }
                    : currentRoute
                )
              );
            });
          }
          if (isCurrentPoint) {
            marker.enableDragging();
            marker.addEventListener("dragend", (event) => {
              const nextPoint = marker.getPosition() ?? event.target?.getPosition() ?? event.point;
              if (!nextPoint || !isLngLat(nextPoint)) return;
              updateRoutePoint(route.id, index, { lng: nextPoint.lng, lat: nextPoint.lat });
            });
          }
          return marker;
        }) : [];
        map.addOverlay(polyline);
        markers.forEach((marker) => map.addOverlay(marker));
        overlaysRef.current.set(route.id, { polyline, markers });
      });
  }, [routes, selectedRouteId, routeMode, selectedPointIndex, isMapReady, updateRoutePoint, showRouteDirectionArrows]);

  useEffect(() => {
    const map = mapRef.current;
    const BMap = window.BMapGL;
    if (!isMapReady || !map || !BMap) return;
    if (clickHandlerRef.current) {
      map.removeEventListener("click", clickHandlerRef.current);
      clickHandlerRef.current = null;
    }
    if (routeMode !== "edit") return;

    const handler = (event: BMapGL.MapMouseEvent) => {
      if (skipNextMapClickRef.current) {
        skipNextMapClickRef.current = false;
        return;
      }
      const point = event.latlng ?? event.point;
      if (!point || !selectedRouteId) return;
      setRoutes((currentRoutes) =>
        currentRoutes.map((route) =>
          route.id === selectedRouteId
            ? (() => {
                const nextPoint = {
                  lng: point.lng,
                  lat: point.lat
                };
                const insertIndex =
                  selectedPointIndex === null ? route.points.length : Math.min(selectedPointIndex + 1, route.points.length);
                const nextPoints = [...route.points];
                nextPoints.splice(insertIndex, 0, nextPoint);
                setSelectedPointIndex(insertIndex);
                return { ...route, points: nextPoints };
              })()
            : route
        )
      );
    };

    clickHandlerRef.current = handler;
    map.addEventListener("click", handler);
  }, [selectedRouteId, routeMode, selectedPointIndex, isMapReady]);

  const focusSelectedRoute = useCallback(() => {
    const map = mapRef.current;
    const BMap = window.BMapGL;
    if (!map || !BMap || !selectedRoute?.points.length) return;
    map.setViewport(selectedRoute.points.map((point) => new BMap.Point(point.lng, point.lat)));
  }, [selectedRoute]);

  const createFolder = async (parentId: string | null) => {
    const name = window.prompt(parentId ? "二级目录名称" : "一级目录名称", parentId ? "新的二级目录" : "新的一级目录");
    if (!name) return;
    const folder = await api.createFolder({ name, parentId });
    await refreshTree();
    setExpandedFolderIds((current) => new Set([...current, folder.id, ...(parentId ? [parentId] : [])]));
  };

  const createRoute = async (folderId: string | null) => {
    const name = window.prompt("路线名称", "新的 CityWalk");
    if (!name) return;
    const route = await api.createRoute({ name, folderId, color: colorChoices[routes.length % colorChoices.length] });
    await refreshTree();
    if (folderId) {
      setExpandedFolderIds((current) => new Set([...current, folderId]));
    }
    setSelectedRouteId(route.id);
    setSelectedPointIndex(null);
    setRouteMode("edit");
  };

  const deleteFolder = async (folderId: string) => {
    if (!window.confirm("删除该文件夹及其所有子内容？")) return;
    await api.deleteFolder(folderId);
    await refreshTree();
  };

  const renameFolder = async (folderId: string, currentName: string) => {
    const name = window.prompt("文件夹名称", currentName)?.trim();
    if (!name || name === currentName) return;
    try {
      await api.updateFolder(folderId, { name });
      await refreshTree();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重命名文件夹失败");
    }
  };

  const deleteRoute = async (routeId: string) => {
    if (!window.confirm("删除该路线？")) return;
    await api.deleteRoute(routeId);
    if (selectedRouteId === routeId) setSelectedRouteId(null);
    if (selectedRouteId === routeId) setRouteMode("view");
    await refreshTree();
  };

  const toggleVisibility = async (node: TreeNode) => {
    const nextVisible = getNextVisibility(node.visibilityState);
    if (node.type === "folder") {
      await api.setFolderVisibility(node.id, nextVisible);
    } else {
      await api.setRouteVisibility(node.id, nextVisible);
    }
    await refreshTree();
  };

  const patchSelectedRoute = async (patch: Partial<RoutePlan>) => {
    if (!selectedRoute) return;
    setRoutes((currentRoutes) => currentRoutes.map((route) => (route.id === selectedRoute.id ? { ...route, ...patch } : route)));
  };

  const saveSelectedRoute = async () => {
    if (!selectedRouteId) return;
    const routeToSave = findRoute(routesRef.current, selectedRouteId);
    if (!routeToSave) return;

    setIsSaving(true);
    try {
      const map = mapRef.current;
      const center = map?.getCenter();
      const zoom = map?.getZoom();

      const updated = await api.updateRoute(routeToSave.id, {
        name: routeToSave.name,
        description: routeToSave.description,
        color: routeToSave.color,
        mapLng: center?.lng ?? routeToSave.mapLng,
        mapLat: center?.lat ?? routeToSave.mapLat,
        mapZoom: zoom ?? routeToSave.mapZoom
      });
      const withPoints = await api.saveRoutePoints(updated.id, routeToSave.points);
      setRoutes((currentRoutes) => currentRoutes.map((route) => (route.id === withPoints.id ? withPoints : route)));
      setDataStatus("已保存");
      setRouteMode("view");
      setSelectedPointIndex(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const copySelectedRoute = async () => {
    if (!selectedRoute) return;
    const copy = await api.copyRoute(selectedRoute.id);
    await refreshTree();
    setSelectedRouteId(copy.id);
    setSelectedPointIndex(null);
    setRouteMode("edit");
  };

  const exportRouteKmz = (route: RoutePlan) => {
    const { blob, fileName } = createRouteKmz(route);
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  };

  const exportSelectedRouteKmz = () => {
    if (selectedRoute) exportRouteKmz(selectedRoute);
  };

  const exportFolderKmz = (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    const { blob, fileName } = createFolderKmz(folder, folders, routes);
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  };

  const importKmz = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImporting(true);
    setError(null);
    try {
      const importedFolders = await parseKmzFile(file);
      const expandedIds: string[] = [];
      let lastRouteId: string | null = null;
      let routeCount = 0;
      const importFolder = async (folder: ImportedKmzFolder, parentId: string | null, level: number): Promise<void> => {
        if (level > 1) throw new Error("当前仅支持导入两级文件夹结构");
        const createdFolder = await api.createFolder({ name: folder.name, parentId });
        expandedIds.push(createdFolder.id);
        for (const route of folder.routes) {
          const createdRoute = await api.createRouteFromWalk({
            name: route.name,
            description: route.description,
            folderId: createdFolder.id,
            color: route.color,
            points: route.points
          });
          lastRouteId = createdRoute.id;
          routeCount += 1;
        }
        for (const child of folder.children) await importFolder(child, createdFolder.id, level + 1);
      };

      for (const folder of importedFolders) await importFolder(folder, null, 0);
      if (routeCount === 0) throw new Error("KMZ 中没有至少包含两个坐标点的路线");
      await refreshTree();
      setExpandedFolderIds((current) => new Set([...current, ...expandedIds]));
      setSelectedRouteId(lastRouteId);
      setDataStatus(`已导入 ${routeCount} 条路线`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "KMZ 导入失败");
    } finally {
      setIsImporting(false);
    }
  };

  const submitAuth = async (payload: { username: string; password: string; displayName?: string }) => {
    setIsAuthSubmitting(true);
    setAuthError(null);
    try {
      const result = authMode === "login" ? await api.login(payload) : await api.register(payload);
      setCurrentUser(result.user);
      setError(null);
      setDataStatus("正在加载路线");
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : "认证失败");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (caught) {
      console.warn(caught);
    } finally {
      setCurrentUser(null);
      clearWorkspace();
    }
  };

  if (authStatus === "checking") {
    return (
      <main className="auth-screen">
        <div className="auth-panel compact">
          <div className="auth-heading">
            <h1>CityWalk Planner</h1>
            <p>正在检查登录状态</p>
          </div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        mode={authMode}
        authError={authError}
        isSubmitting={isAuthSubmitting}
        onModeChange={(nextMode) => {
          setAuthMode(nextMode);
          setAuthError(null);
        }}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <main
      className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""} ${
        isDetailsCollapsed ? "details-collapsed" : ""
      }`}
      style={{ "--sidebar-width": `${isSidebarCollapsed ? 0 : sidebarWidth}px` } as CSSProperties}
    >
      <aside className="sidebar" aria-hidden={isSidebarCollapsed}>
        <header className="panel-header">
          <div>
            <h1>CityWalk Planner</h1>
            <p>
              {currentUser.displayName || currentUser.username} · {dataStatus}
            </p>
          </div>
          <div className="header-actions">
            <input ref={kmzInputRef} className="file-input" type="file" accept=".kmz,application/vnd.google-earth.kmz" onChange={importKmz} />
            <button className="icon-button primary" type="button" title="导入 KMZ" disabled={isImporting} onClick={() => kmzInputRef.current?.click()}>
              <Upload size={17} />
            </button>
            <button className="icon-button" type="button" title="退出登录" onClick={logout}>
              <LogOut size={17} />
            </button>
            <button className="icon-button" type="button" title="隐藏左边栏" onClick={() => setIsSidebarCollapsed(true)}>
              <PanelLeftClose size={17} />
            </button>
            <button className="icon-button primary" type="button" title="新建一级目录" onClick={() => createFolder(null)}>
              <FolderPlus size={17} />
            </button>
            <button className="icon-button primary" type="button" title="新建路线" onClick={() => createRoute(null)}>
              <Plus size={17} />
            </button>
          </div>
        </header>
        <TreeView
          nodes={treeNodes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={(routeId) => {
            setSelectedRouteId(routeId);
            setSelectedPointIndex(null);
            setRouteMode("view");
          }}
          onToggleVisibility={toggleVisibility}
          onCreateFolder={createFolder}
          onCreateRoute={createRoute}
          onExportFolderKmz={exportFolderKmz}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onDeleteRoute={deleteRoute}
          expandedFolderIds={expandedFolderIds}
          onToggleFolderExpanded={toggleFolderExpanded}
          draggedRouteId={draggedRouteId}
          draggedFolderId={draggedFolderId}
          draggedFolderParentId={draggedFolderParentId}
          dropTarget={dropTarget}
          onRouteDragStart={setDraggedRouteId}
          onFolderDragStart={(folderId, parentId) => {
            setDraggedFolderId(folderId);
            setDraggedFolderParentId(parentId);
          }}
          onRouteDragEnd={() => {
            setDraggedRouteId(null);
            setDraggedFolderId(null);
            setDraggedFolderParentId(null);
            setDropTarget(null);
          }}
          onRouteDropTarget={setDropTarget}
          onRouteDrop={(routeId, target) => {
            reorderRoute(routeId, target).catch((caught) => {
              setError(caught instanceof Error ? caught.message : "移动路线失败");
              refreshTree();
            });
          }}
          onFolderDrop={(folderId, parentId) => {
            moveFolderToSecondLevel(folderId, parentId).catch((caught) => {
              setError(caught instanceof Error ? caught.message : "移动目录失败");
              refreshTree();
            });
          }}
          onFolderReorder={(folderId, target) => {
            reorderFolder(folderId, target).catch((caught) => {
              setError(caught instanceof Error ? caught.message : "排序目录失败");
              refreshTree();
            });
          }}
          onOpenContextMenu={(node, x, y) => setTreeContextMenu({ node, x, y })}
        />
        {treeContextMenu ? (
          <div
            className="tree-context-menu"
            style={{ left: treeContextMenu.x, top: treeContextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            {treeContextMenu.node.type === "folder" ? (
              <>
                <button type="button" onClick={() => { setTreeContextMenu(null); exportFolderKmz(treeContextMenu.node.id); }}>
                  <Download size={15} /> 导出 KMZ
                </button>
                <button type="button" onClick={() => { setTreeContextMenu(null); renameFolder(treeContextMenu.node.id, treeContextMenu.node.name); }}>
                  <Edit3 size={15} /> 重命名文件夹
                </button>
                {treeContextMenu.node.parentId === null ? (
                  <button type="button" onClick={() => { setTreeContextMenu(null); createFolder(treeContextMenu.node.id); }}>
                    <FolderPlus size={15} /> 新建二级目录
                  </button>
                ) : null}
                <button type="button" onClick={() => { setTreeContextMenu(null); createRoute(treeContextMenu.node.id); }}>
                  <Plus size={15} /> 新建路线
                </button>
                <button className="danger" type="button" onClick={() => { setTreeContextMenu(null); deleteFolder(treeContextMenu.node.id); }}>
                  <Trash2 size={15} /> 删除文件夹
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setTreeContextMenu(null); exportRouteKmz(treeContextMenu.node as RoutePlan); }}>
                  <Download size={15} /> 导出 KMZ
                </button>
                <button className="danger" type="button" onClick={() => { setTreeContextMenu(null); deleteRoute(treeContextMenu.node.id); }}>
                  <Trash2 size={15} /> 删除路线
                </button>
              </>
            )}
          </div>
        ) : null}
      </aside>
      {!isSidebarCollapsed ? <div className="sidebar-resizer" role="separator" onPointerDown={startSidebarResize} /> : null}

      <section className="map-stage">
        <div ref={mapContainerRef} className="map-canvas" />
        {isSidebarCollapsed ? (
          <button
            className="panel-tab panel-tab-left"
            type="button"
            title="显示路线列表"
            onClick={() => setIsSidebarCollapsed(false)}
          >
            路线列表
          </button>
        ) : null}
        {isDetailsCollapsed ? (
          <button
            className="panel-tab panel-tab-right"
            type="button"
            title="显示路线详情"
            onClick={() => setIsDetailsCollapsed(false)}
          >
            路线详情
          </button>
        ) : null}
        <div className="map-toolbar">
          <span>{mapStatus}</span>
          <button type="button" onClick={focusSelectedRoute}>
            <LocateFixed size={16} />
            聚焦路线
          </button>
          <button
            type="button"
            className={mapTypeMode === "satellite" ? "active" : ""}
            onClick={() => setMapTypeMode((current) => (current === "normal" ? "satellite" : "normal"))}
            title={mapTypeMode === "satellite" ? "切换到普通地图" : "切换到卫星地图"}
          >
            <Satellite size={16} />
            {mapTypeMode === "satellite" ? "卫星图" : "普通图"}
          </button>
          <span className={`mode-pill ${routeMode}`}>{routeMode === "edit" ? "编辑中" : "显示模式"}</span>
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
      </section>

      <aside className="details" aria-hidden={isDetailsCollapsed}>
        {selectedRoute ? (
          <>
            <header className="panel-header">
              <div>
                <h2>路线详情</h2>
                <p>
                  {routeMode === "edit" ? "编辑状态 · " : "显示状态 · "}
                  {selectedRoute.points.length} 个点 · {formatDistance(selectedRoute.points)}
                </p>
              </div>
              <div className="detail-actions">
                <button className="icon-button" type="button" title="隐藏右边栏" onClick={() => setIsDetailsCollapsed(true)}>
                  <PanelRightClose size={16} />
                </button>
                <button className="icon-button" type="button" title="复制路线" onClick={copySelectedRoute}>
                  <Copy size={16} />
                </button>
                <button className="icon-button" type="button" title="导出 KMZ" onClick={exportSelectedRouteKmz}>
                  KMZ
                </button>
              </div>
            </header>
            <label className="field">
              <span>名称</span>
              <input
                value={selectedRoute.name}
                disabled={routeMode !== "edit"}
                onChange={(event) => patchSelectedRoute({ name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>描述</span>
              <textarea
                value={selectedRoute.description ?? ""}
                disabled={routeMode !== "edit"}
                onChange={(event) => patchSelectedRoute({ description: event.target.value })}
                rows={4}
              />
            </label>
            <div className="field">
              <span>颜色</span>
              <div className="swatches">
                {colorChoices.map((color) => (
                  <button
                    className={selectedRoute.color === color ? "swatch active" : "swatch"}
                    key={color}
                    type="button"
                    title={color}
                    style={{ background: color }}
                    disabled={routeMode !== "edit"}
                    onClick={() => patchSelectedRoute({ color })}
                  />
                ))}
              </div>
              <div className="color-picker-row">
                <input
                  aria-label="自定义路线颜色"
                  className="color-picker"
                  type="color"
                  value={getInputColor(selectedRoute.color)}
                  disabled={routeMode !== "edit"}
                  onChange={(event) => {
                    setColorDraft(event.target.value.toUpperCase());
                    patchSelectedRoute({ color: event.target.value });
                  }}
                />
                <input
                  aria-label="路线颜色代码"
                  className="color-code"
                  value={colorDraft}
                  disabled={routeMode !== "edit"}
                  maxLength={7}
                  onChange={(event) => {
                    const nextColor = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
                    setColorDraft(nextColor.toUpperCase());
                    if (colorPattern.test(nextColor)) {
                      patchSelectedRoute({ color: nextColor });
                    }
                  }}
                  onBlur={(event) => {
                    if (!colorPattern.test(event.target.value)) {
                      setColorDraft(getInputColor(selectedRoute.color).toUpperCase());
                    }
                  }}
                />
              </div>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={showRouteDirectionArrows}
                onChange={(event) => setShowRouteDirectionArrows(event.target.checked)}
              />
              <span>显示方向箭头</span>
            </label>
            <div className="route-summary">
              <span>{selectedRoute.points.length}</span>
              <div>
                <strong>路线节点</strong>
                <small>{formatDistance(selectedRoute.points)}</small>
              </div>
            </div>
            {routeMode === "edit" ? (
              <button className="save-button" type="button" onClick={saveSelectedRoute} disabled={isSaving}>
                <Save size={18} />
                {isSaving ? "保存中" : "保存"}
              </button>
            ) : (
              <button className="save-button" type="button" onClick={() => setRouteMode("edit")}>
                <Edit3 size={18} />
                编辑路线
              </button>
            )}
          </>
        ) : (
          <div className="empty-state">
            <button className="icon-button details-empty-toggle" type="button" title="隐藏右边栏" onClick={() => setIsDetailsCollapsed(true)}>
              <PanelRightClose size={16} />
            </button>
            <Route size={28} />
            <h2>选择或创建一条路线</h2>
            <p>显示状态开启的路线会一起绘制在地图上。</p>
          </div>
        )}
      </aside>
    </main>
  );
}
