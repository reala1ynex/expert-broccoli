import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/features/growops/engines/growOpsEngines.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const engines = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("growops compatibility flags hydroponic method and soil medium mismatch", () => {
  const report = engines.evaluateGrowOpsCompatibility({
    crop: {
      name: "Lettuce",
      daysToMaturity: 35,
      spacingIn: 8,
      rootDepthIn: 6,
      humidityPreference: "moderate",
      compatibleEnvironmentTypes: ["greenhouse"],
      compatibleMethodTypes: ["nft"],
      compatibleMediumIds: ["medium_water"],
      preferredPhRange: [5.8, 6.4],
      preferredEcRange: [0.8, 1.4]
    },
    environment: { name: "Greenhouse", type: "greenhouse", assumptions: { humidityPercent: 82, airflow: "low" } },
    methods: [{ id: "method_nft", name: "NFT", type: "nft", category: "hydroponic", compatibleMediaIds: ["medium_water"] }],
    media: [{ id: "medium_soil", name: "Compost soil", compatibleMethodIds: ["method_soil"], biologicalActivity: "high" }],
    planting: { seedDate: "2026-05-01", terminationDate: "2026-06-15", spacingIn: 5, plantCount: 40, irrigationProfile: { targetPh: [7.2, 7.6], targetEc: [2.2, 2.5] } },
    unit: { name: "Channel 1", capacityPlants: 32, rootDepthIn: 4 },
    seasonEnd: "2026-06-01"
  });
  assert.equal(report.status, "incompatible");
  assert.ok(report.issues.some((issue) => issue.field === "method_medium"));
  assert.ok(report.issues.some((issue) => issue.field === "ph"));
  assert.ok(report.issues.some((issue) => issue.field === "space_capacity"));
});

test("growops diagnostic scores pH lockout and hydroponic oxygen risk", () => {
  const results = engines.scoreGrowOpsDiagnostic({
    symptoms: ["yellowing", "chlorosis", "wilting"],
    affectedParts: ["leaves", "roots"],
    distribution: "new_growth",
    recentActions: ["changed nutrient solution"],
    moisture: "wet",
    ph: 7.4,
    ec: 1.2,
    reservoirTempF: 78,
    dissolvedOxygen: 3.8,
    methodCategories: ["hydroponic"],
    mediumRiskFactors: ["poor aeration"],
    cropName: "Basil",
    cropType: "herb",
    preferredPhRange: [5.8, 6.4],
    preferredEcRange: [1, 1.8]
  });
  assert.equal(results[0].cause, "Hydroponic oxygen deficiency");
  assert.ok(results.some((result) => result.cause === "pH lockout"));
});

test("growops lab calculators return useful local values", () => {
  const gdd = engines.calculateGrowingDegreeDays([{ date: "2026-05-01", minF: 50, maxF: 80 }], 50, 86);
  const vpd = engines.calculateVpdKpa(77, 65);
  const trial = engines.summarizeTrial([10, 11, 9, 10], [12, 13, 12, 11]);
  assert.equal(gdd[0].gdd, 15);
  assert.ok(vpd > 1);
  assert.ok(trial.liftPercent > 15);
  assert.equal(trial.sampleSize, 4);
});
