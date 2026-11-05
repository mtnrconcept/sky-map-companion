import { hipsServiceUrlForSurvey } from "../domain/hips-surveys";

const ALADIN_LITE_VERSION = "3.8.2";

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

export interface AladinStarSource {
  ra: number;
  dec: number;
  data: Record<string, unknown>;
}

export interface AladinStarCatalog {
  addSources(sources: AladinStarSource[]): void;
  removeAll(): void;
  show(): void;
  hide(): void;
}

export interface AladinMoc {
  contains(ra: number, dec: number): boolean;
}

export interface AladinInstance {
  addCatalog(catalog: AladinStarCatalog): void;
  showPopup(ra: number, dec: number, title: string, content: string): void;
  getFov(): [number, number];
  getFoVCorners(nseg?: number, frame?: string): readonly (readonly [number, number])[];
  getRaDec(): [number, number];
  gotoRaDec(ra: number, dec: number): void;
  getOverlayImageLayer(layerName: string): AladinImageSurvey | undefined;
  off(event: string): void;
  on(event: "positionChanged", callback: (position: AladinPosition) => void): void;
  on(event: "zoomChanged", callback: (fov: number) => void): void;
  on(event: "click", callback: (position: { ra: number; dec: number }) => void): void;
  on(event: "objectClicked", callback: () => void): void;
  setBaseImageLayer(survey: string | AladinImageSurvey): unknown;
  setOverlayImageLayer(survey: string | AladinImageSurvey, layerName: string): unknown;
  setFoV(fov: number): void;
  setProjection(projection: string): void;
}

export interface AladinApi {
  init: Promise<void>;
  catalog(options: {
    name: string;
    color: string;
    shape: string;
    sourceSize: number;
    onClick: "showPopup";
    limit: number;
  }): AladinStarCatalog;
  source(ra: number, dec: number, data: Record<string, unknown>): AladinStarSource;
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

let aladinLoader: Promise<AladinApi> | null = null;
let patchedApi: AladinApi | null = null;

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

export function loadAladinLite(): Promise<AladinApi> {
  if (aladinLoader) return aladinLoader;
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Aladin Lite requires a browser environment"));
  }

  aladinLoader = import("aladin-lite")
    .then(async ({ default: api }) => {
      await api.init;
      return patchAladinApi(api);
    })
    .catch((error) => {
      aladinLoader = null;
      throw error;
    });

  return aladinLoader;
}

export { ALADIN_LITE_VERSION };
