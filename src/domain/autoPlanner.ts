import { addDaysIso, daysBetween, id } from "../lib/utils";
import { checkCompatibility } from "./compatibility";
import { overlaps, planDates } from "./datePlanning";
import { estimateUnitPlantSlots } from "./layout";
import type { AppData, BedOrUnit, Crop, Environment, Farm, GrowingMedium, GrowingMethod, ID, InventoryLot, Planting, StartMethod } from "./types";

export interface SeedBackedCrop {
  cropId: ID;
  cropName: string;
  sources: string[];
  lotIds: ID[];
  seedOrderIds: ID[];
}

export interface AutoPlanOptions {
  selectedCropIds: ID[];
  seedDate: string;
  maxPlantings: number;
  goal?: "balanced" | "revenue" | "food" | "quick" | "trials";
}

export interface AutoPlanCandidate {
  planting: Planting;
  crop: Crop;
  environment: Environment;
  bedOrUnit: BedOrUnit;
  methodNames: string[];
  mediumNames: string[];
  compatibilityScore: number;
  score: number;
  reason: string;
  seedSources: string[];
  sourceLotIds: ID[];
  sourceSeedOrderIds: ID[];
  seedNeed: number;
  seedAvailable: number;
  seedCoverage: "enough" | "partial" | "ordered";
}

export interface AutoPlanResult {
  seedBackedCrops: SeedBackedCrop[];
  candidates: AutoPlanCandidate[];
  skipped: string[];
}

export interface SeedReservation {
  plantingId: ID;
  cropId: ID;
  lotId?: ID;
  lotName?: string;
  quantityReserved: number;
  unit: string;
  note: string;
}

interface SeedSourceBucket {
  sources: Set<string>;
  lotIds: Set<ID>;
  seedOrderIds: Set<ID>;
}

export function getSeedBackedCrops(data: AppData, farmId: ID): SeedBackedCrop[] {
  const sourceMap = new Map<ID, SeedSourceBucket>();
  const crops = data.crops.filter((crop) => !crop.archived);

  data.seedOrderItems
    .filter((item) => item.farmId === farmId && item.ordered)
    .forEach((item) => {
      const crop = crops.find((candidate) => candidate.id === item.cropId);
      if (!crop) return;
      addSeedSource(sourceMap, crop.id, `Ordered seed: ${item.seedName || crop.name}`, { seedOrderId: item.id });
    });

  data.inventoryLots
    .filter((lot) => lot.farmId === farmId && lot.itemType === "seed" && availableLotQuantity(lot) > 0)
    .forEach((lot) => {
      const linkedCrop = lot.cropId ? crops.find((crop) => crop.id === lot.cropId) : undefined;
      if (linkedCrop) {
        addSeedSource(sourceMap, linkedCrop.id, `Inventory: ${lot.name} (${availableLotQuantity(lot)} ${lot.unit} available)`, { lotId: lot.id });
        return;
      }
      const text = `${lot.name} ${lot.lotCode} ${lot.vendor} ${lot.notes}`;
      crops
        .filter((crop) => cropMatchesSeedText(crop, text))
        .forEach((crop) => addSeedSource(sourceMap, crop.id, `Inventory: ${lot.name} (${availableLotQuantity(lot)} ${lot.unit} available)`, { lotId: lot.id }));
    });

  return crops
    .filter((crop) => sourceMap.has(crop.id))
    .map((crop) => {
      const source = sourceMap.get(crop.id);
      return {
        cropId: crop.id,
        cropName: crop.name,
        sources: [...(source?.sources ?? [])],
        lotIds: [...(source?.lotIds ?? [])],
        seedOrderIds: [...(source?.seedOrderIds ?? [])]
      };
    })
    .sort((a, b) => a.cropName.localeCompare(b.cropName));
}

