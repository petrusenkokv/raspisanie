import esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  writeFileSync,
} from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Единый CJS-бандл: Layero не запускает ESM (его рантайм парсит .js как CJS),
// а onreza запускает бандл через spawn дочерним процессом — формат ему безразличичен.
// Раньше был ESM + top-level await в storage-db.ts: CJS не собирался (esbuild не
// поддерживает TLA в cjs), а ESM не жил на Layero. TLA убран — форматы сошлись на CJS.
await esbuild.build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/index.js",
  external: ["vite", "@replit/vite-plugin-cartographer", "@replit/vite-plugin-runtime-error-modal"],
  target: "node20",
  resolveExtensions: [".ts", ".js", ".json"],
  logLevel: "info",
});

// Корневой package.json имеет "type": "module", поэтому CJS-бандлу нужен
// собственный маркер формата — иначе Node распарсит dist/index.js как ESM.
writeFileSync(
  resolve(__dirname, "dist", "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);

console.log("Server built successfully to dist/index.js (CJS)");

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