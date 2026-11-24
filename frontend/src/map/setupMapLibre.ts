// Tells MapLibre where its worker file is (Vite bundles it). Imported once by createMap.ts.

import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
