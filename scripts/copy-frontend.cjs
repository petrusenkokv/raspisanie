const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "..", "dist", "public");
const dst = path.resolve(__dirname, "..", "dist");

if (!fs.existsSync(src)) {
  console.log("dist/public not found, skipping copy");
  process.exit(0);
}

if (!fs.existsSync(dst)) {
  fs.mkdirSync(dst, { recursive: true });
}

// Copy all files from dist/public to dist
fs.cpSync(src, dst, {
  recursive: true,
  filter: (srcPath) => {
    // Don't copy the public folder itself if it exists
    return true;
  },
});

console.log("Copied frontend from dist/public to dist");
