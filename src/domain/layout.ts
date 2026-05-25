import type { BedOrUnit, Crop, Environment, EnvironmentType, ID } from "./types";

export interface EnvironmentLayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getEnvironmentLayout(environment: Environment, index = 0): EnvironmentLayoutBox {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: clampLayoutValue(environment.mapX ?? 4 + col * 31, 0, 96),
    y: clampLayoutValue(environment.mapY ?? 5 + row * 28, 0, 96),
    width: clampLayoutValue(environment.mapWidth ?? 26, 4, 100),
    height: clampLayoutValue(environment.mapHeight ?? 20, 4, 100)
  };
}

export function autoArrangeEnvironmentLayouts(environments: Environment[]): Record<ID, EnvironmentLayoutBox> {
  return Object.fromEntries(
    environments.map((environment, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return [
        environment.id,
        {
          x: 4 + col * 31,
          y: 5 + row * 28,
          width: 26,
          height: 20
        }
      ];
    })
  );
}

export function fitEnvironmentLayoutsByDimensions(environments: Environment[]): Record<ID, EnvironmentLayoutBox> {
  const maxLength = Math.max(1, ...environments.map((environment) => environment.lengthFt || 0));
  const maxWidth = Math.max(1, ...environments.map((environment) => environment.widthFt || 0));
  return Object.fromEntries(
    environments.map((environment, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const width = clampLayoutValue(((environment.lengthFt || maxLength * 0.5) / maxLength) * 28, 8, 30);
      const height = clampLayoutValue(((environment.widthFt || maxWidth * 0.5) / maxWidth) * 22, 7, 24);
      return [
        environment.id,
        {
          x: clampLayoutValue(4 + col * 31, 0, 100 - width),
          y: clampLayoutValue(5 + row * 28, 0, 100 - height),
          width,
          height
        }
      ];
    })
  );
}

export function clampLayoutValue(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)) * 10) / 10;
}

export function estimateEnvironmentUsableArea(lengthFt: number, widthFt: number, type: EnvironmentType) {
  const grossArea = Math.max(0, lengthFt) * Math.max(0, widthFt);
  const factor: Record<EnvironmentType, number> = {
    outdoor_field: 0.72,
    greenhouse: 0.82,
    high_tunnel: 0.82,
    low_tunnel: 0.78,
    shade_house: 0.8,
    indoor_grow_room: 0.72,
    vertical_rack: 1.8,
    container_patio: 0.65,
    nursery_seedling_area: 1.15
  };
  return Math.round(grossArea * factor[type]);
}

export function defaultEnvironmentAssumptions(type: EnvironmentType) {
  const assumptions: Record<EnvironmentType, { lowTempF: number; highTempF: number; humidityPercent: number; lightHours: number; airflow: "low" | "moderate" | "high"; seasonExtensionDays: number }> = {
    outdoor_field: { lowTempF: 38, highTempF: 88, humidityPercent: 65, lightHours: 12, airflow: "high", seasonExtensionDays: 0 },
    greenhouse: { lowTempF: 48, highTempF: 92, humidityPercent: 75, lightHours: 12, airflow: "moderate", seasonExtensionDays: 60 },
    high_tunnel: { lowTempF: 45, highTempF: 92, humidityPercent: 76, lightHours: 12, airflow: "moderate", seasonExtensionDays: 35 },
    low_tunnel: { lowTempF: 42, highTempF: 85, humidityPercent: 72, lightHours: 11, airflow: "low", seasonExtensionDays: 21 },
    shade_house: { lowTempF: 48, highTempF: 82, humidityPercent: 70, lightHours: 9, airflow: "moderate", seasonExtensionDays: 20 },
    indoor_grow_room: { lowTempF: 66, highTempF: 76, humidityPercent: 62, lightHours: 16, airflow: "moderate", seasonExtensionDays: 365 },
    vertical_rack: { lowTempF: 66, highTempF: 76, humidityPercent: 62, lightHours: 16, airflow: "moderate", seasonExtensionDays: 365 },
    container_patio: { lowTempF: 42, highTempF: 90, humidityPercent: 62, lightHours: 10, airflow: "high", seasonExtensionDays: 0 },
    nursery_seedling_area: { lowTempF: 62, highTempF: 78, humidityPercent: 70, lightHours: 15, airflow: "moderate", seasonExtensionDays: 90 }
  };
  return assumptions[type];
}

export function defaultRootDepthIn(unitType: BedOrUnit["unitType"]) {
  const depths: Record<BedOrUnit["unitType"], number> = {
    bed: 12,
    row: 10,
    container: 10,
    rack_level: 4,
    channel: 3,
    reservoir: 8,
    tray: 1,
    zone: 10
  };
  return depths[unitType];
}

export function estimateUnitPlantSlots(unit: Pick<BedOrUnit, "lengthFt" | "widthFt" | "unitType">, crop?: Pick<Crop, "spacingIn" | "rowSpacingIn" | "estimatedYieldBasis">) {
  const lengthIn = Math.max(0, unit.lengthFt) * 12;
  const widthIn = Math.max(0, unit.widthFt) * 12;
  if (!lengthIn || !widthIn) return 0;
  if (unit.unitType === "tray") return Math.max(1, Math.round((unit.lengthFt * unit.widthFt) / 1.4));
  if (unit.unitType === "channel") return Math.max(1, Math.floor(lengthIn / Math.max(4, crop?.spacingIn ?? 6)));
  if (unit.unitType === "rack_level") return Math.max(1, Math.round((unit.lengthFt * unit.widthFt * 144) / 100));
  if (unit.unitType === "container") return Math.max(1, Math.round((unit.lengthFt * unit.widthFt * 144) / 144));
  const spacingIn = Math.max(2, crop?.spacingIn ?? 8);
  const rowSpacingIn = Math.max(spacingIn, crop?.rowSpacingIn ?? spacingIn);
  const rows = Math.max(1, Math.floor(widthIn / rowSpacingIn));
  const perRow = Math.max(1, Math.floor(lengthIn / spacingIn));
  return Math.max(1, rows * perRow);
}
