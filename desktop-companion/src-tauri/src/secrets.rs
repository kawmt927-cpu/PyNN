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
    if let Ok(p) = std::env::var("DESKTOP_COMPANION_DATA_DIR") {
        let path = PathBuf::from(p);
        if !path.as_os_str().is_empty() {
            return path;
        }
    }
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

/// True when the active keyring backend is the in-process mock (no OS store feature
/// for this target, or mock forced). Mock `set_password` succeeds but does not persist.
fn keyring_is_in_process_mock() -> bool {
    match keyring::Entry::new(SERVICE, "__desktop_companion_persistence_probe__") {
        Ok(entry) => entry_is_mock(&entry),
        Err(_) => true,
    }
}

fn entry_is_mock(entry: &keyring::Entry) -> bool {
    entry
        .get_credential()
        .downcast_ref::<keyring::mock::MockCredential>()
        .is_some()
}

/// Attempt OS keychain write. Returns Ok(true) if a real (non-mock) store accepted
/// the value; Ok(false) if keyring is unavailable/mock (caller should use vault);
/// Err only for unexpected hard failures after a real store was selected.
fn try_set_os_keyring(id: &str, value: &str) -> Result<bool, String> {
    if keyring_is_in_process_mock() {
        return Ok(false);
    }
    let entry = match keyring_entry(id) {
        Ok(e) => e,
        Err(_) => return Ok(false),
    };
    if entry_is_mock(&entry) {
        return Ok(false);
    }
    match entry.set_password(value) {
        Ok(()) => Ok(true),
        Err(e) => {
            // Real store present but write failed — fall back to vault rather than
            // reporting success; caller still verifies read-back.
            let _ = e;
            Ok(false)
        }
    }
}

fn passwords_match(stored: &str, expected: &str) -> bool {
    stored.trim() == expected.trim()
}

/// Persist a secret. Prefer OS keychain; fall back to local vault under app data.
/// Always verifies read-back before returning Ok — never report success for mock-only writes.
pub fn set_secret(id: &str, value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("内容为空".into());
    }

    let mut keyring_wrote = false;
    match try_set_os_keyring(id, trimmed) {
        Ok(true) => {
            keyring_wrote = true;
            // Prefer keychain as source of truth; drop vault copy for this id.
            let _ = delete_file_secret(id);
        }
        Ok(false) => {
            // Mock / unavailable — use encrypted local vault.
        }
        Err(e) => return Err(e),
    }

    if keyring_wrote {
        if let Some(got) = get_secret(id) {
            if passwords_match(&got, trimmed) {
                return Ok(());
            }
        }
        // Keychain claimed success but read-back failed — try vault before erroring.
        let _ = keyring_entry(id).and_then(|e| {
            e.delete_credential()
                .or_else(|err| match err {
                    keyring::Error::NoEntry => Ok(()),
                    other => Err(format!("钥匙串清理失败: {other}")),
                })
        });
    }

    set_file_secret(id, trimmed)?;

    match get_secret(id) {
        Some(got) if passwords_match(&got, trimmed) => Ok(()),
        Some(_) => Err(
            "凭证未能持久化：写入后读回内容不一致。请重试保存，或检查系统钥匙串 / 应用数据目录权限。"
                .into(),
        ),
        None => Err(
            "凭证未能持久化：钥匙串不可用且本地加密仓读回失败。请检查应用数据目录权限后重试。"
                .into(),
        ),
    }
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
    // Skip in-process mock: values there are not durable across restarts.
    if !keyring_is_in_process_mock() {
        if let Ok(entry) = keyring_entry(id) {
            if !entry_is_mock(&entry) {
                if let Ok(pw) = entry.get_password() {
                    let t = pw.trim();
                    if !t.is_empty() {
                        return Some(t.to_string());
                    }
                }
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
    if !keyring_is_in_process_mock() {
        if let Ok(entry) = keyring_entry(id) {
            if !entry_is_mock(&entry) {
                if let Ok(pw) = entry.get_password() {
                    if !pw.trim().is_empty() {
                        return SecretSource::Keychain;
                    }
                }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_id(prefix: &str) -> String {
        format!(
            "{prefix}-{}-{}",
            std::process::id(),
            TEST_SEQ.fetch_add(1, Ordering::SeqCst)
        )
    }

    #[test]
    fn validate_rejects_code_api_key() {
        assert!(validate_kimi_member_token("sk-kimi-abc").is_err());
        assert!(validate_kimi_member_token("sk-abc").is_err());
        assert!(validate_kimi_member_token("eyJhbGciOi.fake.jwt").is_ok());
    }

    /// Failure mode smoke: if keyring is mock / unavailable, set_secret must still
    /// persist via local vault and survive get_secret — never Ok with empty read-back.
    #[test]
    fn set_secret_persists_via_vault_when_keyring_mock_or_unavailable() {
        // Reproduce live-test failure mode: keyring v3 mock (no apple-native / etc.).
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
        assert!(
            keyring_is_in_process_mock(),
            "test setup must force mock keyring"
        );

        let dir = std::env::temp_dir().join(format!(
            "desktop-companion-secrets-test-{}",
            unique_id("dir")
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        std::env::set_var("DESKTOP_COMPANION_DATA_DIR", &dir);

        let id = unique_id("smoke");
        let value = "test-member-token-not-a-secret-prod-value";

        set_secret(&id, value).expect("set_secret must succeed via vault fallback");
        let got = get_secret(&id).expect("read-back must succeed");
        assert_eq!(got, value);
        assert_eq!(secret_source(&id), SecretSource::LocalVault);
        assert!(
            secrets_file_path().exists(),
            "mock keyring must fall back to secrets.enc (live-test failure mode)"
        );

        let _ = delete_secret(&id);
        std::env::remove_var("DESKTOP_COMPANION_DATA_DIR");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_secret_rejects_empty_and_reports_chinese() {
        let err = set_secret("x", "   ").unwrap_err();
        assert!(err.contains("空"));
    }
}