export function buildAutoPlantingPlan(data: AppData, farm: Farm, options: AutoPlanOptions): AutoPlanResult {
  const seedBackedCrops = getSeedBackedCrops(data, farm.id);
  const seedBackedById = new Map(seedBackedCrops.map((item) => [item.cropId, item]));
  const selectedIds = new Set(options.selectedCropIds.length ? options.selectedCropIds : seedBackedCrops.map((item) => item.cropId));
  const crops = data.crops.filter((crop) => selectedIds.has(crop.id) && seedBackedById.has(crop.id) && !crop.archived);
  const units = data.bedOrUnits.filter((unit) => unit.farmId === farm.id);
  const rawCandidates: AutoPlanCandidate[] = [];
  const skipped: string[] = [];

  crops.forEach((crop) => {
    const cropCandidates = units
      .map((unit) => {
        const seedSource = seedBackedById.get(crop.id);
        return buildCandidate(data, farm, crop, unit, options.seedDate, seedSource?.sources ?? [], seedSource?.lotIds ?? [], seedSource?.seedOrderIds ?? []);
      })
      .filter((candidate): candidate is AutoPlanCandidate => Boolean(candidate))
      .sort((a, b) => b.score - a.score);
    if (!cropCandidates.length) skipped.push(`${crop.name}: no compatible open unit found for the selected date window.`);
    rawCandidates.push(...cropCandidates);
  });

  const maxPlantings = Math.max(1, options.maxPlantings || 1);
  const maxPerCrop = options.goal === "trials" ? 1 : Math.max(1, Math.ceil(maxPlantings / Math.max(1, crops.length)));
  const usedUnits = new Set<ID>();
  const cropUse = new Map<ID, number>();
  const candidates: AutoPlanCandidate[] = [];

  rawCandidates
    .sort((a, b) => scoreForGoal(b, options.goal) - scoreForGoal(a, options.goal))
    .forEach((candidate) => {
      if (candidates.length >= maxPlantings) return;
      if (usedUnits.has(candidate.bedOrUnit.id)) return;
      const currentCropCount = cropUse.get(candidate.crop.id) ?? 0;
      if (currentCropCount >= maxPerCrop) return;
      usedUnits.add(candidate.bedOrUnit.id);
      cropUse.set(candidate.crop.id, currentCropCount + 1);
      candidates.push(candidate);
    });

  if (!candidates.length && crops.length) {
    skipped.push("No plan was generated. Add open growing units, seed inventory, or broader crop/environment compatibility.");
  }

  return { seedBackedCrops, candidates, skipped };
}

export function reserveSeedInventoryForCandidates(data: AppData, candidates: AutoPlanCandidate[]): { inventoryLots: InventoryLot[]; reservations: SeedReservation[] } {
  const reservations: SeedReservation[] = [];
  const lots = data.inventoryLots.map((lot) => ({ ...lot }));

  candidates.forEach((candidate) => {
    const neededSeeds = candidate.seedNeed;
    const matchedLots = lots
      .filter((lot) => lot.farmId === candidate.planting.farmId && lot.itemType === "seed" && availableLotQuantity(lot) > 0 && lotMatchesCrop(lot, candidate.crop))
      .sort((a, b) => lotPriority(candidate, a) - lotPriority(candidate, b) || (a.expirationDate ?? "9999-12-31").localeCompare(b.expirationDate ?? "9999-12-31"));

    if (!matchedLots.length) {
      reservations.push({
        plantingId: candidate.planting.id,
        cropId: candidate.crop.id,
        quantityReserved: 0,
        unit: "seed",
        note: `No inventory lot was deducted for ${candidate.crop.name}; seed may be covered by an ordered seed row.`
      });
      return;
    }

    const lot = matchedLots[0];
    const deduction = seedDeductionForLot(lot, neededSeeds);
    if (deduction <= 0) {
      reservations.push({
        plantingId: candidate.planting.id,
        cropId: candidate.crop.id,
        lotId: lot.id,
        lotName: lot.name,
        quantityReserved: 0,
        unit: lot.unit,
        note: `Matched ${lot.name}, but ${lot.unit} cannot be safely converted to seed count. Inventory quantity was left unchanged.`
      });
      return;
    }

    lot.reservedQuantity = Math.min(lot.quantityOnHand, Math.round(((lot.reservedQuantity ?? 0) + deduction) * 1000) / 1000);
    lot.updatedAt = new Date().toISOString();
    reservations.push({
      plantingId: candidate.planting.id,
      cropId: candidate.crop.id,
      lotId: lot.id,
      lotName: lot.name,
      quantityReserved: deduction,
      unit: lot.unit,
      note: `Reserved ${deduction} ${lot.unit} from ${lot.name}.`
    });
  });

  return { inventoryLots: lots, reservations };
}

