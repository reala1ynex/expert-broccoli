import { id } from "../lib/utils";
import type { Crop, Planting, SeedOrderItem, SupplyItem } from "./types";

export function generateSuppliesForPlanting(planting: Planting, crop: Crop): { supplies: SupplyItem[]; seeds: SeedOrderItem[] } {
  const trayCount = Math.ceil(planting.plantCount / 72);
  const mediaVolume = Math.max(1, Math.round(planting.areaSqFt * 0.35));
  const hydro = planting.growingMethodIds.some((method) => ["method_dwc", "method_nft", "method_ebb_flow", "method_dutch_bucket", "method_vertical_tower", "method_aeroponics"].includes(method));
  return {
    seeds: [
      {
        id: id("seed"),
        farmId: planting.farmId,
        cropId: planting.cropId,
        plantingId: planting.id,
        seedName: `${crop.name} seed`,
        quantityNeeded: Math.ceil(planting.plantCount * 1.15),
        unit: "seeds",
        estimatedCost: Math.round(planting.plantCount * 0.04 * 100) / 100,
        ordered: false,
        notes: "Includes 15% germination and loss buffer."
      }
    ],
    supplies: [
      {
        id: id("supply"),
        farmId: planting.farmId,
        plantingId: planting.id,
        itemType: "labels",
        name: "Plant labels",
        quantity: Math.ceil(planting.plantCount / 12),
        unit: "each",
        estimatedCost: Math.ceil(planting.plantCount / 12) * 0.08,
        notes: ""
      },
      {
        id: id("supply"),
        farmId: planting.farmId,
        plantingId: planting.id,
        itemType: "media",
        name: hydro ? "Nutrient solution volume" : "Growing media volume",
        quantity: hydro ? Math.max(5, Math.round(planting.plantCount * 0.4)) : mediaVolume,
        unit: hydro ? "gal" : "cu ft",
        estimatedCost: hydro ? Math.max(8, Math.round(planting.plantCount * 0.12)) : Math.round(mediaVolume * 4.5),
        notes: hydro ? "Estimate for reservoir or fertigation startup." : "Estimate for bed or container preparation."
      },
      ...(planting.startMethod === "indoor_start" || planting.startMethod === "microgreen_sowing"
        ? [
            {
              id: id("supply"),
              farmId: planting.farmId,
              plantingId: planting.id,
              itemType: "trays",
              name: planting.startMethod === "microgreen_sowing" ? "10x20 microgreen trays" : "Seed trays or cell flats",
              quantity: trayCount,
              unit: "each",
              estimatedCost: trayCount * 3.5,
              notes: ""
            }
          ]
        : []),
      ...(crop.cropType === "fruiting"
        ? [
            {
              id: id("supply"),
              farmId: planting.farmId,
              plantingId: planting.id,
              itemType: "trellis",
              name: "Trellis clips, twine, or stakes",
              quantity: planting.plantCount,
              unit: "plants",
              estimatedCost: Math.round(planting.plantCount * 0.3 * 100) / 100,
              notes: "Adjust by crop support style."
            }
          ]
        : [])
    ]
  };
}
