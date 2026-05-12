use serde::Deserialize;
use serde_json::Value;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use sha2::{Digest, Sha256};

use crate::pricing::PricingTable;
use crate::store::schema::{Source, UsageEvent};

#[derive(Debug, Deserialize)]
struct ClaudeRecord {
    #[serde(rename = "type")]
    record_type: String,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(rename = "sessionId")]
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(rename = "gitBranch")]
    #[serde(default)]
    git_branch: Option<String>,
    #[serde(default)]
    message: Option<Value>,
    #[serde(default)]
    uuid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MessageUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    cache_creation_input_tokens: u64,
    #[serde(default)]
    cache_read_input_tokens: u64,
}

pub struct ClaudeParser<'a> {
    pricing: &'a PricingTable,
}

impl<'a> ClaudeParser<'a> {
    pub fn new(pricing: &'a PricingTable) -> Self {
        Self { pricing }
    }

    pub fn parse_file_from_offset<R: Read + Seek>(
        &self,
        reader: &mut R,
        byte_offset: u64,
    ) -> anyhow::Result<(Vec<UsageEvent>, u64)> {
        reader.seek(SeekFrom::Start(byte_offset))?;
        let mut buf_reader = BufReader::new(reader);
        let mut events = Vec::new();
        let mut line = String::new();
        let mut current_offset = byte_offset;

        loop {
            line.clear();
            let bytes_read = buf_reader.read_line(&mut line)?;
            if bytes_read == 0 {
                break;
            }
            current_offset += bytes_read as u64;

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(record) = serde_json::from_str::<ClaudeRecord>(trimmed) {
                if record.record_type == "assistant" {
                    if let Some(ev) = self.extract_event(record) {
                        events.push(ev);
                    }
                }
            }
        }

        Ok((events, current_offset))
    }

    pub fn parse_file(&self, path: &Path) -> anyhow::Result<Vec<UsageEvent>> {
        let file = std::fs::File::open(path)?;
        let mut reader = BufReader::new(file);
        let mut events = Vec::new();
        let mut line = String::new();

        while reader.read_line(&mut line)? > 0 {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                if let Ok(record) = serde_json::from_str::<ClaudeRecord>(trimmed) {
                    if record.record_type == "assistant" {
                        if let Some(ev) = self.extract_event(record) {
                            events.push(ev);
                        }
                    }
                }
            }
            line.clear();
        }

        Ok(events)
    }

    fn extract_event(&self, record: ClaudeRecord) -> Option<UsageEvent> {
        let message = record.message.as_ref()?;

        // must have usage block
        let usage_val = message.get("usage")?;
        let usage: MessageUsage = serde_json::from_value(usage_val.clone()).ok()?;

        let model = message.get("model")?.as_str()?.to_string();
        let timestamp_ms = parse_timestamp(record.timestamp.as_deref()?)?;
        let session_id = record.session_id.clone().unwrap_or_default();
        let message_id = message.get("id")
            .and_then(|v| v.as_str())
            .or(record.uuid.as_deref())
            .unwrap_or(&session_id);

        let id = event_id("claude", &session_id, message_id);
        let project = record.cwd.as_deref().map(project_from_cwd);

        let cost_usd = self.pricing.compute_cost(
            &model,
            usage.input_tokens,
            usage.output_tokens,
            usage.cache_creation_input_tokens,
            usage.cache_read_input_tokens,
            0,
        );

        Some(UsageEvent {
            id,
            source: Source::Claude,
            timestamp_ms,
            session_id,
            project,
            git_branch: record.git_branch,
            model,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_creation_tokens: usage.cache_creation_input_tokens,
            cache_read_tokens: usage.cache_read_input_tokens,
            reasoning_tokens: 0,
            cost_usd,
        })
    }
}

fn parse_timestamp(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

fn project_from_cwd(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(cwd)
        .to_string()
}

pub fn event_id(source: &str, session_id: &str, msg_id: &str) -> String {
    let mut h = Sha256::new();
    h.update(source.as_bytes());
    h.update(b":");
    h.update(session_id.as_bytes());
    h.update(b":");
    h.update(msg_id.as_bytes());
    hex::encode(&h.finalize()[..12])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pricing::PricingTable;

    #[test]
    fn parse_assistant_event() {
        let line = r#"{"type":"assistant","timestamp":"2026-05-07T01:08:49.621Z","sessionId":"test-session","cwd":"/home/user/my-project","gitBranch":"main","uuid":"msg-1","message":{"id":"msg_abc","model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":200,"cache_creation_input_tokens":50,"cache_read_input_tokens":10}}}"#;
        let pricing = PricingTable::load(None);
        let parser = ClaudeParser::new(&pricing);
        let record: super::ClaudeRecord = serde_json::from_str(line).unwrap();
        let ev = parser.extract_event(record).unwrap();
        assert_eq!(ev.input_tokens, 100);
        assert_eq!(ev.output_tokens, 200);
        assert_eq!(ev.model, "claude-sonnet-4-6");
        assert_eq!(ev.project.as_deref(), Some("my-project"));
        assert!(ev.cost_usd > 0.0);
    }

    #[test]
    fn skips_non_assistant() {
        let line = r#"{"type":"user","timestamp":"2026-05-07T01:08:49.621Z","sessionId":"s","message":{}}"#;
        let pricing = PricingTable::load(None);
        let parser = ClaudeParser::new(&pricing);
        let record: super::ClaudeRecord = serde_json::from_str(line).unwrap();
        assert!(parser.extract_event(record).is_none());
    }
}
