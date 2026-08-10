const ALADIN_LITE_VERSION = "3.8.2";
const ALADIN_LITE_SCRIPT_ID = "sky-aladin-lite-v3";
const ALADIN_LITE_SCRIPT_URL = `https://aladin.cds.unistra.fr/AladinLite/api/v3/${ALADIN_LITE_VERSION}/aladin.js`;

export interface AladinPosition {
  ra: number;
  dec: number;
  dragging?: boolean;
  frame?: string;
}

export interface AladinInstance {
  getFov(): [number, number];
  getRaDec(): [number, number];
  gotoRaDec(ra: number, dec: number): void;
  off(event: string): void;
  on(event: "positionChanged", callback: (position: AladinPosition) => void): void;
  on(event: "zoomChanged", callback: (fov: number) => void): void;
  setBaseImageLayer(survey: string): unknown;
  setFoV(fov: number): void;
  setProjection(projection: string): void;
}

export interface AladinApi {
  init: Promise<void>;
  aladin(
    element: HTMLElement,
    options: {
      survey: string;
      fov: number;
      projection: string;
      cooFrame: string;
      showReticle: boolean;
      showCooGridControl: boolean;
      showCooGrid: boolean;
      showSimbadPointerControl: boolean;
      showContextMenu: boolean;
      showFullscreenControl: boolean;
    },
  ): AladinInstance;
}

type WindowWithAladin = Window & { A?: AladinApi };

let aladinLoader: Promise<AladinApi> | null = null;

function currentApi(): AladinApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as WindowWithAladin).A;
}

export function loadAladinLite(): Promise<AladinApi> {
  const loaded = currentApi();
  if (loaded) return loaded.init.then(() => loaded);
  if (aladinLoader) return aladinLoader;
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Aladin Lite requires a browser environment"));
  }

  aladinLoader = new Promise<AladinApi>((resolve, reject) => {
    const finish = () => {
      const api = currentApi();
      if (!api) {
        reject(new Error("Aladin Lite loaded without exposing its browser API"));
        return;
      }
      api.init.then(() => resolve(api)).catch(reject);
    };

    const existing = document.getElementById(ALADIN_LITE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (currentApi()) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("Unable to load Aladin Lite")), {
          once: true,
        });
      }
      return;
    }

    const script = document.createElement("script");
    script.id = ALADIN_LITE_SCRIPT_ID;
    script.src = ALADIN_LITE_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load Aladin Lite")), {
      once: true,
    });
    document.head.appendChild(script);
  }).catch((error) => {
    aladinLoader = null;
    throw error;
  });

  return aladinLoader;
}

export { ALADIN_LITE_VERSION };
