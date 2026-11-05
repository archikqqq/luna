use std::{collections::HashMap, sync::{Mutex, OnceLock}};

use futures_util::StreamExt;
use keyring::Entry;
use reqwest::{header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE}, Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio_util::sync::CancellationToken;

const SERVICE: &str = "com.tguse.luna";
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInput {
    pub id: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireMessage {
    pub role: String,
    pub blocks: Vec<WireBlock>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireBlock {
    Text { text: String },
    Image { mime_type: String, data: String },
    ToolCall { id: String, name: String, arguments: String },
    ToolResult { id: String, content: String, is_error: bool },
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    TextDelta { delta: String },
    ReasoningDelta { delta: String },
    ToolCall { id: String, name: String, arguments: String },
    Usage { input_tokens: u64, output_tokens: u64, total_tokens: u64 },
    Done,
    Error { message: String },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKeyInput {
    pub provider_id: String,
    pub key: String,
}

static REQUESTS: OnceLock<Mutex<HashMap<String, CancellationToken>>> = OnceLock::new();

fn requests() -> &'static Mutex<HashMap<String, CancellationToken>> {
    REQUESTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn credential(provider_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, provider_id).map_err(|_| "Не удалось открыть хранилище ключей Windows.".into())
}

fn api_key(provider_id: &str) -> Result<Option<String>, String> {
    match credential(provider_id)?.get_password() {
        Ok(key) if !key.is_empty() => Ok(Some(key)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Не удалось прочитать ключ из Windows Credential Manager.".into()),
    }
}

fn validate_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "Некорректный Base URL.".to_string())?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
    if url.scheme() != "https" && !(local && url.scheme() == "http") {
        return Err("Разрешён только HTTPS; HTTP допускается только для localhost и 127.0.0.1.".into());
    }
    Ok(url)
}

fn client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|_| "Не удалось настроить сетевой клиент.".into())
}

fn endpoint(base: &str, path: &str) -> Result<reqwest::Url, String> {
    let mut url = validate_url(base)?;
    let base_path = url.path().trim_end_matches('/').to_string();
    url.set_path(&format!("{base_path}{path}"));
    Ok(url)
}

fn auth_headers(kind: &str, key: Option<&str>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if let Some(key) = key {
        if kind == "anthropic" {
            headers.insert("x-api-key", HeaderValue::from_str(key).map_err(|_| "Некорректный API-ключ.")?);
            headers.insert("anthropic-version", HeaderValue::from_static(ANTHROPIC_VERSION));
        } else {
            headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {key}")).map_err(|_| "Некорректный API-ключ.")?);
        }
    }
    Ok(headers)
}

async fn response_error(response: reqwest::Response, key: Option<&str>) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let safe = key.map(|secret| body.replace(secret, "[скрыто]")).unwrap_or(body);
    let detail = safe.chars().take(500).collect::<String>();
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => "Неверный API-ключ или доступ запрещён.".into(),
        StatusCode::NOT_FOUND => "Неверный URL или модель не найдена.".into(),
        StatusCode::TOO_MANY_REQUESTS => "Провайдер временно ограничил запросы (429).".into(),
        s if s.is_server_error() => format!("Провайдер временно недоступен ({s})."),
        _ if detail.is_empty() => format!("Провайдер вернул HTTP {status}."),
        _ => format!("Провайдер вернул HTTP {status}: {detail}"),
    }
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Провайдер не ответил вовремя.".into()
    } else if error.is_connect() {
        "Не удалось подключиться к провайдеру. Проверьте сеть и Base URL.".into()
    } else if error.is_decode() {
        "Провайдер вернул невалидный JSON.".into()
    } else {
        "Сетевая ошибка при обращении к провайдеру.".into()
    }
}

fn text_of(blocks: &[WireBlock]) -> String {
    blocks.iter().filter_map(|block| match block {
        WireBlock::Text { text } => Some(text.as_str()),
        _ => None,
    }).collect::<Vec<_>>().join("")
}

fn openai_messages(messages: &[WireMessage]) -> Vec<Value> {
    messages.iter().map(|message| {
        let content = if message.blocks.iter().all(|block| matches!(block, WireBlock::Text { .. })) {
            Value::String(text_of(&message.blocks))
        } else {
            Value::Array(message.blocks.iter().map(|block| match block {
                WireBlock::Text { text } => json!({"type":"text", "text": text}),
                WireBlock::Image { mime_type, data } => json!({"type":"image_url", "image_url":{"url":format!("data:{mime_type};base64,{data}")}}),
                WireBlock::ToolCall { id, name, arguments } => json!({"type":"tool_call", "id":id, "function":{"name":name,"arguments":arguments}}),
                WireBlock::ToolResult { id, content, .. } => json!({"type":"tool_result", "tool_call_id":id, "content":content}),
            }).collect())
        };
        json!({"role": message.role, "content": content})
    }).collect()
}

