import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "dist-web");
const indexPath = join(outDir, "index.html");

if (!existsSync(indexPath)) {
  throw new Error("dist-web/index.html was not found. Run npm run web:build before preparing Pages output.");
}

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, ".nojekyll"), "");
await copyFile(indexPath, join(outDir, "404.html"));

console.log("Prepared dist-web for GitHub Pages.");
