declare namespace AMap {
  class Map {
    constructor(container: string | HTMLElement, opts?: Record<string, unknown>);
    setCenter(center: [number, number]): void;
    setZoom(zoom: number): void;
    destroy(): void;
  }
  class Marker {
    constructor(opts?: { position?: [number, number]; map?: Map });
    setMap(map: Map | null): void;
    setPosition(position: [number, number]): void;
  }
}

interface Window {
  AMap?: typeof AMap;
}
