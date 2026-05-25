import { addDaysIso, id, todayIso } from "../lib/utils";
import { overlaps } from "./datePlanning";
import { checkCompatibility } from "./compatibility";
import type { AppData, Recommendation } from "./types";

export function generateRecommendations(data: AppData, farmId: string): Recommendation[] {
  const createdAt = new Date().toISOString();
  const farm = data.farms.find((item) => item.id === farmId);
  const plantings = data.plantings.filter((item) => item.farmId === farmId && item.status !== "finished");
  const units = data.bedOrUnits.filter((item) => item.farmId === farmId);
  const environments = data.environments.filter((item) => item.farmId === farmId);
  const seedLots = data.inventoryLots.filter((lot) => lot.farmId === farmId && lot.itemType === "seed");
  const activeCropIds = new Set(plantings.map((planting) => planting.cropId));
  const recommendations: Recommendation[] = [];

  units.forEach((unit) => {
    const active = plantings.filter((planting) => planting.bedOrUnitId === unit.id);
    const utilization = Math.min(1, active.reduce((sum, planting) => sum + planting.areaSqFt, 0) / Math.max(1, unit.lengthFt * unit.widthFt));
    if (utilization < 0.45) {
      recommendations.push(makeRecommendation(farmId, "space", "normal", `${unit.name} has open production capacity`, `Current utilization is ${Math.round(utilization * 100)}%. Add a short-cycle crop or schedule a succession.`, "Review crop suggestions for this bed or unit.", unit.id, createdAt));
    }
    active.forEach((planting, index) => {
      active.slice(index + 1).forEach((other) => {
        if (overlaps(planting.seedDate, planting.terminationDate, other.seedDate, other.terminationDate)) {
          recommendations.push(makeRecommendation(farmId, "space", "high", `Bed conflict in ${unit.name}`, `${planting.name} and ${other.name} overlap in the same unit.`, "Move one planting or adjust dates.", unit.id, createdAt));
        }
      });
    });
  });

  plantings.forEach((planting) => {
    const crop = data.crops.find((item) => item.id === planting.cropId);
    const environment = data.environments.find((item) => item.id === planting.environmentId);
    const bedOrUnit = data.bedOrUnits.find((item) => item.id === planting.bedOrUnitId);
    const methods = data.growingMethods.filter((item) => planting.growingMethodIds.includes(item.id));
    const media = data.growingMedia.filter((item) => planting.mediumIds.includes(item.id));
    const report = checkCompatibility({ farm, crop, environment, bedOrUnit, methods, media, planting });
    if (report.status !== "compatible") {
      const issue = report.issues.find((item) => item.status === "incompatible") ?? report.issues.find((item) => item.status === "caution");
      if (issue) {
        recommendations.push(makeRecommendation(farmId, "compatibility", report.status === "incompatible" ? "urgent" : "high", `Review ${planting.name}`, issue.message, issue.suggestedFix, planting.id, createdAt));
      }
    }
  });

  environments
    .filter((environment) => ["greenhouse", "high_tunnel"].includes(environment.type) && (environment.assumptions.humidityPercent ?? 0) > 75)
    .forEach((environment) => {
      recommendations.push(makeRecommendation(farmId, "environment", "high", `Humidity disease prevention in ${environment.name}`, "Protected space has high humidity assumptions.", "Keep airflow tasks active, irrigate early, and scout leaves weekly.", environment.id, createdAt));
    });

  const taskLoad = data.tasks
    .filter((task) => task.farmId === farmId && task.status !== "done")
    .reduce<Record<string, number>>((acc, task) => {
      acc[task.dueDate] = (acc[task.dueDate] ?? 0) + task.estimatedMinutes;
      return acc;
    }, {});
  Object.entries(taskLoad)
    .filter(([, minutes]) => minutes > 360)
    .forEach(([date, minutes]) => {
      recommendations.push(makeRecommendation(farmId, "labor", "high", `Labor peak on ${date}`, `${Math.round(minutes / 60)} hours of open work are scheduled.`, "Move flexible prep, scouting, or sanitation tasks earlier.", undefined, createdAt));
    });

  if (data.diagnosticCases.some((item) => item.farmId === farmId && item.status !== "resolved")) {
    recommendations.push(makeRecommendation(farmId, "diagnostic", "high", "Active diagnostic monitoring", "There are unresolved diagnostic cases.", "Add follow-up scouting and pH/EC/moisture checks until symptoms improve.", undefined, createdAt));
  }

  const noUpcoming = plantings.filter((planting) => planting.seedDate >= todayIso()).length === 0;
  if (noUpcoming) {
    recommendations.push(makeRecommendation(farmId, "succession", "normal", "No upcoming plantings", "The plan has no future seed dates.", "Add a fast succession such as arugula, radish, lettuce, basil, or microgreens.", undefined, createdAt));
  }

  seedLots
    .filter((lot) => !lot.cropId)
    .slice(0, 4)
    .forEach((lot) => {
      recommendations.push(makeRecommendation(farmId, "succession", "normal", `Link seed lot ${lot.name} to a crop`, "Seed inventory without a crop link can only be matched by text.", "Open Seed & Supply and choose a crop link so the guided planner can calculate seed coverage more accurately.", lot.id, createdAt));
    });

  seedLots
    .filter((lot) => (lot.reservedQuantity ?? 0) > lot.quantityOnHand)
    .forEach((lot) => {
      recommendations.push(makeRecommendation(farmId, "compatibility", "urgent", `Seed reservations exceed ${lot.name}`, `${lot.reservedQuantity ?? 0} ${lot.unit} is reserved from ${lot.quantityOnHand} ${lot.unit} on hand.`, "Reduce reservations, add inventory, or adjust generated plantings.", lot.id, createdAt));
    });

  const soon = addDaysIso(todayIso(), 90);
  seedLots
    .filter((lot) => lot.expirationDate && lot.expirationDate <= soon)
    .slice(0, 5)
    .forEach((lot) => {
      recommendations.push(makeRecommendation(farmId, "succession", "normal", `${lot.name} seed expires soon`, `${lot.expirationDate} is within the next 90 days.`, "Use this lot in a near-term succession or mark it for germination testing.", lot.id, createdAt));
    });

  seedLots
    .filter((lot) => lot.cropId && !activeCropIds.has(lot.cropId))
    .slice(0, 6)
    .forEach((lot) => {
      const crop = data.crops.find((item) => item.id === lot.cropId);
      recommendations.push(makeRecommendation(farmId, "succession", "normal", `${crop?.name ?? lot.name} seed is available`, "You have linked seed inventory that is not currently used by an active planting.", "Run the Guided Plan Builder or add a small succession for an open unit.", lot.cropId, createdAt));
    });

  if (!data.appSettings.lastBackupAt) {
    recommendations.push(makeRecommendation(farmId, "labor", "normal", "Create a local backup", "No backup date is recorded for this workspace.", "Open Data and export a full JSON backup before a major planning session.", undefined, createdAt));
  } else if (data.appSettings.lastBackupAt.slice(0, 10) < addDaysIso(todayIso(), -14)) {
    recommendations.push(makeRecommendation(farmId, "labor", "normal", "Backup is more than two weeks old", `Last backup: ${data.appSettings.lastBackupAt.slice(0, 10)}.`, "Export a fresh local backup after current changes.", undefined, createdAt));
  }

  return recommendations.slice(0, 24);
}

function makeRecommendation(farmId: string, category: Recommendation["category"], priority: Recommendation["priority"], title: string, explanation: string, suggestedAction: string, relatedEntityId: string | undefined, createdAt: string): Recommendation {
  return { id: id("rec"), farmId, category, priority, title, explanation, suggestedAction, relatedEntityId, createdAt };
}
