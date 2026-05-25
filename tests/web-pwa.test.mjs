import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

test("web package exposes iPad PWA build scripts", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.version, "0.1.16");
  assert.equal(pkg.scripts["web:build"], "tsc --noEmit && node node_modules/vite/bin/vite.js build --outDir dist-web");
  assert.equal(pkg.scripts["web:pages"], "npm run web:build && node scripts/prepare-pages.mjs");
  assert.match(pkg.scripts["web:preview"], /dist-web/);
});

test("iPad PWA assets are configured", () => {
  const index = readFileSync(join(root, "index.html"), "utf8");
  const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
  const sw = readFileSync(join(root, "public/sw.js"), "utf8");
  const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");

  assert.match(index, /apple-mobile-web-app-capable/);
  assert.match(index, /%BASE_URL%manifest\.webmanifest/);
  assert.match(index, /%BASE_URL%branding\/growops-app-icon\.png/);
  assert.match(viteConfig, /base:\s*process\.env\.VITE_BASE_PATH\s*\?\?\s*"\.\/"/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.short_name, "GrowOps");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.every((icon) => icon.src.startsWith("./")));
  assert.ok(manifest.icons.some((icon) => icon.purpose.includes("maskable")));
  assert.match(sw, /growops-planner-web-v0\.1\.16/);
  assert.match(sw, /self\.addEventListener\("fetch"/);
});

test("GitHub Pages deployment workflow is configured", () => {
  const workflowPath = join(root, ".github/workflows/growops-pages.yml");
  assert.ok(existsSync(workflowPath));

  const workflow = readFileSync(workflowPath, "utf8");
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /npm run web:pages/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path:\s*dist-web/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
