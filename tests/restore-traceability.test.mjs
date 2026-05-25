import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/domain/restore.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const restore = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function snapshot() {
  return {
    localProfiles: [],
    farms: [{ id: "farm_1" }],
    environments: [],
    growingAreas: [],
    bedOrUnits: [],
    crops: [],
    cultivars: [],
    growingMedia: [],
    growingMethods: [],
    plantings: [{ id: "planting_1", farmId: "farm_1" }],
    plantingEvents: [],
    tasks: [{ id: "task_1", farmId: "farm_1" }],
    harvestLogs: [{ id: "harvest_1", farmId: "farm_1" }],
    revenueLogs: [],
    expenseLogs: [],
    supplyItems: [],
    inventoryLots: [],
    seedOrderItems: [],
    diagnosticCases: [{ id: "diag_1", farmId: "farm_1" }],
    diagnosticObservations: [],
    diagnosticResults: [],
    recommendations: [],
    sensorReadings: [],
    photoAssets: [],
    backupRecords: [],
    collaborationEvents: [],
    appSettings: { id: "settings", activeFarmId: "farm_1", profileId: "profile_1", theme: "light", dataVersion: 1, onboardingComplete: true, appVersion: "0.1.16", restorePoints: [{ id: "old" }] }
  };
}

test("restore point summarizes the active farm snapshot", () => {
  const point = restore.createRestorePoint(snapshot(), "Planting deleted");
  assert.match(point.id, /^restore_/);
  assert.equal(point.message, "Planting deleted");
  assert.equal(point.summary, "1 farms / 1 plantings / 1 tasks / 1 harvests / 1 diagnostics");
});

test("restore point strips prior restore history from nested snapshot", () => {
  const point = restore.createRestorePoint(snapshot(), "Fresh start created");
  const parsed = JSON.parse(point.snapshotJson);
  assert.deepEqual(parsed.appSettings.restorePoints, []);
});