function buildCandidate(data: AppData, farm: Farm, crop: Crop, unit: BedOrUnit, requestedSeedDate: string, seedSources: string[], sourceLotIds: ID[], sourceSeedOrderIds: ID[]): AutoPlanCandidate | null {
  const environment = data.environments.find((item) => item.id === unit.environmentId);
  if (!environment) return null;

  const methods = selectMethods(data, crop, unit, environment);
  if (!methods.length) return null;
  const media = selectMedia(data, crop, methods);
  if (!media.length) return null;

  const startMethod = chooseStartMethod(crop, methods, unit);
  const seedDate = nextAvailableSeedDate(data, unit.id, crop, requestedSeedDate, startMethod);
  const dates = planDates(crop, seedDate, startMethod);
  const areaSqFt = Math.max(1, Math.round(unit.lengthFt * unit.widthFt * 10) / 10);
  const estimatedSlots = estimateUnitPlantSlots(unit, crop);
  const plantCount = Math.max(1, Math.min(nonZero(unit.capacityPlants, estimatedSlots, 1), nonZero(estimatedSlots, unit.capacityPlants, 1)));
  const expectedYield = estimateExpectedYield(crop, plantCount, areaSqFt);
  const expectedRevenue = Math.round(expectedYield * crop.estimatedPricePerUnit * 100) / 100;
  const seedNeed = estimateNeededSeeds(crop, plantCount, data.inventoryLots.filter((lot) => lotMatchesCrop(lot, crop)));
  const seedAvailable = estimateAvailableSeeds(data.inventoryLots.filter((lot) => lot.farmId === farm.id && lot.itemType === "seed" && lotMatchesCrop(lot, crop)));
  const seedCoverage = seedAvailable >= seedNeed ? "enough" : sourceSeedOrderIds.length ? "ordered" : "partial";
  const timestamp = new Date().toISOString();

  const planting: Planting = {
    id: id("planting"),
    farmId: farm.id,
    cropId: crop.id,
    name: `${crop.name} ${unit.name} Auto Plan`,
    startMethod,
    environmentId: environment.id,
    bedOrUnitId: unit.id,
    growingMethodIds: methods.map((method) => method.id),
    mediumIds: media.map((medium) => medium.id),
    seedDate: dates.seedDate,
    transplantDate: dates.transplantDate,
    firstHarvestDate: dates.firstHarvestDate,
    harvestWindowDays: dates.harvestWindowDays,
    terminationDate: dates.terminationDate,
    successionIndex: 1,
    plantCount,
    areaSqFt,
    spacingIn: crop.spacingIn,
    expectedYield,
    expectedRevenue,
    laborHoursEstimate: estimateLaborHours(crop, plantCount, areaSqFt),
    irrigationProfile: {
      mode: methods.some((method) => method.category === "hydroponic") ? "recirculating" : methods.some((method) => method.type === "drip_irrigation") ? "drip" : "manual check",
      frequency: methods.some((method) => method.category === "hydroponic") ? "daily reservoir check" : "daily check",
      fertigation: methods.some((method) => method.category === "hydroponic" || method.type === "drip_irrigation"),
      targetPh: crop.preferredPhRange,
      targetEc: crop.preferredEcRange
    },
    status: "planned",
    notes: `Auto-filled from seed availability. Sources: ${seedSources.join("; ") || "seed record"}. Review before sowing.`,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const report = checkCompatibility({ farm, crop, environment, bedOrUnit: unit, methods, media, planting });
  if (report.status === "incompatible") return null;

  const revenueDensity = expectedRevenue / Math.max(1, areaSqFt);
  const seasonPenalty = Math.max(0, daysBetween(requestedSeedDate, seedDate) / 7);
  const seedPenalty = seedCoverage === "partial" ? 18 : seedCoverage === "ordered" ? 6 : 0;
  const score =
    report.score +
    Math.min(22, revenueDensity * 1.8) +
    (crop.compatibleEnvironmentTypes.includes(environment.type) ? 8 : 0) +
    (unit.rootDepthIn >= crop.rootDepthIn ? 5 : 0) -
    seasonPenalty -
    seedPenalty;

  return {
    planting,
    crop,
    environment,
    bedOrUnit: unit,
    methodNames: methods.map((method) => method.name),
    mediumNames: media.map((medium) => medium.name),
    compatibilityScore: report.score,
    score: Math.round(score * 10) / 10,
    reason: `Best fit by compatibility ${report.score}/100, ${plantCount} planned slots, ${Math.round(revenueDensity * 100) / 100} projected revenue per sq ft, ${seedCoverage} seed coverage.`,
    seedSources,
    sourceLotIds,
    sourceSeedOrderIds,
    seedNeed,
    seedAvailable,
    seedCoverage
  };
}

function selectMethods(data: AppData, crop: Crop, unit: BedOrUnit, environment: Environment): GrowingMethod[] {
  const preferences = methodPreference(unit, crop, environment);
  const selected: GrowingMethod[] = [];
  preferences.forEach((type) => {
    const method = data.growingMethods.find((item) => item.type === type && crop.compatibleMethodTypes.includes(item.type));
    if (method && !selected.some((item) => item.id === method.id)) selected.push(method);
  });
  if (!selected.length) {
    const fallback = data.growingMethods.find((method) => crop.compatibleMethodTypes.includes(method.type));
    if (fallback) selected.push(fallback);
  }
  return selected.slice(0, 2);
}

function methodPreference(unit: BedOrUnit, crop: Crop, environment: Environment): GrowingMethod["type"][] {
  if (crop.cropType === "microgreen" || unit.unitType === "tray") return ["microgreens_trays", "seed_trays"];
  if (unit.unitType === "channel") return ["nft", "hydroponic_dwc", "vertical_tower"];
  if (unit.unitType === "reservoir") return ["hydroponic_dwc", "ebb_and_flow"];
  if (unit.unitType === "rack_level") return ["vertical_tower", "ebb_and_flow", "microgreens_trays"];
  if (unit.unitType === "container") return ["containers_pots_grow_bags", "drip_irrigation", "wick_system"];
  if (environment.type === "greenhouse" || environment.type === "high_tunnel") {
    return crop.cropType === "fruiting" ? ["raised_beds", "drip_irrigation", "dutch_bucket"] : ["raised_beds", "drip_irrigation"];
  }
  return ["raised_beds", "direct_in_ground_soil", "drip_irrigation"];
}

function selectMedia(data: AppData, crop: Crop, methods: GrowingMethod[]): GrowingMedium[] {
  const preferred = ["medium_amended_soil", "medium_loam", "medium_potting_mix", "medium_coco", "medium_rockwool", "medium_water_culture", "medium_seed_starting"];
  const compatible = data.growingMedia.filter((medium) =>
    crop.compatibleMediumIds.includes(medium.id) &&
    methods.every((method) => method.compatibleMediaIds.includes(medium.id) && medium.compatibleMethodIds.includes(method.id))
  );
  const selected = compatible.sort((a, b) => preferredIndex(preferred, a.id) - preferredIndex(preferred, b.id))[0];
  if (selected) return [selected];

  const fallback = data.growingMedia.find((medium) => methods[0]?.compatibleMediaIds.includes(medium.id));
  return fallback ? [fallback] : [];
}

function chooseStartMethod(crop: Crop, methods: GrowingMethod[], unit: BedOrUnit): StartMethod {
  if (crop.cropType === "microgreen" || unit.unitType === "tray") return "microgreen_sowing";
  if (methods.some((method) => method.category === "hydroponic" || method.category === "vertical")) return "hydroponic_transplant";
  if (crop.transplantTimingDays > 0) return "indoor_start";
  return "direct_seed";
}

function nextAvailableSeedDate(data: AppData, unitId: ID, crop: Crop, requestedSeedDate: string, startMethod: StartMethod) {
  let seedDate = requestedSeedDate;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dates = planDates(crop, seedDate, startMethod);
    const conflict = data.plantings
      .filter((planting) => planting.bedOrUnitId === unitId && planting.status !== "finished")
      .find((planting) => overlaps(seedDate, dates.terminationDate, planting.seedDate, planting.terminationDate));
    if (!conflict) return seedDate;
    seedDate = addDaysIso(conflict.terminationDate, 1);
  }
  return seedDate;
}

