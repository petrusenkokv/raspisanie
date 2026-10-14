import esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await esbuild.build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/index.js",
  external: ["vite", "@replit/vite-plugin-cartographer", "@replit/vite-plugin-runtime-error-modal"],
  banner: {
    js: '"use strict";',
  },
  target: "node20",
  resolveExtensions: [".ts", ".js", ".json"],
  logLevel: "info",
});

console.log("Server built successfully to dist/index.js");
