import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tempRoot = join(tmpdir(), `growops-auto-planner-${Date.now()}`);
const files = [
  "src/lib/utils.ts",
  "src/domain/datePlanning.ts",
  "src/domain/layout.ts",
  "src/domain/compatibility.ts",
  "src/domain/autoPlanner.ts"
];

mkdirSync(tempRoot, { recursive: true });
writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ type: "module" }));
for (const file of files) {
  const source = readFileSync(join(root, file), "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  output = output.replace(/from "(\.{1,2}\/[^"]+)"/g, (_match, specifier) => `from "${specifier}.js"`);
  if (file.endsWith("src/lib/utils.ts")) {
    output = output
      .replace('import { clsx } from "clsx";\n', "const clsx = (...inputs) => inputs.flat(Infinity).filter(Boolean).join(' ');\n")
      .replace('import { twMerge } from "tailwind-merge";\n', "const twMerge = (value) => value;\n");
  }
  const outputPath = join(tempRoot, file.replace(/\.ts$/, ".js"));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
}

const planner = await import(`file:///${join(tempRoot, "src/domain/autoPlanner.js").replace(/\\/g, "/")}`);

const farm = {
  id: "farm_1",
  name: "Test Farm",
  location: "Local",
  climateZone: "7a",
  firstFrostDate: "2026-11-01",
  lastFrostDate: "2026-04-01",
  seasonStart: "2026-03-15",
  seasonEnd: "2026-11-15",
  currency: "USD",
  measurementUnits: "imperial",
  productionStyleTags: [],
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const lettuce = crop("crop_lettuce", "Lettuce", "leafy", ["outdoor_field", "indoor_grow_room"], ["raised_beds", "nft"], ["medium_amended_soil", "medium_water_culture"], 30, 8, 12, 6, 1.2, "per_plant", 2.5);
const tomato = crop("crop_tomato", "Tomato", "fruiting", ["greenhouse", "high_tunnel"], ["raised_beds", "drip_irrigation"], ["medium_amended_soil"], 70, 18, 24, 14, 8, "per_plant", 3);
const radish = crop("crop_radish", "Radish", "root", ["outdoor_field"], ["raised_beds"], ["medium_amended_soil"], 24, 3, 6, 8, 0.2, "per_plant", 1.5);

const data = {
  farms: [farm],
  crops: [lettuce, tomato, radish],
  environments: [
    environment("env_field", "Main Field", "outdoor_field"),
    environment("env_tunnel", "Tunnel", "high_tunnel"),
    environment("env_hydro", "Indoor Rack", "indoor_grow_room")
  ],
  bedOrUnits: [
    unit("unit_bed", "Field Bed 1", "env_field", "bed", 40, 4, 160, 12),
    unit("unit_tunnel", "Tunnel Bed", "env_tunnel", "bed", 60, 3, 40, 16),
    unit("unit_nft", "NFT Channel", "env_hydro", "channel", 12, 2, 72, 4)
  ],
  growingMethods: [
    method("method_raised_bed", "raised_beds", "Raised Beds", "soil", ["medium_amended_soil"]),
    method("method_drip", "drip_irrigation", "Drip Irrigation", "container", ["medium_amended_soil"]),
    method("method_nft", "nft", "NFT Channels", "hydroponic", ["medium_water_culture"])
  ],
  growingMedia: [
    medium("medium_amended_soil", "Amended Garden Soil", ["method_raised_bed", "method_drip"], "high"),
    medium("medium_water_culture", "Hydroponic Water Culture", ["method_nft"], "low")
  ],
  plantings: [],
  inventoryLots: [
    { id: "lot_lettuce", farmId: "farm_1", cropId: "crop_lettuce", itemType: "seed", name: "Spring packet", lotCode: "LET", vendor: "", quantityOnHand: 500, reservedQuantity: 0, unit: "seeds", germinationRatePercent: 90, unitCost: 0.02, storageLocation: "", receivedDate: "2026-01-01", notes: "", createdAt: "", updatedAt: "" }
  ],
  seedOrderItems: [
    { id: "seed_tomato", farmId: "farm_1", cropId: "crop_tomato", seedName: "Tomato seed", quantityNeeded: 1, unit: "packet", estimatedCost: 4, ordered: true, notes: "" },
    { id: "seed_radish", farmId: "farm_1", cropId: "crop_radish", seedName: "Radish seed", quantityNeeded: 1, unit: "packet", estimatedCost: 4, ordered: false, notes: "" }
  ]
};

test("seed-backed crops come from seed inventory and ordered seed rows only", () => {
  const backed = planner.getSeedBackedCrops(data, "farm_1").map((item) => item.cropId).sort();
  assert.deepEqual(backed, ["crop_lettuce", "crop_tomato"]);
});

test("auto planner chooses compatible open units for selected seed-backed crops", () => {
  const plan = planner.buildAutoPlantingPlan(data, farm, { selectedCropIds: ["crop_lettuce", "crop_tomato"], seedDate: "2026-05-01", maxPlantings: 3 });
  assert.equal(plan.candidates.length, 3);
  assert.equal(new Set(plan.candidates.map((item) => item.bedOrUnit.id)).size, plan.candidates.length);
  assert.ok(plan.candidates.every((item) => item.compatibilityScore >= 60));
  assert.deepEqual([...new Set(plan.candidates.map((item) => item.crop.id))].sort(), ["crop_lettuce", "crop_tomato"]);
  assert.ok(plan.candidates.some((item) => item.crop.id === "crop_tomato" && item.environment.type === "high_tunnel"));
});

test("auto planner moves a candidate after an occupied unit window", () => {
  const occupied = {
    ...data,
    plantings: [
      {
        id: "planting_busy",
        farmId: "farm_1",
        cropId: "crop_tomato",
        name: "Busy tomato",
        startMethod: "indoor_start",
        environmentId: "env_tunnel",
        bedOrUnitId: "unit_tunnel",
        growingMethodIds: ["method_raised_bed"],
        mediumIds: ["medium_amended_soil"],
        seedDate: "2026-04-01",
        firstHarvestDate: "2026-06-10",
        harvestWindowDays: 30,
        terminationDate: "2026-07-10",
        successionIndex: 1,
        plantCount: 30,
        areaSqFt: 180,
        spacingIn: 18,
        expectedYield: 240,
        expectedRevenue: 720,
        laborHoursEstimate: 4,
        irrigationProfile: { mode: "drip", frequency: "daily", fertigation: true },
        status: "active",
        notes: "",
        createdAt: "",
        updatedAt: ""
      }
    ]
  };
  const plan = planner.buildAutoPlantingPlan(occupied, farm, { selectedCropIds: ["crop_tomato"], seedDate: "2026-05-01", maxPlantings: 1 });
  assert.equal(plan.candidates[0].planting.seedDate, "2026-07-11");
});

test("seed reservation reserves linked seed lots when units are countable", () => {
  const plan = planner.buildAutoPlantingPlan(data, farm, { selectedCropIds: ["crop_lettuce"], seedDate: "2026-05-01", maxPlantings: 1 });
  const reservation = planner.reserveSeedInventoryForCandidates(data, plan.candidates);
  const lot = reservation.inventoryLots.find((item) => item.id === "lot_lettuce");
  assert.equal(reservation.reservations[0].lotId, "lot_lettuce");
  assert.equal(lot.quantityOnHand, 500);
  assert.equal(lot.reservedQuantity, 205);
});

test("seed reservation uses seeds per unit for packet or weight lots", () => {
  const weighted = {
    ...data,
    inventoryLots: [
      { ...data.inventoryLots[0], quantityOnHand: 0.5, reservedQuantity: 0, unit: "oz", seedsPerUnit: 400, germinationRatePercent: 80 }
    ],
    seedOrderItems: []
  };
  const plan = planner.buildAutoPlantingPlan(weighted, farm, { selectedCropIds: ["crop_lettuce"], seedDate: "2026-05-01", maxPlantings: 1 });
  const reservation = planner.reserveSeedInventoryForCandidates(weighted, plan.candidates);
  const lot = reservation.inventoryLots.find((item) => item.id === "lot_lettuce");
  assert.equal(lot.quantityOnHand, 0.5);
  assert.equal(lot.reservedQuantity, 0.5);
});

function crop(id, name, cropType, environments, methods, media, daysToMaturity, spacingIn, rowSpacingIn, rootDepthIn, estimatedYield, estimatedYieldBasis, estimatedPricePerUnit) {
  return {
    id,
    name,
    cropType,
    daysToMaturity,
    germinationTempRangeF: [50, 85],
    transplantTimingDays: cropType === "fruiting" ? 28 : 0,
    spacingIn,
    rowSpacingIn,
    rootDepthIn,
    successionIntervalDays: 14,
    preferredPhRange: [6, 7],
    temperatureRangeF: [50, 86],
    humidityPreference: "moderate",
    lightPreference: "full",
    compatibleEnvironmentTypes: environments,
    compatibleMethodTypes: methods,
    compatibleMediumIds: media,
    commonProblems: [],
    harvestUnit: "unit",
    estimatedYield,
    estimatedYieldBasis,
    estimatedPricePerUnit,
    notes: "",
    archived: false,
    builtin: true,
    createdAt: "",
    updatedAt: ""
  };
}

function environment(id, name, type) {
  return {
    id,
    farmId: "farm_1",
    name,
    type,
    lengthFt: 40,
    widthFt: 20,
    usableAreaSqFt: 700,
    layoutNotes: "",
    assumptions: { lowTempF: 50, highTempF: 82, humidityPercent: 65, lightHours: 12, airflow: "moderate", seasonExtensionDays: 0 },
    notes: "",
    photoAssetIds: [],
    createdAt: "",
    updatedAt: ""
  };
}

function unit(id, name, environmentId, unitType, lengthFt, widthFt, capacityPlants, rootDepthIn) {
  return {
    id,
    farmId: "farm_1",
    environmentId,
    growingAreaId: "area_1",
    name,
    unitType,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    lengthFt,
    widthFt,
    capacityPlants,
    rootDepthIn,
    notes: "",
    createdAt: "",
    updatedAt: ""
  };
}

function method(id, type, name, category, compatibleMediaIds) {
  return { id, type, name, category, compatibleMediaIds, irrigationModes: [], rootDepthMinIn: 1, notes: "" };
}

function medium(id, name, compatibleMethodIds, biologicalActivity) {
  return {
    id,
    name,
    waterRetention: 3,
    drainage: 3,
    phBehavior: "",
    ecBehavior: "",
    biologicalActivity,
    reusable: true,
    compatibleMethodIds,
    cropCompatibilityNotes: "",
    diagnosticRiskFactors: []
  };
}
