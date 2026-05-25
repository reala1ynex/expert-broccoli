import test from "node:test";
import assert from "node:assert/strict";

function scoreBlossomEndRot(input) {
  let points = 0;
  const evidence = [];
  if (input.symptoms.toLowerCase().includes("blossom end") || input.symptoms.toLowerCase().includes("sunken end")) {
    points += 6;
    evidence.push("fruit symptom");
  }
  if (["tomato", "pepper", "eggplant"].includes(input.crop.toLowerCase())) {
    points += 2;
    evidence.push("susceptible crop");
  }
  if (input.moisture === "dry" || input.moisture === "saturated") {
    points += 2;
    evidence.push("moisture instability");
  }
  return { cause: "Blossom end rot", confidence: Math.min(0.95, points / 10), evidence };
}

function scoreHydroOxygen(input) {
  let points = 0;
  if (input.method === "hydroponic" ) points += 2;
  if (input.dissolvedOxygen < 5) points += 5;
  if (input.reservoirTempF > 72) points += 2;
  return { cause: "Hydroponic oxygen deficiency", confidence: Math.min(0.95, points / 9) };
}

test("diagnostic scoring ranks blossom end rot from fruit symptoms and moisture swings", () => {
  const result = scoreBlossomEndRot({
    crop: "Tomato",
    symptoms: "Fruit has dark sunken end lesions near blossom end",
    moisture: "dry"
  });
  assert.equal(result.cause, "Blossom end rot");
  assert.ok(result.confidence >= 0.9);
  assert.deepEqual(result.evidence, ["fruit symptom", "susceptible crop", "moisture instability"]);
});

test("diagnostic scoring detects hydroponic oxygen risk", () => {
  const result = scoreHydroOxygen({ method: "hydroponic", dissolvedOxygen: 3.8, reservoirTempF: 75 });
  assert.equal(result.cause, "Hydroponic oxygen deficiency");
  assert.ok(result.confidence >= 0.9);
});
