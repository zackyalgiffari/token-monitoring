use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::parsers::claude::ClaudeParser;
use crate::pricing::PricingTable;
use crate::store::db::Db;
use crate::store::schema::UsageEvent;
use crate::alerts::AlertEngine;

pub async fn run(
    app: AppHandle,
    db: Arc<Mutex<Db>>,
    pricing: Arc<PricingTable>,
    alerts: Arc<Mutex<AlertEngine>>,
    claude_dir: PathBuf,
) {
    let (tx, mut rx) = mpsc::channel(256);

    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(1)),
    )
    .expect("failed to create claude watcher");

    if watcher.watch(&claude_dir, RecursiveMode::Recursive).is_err() {
        log::warn!("Could not watch {:?} — skipping Claude watcher", claude_dir);
        return;
    }

    log::info!("Claude watcher active on {:?}", claude_dir);
    app.emit("watcher_status", serde_json::json!({"source":"claude","status":"active"})).ok();

    // Track which paths we've already initialised an offset for
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

    app.emit("watcher_status", serde_json::json!({"source":"claude","status":"stopped"})).ok();
}

async fn process_jsonl(
    app: &AppHandle,
    db: &Arc<Mutex<Db>>,
    pricing: &Arc<PricingTable>,
    alerts: &Arc<Mutex<AlertEngine>>,
    path: &Path,
) {
    let path_str = path.to_string_lossy().to_string();
    let mtime_ms = mtime_ms(path);

    let (prev_mtime, byte_offset) = {
        let db = db.lock().unwrap();
        db.get_scan_state(&path_str).unwrap_or(None).unwrap_or((0, 0))
    };

    if mtime_ms <= prev_mtime {
        return;
    }

    let parser = ClaudeParser::new(pricing);
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => { log::warn!("open {:?}: {}", path, e); return; }
    };
    let mut file = file;

    match parser.parse_file_from_offset(&mut file, byte_offset) {
        Ok((events, new_offset)) => {
            let db_guard = db.lock().unwrap();
            for ev in &events {
                if db_guard.insert_event(ev).unwrap_or(false) {
                    emit_event(app, ev);
                }
            }
            db_guard.set_scan_state(&path_str, mtime_ms, new_offset).ok();

            if !events.is_empty() {
                let spent = db_guard.query_cost_since(today_start_ms()).unwrap_or(0.0);
                let mut al = alerts.lock().unwrap();
                al.evaluate(&db_guard, spent, app);
            }
        }
        Err(e) => log::warn!("parse {:?}: {}", path, e),
    }
}

fn emit_event(app: &AppHandle, ev: &UsageEvent) {
    app.emit("usage_event", ev).ok();
}

fn mtime_ms(path: &Path) -> i64 {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn today_start_ms() -> i64 {
    let now = chrono::Utc::now();
    let today = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
    today.and_utc().timestamp_millis()
}
