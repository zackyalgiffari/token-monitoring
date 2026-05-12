use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::parsers::codex::CodexParser;
use crate::pricing::PricingTable;
use crate::store::db::Db;
use crate::store::schema::UsageEvent;
use crate::alerts::AlertEngine;

pub async fn run(
    app: AppHandle,
    db: Arc<Mutex<Db>>,
    pricing: Arc<PricingTable>,
    alerts: Arc<Mutex<AlertEngine>>,
    codex_dir: PathBuf,
) {
    let sessions_dir = codex_dir.join("sessions");
    let sqlite_path = codex_dir.join("state_5.sqlite");

    // Initial SQLite backfill
    if sqlite_path.exists() {
        backfill_sqlite(&app, &db, &pricing, &sqlite_path).await;
    }

    if !sessions_dir.exists() {
        log::warn!("Codex sessions dir not found at {:?}", sessions_dir);
        app.emit("watcher_status", serde_json::json!({"source":"codex","status":"no_dir"})).ok();
        return;
    }

    let (tx, mut rx) = mpsc::channel(256);

    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )
    .expect("failed to create codex watcher");

    if watcher.watch(&sessions_dir, RecursiveMode::Recursive).is_err() {
        log::warn!("Could not watch {:?}", sessions_dir);
        return;
    }

    log::info!("Codex watcher active on {:?}", sessions_dir);
    app.emit("watcher_status", serde_json::json!({"source":"codex","status":"active"})).ok();

    while let Some(event) = rx.recv().await {
        match event.kind {
            EventKind::Create(_) | EventKind::Modify(_) => {
                for path in event.paths {
                    if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                        process_jsonl(&app, &db, &pricing, &alerts, &path).await;
                    }
                }
            }
            _ => {}
        }
    }
}

async fn backfill_sqlite(
    app: &AppHandle,
    db: &Arc<Mutex<Db>>,
    pricing: &Arc<PricingTable>,
    sqlite_path: &Path,
) {
    let seen: HashSet<String> = {
        let db = db.lock().unwrap();
        db.query_recent_events(10_000)
            .unwrap_or_default()
            .into_iter()
            .filter(|e| e.source == crate::store::schema::Source::Codex)
            .map(|e| e.session_id)
            .collect()
    };

    let parser = CodexParser::new(pricing);
    match parser.parse_sqlite_threads(sqlite_path, &seen) {
        Ok(events) => {
            let db = db.lock().unwrap();
            let mut new_count = 0;
            for ev in &events {
                if db.insert_event(ev).unwrap_or(false) {
                    emit_event(app, ev);
                    new_count += 1;
                }
            }
            log::info!("Codex SQLite backfill: {} new thread events", new_count);
        }
        Err(e) => log::warn!("Codex SQLite parse error: {}", e),
    }
}

async fn process_jsonl(
    app: &AppHandle,
    db: &Arc<Mutex<Db>>,
    pricing: &Arc<PricingTable>,
    alerts: &Arc<Mutex<AlertEngine>>,
    path: &Path,
) {
    let path_str = path.to_string_lossy().to_string();
    let parser = CodexParser::new(pricing);

    let byte_offset = {
        let db = db.lock().unwrap();
        db.get_scan_state(&path_str).unwrap_or(None).map(|(_, o)| o).unwrap_or(0)
    };

    match parser.parse_session_jsonl(path, byte_offset) {
        Ok((events, new_offset)) => {
            let db_guard = db.lock().unwrap();
            let mtime_ms = path.metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            for ev in &events {
                if db_guard.insert_event(ev).unwrap_or(false) {
                    emit_event(app, ev);
                }
            }
            db_guard.set_scan_state(&path_str, mtime_ms, new_offset).ok();

            if !events.is_empty() {
                let today_ms = today_start_ms();
                let spent = db_guard.query_cost_since(today_ms).unwrap_or(0.0);
                let mut al = alerts.lock().unwrap();
                al.evaluate(&db_guard, spent, app);
            }
        }
        Err(e) => log::warn!("Codex JSONL parse {:?}: {}", path, e),
    }
}

fn emit_event(app: &AppHandle, ev: &UsageEvent) {
    app.emit("usage_event", ev).ok();
}

fn today_start_ms() -> i64 {
    let now = chrono::Utc::now();
    now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis()
}
