import fs from "fs";
import path from "path";

/** Load .env.local / .env in development (for VAPID keys etc.). Does not override existing env. */
export const loadDevEnv = () => {
  if (process.env.NODE_ENV !== "development") return;

  const root = path.resolve(import.meta.dirname, "..");
  for (const file of [".env.local", ".env"]) {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath)) continue;

    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
};
