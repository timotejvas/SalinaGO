// The version of the app: the one in package.json, which Vite puts in when it builds (see
// vite.config.ts). Shown short, the way people say it: "1.0.0" -> "1.0", "1.2.3" stays.

declare const __APP_VERSION__: string;

export const VERSION = __APP_VERSION__.replace(/\.0$/, "");
