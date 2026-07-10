const fs = require("fs");
const path = require("path");

const assets = [
  { src: "src/server/openapi.yaml", dest: "dist/server/openapi.yaml" },
  { src: "src/server/method-verbs.json", dest: "dist/server/method-verbs.json" }
];

assets.forEach(asset => {
  const destDir = path.dirname(asset.dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(asset.src, asset.dest);
  console.log("Copied " + asset.src + " -> " + asset.dest);
});
