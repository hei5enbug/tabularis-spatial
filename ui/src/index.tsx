import * as api from "@tabularis/plugin-api";
import type { SlotComponentProps } from "@tabularis/plugin-api";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { CompatToolbar, hasCompatTableContext } from "./compat";
import { MapToolbar } from "./MapToolbar";
import { MapRenderer } from "./MapRenderer";

export default function SpatialPlugin(props: SlotComponentProps) {
  if (typeof api.usePluginService !== "function" || typeof api.usePluginAssets !== "function") {
    return hasCompatTableContext(props) ? <CompatToolbar {...props} /> : null;
  }
  if (!props.context.connectionId) return <MapRenderer pluginId={props.pluginId} />;
  return ["postgres", "postgresql"].includes((props.context.driver ?? "").toLowerCase()) ? <MapToolbar {...props} /> : null;
}