fn anthropic_messages(messages: &[WireMessage]) -> (Option<String>, Vec<Value>) {
    let system = messages.iter().find(|message| message.role == "system").map(|message| text_of(&message.blocks));
    let items = messages.iter().filter(|message| message.role != "system").map(|message| {
        let content = message.blocks.iter().map(|block| match block {
            WireBlock::Text { text } => json!({"type":"text","text":text}),
            WireBlock::Image { mime_type, data } => json!({"type":"image","source":{"type":"base64","media_type":mime_type,"data":data}}),
            WireBlock::ToolCall { id, name, arguments } => json!({"type":"tool_use","id":id,"name":name,"input":serde_json::from_str::<Value>(arguments).unwrap_or_else(|_| json!({"raw":arguments}))}),
            WireBlock::ToolResult { id, content, is_error } => json!({"type":"tool_result","tool_use_id":id,"content":content,"is_error":is_error}),
        }).collect::<Vec<_>>();
        json!({"role": if message.role == "assistant" {"assistant"} else {"user"}, "content": content})
    }).collect();
    (system, items)
}

#[derive(Default)]
pub struct SseParser {
    buffer: Vec<u8>,
    event: String,
    data: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct SseFrame {
    pub event: String,
    pub data: String,
}

impl SseParser {
    pub fn feed(&mut self, bytes: &[u8]) -> Result<Vec<SseFrame>, String> {
        self.buffer.extend_from_slice(bytes);
        let mut frames = Vec::new();
        while let Some(index) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line = self.buffer.drain(..=index).collect::<Vec<_>>();
            let line = &line[..line.len() - 1];
            let line = if line.last() == Some(&b'\r') { &line[..line.len() - 1] } else { line };
            let text = std::str::from_utf8(line).map_err(|_| "Поток провайдера содержит невалидный UTF-8.".to_string())?;
            if text.is_empty() {
                if !self.data.is_empty() {
                    frames.push(SseFrame { event: if self.event.is_empty() { "message".into() } else { self.event.clone() }, data: self.data.join("\n") });
                }
                self.event.clear();
                self.data.clear();
            } else if text.starts_with(':') {
                continue;
            } else if let Some(value) = text.strip_prefix("event:") {
                self.event = value.strip_prefix(' ').unwrap_or(value).to_string();
            } else if let Some(value) = text.strip_prefix("data:") {
                self.data.push(value.strip_prefix(' ').unwrap_or(value).to_string());
            }
        }
        Ok(frames)
    }
}

async fn send_openai(provider: &ProviderInput, messages: &[WireMessage], key: Option<&str>, request_id: &str, on_event: &Channel<StreamEvent>, token: &CancellationToken) -> Result<(), String> {
    let url = endpoint(&provider.base_url, "/chat/completions")?;
    let body = json!({"model": provider.model, "messages": openai_messages(messages), "stream": true, "stream_options":{"include_usage":true}});
    let response = client()?.post(url).headers(auth_headers(&provider.kind, key)?).json(&body).send().await.map_err(network_error)?;
    if !response.status().is_success() { return Err(response_error(response, key).await); }
    let mut stream = response.bytes_stream();
    let mut parser = SseParser::default();
    while let Some(chunk) = stream.next().await {
        if token.is_cancelled() { return Ok(()); }
        let bytes = chunk.map_err(network_error)?;
        for frame in parser.feed(&bytes)? {
            if frame.data == "[DONE]" { on_event.send(StreamEvent::Done).map_err(|_| "Не удалось передать событие в интерфейс.")?; continue; }
            let value: Value = serde_json::from_str(&frame.data).map_err(|_| "Провайдер прислал невалидный JSON в потоке.")?;
            if let Some(usage) = value.get("usage") && !usage.is_null() { on_event.send(StreamEvent::Usage { input_tokens: usage.get("prompt_tokens").and_then(Value::as_u64).unwrap_or(0), output_tokens: usage.get("completion_tokens").and_then(Value::as_u64).unwrap_or(0), total_tokens: usage.get("total_tokens").and_then(Value::as_u64).unwrap_or(0) }).map_err(|_| "Не удалось передать событие в интерфейс.")?; }
            if let Some(delta) = value.pointer("/choices/0/delta") {
                if let Some(text) = delta.get("content").and_then(Value::as_str).filter(|text| !text.is_empty()) { on_event.send(StreamEvent::TextDelta { delta: text.into() }).map_err(|_| "Не удалось передать событие в интерфейс.")?; }
                for key_name in ["reasoning_content", "reasoning"] {
                    if let Some(text) = delta.get(key_name).and_then(Value::as_str).filter(|text| !text.is_empty()) { on_event.send(StreamEvent::ReasoningDelta { delta: text.into() }).map_err(|_| "Не удалось передать событие в интерфейс.")?; }
                }
                if let Some(tool_calls) = delta.get("tool_calls").and_then(Value::as_array) {
                    for call in tool_calls { on_event.send(StreamEvent::ToolCall { id: call.get("id").and_then(Value::as_str).unwrap_or("").into(), name: call.pointer("/function/name").and_then(Value::as_str).unwrap_or("").into(), arguments: call.pointer("/function/arguments").and_then(Value::as_str).unwrap_or("").into() }).map_err(|_| "Не удалось передать событие в интерфейс.")?; }
                }
            }
        }
    }
    for frame in parser.feed(b"\n")? {
        if frame.data == "[DONE]" { on_event.send(StreamEvent::Done).map_err(|_| "Не удалось передать событие в интерфейс.")?; }
    }
    let _ = request_id;
    Ok(())
}

