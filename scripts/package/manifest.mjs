import { fail } from './errors.mjs';

export const HOST_FLOOR = '0.26.1-spatial.1';
export const MAPLIBRE_VERSION = '6.11.2';
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));

export function validatedManifest(value) {
  if (!keys(value, ['id', 'name', 'kind', 'version', 'description', 'service_protocol', 'capabilities', 'min_runtime_version', 'ui_extensions']) || value.id !== 'spatial' || value.name !== 'spatial' || value.kind !== 'extension' || value.version !== '0.1.0' || value.service_protocol !== 1 || value.min_runtime_version !== HOST_FLOOR || typeof value.description !== 'string' || !value.description.trim() || /bootstrap|unavailable/i.test(value.description)) fail('MANIFEST_NOT_READY');
  const capabilities = value.capabilities;
  const disabled = ['schemas', 'views', 'routines', 'file_based', 'alter_primary_key', 'manage_tables', 'explain'];
  if (!keys(capabilities, [...disabled, 'identifier_quote', 'spatial_v1']) || disabled.some(key => capabilities[key] !== false) || capabilities.identifier_quote !== '"' || capabilities.spatial_v1 !== true) fail('MANIFEST_NOT_READY');
  if (!Array.isArray(value.ui_extensions) || value.ui_extensions.length !== 2) fail('MANIFEST_NOT_READY');
  const toolbar = value.ui_extensions.find(item => item?.slot === 'data-grid.toolbar.actions');
  const renderer = value.ui_extensions.find(item => item?.slot === 'app.map.renderer');
  if (!keys(toolbar, ['slot', 'module', 'driver']) || toolbar.module !== 'ui/dist/index.js' || toolbar.driver !== 'postgresql' || !keys(renderer, ['slot', 'module']) || renderer.module !== 'ui/dist/index.js') fail('MANIFEST_NOT_READY');
  return value;
}
