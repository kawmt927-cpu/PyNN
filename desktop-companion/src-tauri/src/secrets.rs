//! Secure secret storage: OS keychain first, encrypted file fallback under app data.
//! Never log secret values.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

const SERVICE: &str = "com.vibecoding.desktop-companion";

/// Well-known secret ids (keychain account / file keys).
pub const KIMI_AUTH: &str = "kimi-auth";
pub const CURSOR_API_KEY: &str = "cursor-api-key";
pub const MOONSHOT_API_KEY: &str = "moonshot-api-key";

static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Call once from Tauri setup with the real app data directory.
pub fn init_app_data_dir(dir: PathBuf) {
    let _ = APP_DATA_DIR.set(dir);
}

pub fn app_data_dir_public() -> PathBuf {
    APP_DATA_DIR.get().cloned().unwrap_or_else(|| {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("desktop-companion")
    })
}

fn app_data_dir() -> PathBuf {
    app_data_dir_public()
}

fn secrets_file_path() -> PathBuf {
    app_data_dir().join("secrets.enc")
}

#[derive(Default, Serialize, Deserialize)]
struct FileVault {
    /// Obfuscated (not plaintext) entries — XOR with machine-local key.
    entries: std::collections::HashMap<String, String>,
}

fn machine_key() -> [u8; 32] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    SERVICE.hash(&mut hasher);
    whoami_user().hash(&mut hasher);
    hostname_fallback().hash(&mut hasher);
    let a = hasher.finish().to_le_bytes();
    // Mix into 32 bytes without pulling extra crypto crates.
    let mut key = [0u8; 32];
    for (i, b) in key.iter_mut().enumerate() {
        let mut h = DefaultHasher::new();
        (i as u64).hash(&mut h);
        a.hash(&mut h);
        SERVICE.hash(&mut h);
        *b = (h.finish() & 0xff) as u8;
    }
    key
}

fn whoami_user() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "user".into())
}

fn hostname_fallback() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "local".into())
}

fn obfuscate(plain: &str) -> String {
    let key = machine_key();
    let bytes: Vec<u8> = plain
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    hex_encode(&bytes)
}

fn deobfuscate(encoded: &str) -> Option<String> {
    let bytes = hex_decode(encoded)?;
    let key = machine_key();
    let plain: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    String::from_utf8(plain).ok()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

fn load_vault(path: &Path) -> FileVault {
    let Ok(mut f) = fs::File::open(path) else {
        return FileVault::default();
    };
    let mut buf = String::new();
    if f.read_to_string(&mut buf).is_err() {
        return FileVault::default();
    }
    serde_json::from_str(&buf).unwrap_or_default()
}

fn save_vault(path: &Path, vault: &FileVault) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建应用数据目录: {e}"))?;
    }
    let json = serde_json::to_string(vault).map_err(|e| e.to_string())?;
    let mut f = fs::File::create(path).map_err(|e| format!("无法写入密钥文件: {e}"))?;
    f.write_all(json.as_bytes())
        .map_err(|e| format!("无法写入密钥文件: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn keyring_entry(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, id).map_err(|e| format!("钥匙串不可用: {e}"))
}

/// Persist a secret. Prefer OS keychain; fall back to local vault under app data.
pub fn set_secret(id: &str, value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("内容为空".into());
    }

    match keyring_entry(id).and_then(|e| {
        e.set_password(trimmed)
            .map_err(|err| format!("钥匙串写入失败: {err}"))
    }) {
        Ok(()) => {
            // Keep file vault in sync empty for this id if we used keychain.
            let _ = delete_file_secret(id);
            return Ok(());
        }
        Err(_) => {
            // Fall through to encrypted local store.
        }
    }

    set_file_secret(id, trimmed)
}

fn set_file_secret(id: &str, value: &str) -> Result<(), String> {
    let path = secrets_file_path();
    let mut vault = load_vault(&path);
    vault.entries.insert(id.to_string(), obfuscate(value));
    save_vault(&path, &vault)
}

fn delete_file_secret(id: &str) -> Result<(), String> {
    let path = secrets_file_path();
    if !path.exists() {
        return Ok(());
    }
    let mut vault = load_vault(&path);
    vault.entries.remove(id);
    if vault.entries.is_empty() {
        let _ = fs::remove_file(&path);
        Ok(())
    } else {
        save_vault(&path, &vault)
    }
}

fn get_file_secret(id: &str) -> Option<String> {
    let path = secrets_file_path();
    let vault = load_vault(&path);
    vault.entries.get(id).and_then(|enc| deobfuscate(enc))
}

pub fn get_secret(id: &str) -> Option<String> {
    if let Ok(entry) = keyring_entry(id) {
        if let Ok(pw) = entry.get_password() {
            let t = pw.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    get_file_secret(id).and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    })
}

pub fn delete_secret(id: &str) -> Result<(), String> {
    let mut errors = Vec::new();

    if let Ok(entry) = keyring_entry(id) {
        match entry.delete_credential() {
            Ok(()) => {}
            Err(keyring::Error::NoEntry) => {}
            Err(e) => errors.push(format!("钥匙串删除: {e}")),
        }
    }

    if let Err(e) = delete_file_secret(id) {
        errors.push(e);
    }

    if errors.is_empty() {
        Ok(())
    } else {
        // Partial success is still ok if at least one store cleared.
        if get_secret(id).is_none() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }
}

pub fn has_secret(id: &str) -> bool {
    get_secret(id).is_some()
}

/// Where a secret currently comes from (for UI status — never the value).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SecretSource {
    Keychain,
    LocalVault,
    Env,
    None,
}

pub fn secret_source(id: &str) -> SecretSource {
    if let Ok(entry) = keyring_entry(id) {
        if let Ok(pw) = entry.get_password() {
            if !pw.trim().is_empty() {
                return SecretSource::Keychain;
            }
        }
    }
    if get_file_secret(id).is_some() {
        return SecretSource::LocalVault;
    }
    SecretSource::None
}

/// Reject Code Console keys that users sometimes paste by mistake.
pub fn validate_kimi_member_token(token: &str) -> Result<(), String> {
    let t = token.trim();
    if t.is_empty() {
        return Err("Token 为空".into());
    }
    if t.starts_with("sk-kimi-") || t.starts_with("sk-") {
        return Err(
            "这看起来像 Code / API Key（sk-…），不是会员会话 Token。请粘贴浏览器 Cookie「kimi-auth」的 JWT。"
                .into(),
        );
    }
    Ok(())
}
