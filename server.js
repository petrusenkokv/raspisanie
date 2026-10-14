// This file is used by ONREZA to detect the entry point
// It spawns tsx to run the TypeScript server

import { spawn } from "child_process";

const tsx = spawn("npx", ["tsx", "server/index.ts"], {
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
