//! Generic HTTP + JSONPath-lite quota provider (settings-backed).

use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use crate::models::{GenericHttpProviderConfig, QuotaSnapshot};
use crate::providers::{
    http_client, missing_secret_snapshot, placeholder_failure, resolve_secret, QuotaProvider,
};

pub struct GenericHttpProvider {
    config: GenericHttpProviderConfig,
}

impl GenericHttpProvider {
    pub fn new(config: GenericHttpProviderConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl QuotaProvider for GenericHttpProvider {
    fn id(&self) -> &str {
        &self.config.id
    }

    async fn fetch(&self) -> QuotaSnapshot {
        let secret = self
            .config
            .auth
            .secret_ref
            .as_deref()
            .and_then(resolve_secret);

        if self.config.auth.kind == "bearer" && secret.is_none() {
            return missing_secret_snapshot(
                self.id(),
                &self.config.display_name,
                self.config
                    .auth
                    .secret_ref
                    .as_deref()
                    .unwrap_or("env:?"),
                None,
                false,
            );
        }

        let method = self.config.request.method.to_uppercase();
        let mut req = match method.as_str() {
            "GET" => http_client().get(&self.config.request.url),
            "POST" => http_client().post(&self.config.request.url),
            other => {
                return placeholder_failure(
                    self.id(),
                    &self.config.display_name,
                    &format!("不支持的 method: {other}"),
                    None,
                    false,
                );
            }
        };

        if let Some(token) = &secret {
            if self.config.auth.kind == "bearer" {
                req = req.bearer_auth(token);
            }
        }

        for (k, v) in &self.config.request.headers {
            if let Some(s) = v.as_str() {
                req = req.header(k, s);
            }
        }

        match req.send().await {
            Ok(resp) if resp.status().is_success() => match resp.json::<Value>().await {
                Ok(body) => {
                    let primary = json_path_lite(&body, &self.config.parse.fields.primary_value);
                    if primary.is_none() {
                        return placeholder_failure(
                            self.id(),
                            &self.config.display_name,
                            "JSONPath 未命中 primaryValue（未伪造数值）",
                            None,
                            false,
                        );
                    }
                    let secondary = self
                        .config
                        .parse
                        .fields
                        .secondary_value
                        .as_ref()
                        .and_then(|p| json_path_lite(&body, p));
                    QuotaSnapshot {
                        id: self.config.id.clone(),
                        display_name: self.config.display_name.clone(),
                        primary_value: primary,
                        secondary_value: secondary,
                        unit: self.config.parse.fields.unit.clone(),
                        ok: true,
                        error_message: None,
                        fallback_url: None,
                        experimental: false,
                        updated_at: Utc::now(),
                    }
                }
                Err(e) => placeholder_failure(
                    self.id(),
                    &self.config.display_name,
                    &format!("JSON 解析失败: {e}"),
                    None,
                    false,
                ),
            },
            Ok(resp) => placeholder_failure(
                self.id(),
                &self.config.display_name,
                &format!("HTTP {}", resp.status()),
                None,
                false,
            ),
            Err(e) => placeholder_failure(
                self.id(),
                &self.config.display_name,
                &format!("请求失败: {e}"),
                None,
                false,
            ),
        }
    }
}

/// Minimal `$.a.b[0].c` style path walker (not full JSONPath).
fn json_path_lite(root: &Value, path: &str) -> Option<String> {
    let path = path.trim().trim_start_matches('$').trim_start_matches('.');
    if path.is_empty() {
        return value_to_string(root);
    }
    let mut cur = root;
    for seg in path.split('.') {
        let (name, index) = if let Some((n, rest)) = seg.split_once('[') {
            let idx = rest.trim_end_matches(']').parse::<usize>().ok()?;
            (n, Some(idx))
        } else {
            (seg, None)
        };
        if !name.is_empty() {
            cur = cur.get(name)?;
        }
        if let Some(i) = index {
            cur = cur.get(i)?;
        }
    }
    value_to_string(cur)
}

fn value_to_string(v: &Value) -> Option<String> {
    match v {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => Some(v.to_string()),
    }
}
