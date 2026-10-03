import React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { FeaturePage, MapState } from "../../../ui/src/models";

const EVIDENCE = "actual_macos_wkwebview_with_mock_service";
const CANARY = "v1-own-original-property";
const XSS_TEXT = "<img src=x onerror=window.v1UnexpectedImage=true>";
const metrics = { workers_started: 0, worker_messages: 0, worker_geojson: 0, workers_terminated: 0, gl_contexts: 0, gl_draws: 0, assets_created: 0, assets_disposed: 0, subscriptions: 0, unsubscribed: 0, modal_opened: 0, modal_closed: 0, css_loaded: false, external_attempts: 0, worker_raw_canary: false, toasts: 0 };
const operations: string[] = [];
const workerTypes = new Set<string>();
const contexts = new WeakSet<object>();
const nativeWorker = window.Worker;
class ObservedWorker extends nativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options);
    metrics.workers_started++;
    this.addEventListener("message", () => { metrics.worker_messages++; });
  }
  postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
    const value = message as { type?: unknown; data?: { data?: unknown; type?: unknown } };
    if (typeof value?.type === "string") {
      if (workerTypes.size < 32) workerTypes.add(value.type);
      const geojson = value.data?.data;
      if ((typeof geojson === "string" && geojson.includes('"FeatureCollection"')) || (geojson && typeof geojson === "object" && (geojson as { type?: unknown }).type === "FeatureCollection")) {
        metrics.worker_geojson++;
        if (JSON.stringify(geojson).includes(CANARY)) metrics.worker_raw_canary = true;
      }
    }
    if (transfer === undefined) super.postMessage(message);
    else if (Array.isArray(transfer)) super.postMessage(message, transfer);
    else super.postMessage(message, transfer);
  }
  terminate(): void { metrics.workers_terminated++; super.terminate(); }
}
window.Worker = ObservedWorker;
const nativeContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (...args: unknown[]) {
  const result = Reflect.apply(nativeContext, this, args);
  if ((args[0] === "webgl" || args[0] === "webgl2" || args[0] === "experimental-webgl") && result && !contexts.has(result)) {
    contexts.add(result); metrics.gl_contexts++;
  }
  return result;
} as typeof nativeContext;
for (const context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
  if (!context) continue;
  const prototype = context.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
    const original = prototype[name];
    if (typeof original !== "function") continue;
    prototype[name] = function (...args: unknown[]) { metrics.gl_draws++; return Reflect.apply(original, this, args); };
  }
}

