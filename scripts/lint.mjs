import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const checkedExtensions = new Set([".ts", ".tsx", ".rs", ".json", ".md", ".mjs", ".css"]);
const bannedPatterns = [
  { pattern: /TODO\b/, message: "TODO marker found" },
  { pattern: /apiKey|secretKey|password\s*=/i, message: "Possible secret-like text found" }
];

const failures = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if(["node_modules", "dist", "target", ".git", ".tools", "gen"].includes(entry.name)) continue;
      await walk(path);
      continue;
    }
    const ext = entry.name.slice(entry.name.lastIndexOf("."));
    if (entry.name === "lint.mjs" || entry.name === "package-lock.json" || entry.name === "Cargo.lock") continue;
    if (!checkedExtensions.has(ext)) continue;
    const text = await readFile(path, "utf8");
    for (const rule of bannedPatterns) {
      if (rule.pattern.test(text)) failures.push(`${path}: ${rule.message}`);
    }
    const remoteMatches = text.match(/https:\/\/[^\s"'`),]+/g) ?? [];
    for (const url of remoteMatches) {
      if (url === "https://") continue;
      if (!url.includes("wikipedia.org") && !url.includes("open-meteo.com")) {
        failures.push(`${path}: Unexpected remote URL ${url}`);
      }
    }
  }
}

await walk(root);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Lint checks passed");
