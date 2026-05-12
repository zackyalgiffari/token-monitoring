use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Source {
    Claude,
    Codex,
}

impl std::fmt::Display for Source {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Source::Claude => write!(f, "claude"),
            Source::Codex => write!(f, "codex"),
        }
    }
}

impl Source {
    pub fn from_str(s: &str) -> Self {
        match s {
            "codex" => Source::Codex,
            _ => Source::Claude,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageEvent {
    pub id: String,
    pub source: Source,
    pub timestamp_ms: i64,
    pub session_id: String,
    pub project: Option<String>,
    pub git_branch: Option<String>,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub reasoning_tokens: u64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyRollup {
    pub date: String,
    pub source: String,
    pub model: String,
    pub project: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub reasoning_tokens: u64,
    pub cost_usd: f64,
    pub event_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Budget {
    pub id: i64,
    pub name: String,
    pub scope: BudgetScope,
    pub limit_usd: f64,
    pub period: BudgetPeriod,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BudgetScope {
    All,
    Source(String),
    Model(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BudgetPeriod {
    Daily,
    Monthly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertFired {
    pub id: i64,
    pub budget_id: i64,
    pub budget_name: String,
    pub fired_at_ms: i64,
    pub spent_usd: f64,
    pub limit_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSummary {
    pub today_cost_usd: f64,
    pub mtd_cost_usd: f64,
    pub today_input_tokens: u64,
    pub today_output_tokens: u64,
    pub active_sessions: Vec<ActiveSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSession {
    pub session_id: String,
    pub source: String,
    pub model: String,
    pub project: Option<String>,
    pub last_event_ms: i64,
    pub total_tokens: u64,
    pub cost_usd: f64,
}
