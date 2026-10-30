import esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import {
  copyFileSync,
  mkdirSync,
  rmSync,
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

// --- Deploy-pkg (ONREZA output_directory) ---
// ONREZA ищет файлы в output_directory после сборки. deploy-pkg не в git,
// поэтому build-server.js должен создавать его каждый раз.

const deployPkgDir = resolve(__dirname, "deploy-pkg");

// Чистим старый deploy-pkg
if (existsSync(deployPkgDir)) {
  rmSync(deployPkgDir, { recursive: true, force: true });
}
mkdirSync(deployPkgDir, { recursive: true });

// Копируем dist/ → deploy-pkg/dist/
const deployDistDir = join(deployPkgDir, "dist");
mkdirSync(deployDistDir, { recursive: true });
const distEntries = readdirSync(resolve(__dirname, "dist"), { withFileTypes: true });
for (const entry of distEntries) {
  const srcPath = join(__dirname, "dist", entry.name);
  const destPath = join(deployDistDir, entry.name);
  if (entry.isDirectory()) {
    copyDirSync(srcPath, destPath);
  } else {
    copyFileSync(srcPath, destPath);
  }
}
console.log("Copied dist/ to deploy-pkg/dist/");

// Копируем корневой index.js → deploy-pkg/index.js
copyFileSync(
  resolve(__dirname, "index.js"),
  join(deployPkgDir, "index.js")
);

// Создаём deploy-pkg/package.json
writeFileSync(
  join(deployPkgDir, "package.json"),
  JSON.stringify({ name: "raspisanie", private: true, type: "module" }, null, 2) + "\n"
);

console.log("Created deploy-pkg/ for ONREZA deployment");