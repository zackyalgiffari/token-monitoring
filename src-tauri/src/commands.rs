use std::sync::{Arc, Mutex};
use tauri::State;

use crate::store::db::Db;
use crate::store::schema::{AlertFired, Budget, DailyRollup, UsageEvent};

pub type DbState = Arc<Mutex<Db>>;

#[tauri::command]
pub fn query_recent_events(
    db: State<'_, DbState>,
    limit: Option<u32>,
) -> Result<Vec<UsageEvent>, String> {
    db.lock().unwrap()
        .query_recent_events(limit.unwrap_or(200))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn query_events_since(
    db: State<'_, DbState>,
    since_ms: i64,
) -> Result<Vec<UsageEvent>, String> {
    db.lock().unwrap()
        .query_events_since(since_ms)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn query_daily_rollup(
    db: State<'_, DbState>,
    days: Option<u32>,
) -> Result<Vec<DailyRollup>, String> {
    db.lock().unwrap()
        .query_daily_rollup(days.unwrap_or(90))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn query_cost_today(db: State<'_, DbState>) -> Result<f64, String> {
    let since = today_start_ms();
    db.lock().unwrap()
        .query_cost_since(since)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn query_cost_mtd(db: State<'_, DbState>) -> Result<f64, String> {
    let since = month_start_ms();
    db.lock().unwrap()
        .query_cost_since(since)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_budgets(db: State<'_, DbState>) -> Result<Vec<Budget>, String> {
    db.lock().unwrap()
        .list_budgets()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_budget(
    db: State<'_, DbState>,
    budget: Budget,
) -> Result<i64, String> {
    db.lock().unwrap()
        .save_budget(&budget)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_budget(
    db: State<'_, DbState>,
    id: i64,
) -> Result<(), String> {
    db.lock().unwrap()
        .delete_budget(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_alerts_fired(
    db: State<'_, DbState>,
    limit: Option<u32>,
) -> Result<Vec<AlertFired>, String> {
    db.lock().unwrap()
        .list_alerts_fired(limit.unwrap_or(100))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_csv(
    db: State<'_, DbState>,
    since_ms: Option<i64>,
) -> Result<String, String> {
    let since = since_ms.unwrap_or(0);
    db.lock().unwrap()
        .export_csv(since)
        .map_err(|e| e.to_string())
}

fn today_start_ms() -> i64 {
    chrono::Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis()
}

fn month_start_ms() -> i64 {
    use chrono::Datelike;
    let now = chrono::Utc::now();
    chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis()
}
