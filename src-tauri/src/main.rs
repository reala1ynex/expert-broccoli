#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const SCHEMA: &str = include_str!("../migrations/schema.sql");
const COLLECTIONS: &[(&str, &str)] = &[
    ("localProfiles", "LocalProfile"),
    ("farms", "Farm"),
    ("environments", "Environment"),
    ("growingAreas", "GrowingArea"),
    ("bedOrUnits", "BedOrUnit"),
    ("crops", "Crop"),
    ("cultivars", "Cultivar"),
    ("growingMedia", "GrowingMedium"),
    ("growingMethods", "GrowingMethod"),
    ("plantings", "Planting"),
    ("plantingEvents", "PlantingEvent"),
    ("tasks", "Task"),
    ("harvestLogs", "HarvestLog"),
    ("revenueLogs", "RevenueLog"),
    ("expenseLogs", "ExpenseLog"),
    ("supplyItems", "SupplyItem"),
    ("inventoryLots", "InventoryLot"),
    ("seedOrderItems", "SeedOrderItem"),
    ("diagnosticCases", "DiagnosticCase"),
    ("diagnosticObservations", "DiagnosticObservation"),
    ("diagnosticResults", "DiagnosticResult"),
    ("recommendations", "Recommendation"),
    ("sensorReadings", "SensorReading"),
    ("photoAssets", "PhotoAsset"),
    ("backupRecords", "BackupRecord"),
    ("collaborationEvents", "CollaborationEvent"),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStatus {
    db_path: String,
    app_data_dir: String,
    photo_dir: String,
    backup_dir: String,
    export_dir: String,
    version: String,
    sqlite_available: bool,
}

#[derive(Serialize)]
struct PhotoAsset {
    id: String,
    #[serde(rename = "farmId")]
    farm_id: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "localPath")]
    local_path: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
    caption: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[tauri::command]
fn app_status(app: AppHandle) -> Result<AppStatus, String> {
    let dirs = ensure_dirs(&app)?;
    let db_path = dirs.app_data_dir.join("growops.sqlite3");
    ensure_db(&db_path)?;
    Ok(AppStatus {
        db_path: db_path.to_string_lossy().to_string(),
        app_data_dir: dirs.app_data_dir.to_string_lossy().to_string(),
        photo_dir: dirs.photo_dir.to_string_lossy().to_string(),
        backup_dir: dirs.backup_dir.to_string_lossy().to_string(),
        export_dir: dirs.export_dir.to_string_lossy().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        sqlite_available: true,
    })
}

#[tauri::command]
fn load_snapshot(app: AppHandle) -> Result<Value, String> {
    let dirs = ensure_dirs(&app)?;
    let db_path = dirs.app_data_dir.join("growops.sqlite3");
    let conn = ensure_db(&db_path)?;
    let mut result = Map::new();
    for (key, table) in COLLECTIONS {
        result.insert((*key).to_string(), read_table(&conn, table)?);
    }
    let app_settings = read_table(&conn, "AppSettings")?;
    if let Some(settings) = app_settings.as_array().and_then(|items| items.first()).cloned() {
        result.insert("appSettings".to_string(), settings);
    }
    if result.get("farms").and_then(Value::as_array).map_or(0, Vec::len) == 0 {
        return Ok(json!({}));
    }
    Ok(Value::Object(result))
}

