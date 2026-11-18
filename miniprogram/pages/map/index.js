const { api, getServerIp, isValidServerIp, setServerIp } = require("../../services/api");
const { deleteLocalWalk, listLocalWalks, saveLocalWalk, updateLocalWalk } = require("../../services/localWalks");
const {
  clearServerRouteCache,
  hasCachedServerRoutes,
  readServerRouteCache,
  writeServerRouteCache
} = require("../../services/serverRouteCache");
const { bd09ToGcj02, gcj02ToBd09, toMapPoint } = require("../../utils/coord");
const {
  WALKING_ROUTE_COLOR,
  completionDateFromRouteName,
  routeColorForTravelMode,
  routeDistanceMeters,
  travelModeFromRouteColor
} = require("../../utils/routeCompletion");
const {
  defaultSamplingIntervalSeconds,
  maxSamplingIntervalSeconds,
  minSamplingIntervalSeconds,
  normalizeSamplingIntervalSeconds,
  shouldAppendTrackPoint,
  simplifyTrackPoints
} = require("../../utils/track");

const shanghai = {
  longitude: 121.4737,
  latitude: 31.2304
};

const localFolderId = "__local_walks__";
const trackRenderIntervalMs = 1000;
const previewPointLimit = 600;
const previewTargetPointCount = 400;
const samplingIntervalStorageKey = "citywalk.samplingIntervalSeconds.v1";

