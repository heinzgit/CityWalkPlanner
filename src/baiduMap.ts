declare global {
  interface Window {
    BMapGL?: typeof BMapGL;
    __baiduMapInit?: () => void;
  }

  namespace BMapGL {
    const BMAP_NORMAL_MAP: MapType;
    const BMAP_SATELLITE_MAP: MapType;

    class Map {
      constructor(container: string | HTMLElement);
      centerAndZoom(point: Point, zoom: number): void;
      enableScrollWheelZoom(enable?: boolean): void;
      setMapType(mapType: MapType): void;
      addOverlay(overlay: Overlay): void;
      removeOverlay(overlay: Overlay): void;
      addEventListener(event: string, handler: (event: MapMouseEvent) => void): void;
      removeEventListener(event: string, handler: (event: MapMouseEvent) => void): void;
      setViewport(points: Point[]): void;
      getCenter(): Point;
      getZoom(): number;
    }

    class Point {
      constructor(lng: number, lat: number);
      lng: number;
      lat: number;
    }

    class Size {
      constructor(width: number, height: number);
    }

    class Icon {
      constructor(url: string, size: Size, options?: IconOptions);
    }

    class Polyline implements Overlay {
      constructor(points: Point[], options?: PolylineOptions);
      setStrokeColor(color: string): void;
      setStrokeWeight(weight: number): void;
      addEventListener(event: string, handler: (event: MapMouseEvent) => void): void;
    }

    class Marker implements Overlay {
      constructor(point: Point, options?: MarkerOptions);
      enableDragging(): void;
      disableDragging(): void;
      getPosition(): Point;
      addEventListener(event: string, handler: (event: MarkerDragEvent) => void): void;
      setIcon(icon: Icon): void;
    }

    interface Overlay {}
    interface MapType {}

    type PolylineOptions = {
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
      strokeTexture?: {
        url: string;
        width: number;
        height: number;
      };
    };

    type MarkerOptions = {
      enableDragging?: boolean;
      icon?: Icon;
    };

    type IconOptions = {
      anchor?: Size;
      imageSize?: Size;
    };

    type MapMouseEvent = {
      latlng?: Point;
      point?: Point;
    };

    type MarkerDragEvent = {
      point?: Point;
      target?: Marker;
    };
  }
}

let loadingPromise: Promise<typeof BMapGL> | null = null;

export function loadBaiduMap(ak: string) {
  if (window.BMapGL) return Promise.resolve(window.BMapGL);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    window.__baiduMapInit = () => {
      if (!window.BMapGL) {
        reject(new Error("Baidu Map loaded but BMapGL is unavailable."));
        return;
      }
      resolve(window.BMapGL);
    };

    const script = document.createElement("script");
    script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${encodeURIComponent(ak)}&callback=__baiduMapInit`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Baidu Map script."));
    document.head.appendChild(script);
  });

  return loadingPromise;
}
