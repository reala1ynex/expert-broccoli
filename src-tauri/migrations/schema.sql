PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS LocalProfile (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Farm (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Environment (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS GrowingArea (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS BedOrUnit (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Crop (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Cultivar (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS GrowingMedium (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS GrowingMethod (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Planting (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PlantingEvent (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Task (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS HarvestLog (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS RevenueLog (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ExpenseLog (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS SupplyItem (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS InventoryLot (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS SeedOrderItem (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS DiagnosticCase (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS DiagnosticObservation (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS DiagnosticResult (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Recommendation (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS SensorReading (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PhotoAsset (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS AppSettings (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS BackupRecord (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS CollaborationEvent (
  id TEXT PRIMARY KEY,
  farm_id TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_environment_farm ON Environment(farm_id);
CREATE INDEX IF NOT EXISTS idx_growing_area_farm ON GrowingArea(farm_id);
CREATE INDEX IF NOT EXISTS idx_bed_unit_farm ON BedOrUnit(farm_id);
CREATE INDEX IF NOT EXISTS idx_crop_farm ON Crop(farm_id);
CREATE INDEX IF NOT EXISTS idx_planting_farm ON Planting(farm_id);
CREATE INDEX IF NOT EXISTS idx_task_farm ON Task(farm_id);
CREATE INDEX IF NOT EXISTS idx_harvest_farm ON HarvestLog(farm_id);
CREATE INDEX IF NOT EXISTS idx_expense_farm ON ExpenseLog(farm_id);
CREATE INDEX IF NOT EXISTS idx_inventory_farm ON InventoryLot(farm_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_farm ON DiagnosticCase(farm_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_farm ON CollaborationEvent(farm_id);