function estimateExpectedYield(crop: Crop, plantCount: number, areaSqFt: number) {
  if (crop.estimatedYieldBasis === "per_sqft") return Math.round(crop.estimatedYield * areaSqFt * 100) / 100;
  return Math.round(crop.estimatedYield * plantCount * 100) / 100;
}

function estimateLaborHours(crop: Crop, plantCount: number, areaSqFt: number) {
  const cropFactor = crop.cropType === "fruiting" ? 0.045 : crop.cropType === "microgreen" ? 0.025 : 0.03;
  return Math.round(Math.max(0.5, plantCount * cropFactor + areaSqFt * 0.008) * 10) / 10;
}

function cropMatchesSeedText(crop: Crop, text: string) {
  const haystack = normalizeText(text);
  const cropName = normalizeText(crop.name);
  if (haystack.includes(cropName) || cropName.includes(haystack)) return true;
  const tokens = cropName.split(" ").filter((token) => token.length >= 4 && token !== "mix");
  return tokens.some((token) => haystack.split(" ").includes(token));
}

function addSeedSource(map: Map<ID, SeedSourceBucket>, cropId: ID, source: string, ids: { lotId?: ID; seedOrderId?: ID } = {}) {
  if (!map.has(cropId)) map.set(cropId, { sources: new Set(), lotIds: new Set(), seedOrderIds: new Set() });
  const bucket = map.get(cropId);
  bucket?.sources.add(source);
  if (ids.lotId) bucket?.lotIds.add(ids.lotId);
  if (ids.seedOrderId) bucket?.seedOrderIds.add(ids.seedOrderId);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function preferredIndex(preferred: string[], value: string) {
  const index = preferred.indexOf(value);
  return index === -1 ? preferred.length : index;
}

function nonZero(...values: number[]) {
  return values.find((value) => Number.isFinite(value) && value > 0) ?? 1;
}

function lotMatchesCrop(lot: InventoryLot, crop: Crop) {
  return lot.cropId === crop.id || (!lot.cropId && cropMatchesSeedText(crop, `${lot.name} ${lot.lotCode} ${lot.vendor} ${lot.notes}`));
}

function lotPriority(candidate: AutoPlanCandidate, lot: InventoryLot) {
  if (candidate.sourceLotIds.includes(lot.id)) return 0;
  if (lot.cropId === candidate.crop.id) return 1;
  return 2;
}

function seedDeductionForLot(lot: InventoryLot, neededSeeds: number) {
  const unit = normalizeText(lot.unit);
  const availableQuantity = availableLotQuantity(lot);
  if (lot.seedsPerUnit && lot.seedsPerUnit > 0) return Math.min(availableQuantity, Math.ceil((neededSeeds / lot.seedsPerUnit) * 1000) / 1000);
  if (["seed", "seeds", "each", "count", "ct"].includes(unit)) return Math.min(availableQuantity, neededSeeds);
  if (["packet", "packets", "pkt", "pkts", "pack"].includes(unit)) return Math.min(availableQuantity, 1);
  return 0;
}

function estimateNeededSeeds(crop: Crop, plantCount: number, lots: InventoryLot[]) {
  const bestGermination = lots.reduce((best, lot) => Math.max(best, lot.germinationRatePercent ?? 0), 0);
  const germination = bestGermination ? bestGermination / 100 : 0.85;
  const buffer = crop.cropType === "microgreen" ? 1.05 : 1.15;
  return Math.ceil((plantCount * buffer) / Math.max(0.5, germination));
}

function estimateAvailableSeeds(lots: InventoryLot[]) {
  return Math.floor(
    lots.reduce((sum, lot) => {
      const available = availableLotQuantity(lot);
      if (lot.seedsPerUnit && lot.seedsPerUnit > 0) return sum + available * lot.seedsPerUnit;
      const unit = normalizeText(lot.unit);
      if (["seed", "seeds", "each", "count", "ct"].includes(unit)) return sum + available;
      return sum;
    }, 0)
  );
}

function availableLotQuantity(lot: InventoryLot) {
  return Math.max(0, Math.round((lot.quantityOnHand - (lot.reservedQuantity ?? 0)) * 1000) / 1000);
}

function scoreForGoal(candidate: AutoPlanCandidate, goal: AutoPlanOptions["goal"] = "balanced") {
  if (goal === "revenue") return candidate.score + candidate.planting.expectedRevenue / Math.max(1, candidate.planting.areaSqFt);
  if (goal === "quick") return candidate.score + Math.max(0, 90 - candidate.crop.daysToMaturity) / 3;
  if (goal === "food") return candidate.score + (candidate.crop.cropType === "leafy" || candidate.crop.cropType === "root" ? 8 : 2);
  if (goal === "trials") return candidate.score + candidate.compatibilityScore / 20;
  return candidate.score;
}
