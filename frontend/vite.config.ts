// Vite settings: the React plugin, the version of the app for the page to show, and the
// security policy of the built page. See https://vite.dev/config/

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";

// ---------- settings ----------
// the version of the app, as package.json has it; the page shows it in Settings (src/version.ts)
const VERSION: string = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;

// What the built page may load and connect to, and nothing else (a Content Security Policy):
// a script slipped in somehow - through the map style or the live stream, say - can then neither
// run nor send anything away. Each host is here for one thing:
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com", // and the visit counter of the host
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'" +
    " https://basemaps.cartocdn.com https://tiles.basemaps.cartocdn.com" + // the map
    " wss://gis.brno.cz" + // the live positions
    " https://api.web3forms.com" + // reporting a problem
    " https://cloudflareinsights.com", // counting visits (Cloudflare Web Analytics, no cookies)
  "worker-src 'self' blob:", // MapLibre draws the map in a worker it makes itself
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");
// Counting visits, when a token is given to the build (VITE_ANALYTICS_TOKEN): Cloudflare Web
// Analytics, which keeps no cookies and nothing about who you are. Without one, nothing counts.
const ANALYTICS_TOKEN = process.env.VITE_ANALYTICS_TOKEN;
// ------------------------------

// The policy, and the visit counter, go into the built page only: the dev server needs a script
// of its own inline for reloading as you edit, which the policy would stop.
function securityPolicy(): Plugin {
  return {
    name: "security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
        injectTo: "head-prepend",
      },
      ...(ANALYTICS_TOKEN
        ? [
            {
              tag: "script",
              attrs: {
                defer: true,
                src: "https://static.cloudflareinsights.com/beacon.min.js",
                "data-cf-beacon": JSON.stringify({ token: ANALYTICS_TOKEN }),
              },
              injectTo: "body" as const,
            },
          ]
        : []),
    ],
  };
}

export default defineConfig({
  // paths relative to the page, so that it works on a domain of its own and in a folder of one
  // (github.io/SalinaGO/) alike
  base: "./",
  plugins: [react(), securityPolicy()],
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
  },
});