async fn send_anthropic(provider: &ProviderInput, messages: &[WireMessage], key: Option<&str>, on_event: &Channel<StreamEvent>, token: &CancellationToken) -> Result<(), String> {
    let (system, messages) = anthropic_messages(messages);
    let mut body = json!({"model":provider.model,"max_tokens":4096,"messages":messages,"stream":true});
    if let Some(system) = system { body["system"] = Value::String(system); }
    let url = endpoint(&provider.base_url, "/v1/messages")?;
    let response = client()?.post(url).headers(auth_headers("anthropic", key)?).json(&body).send().await.map_err(network_error)?;
    if !response.status().is_success() { return Err(response_error(response, key).await); }
    let mut stream = response.bytes_stream();
    let mut parser = SseParser::default();
    while let Some(chunk) = stream.next().await {
        if token.is_cancelled() { return Ok(()); }
        for frame in parser.feed(&chunk.map_err(network_error)?)? {
            let value: Value = serde_json::from_str(&frame.data).map_err(|_| "Провайдер прислал невалидный JSON в потоке.")?;
            match value.get("type").and_then(Value::as_str) {
                Some("content_block_delta") => if let Some(delta) = value.get("delta") {
                    match delta.get("type").and_then(Value::as_str) {
                        Some("text_delta") => if let Some(text) = delta.get("text").and_then(Value::as_str) { on_event.send(StreamEvent::TextDelta { delta: text.into() }).map_err(|_| "Не удалось передать событие в интерфейс.")?; },
                        Some("thinking_delta") => if let Some(text) = delta.get("thinking").and_then(Value::as_str) { on_event.send(StreamEvent::ReasoningDelta { delta: text.into() }).map_err(|_| "Не удалось передать событие в интерфейс.")?; },
                        Some("input_json_delta") => on_event.send(StreamEvent::ToolCall { id: value.get("index").map(ToString::to_string).unwrap_or_default(), name: String::new(), arguments: delta.get("partial_json").and_then(Value::as_str).unwrap_or("").into() }).map_err(|_| "Не удалось передать событие в интерфейс.")?,
                        _ => {}
                    }
                },
                Some("message_delta") => if let Some(usage) = value.get("usage") { on_event.send(StreamEvent::Usage { input_tokens: 0, output_tokens: usage.get("output_tokens").and_then(Value::as_u64).unwrap_or(0), total_tokens: usage.get("output_tokens").and_then(Value::as_u64).unwrap_or(0) }).map_err(|_| "Не удалось передать событие в интерфейс.")?; },
                Some("message_stop") => { on_event.send(StreamEvent::Done).map_err(|_| "Не удалось передать событие в интерфейс.")?; },
                _ => {}
            }
        }
    }
    for frame in parser.feed(b"\n")? {
        if frame.data == "[DONE]" { on_event.send(StreamEvent::Done).map_err(|_| "Не удалось передать событие в интерфейс.")?; }
    }
    Ok(())
}

#[tauri::command]
async fn save_key(provider_id: String, key: String) -> Result<bool, String> {
    if provider_id.trim().is_empty() || key.trim().is_empty() { return Err("Введите API-ключ.".into()); }
    credential(&provider_id)?.set_password(&key).map_err(|_| "Не удалось сохранить ключ в Windows Credential Manager.".to_string())?;
    Ok(true)
}

#[tauri::command]
fn has_key(provider_id: String) -> Result<bool, String> { Ok(api_key(&provider_id)?.is_some()) }

#[tauri::command]
fn delete_key(provider_id: String) -> Result<(), String> {
    match credential(&provider_id)?.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(_) => Err("Не удалось удалить ключ из Windows Credential Manager.".into()) }
}

