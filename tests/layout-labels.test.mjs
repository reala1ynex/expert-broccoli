import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/domain/layout.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const layout = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function environment(id, lengthFt, widthFt) {
  return {
    id,
    farmId: "farm_1",
    name: id,
    type: "greenhouse",
    lengthFt,
    widthFt,
    usableAreaSqFt: lengthFt * widthFt,
    layoutNotes: "",
    assumptions: { airflow: "moderate" },
    notes: "",
    photoAssetIds: [],
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z"
  };
}

test("environment layout defaults stay inside the farm canvas", () => {
  const box = layout.getEnvironmentLayout(environment("env_a", 100, 30), 4);
  assert.ok(box.x >= 0 && box.x <= 96);
  assert.ok(box.y >= 0 && box.y <= 96);
  assert.ok(box.width >= 4 && box.width <= 100);
  assert.ok(box.height >= 4 && box.height <= 100);
});

test("environment auto arrange creates one layout per environment", () => {
  const environments = [environment("env_a", 100, 30), environment("env_b", 40, 20), environment("env_c", 20, 10)];
  const boxes = layout.autoArrangeEnvironmentLayouts(environments);
  assert.deepEqual(Object.keys(boxes), ["env_a", "env_b", "env_c"]);
  assert.notEqual(boxes.env_a.x, boxes.env_b.x);
});

test("dimension fitting gives larger environments larger map boxes", () => {
  const boxes = layout.fitEnvironmentLayoutsByDimensions([environment("big", 120, 80), environment("small", 24, 16)]);
  assert.ok(boxes.big.width > boxes.small.width);
  assert.ok(boxes.big.height > boxes.small.height);
});

test("environment usable area is estimated from type and dimensions", () => {
  const field = layout.estimateEnvironmentUsableArea(100, 50, "outdoor_field");
  const greenhouse = layout.estimateEnvironmentUsableArea(100, 50, "greenhouse");
  assert.ok(greenhouse > field);
  assert.equal(layout.estimateEnvironmentUsableArea(0, 50, "greenhouse"), 0);
});

test("unit plant slots use crop spacing when available", () => {
  const unit = { lengthFt: 30, widthFt: 4, unitType: "bed" };
  const loose = layout.estimateUnitPlantSlots(unit, { spacingIn: 18, rowSpacingIn: 24, estimatedYieldBasis: "per_plant" });
  const dense = layout.estimateUnitPlantSlots(unit, { spacingIn: 6, rowSpacingIn: 6, estimatedYieldBasis: "per_plant" });
  assert.ok(dense > loose);
});

test("unit plant slots use method-specific defaults", () => {
  assert.equal(layout.defaultRootDepthIn("tray"), 1);
  assert.ok(layout.estimateUnitPlantSlots({ lengthFt: 10, widthFt: 2, unitType: "channel" }) > 0);
});
