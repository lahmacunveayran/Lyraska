const l = require(process.cwd() + "/package-lock.json");
const fs = require("fs");
const miss = [];
for (const [k, v] of Object.entries(l.packages)) {
  if (!k) continue;
  if (!fs.existsSync(k + "/package.json"))
    miss.push(k + " " + (v.license || "?") + " dev=" + !!v.dev + " os=" + (v.os || ""));
}
console.log("kurulmayan:", miss.length);
console.log(miss.join("\n"));
