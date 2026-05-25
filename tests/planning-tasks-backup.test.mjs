import test from "node:test";
import assert from "node:assert/strict";

function addDaysIso(dateIso, days) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function planDates(crop, startDate, startMethod) {
  const transplantDelay = startMethod === "indoor_start" || startMethod === "hydroponic_transplant" ? crop.transplantTimingDays : 0;
  const transplantDate = transplantDelay > 0 ? addDaysIso(startDate, transplantDelay) : undefined;
  const firstHarvestDate = addDaysIso(transplantDate ?? startDate, crop.daysToMaturity);
  const harvestWindowDays = crop.cropType === "fruiting" ? 35 : crop.cropType === "microgreen" ? 5 : 18;
  return { seedDate: startDate, transplantDate, firstHarvestDate, harvestWindowDays, terminationDate: addDaysIso(firstHarvestDate, harvestWindowDays) };
}

function generateTasks(planting, methodCategories) {
  const tasks = ["Order seed", "Prepare bed or unit", "Sow crop", "Check germination", "Irrigation check", "Pest scouting", "Disease scouting", "Harvest crop", "Terminate crop"];
  if (methodCategories.includes("hydroponic")) tasks.push("pH check", "EC check", "Reservoir change");
  return tasks.map((title) => ({ title: `${title}: ${planting.name}` }));
}

function validateBackup(input) {
  const requiredArrays = ["farms", "crops", "plantings", "tasks", "harvestLogs", "diagnosticCases"];
  const output = { ...input };
  for (const key of requiredArrays) output[key] = Array.isArray(input[key]) ? input[key] : [];
  if (!input.appSettings || input.appSettings.id !== "settings") throw new Error("Invalid appSettings");
  return output;
}

test("date planner calculates transplant and harvest dates", () => {
  const dates = planDates({ daysToMaturity: 70, transplantTimingDays: 35, cropType: "fruiting" }, "2026-03-01", "indoor_start");
  assert.equal(dates.transplantDate, "2026-04-05");
  assert.equal(dates.firstHarvestDate, "2026-06-14");
  assert.equal(dates.terminationDate, "2026-07-19");
});

test("task generation adds hydroponic monitoring tasks", () => {
  const tasks = generateTasks({ name: "NFT Lettuce" }, ["hydroponic"]);
  assert.ok(tasks.some((task) => task.title.startsWith("pH check")));
  assert.ok(tasks.some((task) => task.title.startsWith("EC check")));
  assert.ok(tasks.some((task) => task.title.startsWith("Reservoir change")));
});

test("backup validation restores missing arrays and rejects bad settings", () => {
  const backup = validateBackup({ appSettings: { id: "settings", growOps: { trials: [{ id: "lab_trial_1" }] } }, farms: [{ id: "farm_1" }] });
  assert.deepEqual(backup.crops, []);
  assert.deepEqual(backup.farms, [{ id: "farm_1" }]);
  assert.deepEqual(backup.appSettings.growOps.trials, [{ id: "lab_trial_1" }]);
  assert.throws(() => validateBackup({ appSettings: { id: "bad" } }));
});
