// ONREZA entry point - uses tsx to run TypeScript
const { spawn } = require("child_process");
const path = require("path");
const { fileURLToPath } = require("url");

const tsxPath = path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs");

const tsx = spawn("node", [tsxPath, "server/index.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});

tsx.on("close", (code) => process.exit(code));
tsx.on("error", (err) => {
  console.error("Failed to start tsx:", err);
  process.exit(1);
});
