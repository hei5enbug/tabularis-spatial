import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const viteRequire = createRequire(import.meta.resolve("vite"));
const workerEntry = fileURLToPath(import.meta.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"));

export function mapLibreWorkerPlugin() {
  return {
    name: "tabularis-maplibre-worker",
    apply: "build",
    async generateBundle() {
      const { rollup } = await import(pathToFileURL(viteRequire.resolve("rollup")).href);
      const license = readFileSync(workerEntry, "utf8").match(/^\/\*\*[\s\S]*?\*\//)?.[0];
      if (!license?.includes("@license")) throw new Error("The MapLibre worker license header is unavailable.");
      const bundle = await rollup({ input: workerEntry });
      try {
        const { output } = await bundle.generate({ format: "iife", name: "TabularisMapLibreWorker", inlineDynamicImports: true, sourcemap: false, banner: license });
        if (output.length !== 1 || output[0].type !== "chunk" || output[0].imports.length || output[0].dynamicImports.length) throw new Error("The MapLibre worker must be one standalone chunk.");
        this.emitFile({ type: "asset", fileName: "maplibre-worker.js", source: output[0].code });
      } finally {
        await bundle.close();
      }
    },
  };
}