function originalPoint(empty = false) {
  const bytes = new Uint8Array(25);
  const view = new DataView(bytes.buffer);
  bytes[0] = 1; view.setUint32(1, 0x20000001, true); view.setUint32(5, 4326, true);
  view.setFloat64(9, empty ? NaN : -9, true); view.setFloat64(17, empty ? NaN : 0, true);
  return { kind: "spatial", native_type: "geometry", srid: 4326, dimensions: "XY", encoding: "ewkb-base64", value: btoa(String.fromCharCode(...bytes)), is_empty: empty };
}
const geometries = [
  { type: "Point", coordinates: [-9, 0] },
  { type: "LineString", coordinates: [[-8, -4], [-4, -2], [-2, -4]] },
  { type: "Polygon", coordinates: [[[-10, 2], [-5, 2], [-5, 7], [-10, 7], [-10, 2]], [[-9, 3], [-9, 5], [-7, 5], [-7, 3], [-9, 3]]] },
  { type: "MultiPoint", coordinates: [[2, 0], [4, 1]] },
  { type: "MultiLineString", coordinates: [[[3, -4], [7, -4]], [[4, -6], [8, -6]]] },
  { type: "MultiPolygon", coordinates: [[[[5, 3], [8, 3], [8, 6], [5, 6], [5, 3]]], [[[9, 2], [11, 2], [11, 4], [9, 4], [9, 2]]]] },
  { type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [0, 6] }, { type: "LineString", coordinates: [[-2, 4], [2, 4]] }] },
  null, null,
] as FeaturePage["features"][number]["geometry"][];
const page: FeaturePage = {
  features: geometries.map((geometry, index) => ({ type: "Feature", id: `v1-query:0:${index}`, geometry,
    properties: { label: index === 0 ? XSS_TEXT : `own ${index}`, canary: CANARY, ...(index === 0 ? { g: originalPoint() } : index === 7 ? { g: null } : index === 8 ? { g: originalPoint(true) } : {}) } })),
  row_references: geometries.map((_, index) => ({ feature_id: `v1-query:0:${index}`, identity: null, snapshot_id: "v1-query", row_ordinal: index })),
  page: { next_token: null, has_more: false, resume_mode: "none" }, limits: { truncated: false, reasons: [] }, warnings: [], feature_errors: [],
};
let map: MapState = { map_id: "v1-map", name: "실제 WKWebView 합성 지도", version: 0, viewport: { west: -15, east: 15, south: -10, north: 10 }, basemap: null,
  layers: [{ layer_id: "v1-layer", connection_id: "v1-inactive-connection", source: { kind: "query_result", result_id: "v1-query", result_set_index: 0, column_index: 2, longitude_mode: "preserve", skip_invalid: false }, visible: true,
    style: { point: { color: "#ef4444", radius: 8 }, line: { color: "#22c55e", width: 4 }, polygon: { color: "#3b82f6", opacity: 0.5 } }, generation: 1, result_references: [{ result_id: "v1-query", result_set_index: 0 }] }], selected_feature_refs: [] };
type Apply = { map_id: string; state_version: number; generation: number; state: { action: "open" | "update" | "close"; map: MapState } };
type Ack = { state_version: number; rendered_version: number | null; generation: number; gui_applied: boolean };
let handler: ((request: Apply) => Promise<Ack>) | null = null;
let pluginRoot: Root | null = null;
let modalRoot: Root | null = null;
let dialog: HTMLElement | null = null;
let done = false;
let phase = "initialization";
let watchdog: ReturnType<typeof setTimeout>;
const ownOrigin = location.origin;
const nativeFetch = window.fetch;
const observeUrl = (value: string | URL) => {
  const url = new URL(String(value), ownOrigin);
  if (/^https?:$/.test(url.protocol) && url.origin !== ownOrigin) metrics.external_attempts++;
};
window.fetch = function (input: RequestInfo | URL, options?: RequestInit) {
  observeUrl(input instanceof Request ? input.url : input);
  return nativeFetch.call(this, input, options);
};
const nativeOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (...args: unknown[]) {
  observeUrl(String(args[1]));
  return Reflect.apply(nativeOpen, this, args);
} as typeof nativeOpen;

