mod alerts;
mod commands;
mod parsers;
mod pricing;
mod store;
mod watchers;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::MacosLauncher;

use alerts::AlertEngine;
use commands::DbState;
use pricing::PricingTable;
use store::db::Db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let app_data = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&app_data).ok();

            let db_path = app_data.join("token-monitoring.sqlite");
            let db = Db::open(db_path).expect("failed to open app database");
            let db: DbState = Arc::new(Mutex::new(db));
            app.manage(db.clone());

            let pricing = Arc::new(PricingTable::load(Some(&app_data.join("pricing.json"))));
            let alerts = Arc::new(Mutex::new(AlertEngine::new()));

            let handle = app.handle().clone();
            let db2 = db.clone();
            let pricing2 = pricing.clone();
            let alerts2 = alerts.clone();

            // Run initial backfill + start watchers on a background tokio task
            tauri::async_runtime::spawn(async move {
                let claude_dir = dirs::home_dir()
                    .map(|h| h.join(".claude").join("projects"))
                    .unwrap_or_else(|| PathBuf::from("/nonexistent"));

                let codex_dir = dirs::home_dir()
                    .map(|h| h.join(".codex"))
                    .unwrap_or_else(|| PathBuf::from("/nonexistent"));

                // Historical backfill on first run
                initial_backfill(&handle, &db2, &pricing2, &claude_dir, &codex_dir).await;

                // Start live watchers
                let h1 = handle.clone();
                let d1 = db2.clone();
                let p1 = pricing2.clone();
                let al1 = alerts2.clone();
                let cd = claude_dir.clone();
                tauri::async_runtime::spawn(async move {
                    watchers::claude_watcher::run(h1, d1, p1, al1, cd).await;
                });

                let h2 = handle.clone();
                tauri::async_runtime::spawn(async move {
                    watchers::codex_watcher::run(h2, db2, pricing2, alerts2, codex_dir).await;
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::query_recent_events,
            commands::query_events_since,
            commands::query_daily_rollup,
            commands::query_cost_today,
            commands::query_cost_mtd,
            commands::list_budgets,
            commands::save_budget,
            commands::delete_budget,
            commands::list_alerts_fired,
            commands::export_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn initial_backfill(
    app: &AppHandle,
    db: &DbState,
    pricing: &PricingTable,
    claude_dir: &PathBuf,
    codex_dir: &PathBuf,
) {
    use parsers::claude::ClaudeParser;
    use tauri::Emitter;

    // Backfill Claude JSONL history
    if claude_dir.exists() {
        let parser = ClaudeParser::new(pricing);
        let pattern = format!("{}/**/*.jsonl", claude_dir.display());
        let paths = glob::glob(&pattern)
            .into_iter()
            .flatten()
            .flatten();

        let mut total = 0;
        for path in paths {
            let path_str = path.to_string_lossy().to_string();
            let mtime_ms = mtime_ms(&path);

            let already_scanned = {
                let db = db.lock().unwrap();
                db.get_scan_state(&path_str)
                    .ok()
                    .flatten()
                    .map(|(m, _)| m >= mtime_ms)
                    .unwrap_or(false)
            };

            if already_scanned {
                continue;
            }

            match parser.parse_file(&path) {
                Ok(events) => {
                    let db = db.lock().unwrap();
                    for ev in &events {
                        if db.insert_event(ev).unwrap_or(false) {
                            total += 1;
                        }
                    }
                    let file_len = path.metadata().map(|m| m.len()).unwrap_or(0);
                    db.set_scan_state(&path_str, mtime_ms, file_len).ok();
                }
                Err(e) => log::warn!("backfill {:?}: {}", path, e),
            }
        }
        log::info!("Claude backfill complete: {} new events", total);
        app.emit("backfill_progress", serde_json::json!({"source":"claude","count":total})).ok();
    }

    // Codex SQLite backfill happens in codex_watcher on startup
}

fn mtime_ms(path: &std::path::Path) -> i64 {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
