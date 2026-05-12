use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

use crate::store::db::Db;
use crate::store::schema::{AlertFired, BudgetPeriod};

pub struct AlertEngine {
    // budget_id → last-fired day (YYYY-MM-DD) to avoid re-firing same day
    last_fired: HashMap<i64, String>,
}

impl AlertEngine {
    pub fn new() -> Self {
        Self { last_fired: HashMap::new() }
    }

    pub fn evaluate(&mut self, db: &Db, today_spent: f64, app: &AppHandle) {
        let budgets = match db.list_budgets() {
            Ok(b) => b,
            Err(e) => { log::warn!("alert eval: {}", e); return; }
        };

        let today_str = chrono::Utc::now().format("%Y-%m-%d").to_string();

        let mtd_spent = {
            let month_start = month_start_ms();
            db.query_cost_since(month_start).unwrap_or(0.0)
        };

        for budget in budgets {
            if !budget.enabled {
                continue;
            }
            let spent = match budget.period {
                BudgetPeriod::Daily => today_spent,
                BudgetPeriod::Monthly => mtd_spent,
            };

            if spent < budget.limit_usd {
                continue;
            }

            // Don't re-fire the same budget on the same day
            let last = self.last_fired.get(&budget.id).cloned().unwrap_or_default();
            if last == today_str {
                continue;
            }
            self.last_fired.insert(budget.id, today_str.clone());

            let alert = AlertFired {
                id: 0,
                budget_id: budget.id,
                budget_name: budget.name.clone(),
                fired_at_ms: chrono::Utc::now().timestamp_millis(),
                spent_usd: spent,
                limit_usd: budget.limit_usd,
            };

            db.insert_alert_fired(&alert).ok();

            let body = format!(
                "Spent ${:.2} / ${:.2} limit ({})",
                spent, budget.limit_usd,
                match budget.period { BudgetPeriod::Daily => "today", BudgetPeriod::Monthly => "this month" }
            );

            app.notification()
                .builder()
                .title(format!("Budget alert: {}", budget.name))
                .body(&body)
                .show()
                .ok();

            app.emit("alert_fired", &alert).ok();
            log::info!("Budget alert fired: {} — {}", budget.name, body);
        }
    }
}

fn month_start_ms() -> i64 {
    let now = chrono::Utc::now();
    let first = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1).unwrap();
    first.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis()
}

use chrono::Datelike;
