import { createFreshData } from "../data/seedData";
import { safeParseJsonBackup, validateBackup } from "../domain/validators";
import type { AppData, AppStatus, PhotoAsset } from "../domain/types";
import { downloadTextFile, id } from "../lib/utils";

const LOCAL_KEY = "growops-planner:data:v1";
const WEB_DB_NAME = "growops-planner-web";
const WEB_STORE_NAME = "snapshots";
const WEB_SNAPSHOT_KEY = "app-data";
const APP_VERSION = "0.1.16";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<Invoke | null> {
  if (!window.__TAURI_INTERNALS__) return null;
  try {
    const api = await import("@tauri-apps/api/core");
    return api.invoke as Invoke;
  } catch {
    return null;
  }
}

export async function getAppStatus(): Promise<AppStatus> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<AppStatus>("app_status");
  }
  return {
    dbPath: "Web build: IndexedDB snapshot store",
    appDataDir: "Web build: browser IndexedDB and downloaded files",
    photoDir: "Browser fallback: local previews",
    backupDir: "Browser fallback: downloads",
    exportDir: "Browser fallback: downloads",
    version: APP_VERSION,
    sqliteAvailable: false
  };
}

export async function loadSnapshot(): Promise<AppData> {
  const invoke = await getInvoke();
  if (invoke) {
    const value = await invoke<unknown>("load_snapshot");
    if (value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0) {
      return upgradeSnapshot(validateBackup(value));
    }
    const seed = createFreshData();
    await invoke("save_snapshot", { snapshot: seed });
    return seed;
  }

  const raw = await readWebSnapshotText();
  if (!raw) {
    const seed = createFreshData();
    await writeWebSnapshotText(JSON.stringify(seed));
    return seed;
  }
  try {
    return upgradeSnapshot(safeParseJsonBackup(raw));
  } catch {
    const seed = createFreshData();
    await writeWebSnapshotText(JSON.stringify(seed));
    return seed;
  }
}

function upgradeSnapshot(data: AppData): AppData {
  return {
    ...data,
    appSettings: { ...data.appSettings, appVersion: APP_VERSION },
    expenseLogs: data.expenseLogs ?? [],
    inventoryLots: data.inventoryLots ?? [],
    collaborationEvents: data.collaborationEvents ?? []
  };
}

export async function saveSnapshot(data: AppData): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke("save_snapshot", { snapshot: data });
    return;
  }
  await writeWebSnapshotText(JSON.stringify(data));
}

export async function exportBackup(data: AppData): Promise<string> {
  const text = JSON.stringify({ ...data, exportedAt: new Date().toISOString(), product: "GrowOps Planner" }, null, 2);
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<string>("export_backup", { backupJson: text });
  }
  downloadTextFile(`growops-backup-${new Date().toISOString().slice(0, 10)}.json`, text, "application/json");
  return "Downloaded backup JSON";
}

export async function importBackupText(text: string): Promise<AppData> {
  const data = upgradeSnapshot(safeParseJsonBackup(text));
  await saveSnapshot(data);
  return data;
}

export async function exportCsvFile(fileName: string, csv: string): Promise<string> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<string>("export_csv", { fileName, csv });
  }
  downloadTextFile(fileName, csv, "text/csv");
  return "Downloaded CSV";
}

export async function exportSyncPackageFile(fileName: string, payload: unknown): Promise<string> {
  const text = JSON.stringify(payload, null, 2);
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<string>("export_sync_package", { fileName, packageJson: text });
  }
  downloadTextFile(fileName, text, "application/json");
  return "Downloaded sync package JSON";
}

export async function openBluetoothSettings(): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return "Bluetooth settings are available in the packaged Windows app.";
  return invoke<string>("open_bluetooth_settings");
}

export async function openBluetoothTransfer(): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return "Bluetooth transfer is available in the packaged Windows app.";
  return invoke<string>("open_bluetooth_transfer");
}

