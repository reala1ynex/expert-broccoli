import { z } from "zod";
import type { AppData } from "./types";

export const nonEmptyString = z.string().trim().min(1, "Required");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const positiveNumber = z.coerce.number().finite().nonnegative();
const optionalNumber = z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().optional());

export const farmSchema = z.object({
  name: nonEmptyString,
  location: z.string().trim().default(""),
  climateZone: z.string().trim().default(""),
  firstFrostDate: isoDate,
  lastFrostDate: isoDate,
  seasonStart: isoDate,
  seasonEnd: isoDate,
  currency: z.string().trim().min(3).max(3).default("USD"),
  measurementUnits: z.enum(["imperial", "metric"]),
  productionStyleTags: z.array(z.string()).default([]),
  notes: z.string().default("")
});

export const cropSchema = z.object({
  name: nonEmptyString,
  cultivar: z.string().optional(),
  cropType: z.enum(["fruiting", "leafy", "root", "legume", "herb", "microgreen"]),
  daysToMaturity: z.coerce.number().int().positive(),
  spacingIn: z.coerce.number().positive(),
  rowSpacingIn: z.coerce.number().positive(),
  rootDepthIn: z.coerce.number().positive(),
  successionIntervalDays: z.coerce.number().int().nonnegative(),
  harvestUnit: nonEmptyString,
  estimatedYield: z.coerce.number().nonnegative(),
  estimatedPricePerUnit: z.coerce.number().nonnegative(),
  notes: z.string().default("")
});

export const plantingSchema = z.object({
  name: nonEmptyString,
  cropId: nonEmptyString,
  startMethod: z.enum(["direct_seed", "indoor_start", "transplant", "purchased_transplant", "cutting_clone", "hydroponic_transplant", "microgreen_sowing"]),
  environmentId: nonEmptyString,
  bedOrUnitId: nonEmptyString,
  growingMethodIds: z.array(nonEmptyString).min(1),
  mediumIds: z.array(nonEmptyString).min(1),
  seedDate: isoDate,
  plantCount: z.coerce.number().int().positive(),
  areaSqFt: z.coerce.number().positive(),
  spacingIn: z.coerce.number().positive(),
  laborHoursEstimate: z.coerce.number().nonnegative(),
  notes: z.string().default("")
});

export const taskSchema = z.object({
  title: nonEmptyString,
  dueDate: isoDate,
  status: z.enum(["todo", "in_progress", "done", "skipped"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  estimatedMinutes: z.coerce.number().int().nonnegative(),
  notes: z.string().default("")
});

export const harvestSchema = z.object({
  cropId: nonEmptyString,
  plantingId: z.string().optional(),
  harvestDate: isoDate,
  quantity: z.coerce.number().positive(),
  unit: nonEmptyString,
  grade: z.enum(["premium", "standard", "seconds", "waste"]),
  destination: z.string().default(""),
  salePrice: z.coerce.number().nonnegative(),
  wasteLoss: z.coerce.number().nonnegative(),
  notes: z.string().default("")
});

export const inventoryLotSchema = z.object({
  itemType: z.enum(["seed", "media", "fertilizer", "nutrient", "label", "container", "supply", "other"]),
  cropId: z.string().trim().optional(),
  name: nonEmptyString,
  lotCode: z.string().trim().default(""),
  vendor: z.string().trim().default(""),
  quantityOnHand: z.coerce.number().nonnegative(),
  reservedQuantity: z.coerce.number().nonnegative().optional(),
  unit: nonEmptyString,
  seedsPerUnit: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().positive().optional()),
  germinationRatePercent: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().min(1).max(100).optional()),
  unitCost: z.coerce.number().nonnegative(),
  storageLocation: z.string().trim().default(""),
  receivedDate: isoDate,
  expirationDate: z.string().optional(),
  notes: z.string().default("")
});

export const expenseSchema = z.object({
  date: isoDate,
  category: z.enum(["seed", "media", "fertility", "labor", "packaging", "equipment", "utilities", "other"]),
  vendor: z.string().trim().default(""),
  description: nonEmptyString,
  amount: z.coerce.number().nonnegative(),
  notes: z.string().default("")
});

export const diagnosticCaseFormSchema = z.object({
  cropId: nonEmptyString,
  cultivar: z.string().optional(),
  growthStage: z.enum(["seedling", "vegetative", "flowering", "fruiting", "harvest", "post_harvest"]),
  environmentId: nonEmptyString,
  growingMethodIds: z.array(nonEmptyString).min(1),
  mediumIds: z.array(nonEmptyString).min(1),
  locationZone: z.string().default(""),
  symptoms: nonEmptyString,
  affectedParts: z.array(z.string()).min(1),
  symptomTypes: z.array(z.string()).min(1),
  distribution: z.enum(["single_plant", "scattered", "edge", "whole_bed", "new_growth", "older_growth"]),
  recentActions: z.array(z.string()).default([]),
  airTempF: optionalNumber,
  humidityPercent: optionalNumber,
  vpdKpa: optionalNumber,
  moisture: z.enum(["dry", "normal", "wet", "saturated"]),
  ph: optionalNumber,
  ec: optionalNumber,
  lightHours: optionalNumber,
  lightIntensity: optionalNumber,
  reservoirTempF: optionalNumber,
  dissolvedOxygen: optionalNumber,
  notes: z.string().default("")
});

const appDataKeys = [
  "localProfiles",
  "farms",
  "environments",
  "growingAreas",
  "bedOrUnits",
  "crops",
  "cultivars",
  "growingMedia",
  "growingMethods",
  "plantings",
  "plantingEvents",
  "tasks",
  "harvestLogs",
  "revenueLogs",
  "expenseLogs",
  "supplyItems",
  "inventoryLots",
  "seedOrderItems",
  "diagnosticCases",
  "diagnosticObservations",
  "diagnosticResults",
  "recommendations",
  "sensorReadings",
  "photoAssets",
  "backupRecords",
  "collaborationEvents"
] as const;

export function validateBackup(input: unknown): AppData {
  const objectSchema = z.object({
    appSettings: z
      .object({
        id: z.literal("settings"),
        activeFarmId: z.string(),
        profileId: z.string(),
        theme: z.enum(["light", "dark"]).default("light"),
        dataVersion: z.number().default(1),
        onboardingComplete: z.boolean().default(true),
        lastBackupAt: z.string().optional(),
        appVersion: z.string().default("0.1.16")
      })
      .passthrough()
  });
  const base = objectSchema.passthrough().parse(input);
  const result: Record<string, unknown> = { ...base };
  appDataKeys.forEach((key) => {
    result[key] = Array.isArray((input as Record<string, unknown>)?.[key]) ? (input as Record<string, unknown>)[key] : [];
  });
  return result as unknown as AppData;
}

export function safeParseJsonBackup(text: string): AppData {
  const parsed = JSON.parse(text) as unknown;
  return validateBackup(parsed);
}
