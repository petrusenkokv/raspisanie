// ONREZA entry point - uses tsx to run TypeScript
import { spawn } from "node:child_process";

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