export async function revealLocalFile(filePath: string): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return filePath;
  return invoke<string>("reveal_local_file", { filePath });
}

export async function savePhotoAsset(farmId: string, file: File, caption?: string): Promise<PhotoAsset> {
  const dataUrl = await fileToDataUrl(file);
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<PhotoAsset>("save_photo_asset", {
      farmId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      dataUrl,
      caption: caption ?? ""
    });
  }
  return {
    id: id("photo"),
    farmId,
    fileName: file.name,
    localPath: dataUrl,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    caption,
    createdAt: new Date().toISOString()
  };
}

export interface WebImportResult {
  source: string;
  kind: "crop_summary" | "weather_snapshot";
  title: string;
  summary: string;
  sourceUrl: string;
  items: unknown;
}

export interface UpdateCheckResult {
  version: string;
  notes: string;
  url: string;
  signaturePresent: boolean;
  updateAvailable: boolean;
}

export async function checkUpdateManifest(manifestUrl: string, currentVersion: string): Promise<UpdateCheckResult> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<UpdateCheckResult>("check_update_manifest", { manifestUrl, currentVersion });
  }
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Update check failed: ${response.status}`);
  const value = await response.json();
  return {
    version: value.version ?? "",
    notes: value.notes ?? "",
    url: value.url ?? "",
    signaturePresent: Boolean(value.signature),
    updateAvailable: String(value.version ?? "") > currentVersion
  };
}

export async function fetchWebImport(source: string, topic: string, location: string): Promise<WebImportResult> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<WebImportResult>("fetch_web_import", { source, topic, location });
  }
  if (source === "crop_summary") {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.trim())}`);
    if (!response.ok) throw new Error(`Web import failed: ${response.status}`);
    const value = await response.json();
    return {
      source: "Wikipedia",
      kind: "crop_summary",
      title: value.title ?? topic,
      summary: value.extract ?? "",
      sourceUrl: value.content_urls?.desktop?.page ?? "",
      items: []
    };
  }
  const place = (location || topic).trim();
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`).then((response) => response.json());
  const first = geo.results?.[0];
  if (!first) throw new Error("No matching location was found.");
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
  const forecast = await fetch(forecastUrl).then((response) => response.json());
  const current = forecast.current ?? {};
  return {
    source: "Open-Meteo",
    kind: "weather_snapshot",
    title: `Weather snapshot for ${first.name}`,
    summary: `${first.name}: current ${current.temperature_2m ?? "unknown"}F, ${current.relative_humidity_2m ?? "unknown"}% humidity, ${current.wind_speed_10m ?? "unknown"} mph wind, ${current.precipitation ?? "unknown"} in precipitation.`,
    sourceUrl: forecastUrl,
    items: forecast.daily ?? {}
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readWebSnapshotText(): Promise<string | null> {
  const localFallback = localStorage.getItem(LOCAL_KEY);
  if (!("indexedDB" in window)) return localFallback;
  try {
    const db = await openWebDb();
    const value = await webStoreRequest<string | undefined>(db, "readonly", (store) => store.get(WEB_SNAPSHOT_KEY));
    if (value) return value;
    if (localFallback) {
      await writeWebSnapshotText(localFallback);
      return localFallback;
    }
    return null;
  } catch {
    return localFallback;
  }
}

async function writeWebSnapshotText(text: string): Promise<void> {
  localStorage.setItem(LOCAL_KEY, text);
  if (!("indexedDB" in window)) return;
  try {
    const db = await openWebDb();
    await webStoreRequest(db, "readwrite", (store) => store.put(text, WEB_SNAPSHOT_KEY));
  } catch {
    localStorage.setItem(LOCAL_KEY, text);
  }
}

function openWebDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WEB_STORE_NAME)) db.createObjectStore(WEB_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function webStoreRequest<T = unknown>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WEB_STORE_NAME, mode);
    const request = run(transaction.objectStore(WEB_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
