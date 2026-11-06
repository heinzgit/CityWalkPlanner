declare global {
  interface Window {
    AMap?: typeof AMap;
    _AMapSecurityConfig?: { securityJsCode: string };
    __cityWalkAmapInit?: () => void;
  }

  namespace AMap {
    type LngLatLike = LngLat | [number, number];
    type EventHandler = (event: MapsEvent) => void;

    class Map {
      constructor(container: string | HTMLElement, options?: MapOptions);
      add(overlays: Overlay | Overlay[]): void;
      remove(overlays: Overlay | Overlay[]): void;
      on(event: string, handler: EventHandler): void;
      off(event: string, handler: EventHandler): void;
      setZoomAndCenter(zoom: number, center: LngLatLike): void;
      setBounds(bounds: Bounds, immediately?: boolean, avoid?: number[], maxZoom?: number): void;
      getCenter(): LngLat;
      getZoom(): number;
      destroy(): void;
    }

    class LngLat {
      constructor(lng: number, lat: number);
      getLng(): number;
      getLat(): number;
    }

    class Bounds {
      constructor(southWest: LngLatLike, northEast: LngLatLike);
      extend(point: LngLatLike): Bounds;
    }

    class Size {
      constructor(width: number, height: number);
    }

    class Icon {
      constructor(options: IconOptions);
    }

    class Polyline implements Overlay {
      constructor(options: PolylineOptions);
      on(event: string, handler: EventHandler): void;
      off(event: string, handler: EventHandler): void;
    }

    class Marker implements Overlay {
      constructor(options: MarkerOptions);
      getPosition(): LngLat | null;
      setIcon(icon: Icon): void;
      on(event: string, handler: EventHandler): void;
      off(event: string, handler: EventHandler): void;
    }

    interface Overlay {}
    interface Layer {
      show(): void;
      hide(): void;
    }

    type MapOptions = {
      center?: LngLatLike;
      zoom?: number;
      viewMode?: "2D" | "3D";
      resizeEnable?: boolean;
      showLabel?: boolean;
      layers?: Layer[];
    };

    type IconOptions = {
      image: string;
      size?: Size;
      imageSize?: Size;
    };

    type PolylineOptions = {
      path: LngLatLike[];
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
      lineJoin?: "miter" | "round" | "bevel";
      showDir?: boolean;
      dirColor?: string;
      zIndex?: number;
    };

    type MarkerOptions = {
      position: LngLatLike;
      draggable?: boolean;
      icon?: Icon;
      anchor?: "top-left" | "top-center" | "top-right" | "middle-left" | "center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";
      zIndex?: number;
    };

    type MapsEvent = {
      lnglat?: LngLat;
      target?: Overlay;
    };

    namespace TileLayer {
      class Satellite implements Layer {
        show(): void;
        hide(): void;
      }
      class RoadNet implements Layer {
        show(): void;
        hide(): void;
      }
    }

    function createDefaultLayer(): Layer;
  }
}

let loadingPromise: Promise<typeof AMap> | null = null;

export function loadAmap(key: string, securityJsCode: string) {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loadingPromise) return loadingPromise;

  window._AMapSecurityConfig = { securityJsCode };
  loadingPromise = new Promise((resolve, reject) => {
    window.__cityWalkAmapInit = () => {
      if (!window.AMap) {
        loadingPromise = null;
        reject(new Error("高德地图脚本已加载，但 AMap 对象不可用"));
        return;
      }
      resolve(window.AMap);
    };

    const script = document.createElement("script");
    script.charset = "utf-8";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=__cityWalkAmapInit`;
    script.async = true;
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error("高德地图脚本加载失败"));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}