#[tauri::command]
fn save_snapshot(app: AppHandle, snapshot: Value) -> Result<(), String> {
    let dirs = ensure_dirs(&app)?;
    let db_path = dirs.app_data_dir.join("growops.sqlite3");
    let mut conn = ensure_db(&db_path)?;
    let tx = conn.transaction().map_err(to_string)?;
    for (key, table) in COLLECTIONS {
        let values = snapshot
            .get(*key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        write_table(&tx, table, values)?;
    }
    let settings = snapshot
        .get("appSettings")
        .cloned()
        .unwrap_or_else(|| json!({ "id": "settings", "updatedAt": Utc::now().to_rfc3339() }));
    write_table(&tx, "AppSettings", vec![settings])?;
    tx.commit().map_err(to_string)
}

#[tauri::command]
fn export_backup(app: AppHandle, backup_json: String) -> Result<String, String> {
    let dirs = ensure_dirs(&app)?;
    let file_name = format!("growops-backup-{}.json", Utc::now().format("%Y%m%d-%H%M%S"));
    let path = dirs.backup_dir.join(file_name);
    fs::write(&path, backup_json).map_err(to_string)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_csv(app: AppHandle, file_name: String, csv: String) -> Result<String, String> {
    let dirs = ensure_dirs(&app)?;
    let safe = sanitize_file_name(&file_name, "export.csv");
    let path = dirs.export_dir.join(safe);
    fs::write(&path, csv).map_err(to_string)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_sync_package(app: AppHandle, file_name: String, package_json: String) -> Result<String, String> {
    let dirs = ensure_dirs(&app)?;
    let safe = sanitize_file_name(&file_name, "growops-sync.json");
    let path = dirs.export_dir.join(safe);
    fs::write(&path, package_json).map_err(to_string)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_bluetooth_settings() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg("ms-settings:bluetooth")
            .spawn()
            .map_err(to_string)?;
        Ok("Opened Windows Bluetooth settings.".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Bluetooth settings shortcut is currently implemented for Windows packages.".to_string())
    }
}

#[tauri::command]
fn open_bluetooth_transfer() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("fsquirt.exe").spawn().map_err(to_string)?;
        Ok("Opened Windows Bluetooth File Transfer.".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Bluetooth file transfer shortcut is currently implemented for Windows packages.".to_string())
    }
}

#[tauri::command]
fn reveal_local_file(app: AppHandle, file_path: String) -> Result<String, String> {
    let dirs = ensure_dirs(&app)?;
    let requested = PathBuf::from(file_path);
    let canonical = requested.canonicalize().map_err(to_string)?;
    let allowed_root = dirs.app_data_dir.canonicalize().map_err(to_string)?;
    if !canonical.starts_with(&allowed_root) {
        return Err("Only GrowOps local data files can be revealed.".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", canonical.to_string_lossy()))
            .spawn()
            .map_err(to_string)?;
        Ok(canonical.to_string_lossy().to_string())
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&canonical)
            .spawn()
            .map_err(to_string)?;
        Ok(canonical.to_string_lossy().to_string())
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let folder = canonical.parent().unwrap_or(&allowed_root);
        Command::new("xdg-open").arg(folder).spawn().map_err(to_string)?;
        Ok(canonical.to_string_lossy().to_string())
    }
}

#[tauri::command]
fn save_photo_asset(
    app: AppHandle,
    farm_id: String,
    file_name: String,
    mime_type: String,
    data_url: String,
    caption: String,
) -> Result<PhotoAsset, String> {
    let dirs = ensure_dirs(&app)?;
    let safe_name = sanitize_file_name(&file_name, "photo.bin");
    let bytes = decode_data_url(&data_url)?;
    let asset_id = format!("photo_{}", Uuid::new_v4());
    let final_name = format!("{}-{}", asset_id, safe_name);
    let path = dirs.photo_dir.join(final_name);
    fs::write(&path, &bytes).map_err(to_string)?;
    Ok(PhotoAsset {
        id: asset_id,
        farm_id,
        file_name,
        local_path: path.to_string_lossy().to_string(),
        mime_type,
        size_bytes: bytes.len() as u64,
        caption: if caption.trim().is_empty() { None } else { Some(caption) },
        created_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
fn fetch_web_import(source: String, topic: String, location: String) -> Result<Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("GrowOps Planner/0.1.16 offline-desktop optional-import")
        .build()
        .map_err(to_string)?;
    match source.as_str() {
        "crop_summary" => {
            let clean_topic = topic.trim();
            if clean_topic.len() < 2 {
                return Err("Enter a crop or plant topic to import.".to_string());
            }
            let url = format!(
                "https://en.wikipedia.org/api/rest_v1/page/summary/{}",
                urlencoding::encode(clean_topic)
            );
            let value: Value = client.get(&url).send().map_err(to_string)?.error_for_status().map_err(to_string)?.json().map_err(to_string)?;
            Ok(json!({
                "source": "Wikipedia",
                "kind": "crop_summary",
                "title": value.get("title").and_then(Value::as_str).unwrap_or(clean_topic),
                "summary": value.get("extract").and_then(Value::as_str).unwrap_or(""),
                "sourceUrl": value.get("content_urls").and_then(|urls| urls.get("desktop")).and_then(|desktop| desktop.get("page")).and_then(Value::as_str).unwrap_or(&url),
                "items": []
            }))
        }
        "weather_snapshot" => {
            let place = if location.trim().is_empty() { topic.trim() } else { location.trim() };
            if place.len() < 2 {
                return Err("Enter a location for the weather snapshot.".to_string());
            }
            let geo_url = format!(
                "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=en&format=json",
                urlencoding::encode(place)
            );
            let geo: Value = client.get(&geo_url).send().map_err(to_string)?.error_for_status().map_err(to_string)?.json().map_err(to_string)?;
            let first = geo
                .get("results")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .ok_or_else(|| "No matching location was found.".to_string())?;
            let lat = first.get("latitude").and_then(Value::as_f64).ok_or_else(|| "Location latitude missing.".to_string())?;
            let lon = first.get("longitude").and_then(Value::as_f64).ok_or_else(|| "Location longitude missing.".to_string())?;
            let name = first.get("name").and_then(Value::as_str).unwrap_or(place);
            let country = first.get("country").and_then(Value::as_str).unwrap_or("");
            let forecast_url = format!(
                "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto"
            );
            let forecast: Value = client.get(&forecast_url).send().map_err(to_string)?.error_for_status().map_err(to_string)?.json().map_err(to_string)?;
            let current = forecast.get("current").cloned().unwrap_or_else(|| json!({}));
            let summary = format!(
                "{}{}: current {}F, {}% humidity, {} mph wind, {} in precipitation.",
                name,
                if country.is_empty() { "".to_string() } else { format!(", {country}") },
                current.get("temperature_2m").map(Value::to_string).unwrap_or_else(|| "unknown".to_string()),
                current.get("relative_humidity_2m").map(Value::to_string).unwrap_or_else(|| "unknown".to_string()),
                current.get("wind_speed_10m").map(Value::to_string).unwrap_or_else(|| "unknown".to_string()),
                current.get("precipitation").map(Value::to_string).unwrap_or_else(|| "unknown".to_string())
            );
            Ok(json!({
                "source": "Open-Meteo",
                "kind": "weather_snapshot",
                "title": format!("Weather snapshot for {name}"),
                "summary": summary,
                "sourceUrl": forecast_url,
                "items": forecast.get("daily").cloned().unwrap_or_else(|| json!({}))
            }))
        }
        _ => Err("Unsupported web import source.".to_string()),
    }
}

#[tauri::command]
fn check_update_manifest(manifest_url: String, current_version: String) -> Result<Value, String> {
    let clean = manifest_url.trim();
    if clean.is_empty() {
        return Err("Enter an update manifest URL first.".to_string());
    }
    if !(clean.starts_with("https://") || clean.starts_with("http://")) {
        return Err("Update checks require an http or https static JSON manifest URL.".to_string());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("GrowOps Planner/0.1.16 updater-check")
        .build()
        .map_err(to_string)?;
    let value: Value = client
        .get(clean)
        .send()
        .map_err(to_string)?
        .error_for_status()
        .map_err(to_string)?
        .json()
        .map_err(to_string)?;
    let version = value.get("version").and_then(Value::as_str).unwrap_or("");
    let update_available = semver_tuple(version) > semver_tuple(&current_version);
    Ok(json!({
        "version": version,
        "notes": value.get("notes").and_then(Value::as_str).unwrap_or(""),
        "url": value.get("url").and_then(Value::as_str).unwrap_or(""),
        "signaturePresent": value.get("signature").and_then(Value::as_str).map(|text| !text.trim().is_empty()).unwrap_or(false),
        "updateAvailable": update_available
    }))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_status,
            load_snapshot,
            save_snapshot,
            export_backup,
            export_csv,
            export_sync_package,
            save_photo_asset,
            fetch_web_import,
            open_bluetooth_settings,
            open_bluetooth_transfer,
            reveal_local_file,
            check_update_manifest
        ])
        .run(tauri::generate_context!())
        .expect("error while running GrowOps Planner");
}

struct AppDirs {
    app_data_dir: PathBuf,
    photo_dir: PathBuf,
    backup_dir: PathBuf,
    export_dir: PathBuf,
}

fn ensure_dirs(app: &AppHandle) -> Result<AppDirs, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not resolve app data directory: {err}"))?;
    let photo_dir = app_data_dir.join("photos");
    let backup_dir = app_data_dir.join("backups");
    let export_dir = app_data_dir.join("exports");
    for path in [&app_data_dir, &photo_dir, &backup_dir, &export_dir] {
        fs::create_dir_all(path).map_err(to_string)?;
    }
    Ok(AppDirs {
        app_data_dir,
        photo_dir,
        backup_dir,
        export_dir,
    })
}

fn ensure_db(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_string)?;
    }
    let conn = Connection::open(path).map_err(to_string)?;
    conn.execute_batch(SCHEMA).map_err(to_string)?;
    Ok(conn)
}

