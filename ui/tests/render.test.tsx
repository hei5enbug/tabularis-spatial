import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { MapEngine } from "../src/render";
import { LayerDataStore } from "../src/data";
import { FakeMap } from "./fake-map";
import { harness, mapFixture, resetHarness } from "./fixtures";

vi.mock("maplibre-gl", async () => ({ Map: (await import("./fake-map")).FakeMap, setWorkerUrl: vi.fn() }));
beforeEach(() => { resetHarness(); FakeMap.reset(); });
function engine() {
  const dispose = vi.fn(() => FakeMap.lifecycle.push("asset.dispose"));
  const move = vi.fn();
  const select = vi.fn();
  const store = new LayerDataStore(harness.service);
  const engine = new MapEngine(document.createElement("div"), { workerUrl: "blob:fixture-worker", dispose }, store, move, select, "#101010");
  return { engine, dispose, move, select, store, map: FakeMap.instances[0] };
}

describe("MapLibre 이벤트 ACK fence mock 검증", () => {
  it("style_source_tiles와_render_idle_전에는_완료하지_않는다", async () => {
    // given
    FakeMap.autoEvents = false;
    const fixture = engine();
    fixture.map.sourcesLoaded = false;
    let complete = false;
    const pending = fixture.engine.apply(mapFixture, new AbortController().signal).then(() => { complete = true; });
    await waitFor(() => expect(fixture.map.sources.size).toBe(1));
    fixture.map.emit("render");
    fixture.map.emit("idle");
    await Promise.resolve();
    const before = complete;
    fixture.map.sourcesLoaded = true;
    // when
    fixture.map.emit("idle");
    // then
    await expect(pending).resolves.toBeUndefined();
    expect(complete).toBe(true);
    expect(before).toBe(false);
    expect(fixture.map.events.get("render")?.size).toBe(0);
    expect(fixture.map.events.get("idle")?.size).toBe(0);
  });

  it("source에는_최소_ID만_넣고_원본_properties는_보존한다", async () => {
    // given
    const fixture = engine();
    // when
    await fixture.engine.apply(mapFixture, new AbortController().signal);
    // then
    expect(fixture.map.sources.get("spatial:fixture-layer")?.data).toMatchObject({ type: "FeatureCollection", features: [{ properties: { layer_id: "fixture-layer", feature_id: "original-snapshot:2:19" } }] });
    expect(JSON.stringify(fixture.map.sources.get("spatial:fixture-layer")?.data)).not.toContain("AQEA-original");
    expect(fixture.store.get("fixture-layer")?.page.features[0].properties.g).toMatchObject({ dimensions: "XYZM", value: "AQEA-original+/==" });
  });

  it("programmatic_camera는_viewport_저장_피드백을_만들지_않는다", async () => {
    // given
    const fixture = engine();
    // when
    await fixture.engine.apply(mapFixture, new AbortController().signal);
    // then
    expect(fixture.move).not.toHaveBeenCalled();
    expect(fixture.map.fitBounds).toHaveBeenCalledWith([[-180,-85.05112878],[180,85.05112878]], expect.any(Object));
  });

  it("사용자_이동만_dateline_viewport로_전달한다", async () => {
    // given
    const fixture = engine();
    fixture.map.bounds = { west: 179, east: 181, south: -10, north: 10 };
    // when
    fixture.map.emit("moveend", { originalEvent: {} });
    // then
    expect(fixture.move).toHaveBeenCalledWith({ west: 179, east: -179, south: -10, north: 10, world: false });
  });

  it("dispose는_map_remove_이후_assets와_모든_listener를_해제한다", async () => {
    // given
    const fixture = engine();
    await fixture.engine.apply(mapFixture, new AbortController().signal);
    // when
    fixture.engine.dispose();
    // then
    expect(FakeMap.lifecycle).toEqual(["map.remove","asset.dispose"]);
    expect(fixture.map.listenerCount()).toBe(0);
    expect(fixture.dispose).toHaveBeenCalledTimes(1);
  });

  it("render_error는_성공_완료로_반환하지_않는다", async () => {
    // given
    FakeMap.autoEvents = false;
    const fixture = engine();
    const pending = fixture.engine.apply(mapFixture, new AbortController().signal);
    await waitFor(() => expect(fixture.map.sources.size).toBe(1));
    // when
    fixture.map.emit("error", { error: { message: "WebGL failed fixture" } });
    // then
    await expect(pending).rejects.toThrow("WebGL failed fixture");
    expect(fixture.map.events.get("error")?.size).toBe(0);
  });
});
