import type { SlotComponentProps } from "@tabularis/plugin-api";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { MapToolbar } from "./MapToolbar";
import { MapRenderer } from "./MapRenderer";

export default function SpatialPlugin(props: SlotComponentProps) {
  return props.context.connectionId ? <MapToolbar {...props} /> : <MapRenderer pluginId={props.pluginId} />;
}
