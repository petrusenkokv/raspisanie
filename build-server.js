import esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Build server
await esbuild.build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/index.js",
  external: ["vite", "@replit/vite-plugin-cartographer", "@replit/vite-plugin-runtime-error-modal"],
  banner: {
    // ESM-бандл не имеет require(), а CommonJS-зависимости (express, pg, ...)
    // вызывают его внутри себя. Без этого шейпа Node падает на старте с
    // «Dynamic require of "path" is not supported».
    js: 'import{createRequire as __createRequire}from"node:module";const require=__createRequire(import.meta.url);',
  },
  target: "node20",
  resolveExtensions: [".ts", ".js", ".json"],
  logLevel: "info",
});

console.log("Server built successfully to dist/index.js");

// Copy dist/public to server/public for the server to find
function copyDirSync(src, dest) {
  const entries = readdirSync(src, { withFileTypes: true });
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

const srcDir = resolve(__dirname, "dist", "public");
const destDir = resolve(__dirname, "server", "public");

if (existsSync(srcDir)) {
  copyDirSync(srcDir, destDir);
  console.log("Copied dist/public to server/public");
}