#[tauri::command(rename_all = "camelCase")]
async fn cancel_request(request_id: String) -> Result<(), String> {
    if let Some(token) = requests().lock().map_err(|_| "Не удалось остановить запрос.")?.get(&request_id) { token.cancel(); }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
async fn send_message(provider: ProviderInput, messages: Vec<WireMessage>, request_id: String, on_event: Channel<StreamEvent>) -> Result<(), String> {
    if provider.kind != "openai-compatible" && provider.kind != "anthropic" { return Err("Этот тип провайдера пока не поддерживается.".into()); }
    let key = api_key(&provider.id)?;
    let token = CancellationToken::new();
    requests().lock().map_err(|_| "Не удалось начать запрос.")?.insert(request_id.clone(), token.clone());
    let result = if provider.kind == "anthropic" { send_anthropic(&provider, &messages, key.as_deref(), &on_event, &token).await } else { send_openai(&provider, &messages, key.as_deref(), &request_id, &on_event, &token).await };
    requests().lock().map_err(|_| "Не удалось завершить запрос.")?.remove(&request_id);
    if let Err(error) = &result { let _ = on_event.send(StreamEvent::Error { message: error.clone() }); }
    result
}

#[tauri::command]
async fn list_models(provider: ProviderInput, draft_key: Option<String>) -> Result<Vec<String>, String> {
    if provider.kind != "openai-compatible" && provider.kind != "anthropic" { return Err("Список моделей для этого типа провайдера будет доступен позже.".into()); }
    let stored_key = api_key(&provider.id)?;
    let key = draft_key.filter(|value| !value.trim().is_empty()).or(stored_key);
    let url = endpoint(&provider.base_url, "/models")?;
    let response = client()?.get(url).headers(auth_headers(&provider.kind, key.as_deref())?).send().await.map_err(network_error)?;
    if !response.status().is_success() { return Err(response_error(response, key.as_deref()).await); }
    let value: Value = response.json().await.map_err(|_| "Провайдер вернул невалидный JSON.".to_string())?;
    Ok(value.get("data").and_then(Value::as_array).map(|items| items.iter().filter_map(|item| item.get("id").and_then(Value::as_str).map(String::from)).collect()).unwrap_or_default())
}

#[tauri::command]
async fn test_connection(provider: ProviderInput, draft_key: Option<String>) -> Result<String, String> {
    if provider.kind != "openai-compatible" && provider.kind != "anthropic" { return Err("Для этого типа провайдера подключение будет доступно позже.".into()); }
    let stored_key = api_key(&provider.id)?;
    let key = draft_key.filter(|value| !value.trim().is_empty()).or(stored_key);
    let (url, body, kind) = if provider.kind == "anthropic" {
        (endpoint(&provider.base_url, "/v1/messages")?, json!({"model":provider.model,"max_tokens":1,"messages":[{"role":"user","content":"Hi"}]}), "anthropic")
    } else {
        (endpoint(&provider.base_url, "/chat/completions")?, json!({"model":provider.model,"messages":[{"role":"user","content":"Hi"}],"max_tokens":1}), provider.kind.as_str())
    };
    let response = client()?.post(url).headers(auth_headers(kind, key.as_deref())?).json(&body).send().await.map_err(network_error)?;
    if !response.status().is_success() { return Err(response_error(response, key.as_deref()).await); }
    Ok("Подключение успешно проверено.".into())
}

pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters_schema(&self) -> Value;
    fn execute(&self, _arguments: Value) -> Result<Value, String> { Err("Инструменты ещё не реализованы.".into()) }
}

pub fn tool_registry() -> Vec<Box<dyn Tool>> { Vec::new() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create Luna data tables",
        sql: "CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, preset_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, base_url TEXT NOT NULL, models_json TEXT NOT NULL, has_key INTEGER NOT NULL DEFAULT 0, key_required INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, title TEXT NOT NULL, provider_id TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, role TEXT NOT NULL, blocks_json TEXT NOT NULL, attachments_json TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL, error TEXT, usage_json TEXT); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);",
        kind: MigrationKind::Up,
    }];
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:luna.db", migrations).build())
        .invoke_handler(tauri::generate_handler![save_key, has_key, delete_key, send_message, cancel_request, test_connection, list_models])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_handles_utf8_split_and_comments() {
        let mut parser = SseParser::default();
        let text = " : keep\ndata: Привет\n\n";
        let bytes = text.as_bytes();
        let split = text.find('П').unwrap() + 1;
        assert!(parser.feed(&bytes[..split]).unwrap().is_empty());
        assert_eq!(parser.feed(&bytes[split..]).unwrap(), vec![SseFrame { event: "message".into(), data: "Привет".into() }]);
    }

    #[test]
    fn sse_ignores_empty_data_and_reads_done() {
        let mut parser = SseParser::default();
        let frames = parser.feed(b": comment\n\ndata:\n\ndata: [DONE]\n\n").unwrap();
        assert_eq!(frames, vec![SseFrame { event: "message".into(), data: "".into() }, SseFrame { event: "message".into(), data: "[DONE]".into() }]);
    }
}
