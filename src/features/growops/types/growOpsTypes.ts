import type {
  AppData,
  AppStatus,
  BedOrUnit,
  Crop,
  Cultivar,
  DiagnosticCase,
  DiagnosticObservation,
  DiagnosticResult,
  Environment,
  Farm,
  GrowingArea,
  GrowingMedium,
  GrowingMethod,
  HarvestLog,
  PhotoAsset,
  Planting,
  PlantingEvent,
  Recommendation,
  RevenueLog,
  SupplyItem,
  Task
} from "../../../domain/types";

export type GrowOpsData = AppData;
export type GrowOpsStatus = AppStatus;
export type GrowOpsFarm = Farm;
export type GrowOpsEnvironment = Environment;
export type GrowOpsGrowingArea = GrowingArea;
export type GrowOpsBedOrUnit = BedOrUnit;
export type GrowOpsCrop = Crop;
export type GrowOpsCultivar = Cultivar;
export type GrowOpsGrowingMedium = GrowingMedium;
export type GrowOpsGrowingMethod = GrowingMethod;
export type GrowOpsPlanting = Planting;
export type GrowOpsPlantingEvent = PlantingEvent;
export type GrowOpsTask = Task;
export type GrowOpsHarvestLog = HarvestLog;
export type GrowOpsRevenueLog = RevenueLog;
export type GrowOpsSupplyItem = SupplyItem;
export type GrowOpsDiagnosticCase = DiagnosticCase;
export type GrowOpsDiagnosticObservation = DiagnosticObservation;
export type GrowOpsDiagnosticResult = DiagnosticResult;
export type GrowOpsRecommendation = Recommendation;
export type GrowOpsPhotoAsset = PhotoAsset;
