import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tsxPath = join(__dirname, "node_modules", "tsx", "dist", "cli.mjs");

const child = spawn("node", [tsxPath, "server/index.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});

child.on("close", (code) => process.exit(code || 0));
child.on("error", (err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
