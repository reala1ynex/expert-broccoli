import { addDaysIso, id } from "../lib/utils";
import type { Crop, Planting, Task } from "./types";

interface TaskTemplate {
  title: string;
  category: string;
  offsetFrom: "seedDate" | "transplantDate" | "firstHarvestDate" | "terminationDate";
  offsetDays: number;
  priority: Task["priority"];
  minutes: number;
  repeatRule?: string;
  methodCategories?: string[];
}

const templates: TaskTemplate[] = [
  { title: "Order seed", category: "seed ordering", offsetFrom: "seedDate", offsetDays: -21, priority: "normal", minutes: 20 },
  { title: "Prepare bed or unit", category: "bed prep", offsetFrom: "seedDate", offsetDays: -7, priority: "normal", minutes: 45 },
  { title: "Prepare media", category: "media prep", offsetFrom: "seedDate", offsetDays: -3, priority: "normal", minutes: 35 },
  { title: "Set trays", category: "tray setup", offsetFrom: "seedDate", offsetDays: -1, priority: "normal", minutes: 20, methodCategories: ["nursery", "microgreens"] },
  { title: "Sow crop", category: "sowing", offsetFrom: "seedDate", offsetDays: 0, priority: "high", minutes: 45 },
  { title: "Check germination", category: "germination check", offsetFrom: "seedDate", offsetDays: 5, priority: "normal", minutes: 15 },
  { title: "Harden off starts", category: "hardening off", offsetFrom: "transplantDate", offsetDays: -7, priority: "normal", minutes: 25 },
  { title: "Transplant crop", category: "transplanting", offsetFrom: "transplantDate", offsetDays: 0, priority: "high", minutes: 90 },
  { title: "Prune crop", category: "pruning", offsetFrom: "transplantDate", offsetDays: 14, priority: "normal", minutes: 30 },
  { title: "Install or check trellis", category: "trellising", offsetFrom: "transplantDate", offsetDays: 10, priority: "normal", minutes: 45 },
  { title: "Irrigation check", category: "irrigation check", offsetFrom: "seedDate", offsetDays: 7, priority: "normal", minutes: 15, repeatRule: "weekly" },
  { title: "Fertigation check", category: "fertigation check", offsetFrom: "seedDate", offsetDays: 10, priority: "normal", minutes: 20, repeatRule: "weekly" },
  { title: "Pest scouting", category: "pest scouting", offsetFrom: "seedDate", offsetDays: 12, priority: "normal", minutes: 20, repeatRule: "weekly" },
  { title: "Disease scouting", category: "disease scouting", offsetFrom: "seedDate", offsetDays: 12, priority: "normal", minutes: 20, repeatRule: "weekly" },
  { title: "pH check", category: "pH check", offsetFrom: "seedDate", offsetDays: 7, priority: "normal", minutes: 15, repeatRule: "weekly", methodCategories: ["hydroponic", "aquaponic", "container"] },
  { title: "EC check", category: "EC check", offsetFrom: "seedDate", offsetDays: 7, priority: "normal", minutes: 15, repeatRule: "weekly", methodCategories: ["hydroponic", "container"] },
  { title: "Reservoir change", category: "reservoir change", offsetFrom: "seedDate", offsetDays: 14, priority: "normal", minutes: 45, repeatRule: "biweekly", methodCategories: ["hydroponic"] },
  { title: "Harvest crop", category: "harvest", offsetFrom: "firstHarvestDate", offsetDays: 0, priority: "high", minutes: 60, repeatRule: "weekly" },
  { title: "Post-harvest handling", category: "post-harvest handling", offsetFrom: "firstHarvestDate", offsetDays: 0, priority: "normal", minutes: 30 },
  { title: "Terminate crop", category: "crop termination", offsetFrom: "terminationDate", offsetDays: 0, priority: "normal", minutes: 45 },
  { title: "Sanitize area", category: "sanitation", offsetFrom: "terminationDate", offsetDays: 1, priority: "normal", minutes: 45 },
  { title: "Reset for succession", category: "succession reset", offsetFrom: "terminationDate", offsetDays: 2, priority: "normal", minutes: 30 }
];

export function generateTasksForPlanting(planting: Planting, crop: Crop, methodCategories: string[]): Task[] {
  const createdAt = new Date().toISOString();
  return templates
    .filter((template) => !template.methodCategories || template.methodCategories.some((category) => methodCategories.includes(category)))
    .filter((template) => !(template.offsetFrom === "transplantDate" && !planting.transplantDate))
    .filter((template) => !(template.title.includes("Prune") && !["fruiting", "herb"].includes(crop.cropType)))
    .filter((template) => !(template.title.includes("Trellis") && !["tomato", "cucumber", "peas", "beans"].some((term) => crop.name.toLowerCase().includes(term))))
    .map((template) => {
      const anchor = planting[template.offsetFrom] || planting.seedDate;
      return {
        id: id("task"),
        farmId: planting.farmId,
        plantingId: planting.id,
        cropId: planting.cropId,
        environmentId: planting.environmentId,
        bedOrUnitId: planting.bedOrUnitId,
        title: `${template.title}: ${planting.name}`,
        category: template.category,
        dueDate: addDaysIso(anchor, template.offsetDays),
        status: "todo",
        priority: template.priority,
        estimatedMinutes: template.minutes,
        repeatRule: template.repeatRule,
        notes: "",
        createdAt,
        updatedAt: createdAt
      } satisfies Task;
    });
}