fn read_table(conn: &Connection, table: &str) -> Result<Value, String> {
    let sql = format!("SELECT data_json FROM \"{}\" ORDER BY updated_at, id", table);
    let mut stmt = conn.prepare(&sql).map_err(to_string)?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(to_string)?;
    let mut values = Vec::new();
    for row in rows {
        let text = row.map_err(to_string)?;
        let value: Value = serde_json::from_str(&text).map_err(to_string)?;
        values.push(value);
    }
    Ok(Value::Array(values))
}

fn write_table(conn: &Connection, table: &str, values: Vec<Value>) -> Result<(), String> {
    let delete_sql = format!("DELETE FROM \"{}\"", table);
    conn.execute(&delete_sql, []).map_err(to_string)?;
    let insert_sql = format!(
        "INSERT INTO \"{}\" (id, farm_id, data_json, updated_at) VALUES (?1, ?2, ?3, ?4)",
        table
    );
    let mut stmt = conn.prepare(&insert_sql).map_err(to_string)?;
    for value in values {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("row_{}", Uuid::new_v4()));
        let farm_id = value
            .get("farmId")
            .and_then(Value::as_str)
            .map(str::to_string);
        let updated_at = value
            .get("updatedAt")
            .or_else(|| value.get("createdAt"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        let data_json = serde_json::to_string(&value).map_err(to_string)?;
        stmt.execute(params![id, farm_id, data_json, updated_at])
            .map_err(to_string)?;
    }
    Ok(())
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let payload = data_url
        .split_once(',')
        .map(|(_, payload)| payload)
        .unwrap_or(data_url);
    general_purpose::STANDARD
        .decode(payload.as_bytes())
        .map_err(|err| format!("Could not decode photo data: {err}"))
}

fn sanitize_file_name(name: &str, fallback: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ' '))
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed
    }
}

fn to_string<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

fn semver_tuple(version: &str) -> (u64, u64, u64) {
    let clean = version.trim().trim_start_matches('v');
    let mut parts = clean.split('.').map(|part| part.parse::<u64>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}
