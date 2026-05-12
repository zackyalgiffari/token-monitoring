use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPrice {
    pub input_per_m: f64,
    pub output_per_m: f64,
    pub cache_write_per_m: f64,
    pub cache_read_per_m: f64,
    pub reasoning_per_m: f64,
}

impl ModelPrice {
    pub fn compute_cost(
        &self,
        input: u64, output: u64,
        cache_write: u64, cache_read: u64, reasoning: u64,
    ) -> f64 {
        let m = 1_000_000.0_f64;
        (input as f64 / m) * self.input_per_m
            + (output as f64 / m) * self.output_per_m
            + (cache_write as f64 / m) * self.cache_write_per_m
            + (cache_read as f64 / m) * self.cache_read_per_m
            + (reasoning as f64 / m) * self.reasoning_per_m
    }
}

pub struct PricingTable {
    table: HashMap<String, ModelPrice>,
    default: ModelPrice,
}

impl PricingTable {
    pub fn load(override_path: Option<&Path>) -> Self {
        let mut table = Self::builtin();

        if let Some(path) = override_path {
            if path.exists() {
                if let Ok(data) = std::fs::read_to_string(path) {
                    if let Ok(overrides) = serde_json::from_str::<HashMap<String, ModelPrice>>(&data) {
                        table.extend(overrides);
                    }
                }
            }
        }

        PricingTable {
            table,
            default: ModelPrice {
                input_per_m: 3.0, output_per_m: 15.0,
                cache_write_per_m: 3.75, cache_read_per_m: 0.3,
                reasoning_per_m: 15.0,
            },
        }
    }

    fn builtin() -> HashMap<String, ModelPrice> {
        let mut m = HashMap::new();

        // Claude 4 family
        m.insert("claude-opus-4-7".into(), ModelPrice { input_per_m: 15.0, output_per_m: 75.0, cache_write_per_m: 18.75, cache_read_per_m: 1.5, reasoning_per_m: 75.0 });
        m.insert("claude-opus-4".into(),   ModelPrice { input_per_m: 15.0, output_per_m: 75.0, cache_write_per_m: 18.75, cache_read_per_m: 1.5, reasoning_per_m: 75.0 });
        m.insert("claude-sonnet-4-6".into(), ModelPrice { input_per_m: 3.0, output_per_m: 15.0, cache_write_per_m: 3.75, cache_read_per_m: 0.3, reasoning_per_m: 15.0 });
        m.insert("claude-sonnet-4".into(),   ModelPrice { input_per_m: 3.0, output_per_m: 15.0, cache_write_per_m: 3.75, cache_read_per_m: 0.3, reasoning_per_m: 15.0 });
        m.insert("claude-haiku-4-5-20251001".into(), ModelPrice { input_per_m: 0.80, output_per_m: 4.0, cache_write_per_m: 1.0, cache_read_per_m: 0.08, reasoning_per_m: 4.0 });
        m.insert("claude-haiku-4-5".into(), ModelPrice { input_per_m: 0.80, output_per_m: 4.0, cache_write_per_m: 1.0, cache_read_per_m: 0.08, reasoning_per_m: 4.0 });
        m.insert("claude-haiku-4".into(),   ModelPrice { input_per_m: 0.80, output_per_m: 4.0, cache_write_per_m: 1.0, cache_read_per_m: 0.08, reasoning_per_m: 4.0 });

        // Claude 3 family (legacy)
        m.insert("claude-3-5-sonnet-20241022".into(), ModelPrice { input_per_m: 3.0, output_per_m: 15.0, cache_write_per_m: 3.75, cache_read_per_m: 0.3, reasoning_per_m: 15.0 });
        m.insert("claude-3-5-haiku-20241022".into(),  ModelPrice { input_per_m: 0.80, output_per_m: 4.0, cache_write_per_m: 1.0, cache_read_per_m: 0.08, reasoning_per_m: 4.0 });
        m.insert("claude-3-opus-20240229".into(),     ModelPrice { input_per_m: 15.0, output_per_m: 75.0, cache_write_per_m: 18.75, cache_read_per_m: 1.5, reasoning_per_m: 75.0 });

        // OpenAI Codex / GPT-5 family (approximate — override via pricing.json)
        m.insert("gpt-5.5".into(),       ModelPrice { input_per_m: 10.0, output_per_m: 40.0, cache_write_per_m: 10.0, cache_read_per_m: 2.5, reasoning_per_m: 40.0 });
        m.insert("gpt-5.3-codex".into(), ModelPrice { input_per_m: 3.0,  output_per_m: 15.0, cache_write_per_m: 3.0,  cache_read_per_m: 0.75, reasoning_per_m: 15.0 });
        m.insert("gpt-4o".into(),        ModelPrice { input_per_m: 2.50, output_per_m: 10.0, cache_write_per_m: 2.50, cache_read_per_m: 1.25, reasoning_per_m: 10.0 });
        m.insert("gpt-4o-mini".into(),   ModelPrice { input_per_m: 0.15, output_per_m: 0.60, cache_write_per_m: 0.15, cache_read_per_m: 0.075, reasoning_per_m: 0.60 });
        m.insert("o1".into(),            ModelPrice { input_per_m: 15.0, output_per_m: 60.0, cache_write_per_m: 15.0, cache_read_per_m: 7.5, reasoning_per_m: 60.0 });
        m.insert("o3".into(),            ModelPrice { input_per_m: 10.0, output_per_m: 40.0, cache_write_per_m: 10.0, cache_read_per_m: 2.5, reasoning_per_m: 40.0 });
        m.insert("o4-mini".into(),       ModelPrice { input_per_m: 1.10, output_per_m: 4.40, cache_write_per_m: 1.10, cache_read_per_m: 0.275, reasoning_per_m: 4.40 });

        m
    }

    pub fn price_for(&self, model: &str) -> &ModelPrice {
        // exact match first, then prefix match (handles model ID suffixes)
        if let Some(p) = self.table.get(model) {
            return p;
        }
        for (key, price) in &self.table {
            if model.starts_with(key.as_str()) || key.starts_with(model) {
                return price;
            }
        }
        &self.default
    }

    pub fn compute_cost(
        &self, model: &str,
        input: u64, output: u64,
        cache_write: u64, cache_read: u64, reasoning: u64,
    ) -> f64 {
        self.price_for(model).compute_cost(input, output, cache_write, cache_read, reasoning)
    }

    pub fn all_prices(&self) -> &HashMap<String, ModelPrice> {
        &self.table
    }
}
