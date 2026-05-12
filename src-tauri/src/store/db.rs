use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use crate::store::schema::{AlertFired, Budget, BudgetPeriod, BudgetScope, DailyRollup, Source, UsageEvent};

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: PathBuf) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS usage_events (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                timestamp_ms INTEGER NOT NULL,
                session_id TEXT NOT NULL,
                project TEXT,
                git_branch TEXT,
                model TEXT NOT NULL,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
                cache_read_tokens INTEGER NOT NULL DEFAULT 0,
                reasoning_tokens INTEGER NOT NULL DEFAULT 0,
                cost_usd REAL NOT NULL DEFAULT 0.0
            );
            CREATE INDEX IF NOT EXISTS idx_ue_ts ON usage_events(timestamp_ms);
            CREATE INDEX IF NOT EXISTS idx_ue_session ON usage_events(session_id);
            CREATE INDEX IF NOT EXISTS idx_ue_model ON usage_events(model);

            CREATE TABLE IF NOT EXISTS scan_state (
                path TEXT PRIMARY KEY,
                mtime_ms INTEGER NOT NULL,
                byte_offset INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                scope_type TEXT NOT NULL,
                scope_value TEXT,
                limit_usd REAL NOT NULL,
                period TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS alerts_fired (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                budget_id INTEGER NOT NULL,
                budget_name TEXT NOT NULL,
                fired_at_ms INTEGER NOT NULL,
                spent_usd REAL NOT NULL,
                limit_usd REAL NOT NULL,
                FOREIGN KEY(budget_id) REFERENCES budgets(id)
            );
        ")?;
        Ok(())
    }

    pub fn insert_event(&self, ev: &UsageEvent) -> Result<bool> {
        let rows = self.conn.execute(
            "INSERT OR IGNORE INTO usage_events
             (id,source,timestamp_ms,session_id,project,git_branch,model,
              input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,
              reasoning_tokens,cost_usd)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                ev.id, ev.source.to_string(), ev.timestamp_ms, ev.session_id,
                ev.project, ev.git_branch, ev.model,
                ev.input_tokens as i64, ev.output_tokens as i64,
                ev.cache_creation_tokens as i64, ev.cache_read_tokens as i64,
                ev.reasoning_tokens as i64, ev.cost_usd
            ],
        )?;
        Ok(rows > 0)
    }

    pub fn get_scan_state(&self, path: &str) -> Result<Option<(i64, u64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT mtime_ms, byte_offset FROM scan_state WHERE path = ?1"
        )?;
        let result = stmt.query_row(params![path], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        });
        match result {
            Ok((mtime, offset)) => Ok(Some((mtime, offset as u64))),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn set_scan_state(&self, path: &str, mtime_ms: i64, byte_offset: u64) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO scan_state (path, mtime_ms, byte_offset) VALUES (?1,?2,?3)",
            params![path, mtime_ms, byte_offset as i64],
        )?;
        Ok(())
    }

    pub fn query_daily_rollup(&self, days: u32) -> Result<Vec<DailyRollup>> {
        let cutoff_ms = chrono::Utc::now().timestamp_millis()
            - (days as i64 * 86_400_000);
        let mut stmt = self.conn.prepare(
            "SELECT
               date(timestamp_ms/1000,'unixepoch') as day,
               source, model, project,
               SUM(input_tokens), SUM(output_tokens),
               SUM(cache_creation_tokens), SUM(cache_read_tokens),
               SUM(reasoning_tokens), SUM(cost_usd), COUNT(*)
             FROM usage_events
             WHERE timestamp_ms >= ?1
             GROUP BY day, source, model, project
             ORDER BY day DESC"
        )?;
        let rows = stmt.query_map(params![cutoff_ms], |row| {
            Ok(DailyRollup {
                date: row.get(0)?,
                source: row.get(1)?,
                model: row.get(2)?,
                project: row.get(3)?,
                input_tokens: row.get::<_, i64>(4)? as u64,
                output_tokens: row.get::<_, i64>(5)? as u64,
                cache_creation_tokens: row.get::<_, i64>(6)? as u64,
                cache_read_tokens: row.get::<_, i64>(7)? as u64,
                reasoning_tokens: row.get::<_, i64>(8)? as u64,
                cost_usd: row.get(9)?,
                event_count: row.get::<_, i64>(10)? as u64,
            })
        })?;
        rows.collect()
    }

    pub fn query_cost_since(&self, since_ms: i64) -> Result<f64> {
        let cost: f64 = self.conn.query_row(
            "SELECT COALESCE(SUM(cost_usd),0.0) FROM usage_events WHERE timestamp_ms >= ?1",
            params![since_ms],
            |row| row.get(0),
        )?;
        Ok(cost)
    }

    pub fn query_recent_events(&self, limit: u32) -> Result<Vec<UsageEvent>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,source,timestamp_ms,session_id,project,git_branch,model,
                    input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,
                    reasoning_tokens,cost_usd
             FROM usage_events
             ORDER BY timestamp_ms DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(UsageEvent {
                id: row.get(0)?,
                source: Source::from_str(&row.get::<_, String>(1)?),
                timestamp_ms: row.get(2)?,
                session_id: row.get(3)?,
                project: row.get(4)?,
                git_branch: row.get(5)?,
                model: row.get(6)?,
                input_tokens: row.get::<_, i64>(7)? as u64,
                output_tokens: row.get::<_, i64>(8)? as u64,
                cache_creation_tokens: row.get::<_, i64>(9)? as u64,
                cache_read_tokens: row.get::<_, i64>(10)? as u64,
                reasoning_tokens: row.get::<_, i64>(11)? as u64,
                cost_usd: row.get(12)?,
            })
        })?;
        rows.collect()
    }

    pub fn query_events_since(&self, since_ms: i64) -> Result<Vec<UsageEvent>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,source,timestamp_ms,session_id,project,git_branch,model,
                    input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,
                    reasoning_tokens,cost_usd
             FROM usage_events WHERE timestamp_ms >= ?1 ORDER BY timestamp_ms ASC"
        )?;
        let rows = stmt.query_map(params![since_ms], |row| {
            Ok(UsageEvent {
                id: row.get(0)?,
                source: Source::from_str(&row.get::<_, String>(1)?),
                timestamp_ms: row.get(2)?,
                session_id: row.get(3)?,
                project: row.get(4)?,
                git_branch: row.get(5)?,
                model: row.get(6)?,
                input_tokens: row.get::<_, i64>(7)? as u64,
                output_tokens: row.get::<_, i64>(8)? as u64,
                cache_creation_tokens: row.get::<_, i64>(9)? as u64,
                cache_read_tokens: row.get::<_, i64>(10)? as u64,
                reasoning_tokens: row.get::<_, i64>(11)? as u64,
                cost_usd: row.get(12)?,
            })
        })?;
        rows.collect()
    }

    pub fn list_budgets(&self) -> Result<Vec<Budget>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,name,scope_type,scope_value,limit_usd,period,enabled FROM budgets"
        )?;
        let rows = stmt.query_map([], |row| {
            let scope_type: String = row.get(2)?;
            let scope_value: Option<String> = row.get(3)?;
            let scope = match scope_type.as_str() {
                "source" => BudgetScope::Source(scope_value.unwrap_or_default()),
                "model" => BudgetScope::Model(scope_value.unwrap_or_default()),
                _ => BudgetScope::All,
            };
            let period = match row.get::<_, String>(5)?.as_str() {
                "monthly" => BudgetPeriod::Monthly,
                _ => BudgetPeriod::Daily,
            };
            Ok(Budget {
                id: row.get(0)?,
                name: row.get(1)?,
                scope,
                limit_usd: row.get(4)?,
                period,
                enabled: row.get::<_, i32>(6)? != 0,
            })
        })?;
        rows.collect()
    }

    pub fn save_budget(&self, budget: &Budget) -> Result<i64> {
        let (scope_type, scope_value) = match &budget.scope {
            BudgetScope::All => ("all", None),
            BudgetScope::Source(s) => ("source", Some(s.as_str())),
            BudgetScope::Model(m) => ("model", Some(m.as_str())),
        };
        let period = match budget.period {
            BudgetPeriod::Daily => "daily",
            BudgetPeriod::Monthly => "monthly",
        };
        if budget.id == 0 {
            self.conn.execute(
                "INSERT INTO budgets (name,scope_type,scope_value,limit_usd,period,enabled)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                params![budget.name, scope_type, scope_value, budget.limit_usd, period, budget.enabled as i32],
            )?;
            Ok(self.conn.last_insert_rowid())
        } else {
            self.conn.execute(
                "UPDATE budgets SET name=?1,scope_type=?2,scope_value=?3,
                 limit_usd=?4,period=?5,enabled=?6 WHERE id=?7",
                params![budget.name, scope_type, scope_value, budget.limit_usd, period, budget.enabled as i32, budget.id],
            )?;
            Ok(budget.id)
        }
    }

    pub fn delete_budget(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM budgets WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn insert_alert_fired(&self, alert: &AlertFired) -> Result<()> {
        self.conn.execute(
            "INSERT INTO alerts_fired (budget_id,budget_name,fired_at_ms,spent_usd,limit_usd)
             VALUES (?1,?2,?3,?4,?5)",
            params![alert.budget_id, alert.budget_name, alert.fired_at_ms, alert.spent_usd, alert.limit_usd],
        )?;
        Ok(())
    }

    pub fn list_alerts_fired(&self, limit: u32) -> Result<Vec<AlertFired>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,budget_id,budget_name,fired_at_ms,spent_usd,limit_usd
             FROM alerts_fired ORDER BY fired_at_ms DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(AlertFired {
                id: row.get(0)?,
                budget_id: row.get(1)?,
                budget_name: row.get(2)?,
                fired_at_ms: row.get(3)?,
                spent_usd: row.get(4)?,
                limit_usd: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn export_csv(&self, since_ms: i64) -> Result<String> {
        let events = self.query_events_since(since_ms)?;
        let mut out = String::from(
            "id,source,timestamp_ms,session_id,project,git_branch,model,\
             input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,\
             reasoning_tokens,cost_usd\n"
        );
        for e in events {
            out.push_str(&format!(
                "{},{},{},{},{},{},{},{},{},{},{},{},{:.6}\n",
                e.id, e.source, e.timestamp_ms, e.session_id,
                e.project.as_deref().unwrap_or(""),
                e.git_branch.as_deref().unwrap_or(""),
                e.model,
                e.input_tokens, e.output_tokens,
                e.cache_creation_tokens, e.cache_read_tokens,
                e.reasoning_tokens, e.cost_usd,
            ));
        }
        Ok(out)
    }
}
