export type ID = string;

export type CompatibilityStatus = "compatible" | "caution" | "incompatible" | "unknown";
export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type ThemeMode = "light" | "dark";

export type EnvironmentType =
  | "outdoor_field"
  | "greenhouse"
  | "high_tunnel"
  | "low_tunnel"
  | "shade_house"
  | "indoor_grow_room"
  | "vertical_rack"
  | "container_patio"
  | "nursery_seedling_area";

export type GrowingMethodType =
  | "direct_in_ground_soil"
  | "raised_beds"
  | "containers_pots_grow_bags"
  | "seed_trays"
  | "transplant_production"
  | "hydroponic_dwc"
  | "nft"
  | "ebb_and_flow"
  | "drip_irrigation"
  | "dutch_bucket"
  | "wick_system"
  | "aeroponics"
  | "aquaponics"
  | "vertical_tower"
  | "microgreens_trays";

export type StartMethod =
  | "direct_seed"
  | "indoor_start"
  | "transplant"
  | "purchased_transplant"
  | "cutting_clone"
  | "hydroponic_transplant"
  | "microgreen_sowing";

export type PlantingStatus = "planned" | "active" | "harvesting" | "finished" | "failed";

export interface LocalProfile {
  id: ID;
  displayName: string;
  defaultFarmId: ID;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Farm {
  id: ID;
  name: string;
  location: string;
  climateZone: string;
  firstFrostDate: string;
  lastFrostDate: string;
  seasonStart: string;
  seasonEnd: string;
  currency: string;
  measurementUnits: "imperial" | "metric";
  productionStyleTags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentAssumptions {
  lowTempF?: number;
  highTempF?: number;
  humidityPercent?: number;
  lightHours?: number;
  airflow: "low" | "moderate" | "high";
  seasonExtensionDays?: number;
}

export interface Environment {
  id: ID;
  farmId: ID;
  name: string;
  type: EnvironmentType;
  lengthFt: number;
  widthFt: number;
  usableAreaSqFt: number;
  mapX?: number;
  mapY?: number;
  mapWidth?: number;
  mapHeight?: number;
  layoutNotes: string;
  assumptions: EnvironmentAssumptions;
  sensorSummary?: string;
  notes: string;
  photoAssetIds: ID[];
  createdAt: string;
  updatedAt: string;
}

export interface GrowingArea {
  id: ID;
  farmId: ID;
  environmentId: ID;
  name: string;
  kind: "bed_block" | "rack" | "container_group" | "hydro_zone" | "nursery_zone";
  x: number;
  y: number;
  width: number;
  height: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface BedOrUnit {
  id: ID;
  farmId: ID;
  environmentId: ID;
  growingAreaId: ID;
  name: string;
  unitType: "bed" | "row" | "container" | "rack_level" | "channel" | "reservoir" | "tray" | "zone";
  x: number;
  y: number;
  width: number;
  height: number;
  lengthFt: number;
  widthFt: number;
  capacityPlants: number;
  rootDepthIn: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface GrowingMethod {
  id: ID;
  type: GrowingMethodType;
  name: string;
  category: "soil" | "container" | "nursery" | "hydroponic" | "aquaponic" | "vertical" | "microgreens";
  compatibleMediaIds: ID[];
  irrigationModes: string[];
  rootDepthMinIn: number;
  notes: string;
}

export interface GrowingMedium {
  id: ID;
  name: string;
  waterRetention: 1 | 2 | 3 | 4 | 5;
  drainage: 1 | 2 | 3 | 4 | 5;
  phBehavior: string;
  ecBehavior: string;
  biologicalActivity: "sterile" | "low" | "moderate" | "high";
  reusable: boolean;
  compatibleMethodIds: ID[];
  cropCompatibilityNotes: string;
  diagnosticRiskFactors: string[];
}

export interface Crop {
  id: ID;
  farmId?: ID;
  name: string;
  cultivar?: string;
  cropType: "fruiting" | "leafy" | "root" | "legume" | "herb" | "microgreen";
  daysToMaturity: number;
  germinationTempRangeF: [number, number];
  transplantTimingDays: number;
  spacingIn: number;
  rowSpacingIn: number;
  rootDepthIn: number;
  successionIntervalDays: number;
  preferredPhRange: [number, number];
  preferredEcRange?: [number, number];
  temperatureRangeF: [number, number];
  humidityPreference: "low" | "moderate" | "high";
  lightPreference: "low" | "partial" | "full" | "high_intensity";
  compatibleEnvironmentTypes: EnvironmentType[];
  compatibleMethodTypes: GrowingMethodType[];
  compatibleMediumIds: ID[];
  commonProblems: string[];
  harvestUnit: string;
  estimatedYield: number;
  estimatedYieldBasis: "per_plant" | "per_sqft" | "per_tray";
  estimatedPricePerUnit: number;
  notes: string;
  archived: boolean;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Cultivar {
  id: ID;
  farmId: ID;
  cropId: ID;
  name: string;
  daysToMaturityDelta: number;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IrrigationProfile {
  mode: string;
  frequency: string;
  fertigation: boolean;
  targetPh?: [number, number];
  targetEc?: [number, number];
}

export interface Planting {
  id: ID;
  farmId: ID;
  cropId: ID;
  cultivarId?: ID;
  name: string;
  startMethod: StartMethod;
  environmentId: ID;
  bedOrUnitId: ID;
  growingMethodIds: ID[];
  mediumIds: ID[];
  seedDate: string;
  transplantDate?: string;
  firstHarvestDate: string;
  harvestWindowDays: number;
  terminationDate: string;
  successionGroupId?: ID;
  successionIndex: number;
  plantCount: number;
  areaSqFt: number;
  spacingIn: number;
  expectedYield: number;
  expectedRevenue: number;
  laborHoursEstimate: number;
  irrigationProfile: IrrigationProfile;
  status: PlantingStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlantingEvent {
  id: ID;
  farmId: ID;
  plantingId: ID;
  eventType: string;
  eventDate: string;
  notes: string;
  createdAt: string;
}

export interface Task {
  id: ID;
  farmId: ID;
  plantingId?: ID;
  cropId?: ID;
  environmentId?: ID;
  bedOrUnitId?: ID;
  title: string;
  category: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedMinutes: number;
  repeatRule?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarvestLog {
  id: ID;
  farmId: ID;
  cropId: ID;
  plantingId?: ID;
  harvestDate: string;
  quantity: number;
  unit: string;
  grade: "premium" | "standard" | "seconds" | "waste";
  destination: string;
  salePrice: number;
  revenue: number;
  wasteLoss: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RevenueLog {
  id: ID;
  farmId: ID;
  harvestLogId?: ID;
  date: string;
  source: string;
  amount: number;
  notes: string;
}

export interface ExpenseLog {
  id: ID;
  farmId: ID;
  date: string;
  category: "seed" | "media" | "fertility" | "labor" | "packaging" | "equipment" | "utilities" | "other";
  vendor: string;
  description: string;
  amount: number;
  linkedEntityId?: ID;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplyItem {
  id: ID;
  farmId: ID;
  plantingId?: ID;
  itemType: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
  notes: string;
}

export interface InventoryLot {
  id: ID;
  farmId: ID;
  cropId?: ID;
  itemType: "seed" | "media" | "fertilizer" | "nutrient" | "label" | "container" | "supply" | "other";
  name: string;
  lotCode: string;
  vendor: string;
  quantityOnHand: number;
  reservedQuantity?: number;
  unit: string;
  seedsPerUnit?: number;
  germinationRatePercent?: number;
  unitCost: number;
  storageLocation: string;
  receivedDate: string;
  expirationDate?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeedOrderItem {
  id: ID;
  farmId: ID;
  cropId: ID;
  plantingId?: ID;
  seedName: string;
  quantityNeeded: number;
  unit: string;
  estimatedCost: number;
  ordered: boolean;
  notes: string;
}

export interface DiagnosticObservation {
  id: ID;
  farmId: ID;
  diagnosticCaseId: ID;
  label: string;
  value: string;
  createdAt: string;
}

export interface DiagnosticResult {
  id: ID;
  farmId: ID;
  diagnosticCaseId: ID;
  cause: string;
  confidence: number;
  severity: "low" | "moderate" | "high" | "critical";
  urgency: "monitor" | "soon" | "prompt" | "immediate";
  evidence: string[];
  checks: string[];
  immediateActions: string[];
  correctionPlan: string[];
  prevention: string[];
  extensionRecommended: boolean;
  createdAt: string;
}

export interface DiagnosticCase {
  id: ID;
  farmId: ID;
  cropId: ID;
  cultivar?: string;
  growthStage: "seedling" | "vegetative" | "flowering" | "fruiting" | "harvest" | "post_harvest";
  environmentId: ID;
  growingMethodIds: ID[];
  mediumIds: ID[];
  locationZone: string;
  symptoms: string;
  affectedParts: string[];
  symptomTypes: string[];
  distribution: "single_plant" | "scattered" | "edge" | "whole_bed" | "new_growth" | "older_growth";
  recentActions: string[];
  airTempF?: number;
  humidityPercent?: number;
  vpdKpa?: number;
  moisture: "dry" | "normal" | "wet" | "saturated";
  ph?: number;
  ec?: number;
  lightHours?: number;
  lightIntensity?: number;
  reservoirTempF?: number;
  dissolvedOxygen?: number;
  photoAssetIds: ID[];
  status: "open" | "monitoring" | "resolved";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recommendation {
  id: ID;
  farmId: ID;
  title: string;
  category: "space" | "labor" | "succession" | "compatibility" | "diagnostic" | "rotation" | "environment";
  priority: TaskPriority;
  explanation: string;
  suggestedAction: string;
  relatedEntityId?: ID;
  createdAt: string;
}

export interface SensorReading {
  id: ID;
  farmId: ID;
  environmentId: ID;
  readingDate: string;
  temperatureF?: number;
  humidityPercent?: number;
  ph?: number;
  ec?: number;
  moisture?: string;
  notes: string;
}

export interface PhotoAsset {
  id: ID;
  farmId: ID;
  fileName: string;
  localPath: string;
  mimeType: string;
  sizeBytes: number;
  caption?: string;
  createdAt: string;
}

export interface GrowOpsTrial {
  id: ID;
  farmId: ID;
  name: string;
  cropId?: ID;
  environmentId?: ID;
  hypothesis: string;
  controlLabel: string;
  treatmentLabel: string;
  metric: string;
  controlValues: number[];
  treatmentValues: number[];
  startDate: string;
  endDate?: string;
  status: "planned" | "active" | "completed";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface GrowOpsSensorImport {
  id: ID;
  farmId: ID;
  name: string;
  source: string;
  rows: Array<{
    date: string;
    tempF?: number;
    humidityPercent?: number;
    ph?: number;
    ec?: number;
    moisture?: string;
  }>;
  createdAt: string;
}

export interface GrowOpsIpmScout {
  id: ID;
  farmId: ID;
  date: string;
  cropId?: ID;
  environmentId?: ID;
  target: string;
  count: number;
  pressure: "none" | "low" | "moderate" | "high" | "severe";
  notes: string;
  createdAt: string;
}

export interface GrowOpsResearchNote {
  id: ID;
  farmId: ID;
  title: string;
  source: string;
  tags: string[];
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface RestorePoint {
  id: ID;
  farmId?: ID;
  createdAt: string;
  message: string;
  summary: string;
  snapshotJson: string;
}

export interface AppSettings {
  id: "settings";
  activeFarmId: ID;
  profileId: ID;
  theme: ThemeMode;
  dataVersion: number;
  onboardingComplete: boolean;
  lastBackupAt?: string;
  appVersion: string;
  updateManifestUrl?: string;
  restorePoints?: RestorePoint[];
  tablePresets?: Record<string, {
    statusFilter?: string;
    priorityFilter?: string;
    visibleColumns?: string[];
  }>;
  collaboration?: {
    groupCode: string;
    deviceName: string;
    lastSyncAt?: string;
  };
  growOps?: {
    defaultFarmId?: ID;
    defaultEnvironmentId?: ID;
    defaultMethodId?: ID;
    defaultMediumId?: ID;
    diagnosticWarnings?: "standard" | "sensitive";
    trials?: GrowOpsTrial[];
    sensorImports?: GrowOpsSensorImport[];
    ipmScouts?: GrowOpsIpmScout[];
    researchNotes?: GrowOpsResearchNote[];
  };
}

export interface CollaborationEvent {
  id: ID;
  farmId?: ID;
  eventType: "import" | "export" | "bluetooth_package" | "merge";
  groupCode?: string;
  deviceName?: string;
  packageName?: string;
  summary: string;
  createdAt: string;
}

export interface BackupRecord {
  id: ID;
  farmId?: ID;
  createdAt: string;
  filePath: string;
  sizeBytes: number;
  status: "created" | "imported" | "failed";
  notes: string;
}

export interface AppData {
  localProfiles: LocalProfile[];
  farms: Farm[];
  environments: Environment[];
  growingAreas: GrowingArea[];
  bedOrUnits: BedOrUnit[];
  crops: Crop[];
  cultivars: Cultivar[];
  growingMedia: GrowingMedium[];
  growingMethods: GrowingMethod[];
  plantings: Planting[];
  plantingEvents: PlantingEvent[];
  tasks: Task[];
  harvestLogs: HarvestLog[];
  revenueLogs: RevenueLog[];
  expenseLogs: ExpenseLog[];
  supplyItems: SupplyItem[];
  inventoryLots: InventoryLot[];
  seedOrderItems: SeedOrderItem[];
  diagnosticCases: DiagnosticCase[];
  diagnosticObservations: DiagnosticObservation[];
  diagnosticResults: DiagnosticResult[];
  recommendations: Recommendation[];
  sensorReadings: SensorReading[];
  photoAssets: PhotoAsset[];
  appSettings: AppSettings;
  backupRecords: BackupRecord[];
  collaborationEvents: CollaborationEvent[];
}

export interface AppStatus {
  dbPath: string;
  appDataDir: string;
  photoDir: string;
  backupDir: string;
  exportDir: string;
  version: string;
  sqliteAvailable: boolean;
}

export interface CompatibilityIssue {
  status: CompatibilityStatus;
  field: string;
  message: string;
  suggestedFix: string;
}

export interface CompatibilityReport {
  status: CompatibilityStatus;
  score: number;
  issues: CompatibilityIssue[];
}