function envelope(request: Record<string, unknown>, data: unknown, resultId: string | null = null) {
  return { protocol_version: 1, request_id: request.request_id, connection_id: request.connection_id ?? null, status: "succeeded", job_id: null, result_id: resultId,
    data, page: structuredClone(page.page), limits: structuredClone(page.limits), metrics: { elapsed_ms: 0, retry_count: 0, request_charge: null }, warnings: [], error: null };
}
const service = {
  async subscribeMap(callback: typeof handler) { metrics.subscriptions++; handler = callback; return () => { metrics.unsubscribed++; handler = null; }; },
  async capabilities(connectionId: string) { if (connectionId !== "v1-inactive-connection") throw new Error("WRONG_CONNECTION"); return { service_protocol: 1, spatial_v1: true, documents_v1: false, cancel_v1: true, gui_instance_id: "v1-gui", operations: ["spatial.query_result", "spatial.feature", "map.selection.set"] }; },
  async call(request: Record<string, unknown>, options?: { signal?: AbortSignal }) {
    if (options?.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (operations.length >= 64) throw new Error("REQUEST_LIMIT");
    const operation = String(request.operation); operations.push(operation);
    const input = request.input as Record<string, unknown>;
    if (operation === "spatial.query_result") {
      if (request.connection_id !== "v1-inactive-connection" || input.result_id !== "v1-query" || input.result_set_index !== 0 || input.column_index !== 2) throw new Error("WRONG_SNAPSHOT");
      return envelope(request, structuredClone(page), "v1-display-cache");
    }
    if (operation === "map.selection.set") {
      if (request.map_id !== map.map_id || request.expected_version !== map.version) throw new Error("WRONG_VERSION");
      map = { ...map, version: map.version + 1, selected_feature_refs: structuredClone(input.feature_refs) as MapState["selected_feature_refs"] };
      return envelope(request, { map: structuredClone(map), state_version: map.version, rendered_version: null, gui_applied: false });
    }
    if (operation === "spatial.feature") {
      if (request.connection_id !== "v1-inactive-connection" || input.result_id !== "v1-display-cache") throw new Error("WRONG_DETAIL_CACHE");
      const feature = page.features.find(value => value.id === input.feature_id);
      if (!feature) throw new Error("UNKNOWN_FEATURE");
      return envelope(request, { original_row: structuredClone(feature.properties), identity: null });
    }
    if (operation === "result.get") return envelope(request, { kind: "tabular", columns: [{ name: "id", column_index: 0, native_type: null, srid: null, dimensions: null }, { name: "label", column_index: 1, native_type: null, srid: null, dimensions: null }, { name: "g", column_index: 2, native_type: "geometry", srid: 4326, dimensions: "XY" }], rows: [[0, XSS_TEXT, originalPoint()]] });
    throw new Error("UNEXPECTED_OPERATION");
  },
};
const modal = {
  openModal(options: { content: React.ReactNode; title: string }) {
    if (modalRoot) throw new Error("DUPLICATE_MODAL");
    metrics.modal_opened++;
    dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-label", options.title); document.body.append(dialog);
    modalRoot = createRoot(dialog); modalRoot.render(options.content);
  },
  closeModal() { metrics.modal_closed++; flushSync(() => modalRoot?.unmount()); modalRoot = null; dialog?.remove(); dialog = null; },
};
const assets = {
  async resolve(path: string) {
    if (path !== "ui/dist/style.css" && path !== "ui/dist/maplibre-worker.js") throw new Error("UNEXPECTED_ASSET");
    const response = await fetch(path === "ui/dist/style.css" ? "/style.css" : "/maplibre-worker.js");
    if (!response.ok) throw new Error("ASSET_FAILED");
    const bytes = await response.arrayBuffer();
    const url = URL.createObjectURL(new Blob([bytes], { type: path.endsWith(".css") ? "text/css" : "text/javascript" }));
    metrics.assets_created++; let disposed = false;
    return { url, dispose() { if (disposed) return; disposed = true; metrics.assets_disposed++; URL.revokeObjectURL(url); } };
  },
};
const translation = (_key: string, options: { defaultValue: string }) => options.defaultValue;
const toast = { async showInfo() {}, async showWarning() {}, async showError() { metrics.toasts++; } };
const theme = { isDark: true, themeId: "v1", themeName: "V1", colors: { bg: { base: "#111827", elevated: "#1f2937" }, text: { primary: "#f9fafb" }, border: { default: "#4b5563" }, accent: { primary: "#3b82f6" } } };
Object.assign(window, { React, ReactJSXRuntime, __TABULARIS_API__: { usePluginService: () => service, usePluginModal: () => modal, usePluginAssets: () => assets, usePluginTheme: () => theme, usePluginToast: () => toast, usePluginTranslation: () => translation } });

function requireCheck(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
async function waitFor(predicate: () => boolean, timeout = 5000): Promise<void> {
  const deadline = performance.now() + timeout;
  while (!predicate()) { if (performance.now() > deadline) throw new Error("FIXTURE_WAIT_TIMEOUT"); await new Promise(resolve => setTimeout(resolve, 20)); }
}
function apply(action: Apply["state"]["action"], state: MapState, generation: number): Promise<Ack> {
  requireCheck(handler, "SUBSCRIPTION_MISSING");
  return handler({ map_id: state.map_id, state_version: state.version, generation, state: { action, map: structuredClone(state) } });
}
function ackMatches(ack: Ack, version: number, generation: number) { return ack.gui_applied === true && ack.state_version === version && ack.rendered_version === version && ack.generation === generation; }
function finish(report: Record<string, unknown>) {
  if (done) return; done = true; clearTimeout(watchdog);
  if (modalRoot) modal.closeModal();
  if (pluginRoot) { flushSync(() => pluginRoot?.unmount()); pluginRoot = null; }
  const encoded = JSON.stringify(report);
  const result = new TextEncoder().encode(encoded).byteLength <= 65536 ? report : { pass: false, code: "REPORT_TOO_LARGE", evidence: EVIDENCE };
  const bridge = (window as unknown as { webkit: { messageHandlers: { v1Result: { postMessage(value: unknown): void } } } }).webkit;
  bridge.messageHandlers.v1Result.postMessage(result);
}

export async function start() {
  watchdog = setTimeout(() => finish({ pass: false, code: "JAVASCRIPT_TIMEOUT", evidence: EVIDENCE }), 45000);
  window.addEventListener("error", () => finish({ pass: false, code: "JAVASCRIPT_FAILED", evidence: EVIDENCE }));
  window.addEventListener("unhandledrejection", event => { event.preventDefault(); finish({ pass: false, code: "JAVASCRIPT_FAILED", evidence: EVIDENCE }); });
  try {
    type Plugin = React.ComponentType<{ pluginId: string; context: Record<string, unknown> }>;
    const plugin = (window as unknown as { __tabularis_plugin__: Plugin | { default?: Plugin } }).__tabularis_plugin__;
    const component = typeof plugin === "function" ? plugin : plugin?.default;
    requireCheck(typeof component === "function", "PLUGIN_ENTRY_MISSING");
    const root = document.getElementById("plugin-root"); requireCheck(root, "ROOT_MISSING");
    pluginRoot = createRoot(root); pluginRoot.render(React.createElement(component, { pluginId: "spatial", context: {} }));
    phase = "subscription";
    await waitFor(() => handler !== null);
    phase = "open";
    const opened = await apply("open", map, 1);
    requireCheck(ackMatches(opened, 0, 1), metrics.gl_contexts === 0 ? "WEBGL_UNAVAILABLE" : "OPEN_ACK_FAILED");
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas");
    phase = "feature_options";
    await waitFor(() => [...document.querySelectorAll<HTMLSelectElement>("select")].some(value => value.parentElement?.textContent?.startsWith("Feature 선택") && value.options.length === 10));
    const select = [...document.querySelectorAll<HTMLSelectElement>("select")].find(value => value.parentElement?.textContent?.startsWith("Feature 선택"));
    requireCheck(select, "FEATURE_SELECT_MISSING");
    const featureOptions = [...select.options].filter(option => option.value);
    const originalOptions = featureOptions.map(option => ({ value: option.value, text: option.textContent }));
    const css = document.querySelector<HTMLLinkElement>("link[rel=stylesheet]");
    metrics.css_loaded = Boolean(css?.sheet && css.sheet.cssRules.length > 0);
    phase = "selection";
    select.value = "v1-query:0:0"; select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => operations.includes("spatial.feature") && Boolean(document.querySelector("pre")?.textContent?.includes(CANARY)));
    const detail = document.querySelector("pre")?.textContent ?? "";
    const rawDetail = detail.includes(originalPoint().value) && detail.includes(XSS_TEXT) && detail.includes(CANARY);
    const safeText = !document.querySelector(".spatial-map-modal img") && !(window as unknown as { v1UnexpectedImage?: boolean }).v1UnexpectedImage;
    phase = "stale";
    const staleVersion = await apply("update", { ...map, version: 0 }, 2);
    const staleGeneration = await apply("update", map, 0);
    map = { ...map, version: 2, viewport: { west: -16, east: 16, south: -12, north: 12 }, layers: map.layers.map(layer => ({ ...layer, generation: 2, style: { ...layer.style, point: { color: "#f59e0b", radius: 9 } } })) };
    phase = "update";
    const updated = await apply("update", map, 2);
    const canvasSize = Boolean(canvas && canvas.width > 0 && canvas.height > 0);
    phase = "close";
    const closed = await apply("close", map, 3);
    const firstAckCleanup = metrics.workers_started > 0 && metrics.workers_terminated === metrics.workers_started && metrics.assets_created === 2 && metrics.assets_disposed === 2 && !document.querySelector("link[rel=stylesheet]") && !document.querySelector("[role=dialog]") && !document.querySelector("canvas.maplibregl-canvas");
    await waitFor(() => metrics.workers_terminated === metrics.workers_started && metrics.assets_disposed === metrics.assets_created && !document.querySelector("[role=dialog]"));
    const firstCycle = { open_ack: opened, close_ack: closed, workers_started: metrics.workers_started, workers_terminated: metrics.workers_terminated, assets_created: metrics.assets_created, assets_disposed: metrics.assets_disposed,
      css_removed: !document.querySelector("link[rel=stylesheet]"), canvas_removed: !document.querySelector("canvas.maplibregl-canvas"), modal_unmounted: !document.querySelector("[role=dialog]"), gl_draws: metrics.gl_draws, ack_cleanup_complete: firstAckCleanup };
    phase = "reopen";
    const reopened = await apply("open", map, 4);
    requireCheck(ackMatches(reopened, 2, 4), "REOPEN_ACK_FAILED");
    await waitFor(() => [...document.querySelectorAll<HTMLSelectElement>("select")].some(value => value.parentElement?.textContent?.startsWith("Feature 선택") && value.options.length === 10));
    const reopenedSelect = [...document.querySelectorAll<HTMLSelectElement>("select")].find(value => value.parentElement?.textContent?.startsWith("Feature 선택"));
    const reopenedOptions = [...reopenedSelect!.options].filter(option => option.value);
    const reopenedCanvas = document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas");
    const reopenedCanvasSize = Boolean(reopenedCanvas && reopenedCanvas.width > 0 && reopenedCanvas.height > 0);
    const reopenedCss = document.querySelector<HTMLLinkElement>("link[rel=stylesheet]");
    metrics.css_loaded = metrics.css_loaded && Boolean(reopenedCss?.sheet && reopenedCss.sheet.cssRules.length > 0);
    const secondDraws = metrics.gl_draws > firstCycle.gl_draws;
    phase = "reclose";
    const reclosed = await apply("close", map, 5);
    const secondAckCleanup = metrics.workers_started > firstCycle.workers_started && metrics.workers_terminated === metrics.workers_started && metrics.assets_created === 4 && metrics.assets_disposed === 4 && !document.querySelector("link[rel=stylesheet]") && !document.querySelector("[role=dialog]") && !document.querySelector("canvas.maplibregl-canvas");
    await waitFor(() => metrics.workers_terminated === metrics.workers_started && metrics.assets_disposed === metrics.assets_created && !document.querySelector("[role=dialog]"));
    const secondCycle = { open_ack: reopened, close_ack: reclosed, workers_started: metrics.workers_started, workers_terminated: metrics.workers_terminated, assets_created: metrics.assets_created, assets_disposed: metrics.assets_disposed,
      css_removed: !document.querySelector("link[rel=stylesheet]"), canvas_removed: !document.querySelector("canvas.maplibregl-canvas"), modal_unmounted: !document.querySelector("[role=dialog]"), gl_draws: metrics.gl_draws, ack_cleanup_complete: secondAckCleanup };
    phase = "root_shutdown";
    flushSync(() => pluginRoot?.unmount()); pluginRoot = null;
    await waitFor(() => metrics.unsubscribed === 1);
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const external = resources.filter(resource => /^https?:/.test(resource.name) && new URL(resource.name).origin !== ownOrigin);
    const staticImports = resources.filter(resource => /^https?:/.test(resource.name) && !["/shim.js", "/production/index.js", "/style.css", "/maplibre-worker.js"].includes(new URL(resource.name).pathname));
    const checks = {
      open_ack: ackMatches(opened, 0, 1) && ackMatches(reopened, 2, 4), real_worker: firstCycle.workers_started > 0 && metrics.workers_started > firstCycle.workers_started, worker_geojson: metrics.worker_geojson > 0 && metrics.worker_messages > 0 && !metrics.worker_raw_canary,
      real_webgl: metrics.gl_contexts >= 2 && metrics.gl_draws > 0 && secondDraws, canvas_size: canvasSize && reopenedCanvasSize,
      feature_options: originalOptions.length === 9 && reopenedOptions.length === 9 && page.features.every(feature => originalOptions.some(option => option.value === feature.id) && reopenedOptions.some(option => option.value === feature.id)),
      null_empty: originalOptions.filter(option => option.text?.includes("NULL/EMPTY")).length === 2 && reopenedOptions.filter(option => option.text?.includes("NULL/EMPTY")).length === 2 && page.features[7].properties.g === null && (page.features[8].properties.g as { is_empty: boolean }).is_empty,
      css_loaded: metrics.css_loaded, raw_detail: rawDetail, safe_text: safeText,
      stale_rejected: staleVersion.gui_applied === false && staleVersion.rendered_version === null && staleGeneration.gui_applied === false && staleGeneration.rendered_version === null,
      updated_ack: ackMatches(updated, 2, 2), close_ack: ackMatches(closed, 2, 3) && ackMatches(reclosed, 2, 5) && firstAckCleanup && secondAckCleanup, worker_terminated: firstCycle.workers_started > 0 && firstCycle.workers_terminated === firstCycle.workers_started && metrics.workers_terminated === metrics.workers_started,
      assets_disposed: firstCycle.assets_created === 2 && firstCycle.assets_disposed === 2 && metrics.assets_created === 4 && metrics.assets_disposed === 4, css_removed: firstCycle.css_removed && !document.querySelector("link[rel=stylesheet]"), modal_unmounted: firstCycle.modal_unmounted && !document.querySelector("[role=dialog]") && metrics.modal_closed === 2,
      root_shutdown: root.childElementCount === 0, unsubscribed: metrics.subscriptions === 1 && metrics.unsubscribed === 1,
      no_external_requests: external.length === 0 && metrics.external_attempts === 0, no_static_imports: staticImports.length === 0,
      query_snapshot_only: operations.filter(value => value === "spatial.query_result").length === 2 && operations.every(value => ["spatial.query_result", "map.selection.set", "spatial.feature"].includes(value)),
    };
    finish({ pass: Object.values(checks).every(value => value === true), code: Object.values(checks).every(value => value === true) ? "PASS" : "CHECK_FAILED", evidence: EVIDENCE, checks, metrics, worker_types: [...workerTypes], operations,
      browser: { user_agent: navigator.userAgent, react: React.version }, geometry_types: geometries.filter(Boolean).map(value => value!.type), feature_count: page.features.length, open_ack: opened, update_ack: updated, close_ack: closed, reopen_ack: reopened, reclose_ack: reclosed, cycles: [firstCycle, secondCycle] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FIXTURE_FAILED";
    finish({ pass: false, code: /^[A-Z_]{1,64}$/.test(message) ? message : "FIXTURE_FAILED", evidence: EVIDENCE, phase, metrics, operations, worker_types: [...workerTypes] });
  }
}
