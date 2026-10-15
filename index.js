import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const builtServerPath = join(__dirname, "dist", "index.js");

const child = spawn("node", [builtServerPath], {
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