Page({
  data: {
    center: shanghai,
    scale: 14,
    folders: [],
    routes: [],
    displayRoutes: [],
    routeTreeNodes: [],
    routeListRows: [],
    expandedFolderIds: [],
    selectedRouteId: "",
    showLocalRoutesOnly: false,
    shouldShowLocation: false,
    isRecording: false,
    locationMode: "",
    recordingTravelMode: "",
    samplingIntervalSeconds: defaultSamplingIntervalSeconds,
    samplingIntervalInput: `${defaultSamplingIntervalSeconds}`,
    samplingIntervalRange: `${minSamplingIntervalSeconds}–${maxSamplingIntervalSeconds} 秒`,
    isSavingWalk: false,
    isRoutePanelVisible: false,
    isWalkDialogVisible: false,
    isServerDialogVisible: false,
    serverIp: "",
    serverIpInput: "",
    walkName: "",
    walkDescription: "",
    walkStartedAt: "",
    walkEndedAt: "",
    localWalks: [],
    syncingWalkIds: [],
    polylines: [],
    markers: [],
    currentUser: null,
    isAuthChecking: true
  },

  onLoad() {
    this.trackPoints = [];
    this.previewTrackPoints = [];
    this.routePolylines = [];
    this.trackRenderTimer = null;
    this.lastTrackRenderAt = 0;
    this.recordingSamplingIntervalMs = defaultSamplingIntervalSeconds * 1000;
    this.recordingRouteColor = WALKING_ROUTE_COLOR;
    this.isPageVisible = true;
    const serverIp = getServerIp();
    this.setData({ serverIp, serverIpInput: serverIp });
    this.restoreSamplingInterval();
    this.loadLocalWalks();
    this.loadCachedServerRoutes();
    this.checkAuth();
  },

  onShow() {
    this.isPageVisible = true;
    this.clearTrackRenderTimer();
    this.lastTrackRenderAt = Date.now();
    this.renderTrackPreview(true);
  },

  onHide() {
    this.isPageVisible = false;
    this.clearTrackRenderTimer();
  },

  onUnload() {
    this.isPageVisible = false;
    this.clearTrackRenderTimer();
    wx.offLocationChange(this.handleLocationChange);
    wx.stopLocationUpdate();
  },

  async checkAuth() {
    this.setData({ isAuthChecking: true });
    try {
      const payload = await api.useMiniProgramDefaultUser();
      this.setData({
        currentUser: payload.user,
        isAuthChecking: false
      });
      this.loadRoutes();
    } catch (error) {
      console.warn("[map] auth check failed", error);
      this.setData({
        currentUser: null,
        isAuthChecking: false
      });
      // 离线启动时认证必然失败。这里必须重新从 storage 恢复，不能只
      // 依赖 onLoad 中较早的一次 setData 还保留着缓存路线。
      if (this.restoreCachedServerRoutes({ preserveSelectedId: true })) {
        wx.showToast({ title: "已显示缓存路线", icon: "none" });
        return;
      }

      this.loadLocalWalks({ preserveSelectedId: true });
    }
  },

  async loadRoutes(options = {}) {
    if (!this.data.currentUser) return;
    try {
      const payload = await api.getTree();
      writeServerRouteCache(payload);
      this.applyServerRoutes(payload, { ...options, preserveSelectedId: true });
    } catch (error) {
      console.error("[map] load routes failed", error);
      if (this.restoreCachedServerRoutes({ ...options, preserveSelectedId: true })) {
        wx.showToast({ title: "已显示缓存路线", icon: "none" });
        return;
      }

      wx.showToast({ title: "路线加载失败", icon: "none" });
    }
  },

  loadCachedServerRoutes() {
    return this.restoreCachedServerRoutes({ preserveSelectedId: true });
  },

  restoreCachedServerRoutes(options = {}) {
    const cache = readServerRouteCache();
    if (!hasCachedServerRoutes(cache)) return false;

    this.applyServerRoutes(cache, options);
    return true;
  },

  applyServerRoutes(payload, options = {}) {
    const routes = (payload.routes || []).filter((route) => route.isVisible);
    const folders = payload.folders || [];
    const displayRoutes = this.buildDisplayRoutes(routes, this.data.localWalks);
    const routeTreeNodes = this.buildRouteTree(folders, displayRoutes);
    const expandedFolderIds = options.expandRootFoldersOnly
      ? this.collectRootFolderIds(routeTreeNodes)
      : this.mergeExpandedFolderIds(routeTreeNodes);
    const selectedRouteId = options.preserveSelectedId
      ? this.data.selectedRouteId || this.resolveSelectedRouteId(displayRoutes)
      : this.resolveSelectedRouteId(displayRoutes);

    this.setData(
      {
        folders,
        routes,
        displayRoutes,
        routeTreeNodes,
        routeListRows: this.flattenRouteTree(routeTreeNodes, expandedFolderIds),
        expandedFolderIds,
        selectedRouteId
      },
      () => this.renderPolylines()
    );
  },

  loadLocalWalks(options = {}) {
    const localWalks = listLocalWalks();
    const displayRoutes = this.buildDisplayRoutes(this.data.routes, localWalks);
    const routeTreeNodes = this.buildRouteTree(this.data.folders, displayRoutes);
    const expandedFolderIds = this.mergeExpandedFolderIds(routeTreeNodes);
    const selectedRouteId = options.preserveSelectedId
      ? this.data.selectedRouteId
      : this.resolveSelectedRouteId(displayRoutes);

    this.setData(
      {
        localWalks,
        displayRoutes,
        routeTreeNodes,
        routeListRows: this.flattenRouteTree(routeTreeNodes, expandedFolderIds),
        expandedFolderIds,
        selectedRouteId
      },
      () => {
        this.renderPolylines();
        if (typeof options.after === "function") options.after();
      }
    );
  },

  buildDisplayRoutes(routes, localWalks, showLocalRoutesOnly = this.data.showLocalRoutesOnly) {
    const serverRoutes = (showLocalRoutesOnly ? [] : routes).map((route) => ({
      ...route,
      sourceType: "server",
      pointSystem: "bd09"
    }));

    const localRoutes = localWalks.map((walk) => {
      const travelMode = travelModeFromRouteColor(walk.color, walk.travelMode || "walking");
      return {
        id: walk.id,
        sourceType: "local",
        pointSystem: "gcj02",
        name: walk.name,
        description: walk.description,
        color: routeColorForTravelMode(travelMode),
        points: walk.points || [],
        syncStatus: walk.syncStatus,
        travelMode
      };
    });

    return [...serverRoutes, ...localRoutes];
  },

  buildRouteTree(folders, displayRoutes, showLocalRoutesOnly = this.data.showLocalRoutesOnly) {
    const folderMap = {};
    const rootNodes = [];

    folders.forEach((folder) => {
      folderMap[folder.id] = {
        ...folder,
        type: "folder",
        children: []
      };
    });

    Object.keys(folderMap).forEach((folderId) => {
      const folder = folderMap[folderId];
      if (folder.parentId && folderMap[folder.parentId]) {
        folderMap[folder.parentId].children.push(folder);
      } else {
        rootNodes.push(folder);
      }
    });

    displayRoutes
      .filter((route) => route.sourceType === "server")
      .forEach((route) => {
        const routeNode = {
          ...route,
          type: "route"
        };

        if (route.folderId && folderMap[route.folderId]) {
          folderMap[route.folderId].children.push(routeNode);
        } else {
          rootNodes.push(routeNode);
        }
      });

    const localRoutes = displayRoutes
      .filter((route) => route.sourceType === "local")
      .map((route) => ({
        ...route,
        type: "route"
      }));

    if (localRoutes.length > 0) {
      rootNodes.unshift({
        id: localFolderId,
        type: "folder",
        name: "本地路线",
        parentId: null,
        sortOrder: -1,
        children: localRoutes
      });
    }

    const sortNodes = (nodes) =>
      nodes.sort((left, right) => {
        const orderDelta = (left.sortOrder || 0) - (right.sortOrder || 0);
        if (orderDelta !== 0) return orderDelta;
        if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
        return left.name.localeCompare(right.name, "zh-CN");
      });

    const hydrate = (nodes, level = 0) => {
      sortNodes(nodes);
      return nodes.map((node) => {
        if (node.type !== "folder") return { ...node, level };
        return {
          ...node,
          level,
          routeCount: this.countRoutes(node.children),
          children: hydrate(node.children, level + 1)
        };
      });
    };

    const hydratedNodes = hydrate(rootNodes);
    if (!showLocalRoutesOnly) return hydratedNodes;

    const pruneEmptyFolders = (nodes) =>
      nodes.flatMap((node) => {
        if (node.type !== "folder") return [node];
        const children = pruneEmptyFolders(node.children || []);
        return children.length > 0 ? [{ ...node, children, routeCount: this.countRoutes(children) }] : [];
      });

    return pruneEmptyFolders(hydratedNodes);
  },

  countRoutes(nodes) {
    return nodes.reduce((count, node) => {
      if (node.type === "route") return count + 1;
      return count + this.countRoutes(node.children || []);
    }, 0);
  },

  collectFolderIds(nodes) {
    return nodes.reduce((ids, node) => {
      if (node.type !== "folder") return ids;
      return ids.concat(node.id, this.collectFolderIds(node.children || []));
    }, []);
  },

  mergeExpandedFolderIds(routeTreeNodes) {
    const currentIds = this.data.expandedFolderIds || [];
    const nextIds = this.collectFolderIds(routeTreeNodes);
    if (currentIds.length === 0) return this.collectRootFolderIds(routeTreeNodes);

    return currentIds.filter((id) => nextIds.includes(id));
  },

  collectRootFolderIds(routeTreeNodes) {
    return routeTreeNodes
      .filter((node) => node.type === "folder" && node.level === 0)
      .map((node) => node.id);
  },

  flattenRouteTree(nodes, expandedFolderIds) {
    const rows = [];

    const visit = (items, parentPath = []) => {
      items.forEach((node) => {
        if (node.type === "folder") {
          const isExpanded = expandedFolderIds.includes(node.id);
          rows.push({
            id: node.id,
            type: "folder",
            name: node.name,
            level: node.level,
            routeCount: node.routeCount,
            isExpanded,
            isLocalFolder: node.id === localFolderId,
            directoryLabel: node.id === localFolderId ? "本地" : node.level === 0 ? "一级目录" : "二级目录"
          });

          if (isExpanded) {
            visit(node.children || [], parentPath.concat(node.id));
          }
          return;
        }

        rows.push({
          ...node,
          rowId: `${parentPath.join("/")}/${node.id}`,
          type: "route"
        });
      });
    };

    visit(nodes);
    return rows;
  },

  toggleFolderExpanded(event) {
    const folderId = event.currentTarget.dataset.folderId;
    const expandedFolderIds = this.data.expandedFolderIds.includes(folderId)
      ? this.data.expandedFolderIds.filter((id) => id !== folderId)
      : [...this.data.expandedFolderIds, folderId];

    this.setData({
      expandedFolderIds,
      routeListRows: this.flattenRouteTree(this.data.routeTreeNodes, expandedFolderIds)
    });
  },

  resolveSelectedRouteId(displayRoutes) {
    if (displayRoutes.some((route) => route.id === this.data.selectedRouteId)) {
      return this.data.selectedRouteId;
    }

    return displayRoutes[0]?.id || "";
  },

  routeMapPoints(route) {
    const points = Array.isArray(route?.points) ? route.points : [];
    const gcj02Points = route?.pointSystem === "bd09" ? points.map((point) => bd09ToGcj02(point)) : points;

    return gcj02Points.map(toMapPoint);
  },

  selectRoute(event) {
    const routeId = event.currentTarget.dataset.routeId;
    this.setData({ selectedRouteId: routeId, isRoutePanelVisible: false }, () => {
      this.renderPolylines();
      this.fitSelectedRoute();
    });
  },

  openRoutePanel() {
    this.loadLocalWalks();
    this.setData({ isRoutePanelVisible: true });
  },

  closeRoutePanel() {
    this.setData({ isRoutePanelVisible: false });
  },

  openServerSettings() {
    this.setData({
      isServerDialogVisible: true,
      serverIpInput: getServerIp()
    });
  },

  closeServerSettings() {
    this.setData({ isServerDialogVisible: false, serverIpInput: this.data.serverIp });
  },

  updateServerIpInput(event) {
    this.setData({ serverIpInput: event.detail.value });
  },

  confirmServerSettings() {
    const serverIp = String(this.data.serverIpInput || "").trim();
    if (!isValidServerIp(serverIp)) {
      wx.showToast({ title: "请输入有效的 IPv4 地址", icon: "none" });
      return;
    }

    try {
      setServerIp(serverIp);
      clearServerRouteCache();
      this.setData(
        {
          serverIp,
          serverIpInput: serverIp,
          isServerDialogVisible: false,
          currentUser: null,
          folders: [],
          routes: []
        },
        () => {
          this.loadLocalWalks({ preserveSelectedId: true });
          this.checkAuth();
        }
      );
      wx.showToast({ title: `服务器已切换为 ${serverIp}`, icon: "none" });
    } catch (error) {
      console.error("[map] save server IP failed", error);
      wx.showToast({ title: "服务器地址保存失败", icon: "none" });
    }
  },

  toggleLocalRoutesOnly() {
    const showLocalRoutesOnly = !this.data.showLocalRoutesOnly;
    const displayRoutes = this.buildDisplayRoutes(this.data.routes, this.data.localWalks, showLocalRoutesOnly);
    const routeTreeNodes = this.buildRouteTree(this.data.folders, displayRoutes, showLocalRoutesOnly);
    const expandedFolderIds = this.mergeExpandedFolderIds(routeTreeNodes);
    const selectedRouteId = this.resolveSelectedRouteId(displayRoutes);

    this.setData(
      {
        showLocalRoutesOnly,
        displayRoutes,
        routeTreeNodes,
        routeListRows: this.flattenRouteTree(routeTreeNodes, expandedFolderIds),
        expandedFolderIds,
        selectedRouteId
      },
      () => this.renderPolylines()
    );
  },

  renderPolylines() {
    this.routePolylines = this.data.displayRoutes
      .filter((route) => route.points.length > 0)
      .map((route) => ({
        points: this.routeMapPoints(route),
        color: route.id === this.data.selectedRouteId ? route.color : `${route.color}aa`,
        width: route.id === this.data.selectedRouteId ? 7 : 5,
        dottedLine: false,
        arrowLine: false
      }));

    this.renderTrackPreview(true);
  },

  renderTrackPreview(forceFullUpdate = false) {
    if (!this.isPageVisible) return;
    const trackLine =
      this.previewTrackPoints.length > 1
        ? {
            points: this.previewTrackPoints.map(toMapPoint),
            color: this.recordingRouteColor || WALKING_ROUTE_COLOR,
            width: 8,
            dottedLine: false,
            arrowLine: true
          }
        : null;

    const trackLineIndex = this.routePolylines.length;
    const canUpdateTrackOnly =
      !forceFullUpdate && trackLine && this.data.polylines.length === trackLineIndex + 1;

    if (canUpdateTrackOnly) {
      this.setData({ [`polylines[${trackLineIndex}].points`]: trackLine.points });
      return;
    }

    this.setData({ polylines: trackLine ? [...this.routePolylines, trackLine] : this.routePolylines });
  },

  scheduleTrackPreview(immediate = false) {
    if (!this.isPageVisible || this.trackRenderTimer) return;

    const elapsed = Date.now() - this.lastTrackRenderAt;
    const delay = immediate ? 0 : Math.max(0, trackRenderIntervalMs - elapsed);

    this.trackRenderTimer = setTimeout(() => {
      this.trackRenderTimer = null;
      if (!this.isPageVisible) return;
      this.lastTrackRenderAt = Date.now();
      this.renderTrackPreview();
    }, delay);
  },

  clearTrackRenderTimer() {
    if (!this.trackRenderTimer) return;
    clearTimeout(this.trackRenderTimer);
    this.trackRenderTimer = null;
  },

  fitSelectedRoute() {
    const route = this.data.displayRoutes.find((item) => item.id === this.data.selectedRouteId);
    if (!route?.points.length) return;

    const points = this.routeMapPoints(route);
    wx.createMapContext("citywalk-map", this).includePoints({
      points,
      padding: [80, 48, 220, 48]
    });
  },

  focusCurrentLocation() {
    wx.getLocation({
      type: "gcj02",
      success: (location) => {
        this.setData({
          center: {
            longitude: location.longitude,
            latitude: location.latitude
          },
          shouldShowLocation: true,
          scale: 17
        });
      },
      fail: (error) => {
        console.error("[map] get location failed", error);
        wx.showToast({ title: "无法获取定位", icon: "none" });
      }
    });
  },

  formatWalkTime(value) {
    if (!value) return "";

    const date = new Date(value);
    const pad = (number) => `${number}`.padStart(2, "0");

    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },

  formatWalkDate(value) {
    if (!value) return "";

    const date = new Date(value);
    const pad = (number) => `${number}`.padStart(2, "0");

    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("/");
  },

  formatWalkTimeRange(startedAt, endedAt) {
    const start = this.formatWalkTime(startedAt).slice(11, 16);
    const end = this.formatWalkTime(endedAt).slice(11, 16);
    if (!start && !end) return "";
    return `${start}-${end}`;
  },

  buildWalkName(startedAt, endedAt) {
    const date = this.formatWalkDate(startedAt || endedAt);
    const timeRange = this.formatWalkTimeRange(startedAt, endedAt);
    return [date, timeRange].filter(Boolean).join(" ");
  },

  restoreSamplingInterval() {
    let storedValue = defaultSamplingIntervalSeconds;

    try {
      storedValue = wx.getStorageSync(samplingIntervalStorageKey);
    } catch (error) {
      console.warn("[map] read sampling interval failed", error);
    }

    const samplingIntervalSeconds = normalizeSamplingIntervalSeconds(storedValue);
    this.setData({
      samplingIntervalSeconds,
      samplingIntervalInput: `${samplingIntervalSeconds}`
    });
  },

  updateSamplingIntervalInput(event) {
    this.setData({ samplingIntervalInput: event.detail.value });
  },

  commitSamplingInterval(showFeedback = true) {
    const rawValue = this.data.samplingIntervalInput;
    const samplingIntervalSeconds = normalizeSamplingIntervalSeconds(rawValue);

    this.setData({
      samplingIntervalSeconds,
      samplingIntervalInput: `${samplingIntervalSeconds}`
    });

    try {
      wx.setStorageSync(samplingIntervalStorageKey, samplingIntervalSeconds);
    } catch (error) {
      console.warn("[map] save sampling interval failed", error);
    }

    if (showFeedback && `${rawValue}` !== `${samplingIntervalSeconds}`) {
      wx.showToast({ title: `已调整为 ${samplingIntervalSeconds} 秒`, icon: "none" });
    }

    return samplingIntervalSeconds;
  },

  finishSamplingIntervalEdit() {
    this.commitSamplingInterval();
  },

  startRecording(eventOrTravelMode = "walking") {
    const requestedTravelMode =
      typeof eventOrTravelMode === "string"
        ? eventOrTravelMode
        : eventOrTravelMode?.currentTarget?.dataset?.travelMode;
    const travelMode = requestedTravelMode === "vehicle" ? "vehicle" : "walking";
    const startedAt = new Date().toISOString();
    const samplingIntervalSeconds = this.commitSamplingInterval(false);
    this.recordingSamplingIntervalMs = samplingIntervalSeconds * 1000;
    this.recordingTravelMode = travelMode === "vehicle" ? "vehicle" : "walking";
    this.recordingRouteColor = routeColorForTravelMode(this.recordingTravelMode);

    const startForegroundLocation = () => {
      wx.startLocationUpdate({
        type: "gcj02",
        success: () => {
          this.resetTrackBuffers();
          wx.onLocationChange(this.handleLocationChange);
          this.setData(
            {
              isRecording: true,
              locationMode: "foreground",
              recordingTravelMode: this.recordingTravelMode,
              shouldShowLocation: true,
              walkStartedAt: startedAt,
              walkEndedAt: ""
            },
            () => {
              this.renderPolylines();
            }
          );
          wx.showToast({ title: "前台记录中", icon: "none" });
        },
        fail: (error) => {
          console.error("[map] start foreground location update failed", error);
          wx.showToast({ title: "定位权限未开启", icon: "none" });
        }
      });
    };

    const startLocationUpdateBackground = wx.startLocationUpdateBackground;

    if (typeof startLocationUpdateBackground !== "function") {
      console.warn("[map] background location is not available, fallback to foreground location");
      startForegroundLocation();
      return;
    }

    startLocationUpdateBackground({
      type: "gcj02",
      success: () => {
        this.resetTrackBuffers();
        wx.onLocationChange(this.handleLocationChange);
        this.setData(
          {
            isRecording: true,
            locationMode: "background",
            recordingTravelMode: this.recordingTravelMode,
            shouldShowLocation: true,
            walkStartedAt: startedAt,
            walkEndedAt: ""
          },
          () => {
            this.renderPolylines();
          }
        );
        wx.showToast({ title: "后台记录中", icon: "none" });
      },
      fail: (error) => {
        console.warn("[map] start background location update failed, fallback to foreground location", error);
        startForegroundLocation();
      }
    });
  },

  stopRecording() {
    const startedAt = this.data.walkStartedAt;
    const endedAt = new Date().toISOString();

    wx.offLocationChange(this.handleLocationChange);
    wx.stopLocationUpdate();
    this.clearTrackRenderTimer();
    this.setData({ isRecording: false, locationMode: "", recordingTravelMode: "", walkEndedAt: endedAt }, () => this.renderTrackPreview());

    if (this.trackPoints.length < 2) {
      wx.showToast({ title: "轨迹点太少", icon: "none" });
      return;
    }

    this.setData({
      isWalkDialogVisible: true,
      walkName: this.buildWalkName(startedAt, endedAt),
      walkDescription: ""
    });
  },

  cancelWalkSave() {
    this.setData(
      {
        isWalkDialogVisible: false,
        walkName: "",
        walkDescription: "",
        walkStartedAt: "",
        walkEndedAt: ""
      },
      () => {
        this.resetTrackBuffers();
        this.renderPolylines();
      }
    );
  },

  updateWalkName(event) {
    this.setData({ walkName: event.detail.value });
  },

  updateWalkDescription(event) {
    this.setData({ walkDescription: event.detail.value });
  },

  confirmWalkSave() {
    const name = this.data.walkName.trim();
    const description = this.data.walkDescription.trim();

    if (!name) {
      wx.showToast({ title: "请输入路线名称", icon: "none" });
      return;
    }

    if (this.trackPoints.length < 2 || this.data.isSavingWalk) return;

    this.setData({ isSavingWalk: true });

    try {
      const savedWalk = saveLocalWalk({
        name,
        description: description || null,
        points: this.trackPoints,
        color: this.recordingRouteColor || WALKING_ROUTE_COLOR,
        travelMode: this.recordingTravelMode || "walking"
      });

      wx.showToast({ title: "已保存到本地", icon: "success" });
      this.setData(
        {
          isSavingWalk: false,
          isWalkDialogVisible: false,
          walkName: "",
          walkDescription: "",
          walkStartedAt: "",
          walkEndedAt: "",
          selectedRouteId: savedWalk.id
        },
        () => {
          this.resetTrackBuffers();
          this.loadLocalWalks({
            after: () => {
              this.renderPolylines();
              this.fitSelectedRoute();
            }
          });
        }
      );
    } catch (error) {
      console.error("[map] save local walk failed", error);
      this.setData({ isSavingWalk: false });
      wx.showToast({ title: "本地保存失败", icon: "none" });
    }
  },

  syncAllLocalWalks() {
    if (!this.data.currentUser) {
      wx.showToast({ title: "默认用户未就绪", icon: "none" });
      return;
    }

    const pendingWalks = this.data.localWalks.filter(
      (walk) => !this.data.syncingWalkIds.includes(walk.id) && walk.syncStatus !== "syncing"
    );

    if (pendingWalks.length === 0) {
      wx.showToast({ title: "没有待同步路线", icon: "none" });
      return;
    }

    pendingWalks
      .reduce((promise, walk) => promise.then(() => this.syncLocalWalkById(walk.id)), Promise.resolve())
      .then(() => {
        this.loadLocalWalks({ preserveSelectedId: true });
        if (listLocalWalks().length === 0) {
          wx.showToast({ title: "全部同步完成" });
        }
      });
  },

  uploadLocalWalk(walk) {
    const points = walk.points.map((point) => gcj02ToBd09(point));
    const travelMode = travelModeFromRouteColor(walk.color, walk.travelMode || "walking");
    const color = routeColorForTravelMode(travelMode);
    const completion = {
      color,
      completedOn: completionDateFromRouteName(walk.name),
      distanceMeters: routeDistanceMeters(walk.points),
      travelMode
    };

    const isCompletedRoute = (route) =>
      Boolean(route?.completedOn && route?.distanceMeters && route?.travelMode);

    return api.createRouteFromWalk({
      name: walk.name,
      description: walk.description || null,
      ...completion,
      points,
    }).then((route) => {
      // 兼容仍在运行旧版服务端的部署：旧版会忽略新增完成字段，
      // 但已有 PATCH 路线接口可以补齐这些字段。
      if (isCompletedRoute(route)) return route;
      if (!route?.id || typeof api.updateRoute !== "function") {
        throw new Error("服务端未保存路线完成信息");
      }

      return api.updateRoute(route.id, completion).then((updatedRoute) => {
        if (!isCompletedRoute(updatedRoute)) {
          throw new Error("服务端未保存路线完成信息，请更新并重启服务端");
        }
        return updatedRoute;
      });
    });
  },

  syncLocalWalkById(walkId) {
    const walk = this.data.localWalks.find((item) => item.id === walkId);
    if (!walk || this.data.syncingWalkIds.includes(walkId)) return Promise.resolve(null);

    this.setData({ syncingWalkIds: [...this.data.syncingWalkIds, walkId] });
    updateLocalWalk(walkId, { syncStatus: "syncing", lastSyncError: null });
    this.loadLocalWalks();

    return this.uploadLocalWalk(walk)
      .then((route) => {
        deleteLocalWalk(walkId);
        wx.showToast({ title: "同步成功" });
        this.setData(
          {
            selectedRouteId: route.id,
            syncingWalkIds: this.data.syncingWalkIds.filter((id) => id !== walkId)
          },
          () => {
            this.loadLocalWalks({ preserveSelectedId: true });
            this.loadRoutes({ expandRootFoldersOnly: true });
          }
        );
        return route;
      })
      .catch((error) => {
        console.error("[map] sync local walk failed", error);
        updateLocalWalk(walkId, {
          syncStatus: "failed",
          lastSyncError: error.message || "同步失败"
        });
        this.setData(
          {
            syncingWalkIds: this.data.syncingWalkIds.filter((id) => id !== walkId)
          },
          () => this.loadLocalWalks()
        );
        wx.showToast({ title: "同步失败", icon: "none" });
        return null;
      });
  },

  handleLocationChange(location) {
    const nextPoint = {
      lng: location.longitude,
      lat: location.latitude,
      accuracy: location.accuracy,
      speed: location.speed,
      capturedAt: new Date().toISOString()
    };

    if (
      !shouldAppendTrackPoint(this.trackPoints, nextPoint, {
        minIntervalMs:
          this.recordingSamplingIntervalMs ||
          normalizeSamplingIntervalSeconds(this.data.samplingIntervalSeconds) * 1000
      })
    ) {
      return;
    }

    this.trackPoints.push(nextPoint);
    this.previewTrackPoints.push(nextPoint);

    if (this.previewTrackPoints.length > previewPointLimit) {
      this.previewTrackPoints = simplifyTrackPoints(this.previewTrackPoints, {
        toleranceMeters: 3,
        maxPoints: previewTargetPointCount
      });
    }

    this.scheduleTrackPreview();
  },

  resetTrackBuffers() {
    this.clearTrackRenderTimer();
    this.trackPoints = [];
    this.previewTrackPoints = [];
    this.lastTrackRenderAt = 0;
  }
});
