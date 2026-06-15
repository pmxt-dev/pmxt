const fs = require("fs");

const target = "dist";

fs.rmSync(target, { recursive: true, force: true });
console.log("Cleaned " + target);
