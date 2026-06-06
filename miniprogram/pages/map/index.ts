import { api } from "../../services/api";
import type { RoutePlan, WalkPoint } from "../../types";
import { bd09ToGcj02, gcj02ToBd09, toMapPoint } from "../../utils/coord";
import { shouldAppendTrackPoint } from "../../utils/track";

type Polyline = WechatMiniprogram.MapProps["polyline"][number];

const shanghai = {
  longitude: 121.4737,
  latitude: 31.2304
};

Page({
  data: {
    center: shanghai,
    scale: 14,
    routes: [] as RoutePlan[],
    selectedRouteId: "" as string,
    isRecording: false,
    isSavingWalk: false,
    isWalkDialogVisible: false,
    walkName: "",
    walkDescription: "",
    trackPoints: [] as WalkPoint[],
    polylines: [] as Polyline[],
    markers: [] as WechatMiniprogram.MapProps["markers"]
  },

  onLoad() {
    this.loadRoutes();
  },

  onUnload() {
    wx.offLocationChange(this.handleLocationChange);
    wx.stopLocationUpdate();
  },

  async loadRoutes() {
    try {
      const payload = await api.getTree();
      const routes = payload.routes.filter((route) => route.isVisible);

      this.setData(
        {
          routes,
          selectedRouteId: routes[0]?.id ?? ""
        },
        () => this.renderPolylines()
      );
    } catch (error) {
      wx.showToast({ title: "路线加载失败", icon: "none" });
    }
  },

  selectRoute(event: WechatMiniprogram.TouchEvent) {
    const routeId = event.currentTarget.dataset.routeId as string;
    this.setData({ selectedRouteId: routeId }, () => {
      this.renderPolylines();
      this.fitSelectedRoute();
    });
  },

  renderPolylines() {
    const routeLines: Polyline[] = this.data.routes
      .filter((route) => route.points.length > 0)
      .map((route) => ({
        points: route.points.map((point) => toMapPoint(bd09ToGcj02(point))),
        color: route.id === this.data.selectedRouteId ? route.color : `${route.color}aa`,
        width: route.id === this.data.selectedRouteId ? 7 : 5,
        dottedLine: false,
        arrowLine: false
      }));

    const trackLine: Polyline | null =
      this.data.trackPoints.length > 1
        ? {
            points: this.data.trackPoints.map(toMapPoint),
            color: "#f59e0b",
            width: 8,
            dottedLine: false,
            arrowLine: true
          }
        : null;

    this.setData({
      polylines: trackLine ? [...routeLines, trackLine] : routeLines
    });
  },

  fitSelectedRoute() {
    const route = this.data.routes.find((item) => item.id === this.data.selectedRouteId);
    if (!route?.points.length) return;

    const points = route.points.map((point) => toMapPoint(bd09ToGcj02(point)));
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
          scale: 17
        });
      },
      fail: () => wx.showToast({ title: "无法获取定位", icon: "none" })
    });
  },

  startRecording() {
    wx.startLocationUpdate({
      success: () => {
        wx.onLocationChange(this.handleLocationChange);
        this.setData({ isRecording: true, trackPoints: [] }, () => this.renderPolylines());
      },
      fail: () => wx.showToast({ title: "定位权限未开启", icon: "none" })
    });
  },

  stopRecording() {
    wx.offLocationChange(this.handleLocationChange);
    wx.stopLocationUpdate();
    this.setData({ isRecording: false }, () => this.renderPolylines());

    if (this.data.trackPoints.length < 2) {
      wx.showToast({ title: "轨迹点太少", icon: "none" });
      return;
    }

    this.setData({
      isWalkDialogVisible: true,
      walkName: `CityWalk ${new Date().toLocaleString()}`,
      walkDescription: ""
    });
  },

  cancelWalkSave() {
    this.setData({
      isWalkDialogVisible: false,
      walkName: "",
      walkDescription: "",
      trackPoints: []
    }, () => this.renderPolylines());
  },

  updateWalkName(event: WechatMiniprogram.Input) {
    this.setData({ walkName: event.detail.value });
  },

  updateWalkDescription(event: WechatMiniprogram.Input) {
    this.setData({ walkDescription: event.detail.value });
  },

  confirmWalkSave() {
    const name = this.data.walkName.trim();

    if (!name) {
      wx.showToast({ title: "请输入路线名称", icon: "none" });
      return;
    }

    if (this.data.trackPoints.length < 2 || this.data.isSavingWalk) return;

    const points = this.data.trackPoints.map((point) => gcj02ToBd09(point));
    this.setData({ isSavingWalk: true });

    api
      .createRouteFromWalk({
        name,
        description: this.data.walkDescription.trim() || null,
        points
      })
      .then((route) => {
        wx.showToast({ title: "路线已保存" });
        this.setData(
          {
            isSavingWalk: false,
            isWalkDialogVisible: false,
            walkName: "",
            walkDescription: "",
            trackPoints: [],
            selectedRouteId: route.id
          },
          () => {
            this.loadRoutes();
          }
        );
      })
      .catch(() => {
        this.setData({ isSavingWalk: false });
        wx.showToast({ title: "保存失败", icon: "none" });
      });
  },

  handleLocationChange(location: WechatMiniprogram.OnLocationChangeCallbackResult) {
    const nextPoint: WalkPoint = {
      lng: location.longitude,
      lat: location.latitude,
      accuracy: location.accuracy,
      speed: location.speed,
      capturedAt: new Date().toISOString()
    };

    if (!shouldAppendTrackPoint(this.data.trackPoints, nextPoint)) return;

    this.setData(
      {
        center: {
          longitude: nextPoint.lng,
          latitude: nextPoint.lat
        },
        trackPoints: [...this.data.trackPoints, nextPoint]
      },
      () => this.renderPolylines()
    );
  }
});
