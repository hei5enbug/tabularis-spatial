import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HostFixture, openFixture, applyThroughHost } from "./host";
import { FakeMap } from "./fake-map";
import { applyRequest, harness, mapFixture, pageFixture, resetHarness } from "./fixtures";
import { validateRequest } from "./schema";
import { WORLD } from "../src/models";

vi.mock("maplibre-gl", async () => ({ Map: (await import("./fake-map")).FakeMap, setWorkerUrl: vi.fn() }));
vi.mock("@tabularis/plugin-api", async () => {
  const { harness } = await import("./fixtures");
  return {
    usePluginService: () => harness.service, usePluginAssets: () => harness.assets,
    usePluginModal: () => ({ openModal: harness.openModal, closeModal: harness.closeModal }),
    usePluginTheme: () => ({ colors: null, isDark: true, themeId: "fixture", themeName: "fixture" }),
    usePluginToast: () => harness.toast, usePluginTranslation: () => (_key: string, options: { defaultValue: string }) => options.defaultValue,
  };
});
beforeEach(() => { resetHarness(); FakeMap.reset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); document.head.querySelectorAll("link[rel=stylesheet]").forEach(link => link.remove()); });

describe("host modal과 common operations mock 검증", () => {
  it("active_connection없이_global_subscribe가_지도를_연다", async () => {
    // given
    const input = structuredClone(mapFixture);
    // when
    const actual = await openFixture(input);
    // then
    expect(actual.ack).toMatchObject({ gui_applied: true, rendered_version: input.version, state_version: input.version });
    expect(screen.getByRole("dialog", { name: "공간 지도" })).not.toBeNull();
    expect(harness.requests[0].connection_id).toBe("inactive-connection");
    expect(harness.service.subscribeMap).toHaveBeenCalledTimes(1);
    expect(FakeMap.instances).toHaveLength(1);
  });

  it("unmount는_subscribe와_map과_CSS_worker를_정리한다", async () => {
    // given
    const { view } = await openFixture();
    const map = FakeMap.instances[0];
    // when
    view.unmount();
    // then
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(map.removed).toBe(true);
    expect(map.listenerCount()).toBe(0);
    expect(document.head.querySelector("link[rel=stylesheet]")).toBeNull();
  });

  it("명시_close는_resource_해제_후_true_ACK를_반환한다", async () => {
    // given
    await openFixture();
    // when
    const ack = await applyThroughHost(applyRequest("close", mapFixture, 2));
    // then
    expect(ack).toMatchObject({ gui_applied: true, rendered_version: mapFixture.version });
    expect(FakeMap.instances[0].removed).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.head.querySelector("link[rel=stylesheet]")).toBeNull();
  });

  it("열리지_않은_map의_명시_close도_자원없음을_확인한다", async () => {
    // given
    render(<HostFixture />);
    await waitFor(() => expect(harness.handler).not.toBeNull());
    // when
    const actual = await harness.handler!(applyRequest("close"));
    // then
    expect(actual.gui_applied).toBe(true);
    expect(harness.openModal).not.toHaveBeenCalled();
    expect(FakeMap.instances).toHaveLength(0);
  });

  it("저장은_expected_version을_보낸다", async () => {
    // given
    await openFixture();
    // when
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "저장" })); });
    // then
    expect(harness.requests.find(request => request.operation === "map.save")).toMatchObject({ map_id: mapFixture.map_id, expected_version: 1, input: {} });
    expect(screen.getAllByRole("status").some(status => status.textContent?.includes("저장했습니다"))).toBe(true);
  });

  it("불러오기는_map_get과_common_map_open만_사용한다", async () => {
    // given
    await openFixture();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "저장된 지도 목록" })); });
    fireEvent.change(screen.getByLabelText("불러올 지도"), { target: { value: mapFixture.map_id } });
    // when
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "불러오기" })); });
    // then
    expect(harness.requests.slice(-2).map(request => request.operation)).toEqual(["map.get","map.open"]);
    expect(harness.requests.find(request => request.operation === "map.open")?.input).toEqual({ gui_instance_id: "fixture-gui" });
  });

  it("visibility는_공개_layer_update를_통해_변경한다", async () => {
    // given
    await openFixture();
    // when
    await act(async () => { fireEvent.click(screen.getByLabelText("표시")); });
    // then
    expect(harness.requests.find(request => request.operation === "map.layer.update")?.input).toMatchObject({ layer_id: "fixture-layer", visible: false });
    expect(harness.map.layers[0].generation).toBe(1);
    expect(harness.requests.filter(request => request.operation === "spatial.query_result")).toHaveLength(1);
  });

  it("점_선_면_style은_범위값을_common_layer_update로_보낸다", async () => {
    // given
    await openFixture();
    fireEvent.change(screen.getByLabelText("점 반경"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("선 굵기"), { target: { value: "20" } });
    // when
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "스타일 적용" })); });
    // then
    expect(harness.requests.find(request => request.operation === "map.layer.update")?.input).toMatchObject({ style: { point: { radius: 40 }, line: { width: 20 }, polygon: { color: "#3b82f6" } } });
    expect(harness.requests.every(request => validateRequest(request).valid)).toBe(true);
  });

  it("속성_selection은_returned_detail_cache를_사용하고_XSS를_실행하지_않는다", async () => {
    // given
    await openFixture();
    const selection = screen.getByLabelText("Feature 선택");
    // when
    await act(async () => { fireEvent.change(selection, { target: { value: pageFixture.features[0].id } }); });
    // then
    expect(harness.requests.find(request => request.operation === "spatial.feature")?.input).toEqual({ result_id: "display-cache", feature_id: pageFixture.features[0].id });
    expect(harness.requests.find(request => request.operation === "map.selection.set")?.input).toEqual({ feature_refs: [{ layer_id: "fixture-layer", feature_id: pageFixture.features[0].id }] });
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("원본 속성").textContent).toContain("<img src=x onerror=alert(1)>");
    expect(screen.getByLabelText("원본 속성").textContent).toContain("AQEA-original+/==");
  });

  it("GeoJSON_export는_artifact_metadata만_표시한다", async () => {
    // given
    await openFixture();
    // when
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "GeoJSON export" })); });
    // then
    expect(harness.requests.find(request => request.operation === "spatial.export")?.input).toMatchObject({ format: "geojson", filename: "spatial-layer.geojson", source: mapFixture.layers[0].source });
    expect(screen.getByLabelText("원본 속성").textContent).toContain("fixture-artifact");
    expect(screen.getByLabelText("원본 속성").textContent).toContain("sha256:fixture");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("외부_basemap은_네트워크와_attribution_확인_후_적용한다", async () => {
    // given
    await openFixture();
    fireEvent.change(screen.getByLabelText("HTTPS style URL"), { target: { value: "https://tiles.example/style.json" } });
    fireEvent.change(screen.getByLabelText("제공자 attribution"), { target: { value: "<b>제공자</b>" } });
    fireEvent.click(screen.getByLabelText("외부 네트워크와 제공자 라이선스 표시 확인"));
    // when
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Basemap 적용" })); });
    // then
    expect(harness.requests.find(request => request.operation === "map.update")?.input).toEqual({ basemap: { style_url: "https://tiles.example/style.json", attribution: "<b>제공자</b>" } });
    expect(document.querySelector(".spatial-attribution b")).toBeNull();
    expect(screen.getByText("<b>제공자</b>")).not.toBeNull();
  });

  it("version_conflict는_reload후_사용자_재시도를_요청한다", async () => {
    // given
    await openFixture();
    harness.failNext = "VERSION_CONFLICT";
    fireEvent.change(screen.getByLabelText("지도 이름"), { target: { value: "변경" } });
    // when
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "이름 적용" })); });
    // then
    expect(harness.requests.slice(-2).map(request => request.operation)).toEqual(["map.update","map.get"]);
    expect(harness.requests.filter(request => request.operation === "map.update")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("다시 시도");
  });

  it("user_move는_150ms_debounce하며_query_SQL은_재실행하지_않는다", async () => {
    // given
    await openFixture();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const map = FakeMap.instances[0];
    map.bounds = { west: 10, east: 20, south: -10, north: 10 };
    map.emit("moveend", { originalEvent: {} });
    map.bounds = { west: 20, east: 30, south: -5, north: 5 };
    map.emit("moveend", { originalEvent: {} });
    // when
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    // then
    expect(harness.requests.filter(request => request.operation === "map.viewport.set")).toHaveLength(1);
    expect(harness.requests.find(request => request.operation === "map.viewport.set")?.input).toEqual({ viewport: { west: 20, east: 30, south: -5, north: 5, world: false } });
    expect(harness.requests.filter(request => request.operation === "spatial.query_result")).toHaveLength(1);
    expect(harness.requests.some(request => request.operation === "query.execute")).toBe(false);
  });

  it("table_viewport_변경만_새_범위를_조회한다", async () => {
    // given
    const map = structuredClone(mapFixture);
    map.layers[0].source = { kind: "table", table: { database: null, schema: "public", table: "roads" }, column: "g", viewport: { ...WORLD }, source_srid: 4326, srid_filter: 0 };
    harness.map = map;
    await openFixture(map);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    FakeMap.instances[0].bounds = { west: 10, east: 20, south: -5, north: 5 };
    FakeMap.instances[0].emit("moveend", { originalEvent: {} });
    // when
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    // then
    expect(harness.requests.filter(request => request.operation === "spatial.table_query")).toHaveLength(2);
    expect(harness.requests.filter(request => request.operation === "spatial.table_query")[1].input).toMatchObject({ viewport: { west: 10, east: 20, south: -5, north: 5, world: false } });
    expect(harness.map.layers[0].generation).toBe(1);
  });

  it("접근성_label과_host_dialog를_유지한다", async () => {
    // given
    await openFixture();
    // when
    const actual = screen.getByRole("dialog", { name: "공간 지도" });
    // then
    expect(actual.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByLabelText("MapLibre 지도")).not.toBeNull();
    expect(screen.getByRole("button", { name: "지도 닫기" })).not.toBeNull();
    expect(FakeMap.instances[0].canvas.getAttribute("aria-label")).toContain("방향키");
  });

  it("최신_테이블_행은_사용자의_명시_action과_typed_복합_PK로만_조회한다", async () => {
    // given
    const map = structuredClone(mapFixture);
    map.layers[0].source = { kind: "table", table: { database: null, schema: "public", table: "roads" }, column: "g", viewport: { ...WORLD }, source_srid: 4326, srid_filter: 0 };
    harness.map = map;
    harness.page.row_references[0].identity = { columns: ["tenant","id"], values: ["001",7] };
    await openFixture(map);
    await act(async () => { fireEvent.change(screen.getByLabelText("Feature 선택"), { target: { value: pageFixture.features[0].id } }); });
    // when
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "최신 행 별도 조회" })); });
    // then
    expect(harness.requests.filter(request => request.operation === "spatial.feature").map(request => request.input)).toEqual([{ result_id: "display-cache", feature_id: pageFixture.features[0].id }, { table: map.layers[0].source.table, identity: { columns: ["tenant","id"], values: ["001",7] } }]);
    expect(screen.getAllByRole("status").some(status => status.textContent?.includes("snapshot을 교체하지 않았습니다"))).toBe(true);
    expect(harness.page.features[0].properties.g).toEqual(pageFixture.features[0].properties.g);
  });

  it("worker_asset_누락은_false_ACK와_명확한_오류를_반환한다", async () => {
    // given
    harness.assets.resolve.mockRejectedValue(new Error("missing asset fixture"));
    render(<HostFixture />);
    await waitFor(() => expect(harness.handler).not.toBeNull());
    // when
    const actual = await applyThroughHost(applyRequest("open"));
    // then
    expect(actual).toMatchObject({ gui_applied: false, rendered_version: null });
    expect(FakeMap.instances).toHaveLength(0);
    expect(screen.getByRole("alert").textContent).toContain("asset");
  });

  it("Escape는_host_modal에_전달하고_map_자원을_해제한다", async () => {
    // given
    await openFixture();
    const input = screen.getByLabelText("지도 이름");
    input.focus();
    // when
    fireEvent.keyDown(input, { key: "Escape" });
    // then
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(harness.closeModal).toHaveBeenCalledTimes(1);
    expect(FakeMap.instances[0].removed).toBe(true);
  });
});
