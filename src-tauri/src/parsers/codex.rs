use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::path::Path;
use rusqlite::{params, Connection};

use crate::parsers::claude::event_id;
use crate::pricing::PricingTable;
use crate::store::schema::{Source, UsageEvent};

// Codex state_5.sqlite threads row
#[derive(Debug)]
struct ThreadRow {
    id: String,
    model: String,
    tokens_used: u64,
    cwd: Option<String>,
    git_branch: Option<String>,
    created_at: i64,
}

// Codex session JSONL structures
#[derive(Debug, Deserialize)]
struct CodexRecord {
    #[serde(rename = "type")]
    record_type: String,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    payload: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct TokenCountInfo {
    total_token_usage: Option<TokenUsage>,
}

#[derive(Debug, Deserialize)]
struct TokenUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    cached_input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    reasoning_output_tokens: u64,
}

pub struct CodexParser<'a> {
    pricing: &'a PricingTable,
}

impl<'a> CodexParser<'a> {
    pub fn new(pricing: &'a PricingTable) -> Self {
        Self { pricing }
    }

    /// Parse per-turn events from a session JSONL file.
    /// Returns (events, new_byte_offset).
    pub fn parse_session_jsonl(
        &self,
        path: &Path,
        byte_offset: u64,
    ) -> anyhow::Result<(Vec<UsageEvent>, u64)> {
        let file = std::fs::File::open(path)?;
        let file_len = file.metadata()?.len();
        if file_len <= byte_offset {
            return Ok((vec![], byte_offset));
        }

        use std::io::Seek;
        let mut file = file;
        file.seek(std::io::SeekFrom::Start(byte_offset))?;

        let mut reader = BufReader::new(&mut file);
        let mut events = Vec::new();
        let mut current_offset = byte_offset;

        // First pass: read session_meta to get session context
        let mut session_id = session_id_from_path(path);
        let mut model = String::from("unknown");
        let mut cwd: Option<String> = None;

        let mut line = String::new();
        while reader.read_line(&mut line)? > 0 {
            current_offset += line.len() as u64;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                line.clear();
                continue;
            }
            if let Ok(record) = serde_json::from_str::<CodexRecord>(trimmed) {
                match record.record_type.as_str() {
                    "session_meta" => {
                        if let Some(payload) = &record.payload {
                            if let Some(id) = payload.get("id").and_then(|v| v.as_str()) {
                                session_id = id.to_string();
                            }
                            if let Some(m) = payload.get("model_provider").and_then(|v| v.as_str()) {
                                model = m.to_string();
                            }
                            if let Some(w) = payload.get("cwd").and_then(|v| v.as_str()) {
                                cwd = Some(w.to_string());
                            }
                        }
                    }
                    "event_msg" => {
                        if let Some(payload) = &record.payload {
                            // look for token_count events
                            let ev_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            if ev_type == "token_count" {
                                if let Some(info_val) = payload.get("info") {
                                    if let Ok(info) = serde_json::from_value::<TokenCountInfo>(info_val.clone()) {
                                        if let Some(usage) = info.total_token_usage {
                                            let ts_ms = record.timestamp.as_deref()
                                                .and_then(parse_ts)
                                                .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

                                            // Use turn index as unique discriminator within session
                                            let turn_key = format!("{}:{}:{}", session_id, ts_ms, events.len());
                                            let id = event_id("codex", &session_id, &turn_key);

                                            let cost = self.pricing.compute_cost(
                                                &model,
                                                usage.input_tokens,
                                                usage.output_tokens,
                                                0,
                                                usage.cached_input_tokens,
                                                usage.reasoning_output_tokens,
                                            );

                                            let project = cwd.as_deref().map(project_name);

                                            events.push(UsageEvent {
                                                id,
                                                source: Source::Codex,
                                                timestamp_ms: ts_ms,
                                                session_id: session_id.clone(),
                                                project,
                                                git_branch: None,
                                                model: model.clone(),
                                                input_tokens: usage.input_tokens,
                                                output_tokens: usage.output_tokens,
                                                cache_creation_tokens: 0,
                                                cache_read_tokens: usage.cached_input_tokens,
                                                reasoning_tokens: usage.reasoning_output_tokens,
                                                cost_usd: cost,
                                            });
                                        }
                                    }
                                }
                            }
                            // also pick up model from turn_context
                            if ev_type == "turn_context" {
                                if let Some(m) = payload.get("model").and_then(|v| v.as_str()) {
                                    model = m.to_string();
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            line.clear();
        }

        Ok((events, current_offset))
    }

    /// Read aggregate totals from Codex state_5.sqlite threads table.
    /// Returns synthetic per-thread UsageEvents (one event per thread, using total tokens).
    /// Only returns threads not already seen (caller tracks seen session IDs).
    pub fn parse_sqlite_threads(
        &self,
        sqlite_path: &Path,
        seen_sessions: &HashSet<String>,
    ) -> anyhow::Result<Vec<UsageEvent>> {
        let conn = Connection::open(sqlite_path)?;
        let mut stmt = conn.prepare(
            "SELECT id, model, tokens_used, cwd, git_branch, created_at
             FROM threads
             WHERE tokens_used > 0
             ORDER BY created_at ASC"
        )?;

        let threads: Vec<ThreadRow> = stmt.query_map([], |row| {
            Ok(ThreadRow {
                id: row.get(0)?,
                model: row.get(1).unwrap_or_else(|_| "unknown".into()),
                tokens_used: row.get::<_, i64>(2).map(|v| v as u64).unwrap_or(0),
                cwd: row.get(3)?,
                git_branch: row.get(4)?,
                created_at: row.get::<_, i64>(5).unwrap_or(0),
            })
        })?.filter_map(|r| r.ok()).collect();

        let mut events = Vec::new();
        for thread in threads {
            if seen_sessions.contains(&thread.id) {
                continue;
            }
            // For threads without per-turn JSONL, treat total tokens as one event.
            // Assume 50/50 input/output split as a conservative approximation.
            let input = thread.tokens_used / 2;
            let output = thread.tokens_used - input;
            let cost = self.pricing.compute_cost(&thread.model, input, output, 0, 0, 0);
            let ts_ms = thread.created_at * 1000;
            let id = event_id("codex", &thread.id, "sqlite-total");
            let project = thread.cwd.as_deref().map(project_name);

            events.push(UsageEvent {
                id,
                source: Source::Codex,
                timestamp_ms: ts_ms,
                session_id: thread.id,
                project,
                git_branch: thread.git_branch,
                model: thread.model,
                input_tokens: input,
                output_tokens: output,
                cache_creation_tokens: 0,
                cache_read_tokens: 0,
                reasoning_tokens: 0,
                cost_usd: cost,
            });
        }

        Ok(events)
    }
}

fn session_id_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .and_then(|s| {
            // filename format: rollout-DATE-UUID
            s.rsplitn(2, '-').last().map(|p| p.to_string())
        })
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn project_name(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(cwd)
        .to_string()
}

fn parse_ts(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp_millis())
}
