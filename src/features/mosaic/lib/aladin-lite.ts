import { hipsServiceUrlForSurvey } from "../domain/hips-surveys";

const ALADIN_LITE_VERSION = "3.8.2";
const ALADIN_LITE_SCRIPT_ID = "sky-aladin-lite-v3";
const ALADIN_LITE_SCRIPT_URL = `https://aladin.cds.unistra.fr/AladinLite/api/v3/${ALADIN_LITE_VERSION}/aladin.js`;
// An independent mirror recovers the canvas if the CDS host times out.
const ALADIN_MODULE_URLS = [
  `https://cdn.jsdelivr.net/npm/aladin-lite@${ALADIN_LITE_VERSION}/dist/aladin.js`,
  `https://unpkg.com/aladin-lite@${ALADIN_LITE_VERSION}/dist/aladin.js`,
];
const DOWNLOAD_TIMEOUT_MS = 9_000;
const INIT_TIMEOUT_MS = 12_000;

export interface AladinPosition {
  ra: number;
  dec: number;
  dragging?: boolean;
  frame?: string;
}

export interface AladinImageSurvey {
  setOpacity(opacity: number): void;
  getAlpha?(): number;
}

export interface AladinMoc {
  contains(ra: number, dec: number): boolean;
}

export interface AladinInstance {
  getFov(): [number, number];
  getFoVCorners(nseg?: number, frame?: string): readonly (readonly [number, number])[];
  getRaDec(): [number, number];
  gotoRaDec(ra: number, dec: number): void;
  getOverlayImageLayer(layerName: string): AladinImageSurvey | undefined;
  off(event: string): void;
  on(event: "positionChanged", callback: (position: AladinPosition) => void): void;
  on(event: "zoomChanged", callback: (fov: number) => void): void;
  setBaseImageLayer(survey: string | AladinImageSurvey): unknown;
  setOverlayImageLayer(survey: string | AladinImageSurvey, layerName: string): unknown;
  setFoV(fov: number): void;
  setProjection(projection: string): void;
}

export interface AladinApi {
  init: Promise<void>;
  MOCFromURL(
    url: string,
    options: Record<string, unknown>,
    successCallback?: () => void,
    errorCallback?: (reason: unknown) => void,
  ): AladinMoc;
  aladin(
    element: HTMLElement,
    options: {
      survey: string;
      /** Official Aladin v3 option: explicit HiPS URLs bypass catalogue lookups. */
      surveyUrl?: string[];
      fov: number;
      projection: string;
      cooFrame: string;
      backgroundColor?: string;
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
let patchedApi: AladinApi | null = null;

function currentApi(): AladinApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as WindowWithAladin).A;
}

function patchAladinApi(api: AladinApi): AladinApi {
  if (patchedApi === api) return api;
  const originalAladin = api.aladin.bind(api);
  api.aladin = (element, options) => {
    const instance = originalAladin(element, {
      ...options,
      survey: hipsServiceUrlForSurvey(options.survey),
    });
    const originalSetBaseImageLayer = instance.setBaseImageLayer.bind(instance);
    instance.setBaseImageLayer = (survey) =>
      originalSetBaseImageLayer(
        typeof survey === "string" ? hipsServiceUrlForSurvey(survey) : survey,
      );
    if (typeof instance.off !== "function") instance.off = () => undefined;
    return instance;
  };
  patchedApi = api;
  return api;
}

function withTimeout<T>(work: Promise<T>, milliseconds: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} : délai de ${Math.round(milliseconds / 1000)} s dépassé`));
    }, milliseconds);
    work.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function readyApi(value: unknown): Promise<AladinApi> {
  const api = value as AladinApi | undefined;
  if (!api || typeof api.aladin !== "function" || !api.init?.then) {
    throw new Error("API Aladin Lite incomplète");
  }
  await withTimeout(api.init, INIT_TIMEOUT_MS, "Initialisation Aladin Lite");
  return patchAladinApi(api);
}

async function importAladinModule(url: string): Promise<AladinApi> {
  // Vite must not rewrite the remote module URLs at build time.
  const module = await withTimeout(
    import(/* @vite-ignore */ url),
    DOWNLOAD_TIMEOUT_MS,
    "Téléchargement Aladin Lite",
  );
  return readyApi(module.default ?? module.A);
}

function loadAladinScript(): Promise<AladinApi> {
  return new Promise<AladinApi>((resolve, reject) => {
    document.getElementById(ALADIN_LITE_SCRIPT_ID)?.remove();
    const script = document.createElement("script");
    script.id = ALADIN_LITE_SCRIPT_ID;
    script.src = ALADIN_LITE_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    let finished = false;
    const complete = (failure?: unknown) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (failure) {
        script.remove();
        reject(failure);
      } else {
        void readyApi(currentApi()).then(resolve, reject);
      }
    };
    const onLoad = () => complete();
    const onError = () =>
      complete(new Error("Impossible de télécharger Aladin Lite depuis le CDS"));
    const timer = window.setTimeout(
      () => complete(new Error("Le serveur Aladin CDS ne répond pas")),
      DOWNLOAD_TIMEOUT_MS,
    );
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
  });
}

export function loadAladinLite(): Promise<AladinApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Aladin Lite nécessite un navigateur"));
  }
  if (aladinLoader) return aladinLoader;

  aladinLoader = (async () => {
    const cached = currentApi();
    if (cached) {
      try {
        return await readyApi(cached);
      } catch {
        // A previously injected script may be incomplete: attempt a clean recovery.
      }
    }

    const errors: string[] = [];
    for (const url of ALADIN_MODULE_URLS) {
      try {
        return await importAladinModule(url);
      } catch (reason) {
        errors.push(
          `${new URL(url).host}: ${reason instanceof Error ? reason.message : String(reason)}`,
        );
      }
    }

    try {
      return await loadAladinScript();
    } catch (reason) {
      errors.push(`CDS: ${reason instanceof Error ? reason.message : String(reason)}`);
      throw new Error(`La carte Aladin Lite ne peut pas démarrer. ${errors.join(" · ")}`);
    }
  })().catch((reason) => {
    // A failed first attempt must not poison manual retry or later navigation.
    aladinLoader = null;
    throw reason;
  });

  return aladinLoader;
}

export { ALADIN_LITE_VERSION };
