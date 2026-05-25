import type { AppData, RestorePoint } from "./types";

export function createRestorePoint(data: AppData, message: string): RestorePoint {
  const snapshot: AppData = {
    ...data,
    appSettings: {
      ...data.appSettings,
      restorePoints: []
    }
  };
  return {
    id: restoreId(),
    farmId: data.appSettings.activeFarmId,
    createdAt: new Date().toISOString(),
    message,
    summary: summarizeSnapshot(data),
    snapshotJson: JSON.stringify(snapshot)
  };
}

function restoreId() {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  return cryptoId ? `restore_${cryptoId}` : `restore_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function summarizeSnapshot(data: AppData) {
  const farmId = data.appSettings.activeFarmId;
  return [
    `${data.farms.length} farms`,
    `${data.plantings.filter((item) => item.farmId === farmId).length} plantings`,
    `${data.tasks.filter((item) => item.farmId === farmId).length} tasks`,
    `${data.harvestLogs.filter((item) => item.farmId === farmId).length} harvests`,
    `${data.diagnosticCases.filter((item) => item.farmId === farmId).length} diagnostics`
  ].join(" / ");
}
