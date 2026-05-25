import { addDaysIso, daysBetween } from "../lib/utils";
import type { Crop, Planting, StartMethod } from "./types";

export interface PlannedDates {
  seedDate: string;
  transplantDate?: string;
  firstHarvestDate: string;
  terminationDate: string;
  harvestWindowDays: number;
}

export function planDates(crop: Crop, startDate: string, startMethod: StartMethod): PlannedDates {
  const transplantDelay =
    startMethod === "indoor_start" || startMethod === "hydroponic_transplant" ? Math.max(0, crop.transplantTimingDays) : 0;
  const seedDate = startDate;
  const transplantDate = transplantDelay > 0 ? addDaysIso(seedDate, transplantDelay) : undefined;
  const maturityAnchor = transplantDate ?? seedDate;
  const firstHarvestDate = addDaysIso(maturityAnchor, crop.daysToMaturity);
  const harvestWindowDays = crop.cropType === "fruiting" || crop.cropType === "herb" ? 35 : crop.cropType === "microgreen" ? 5 : 18;
  const terminationDate = addDaysIso(firstHarvestDate, harvestWindowDays);
  return { seedDate, transplantDate, firstHarvestDate, harvestWindowDays, terminationDate };
}

export function plantingDurationDays(planting: Pick<Planting, "seedDate" | "terminationDate">) {
  return daysBetween(planting.seedDate, planting.terminationDate);
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(`${aStart}T00:00:00`) <= new Date(`${bEnd}T00:00:00`) && new Date(`${bStart}T00:00:00`) <= new Date(`${aEnd}T00:00:00`);
}
