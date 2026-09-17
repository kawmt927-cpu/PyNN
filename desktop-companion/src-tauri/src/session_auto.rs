//! Automatic Spending session discovery (no manual cookie paste loop).
//!
//! Preferred sources (macOS-first):
//! 1. Cursor IDE `state.vscdb` → `cursorAuth/accessToken` (same login as
//!    “Open Spending” from the Cursor client).
//! 2. Chromium-family browser cookie DB → `WorkosCursorSessionToken`
//!    (Chrome / Arc / Edge / Brave).
//!
//! Never log cookie / token values. Failures return structured errors only.
//! Browser DBs may be locked; we copy to a temp file before querying.
//! Chromium cookie values are often OS-keychain encrypted — decrypt is
//! best-effort and fragile across browser versions.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

/// Browser ids exposed in settings.
#[allow(dead_code)]
pub const BROWSER_IDS: &[&str] = &["auto", "chrome", "arc", "edge", "brave"];

#[derive(Debug, Clone)]
pub struct AutoSessionResult {
    /// Session material (JWT or cookie value). Never log this.
    pub token: String,
    /// Human-readable source for UI (no secret).
    pub source_label: String,
}

#[derive(Debug, Clone)]
pub struct AutoSessionAttempt {
    pub ok: bool,
    pub source_label: String,
    pub detail: String,
}

/// Try Cursor IDE first, then configured browser.
pub fn obtain_auto_session(browser_pref: &str) -> Result<AutoSessionResult, String> {
    let mut errors = Vec::new();

    match read_cursor_ide_access_token() {
        Ok(r) => return Ok(r),
        Err(e) => errors.push(format!("Cursor IDE: {e}")),
    }

    match read_browser_workos_cookie(browser_pref) {
        Ok(r) => return Ok(r),
        Err(e) => errors.push(format!("浏览器: {e}")),
    }

    Err(errors.join("；"))
}

pub fn obtain_cursor_ide_session() -> Result<AutoSessionResult, String> {
    read_cursor_ide_access_token()
}

pub fn obtain_browser_session(browser_pref: &str) -> Result<AutoSessionResult, String> {
    read_browser_workos_cookie(browser_pref)
}

/// Probe without returning secret values — for settings UI.
pub fn probe_auto_sources(browser_pref: &str) -> Vec<AutoSessionAttempt> {
    let mut out = Vec::new();

    match read_cursor_ide_access_token() {
        Ok(r) => out.push(AutoSessionAttempt {
            ok: true,
            source_label: r.source_label,
            detail: "已找到 accessToken（值未读出到 UI）".into(),
        }),
        Err(e) => out.push(AutoSessionAttempt {
            ok: false,
            source_label: "Cursor IDE".into(),
            detail: e,
        }),
    }

    match read_browser_workos_cookie(browser_pref) {
        Ok(r) => out.push(AutoSessionAttempt {
            ok: true,
            source_label: r.source_label,
            detail: "已找到 WorkosCursorSessionToken（值未读出到 UI）".into(),
        }),
        Err(e) => out.push(AutoSessionAttempt {
            ok: false,
            source_label: format!("浏览器（{browser_pref}）"),
            detail: e,
        }),
    }

    out
}

fn read_cursor_ide_access_token() -> Result<AutoSessionResult, String> {
    let db_path = cursor_state_vscdb_path().ok_or_else(|| {
        "未找到 Cursor 本机状态库（~/Library/Application Support/Cursor/... 或 Linux/Windows 对应路径）。请确认已安装并登录 Cursor。".to_string()
    })?;

    if !db_path.is_file() {
        return Err(format!("状态库不存在：{}", db_path.display()));
    }

    let token = read_vscdb_key(&db_path, "cursorAuth/accessToken")
        .or_else(|_| read_vscdb_key(&db_path, "cursorAuth/cachedAccessToken"))
        .map_err(|e| {
            format!(
                "无法读取 accessToken（{}）。若 macOS 提示权限，请在「系统设置 → 隐私与安全性 → 完全磁盘访问权限」中允许 Desktop Companion。",
                sanitize_err(&e)
            )
        })?;

    let trimmed = token.trim().to_string();
    if trimmed.is_empty() {
        return Err("accessToken 为空 — Cursor 可能未登录".into());
    }

    Ok(AutoSessionResult {
        token: trimmed,
        source_label: "Cursor IDE · state.vscdb".into(),
    })
}

fn cursor_state_vscdb_path() -> Option<PathBuf> {
    // Allow test / advanced override (path only — never a token env).
    if let Ok(p) = std::env::var("DESKTOP_COMPANION_CURSOR_STATE_DB") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Some(path);
        }
    }

    let home = dirs::home_dir()?;
    let candidates = [
        // macOS
        home.join("Library/Application Support/Cursor/User/globalStorage/state.vscdb"),
        // Linux
        home.join(".config/Cursor/User/globalStorage/state.vscdb"),
        // Windows-style under home (WSL / atypical)
        home.join("AppData/Roaming/Cursor/User/globalStorage/state.vscdb"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

fn read_vscdb_key(db_path: &Path, key: &str) -> Result<String, String> {
    let tmp = copy_db_for_read(db_path)?;
    let result = (|| {
        let conn = Connection::open(&tmp).map_err(|e| format!("sqlite open: {e}"))?;
        // VS Code state DB: ItemTable(key TEXT, value BLOB/TEXT)
        let mut stmt = conn
            .prepare("SELECT value FROM ItemTable WHERE key = ?1 LIMIT 1")
            .map_err(|e| format!("sqlite prepare: {e}"))?;
        let value: Vec<u8> = stmt
            .query_row(rusqlite::params![key], |row| {
                row.get::<_, Vec<u8>>(0)
                    .or_else(|_| row.get::<_, String>(0).map(|s| s.into_bytes()))
            })
            .map_err(|e| format!("key missing or unreadable: {e}"))?;
        let s = String::from_utf8(value).map_err(|_| "token not utf-8".to_string())?;
        // Some builds store JSON-quoted strings.
        let s = s.trim().trim_matches('"').to_string();
        if s.is_empty() {
            return Err("empty value".into());
        }
        Ok(s)
    })();
    let _ = fs::remove_file(&tmp);
    result
}

fn read_browser_workos_cookie(browser_pref: &str) -> Result<AutoSessionResult, String> {
    let profiles = chromium_cookie_candidates(browser_pref);
    if profiles.is_empty() {
        return Err(format!(
            "未找到浏览器 Cookie 库（偏好：{browser_pref}）。支持 Chrome / Arc / Edge / Brave。"
        ));
    }

    let mut last_err = String::from("未找到 WorkosCursorSessionToken");
    for (label, cookies_path) in profiles {
        match read_workos_from_chromium_cookies(&cookies_path) {
            Ok(token) => {
                return Ok(AutoSessionResult {
                    token,
                    source_label: format!("{label} · Cookies"),
                });
            }
            Err(e) => {
                last_err = format!("{label}: {e}");
            }
        }
    }
    Err(format!(
        "{last_err}。若浏览器正在运行可能锁库；macOS 可能需「完全磁盘访问」并允许钥匙串解密。Safari 暂不支持自动读取。"
    ))
}

fn chromium_cookie_candidates(browser_pref: &str) -> Vec<(String, PathBuf)> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let mut specs: Vec<(&str, PathBuf)> = Vec::new();

    let want = |id: &str| -> bool {
        browser_pref == "auto" || browser_pref.eq_ignore_ascii_case(id)
    };

    // macOS paths
    #[cfg(target_os = "macos")]
    {
        if want("chrome") {
            specs.push((
                "Chrome",
                home.join("Library/Application Support/Google/Chrome"),
            ));
        }
        if want("arc") {
            specs.push(("Arc", home.join("Library/Application Support/Arc/User Data")));
        }
        if want("edge") {
            specs.push((
                "Edge",
                home.join("Library/Application Support/Microsoft Edge"),
            ));
        }
        if want("brave") {
            specs.push((
                "Brave",
                home.join("Library/Application Support/BraveSoftware/Brave-Browser"),
            ));
        }
    }

    // Linux paths
    #[cfg(target_os = "linux")]
    {
        if want("chrome") {
            specs.push(("Chrome", home.join(".config/google-chrome")));
            specs.push(("Chromium", home.join(".config/chromium")));
        }
        if want("arc") {
            specs.push(("Arc", home.join(".config/Arc")));
        }
        if want("edge") {
            specs.push(("Edge", home.join(".config/microsoft-edge")));
        }
        if want("brave") {
            specs.push((
                "Brave",
                home.join(".config/BraveSoftware/Brave-Browser"),
            ));
        }
    }

    // Windows-ish under home
    #[cfg(target_os = "windows")]
    {
        if want("chrome") {
            specs.push((
                "Chrome",
                home.join("AppData/Local/Google/Chrome/User Data"),
            ));
        }
        if want("edge") {
            specs.push((
                "Edge",
                home.join("AppData/Local/Microsoft/Edge/User Data"),
            ));
        }
        if want("brave") {
            specs.push((
                "Brave",
                home.join("AppData/Local/BraveSoftware/Brave-Browser/User Data"),
            ));
        }
        if want("arc") {
            specs.push(("Arc", home.join("AppData/Local/Arc/User Data")));
        }
    }

    // Fallback when cfg doesn't match host during cross ideas — still try common paths.
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = want;
        let _ = &home;
    }

    let mut out = Vec::new();
    for (label, root) in specs {
        if !root.is_dir() {
            continue;
        }
        // Default + Profile *
        let mut profile_dirs = vec![root.join("Default")];
        if let Ok(rd) = fs::read_dir(&root) {
            for ent in rd.flatten() {
                let name = ent.file_name().to_string_lossy().to_string();
                if name.starts_with("Profile ") {
                    profile_dirs.push(ent.path());
                }
            }
        }
        for pd in profile_dirs {
            let cookies = pd.join("Cookies");
            let network_cookies = pd.join("Network/Cookies");
            if network_cookies.is_file() {
                out.push((
                    format!("{label}/{}", pd.file_name().and_then(|s| s.to_str()).unwrap_or("?")),
                    network_cookies,
                ));
            } else if cookies.is_file() {
                out.push((
                    format!("{label}/{}", pd.file_name().and_then(|s| s.to_str()).unwrap_or("?")),
                    cookies,
                ));
            }
        }
    }
    out
}

fn read_workos_from_chromium_cookies(cookies_path: &Path) -> Result<String, String> {
    let tmp = copy_db_for_read(cookies_path)?;
    let result = (|| {
        let conn = Connection::open(&tmp).map_err(|e| format!("sqlite open: {e}"))?;
        let mut stmt = conn
            .prepare(
                "SELECT host_key, name, value, encrypted_value FROM cookies
                 WHERE name = 'WorkosCursorSessionToken'
                 AND (host_key LIKE '%cursor.com%' OR host_key LIKE '%.cursor.sh%')
                 ORDER BY length(host_key) ASC
                 LIMIT 5",
            )
            .map_err(|e| format!("sqlite prepare: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                ))
            })
            .map_err(|e| format!("sqlite query: {e}"))?;

        let mut last_decrypt_err = None;
        for row in rows.flatten() {
            let (_host, _name, value, encrypted) = row;
            let plain = value.trim();
            if !plain.is_empty() {
                return Ok(plain.to_string());
            }
            if encrypted.is_empty() {
                continue;
            }
            match decrypt_chromium_cookie(&encrypted) {
                Ok(s) if !s.trim().is_empty() => return Ok(s.trim().to_string()),
                Ok(_) => last_decrypt_err = Some("解密结果为空".into()),
                Err(e) => last_decrypt_err = Some(e),
            }
        }
        Err(last_decrypt_err.unwrap_or_else(|| {
            "Cookie 行不存在或无法解密（浏览器可能未登录 cursor.com）".into()
        }))
    })();
    let _ = fs::remove_file(&tmp);
    result
}

fn copy_db_for_read(src: &Path) -> Result<PathBuf, String> {
    let tmp_dir = std::env::temp_dir().join("desktop-companion-session");
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("temp dir: {e}"))?;
    let tmp = tmp_dir.join(format!(
        "db-{}-{}.sqlite",
        std::process::id(),
        UtcNanos::now()
    ));
    fs::copy(src, &tmp).map_err(|e| {
        format!(
            "无法复制 Cookie/状态库（浏览器可能正在占用，或缺少磁盘权限）: {}",
            sanitize_err(&e.to_string())
        )
    })?;
    // Also try -wal/-shm so we see latest if unlocked copy is stale — best effort.
    let wal = PathBuf::from(format!("{}-wal", src.display()));
    let shm = PathBuf::from(format!("{}-shm", src.display()));
    if wal.is_file() {
        let _ = fs::copy(&wal, format!("{}-wal", tmp.display()));
    }
    if shm.is_file() {
        let _ = fs::copy(&shm, format!("{}-shm", tmp.display()));
    }
    Ok(tmp)
}

/// Cheap unique suffix without extra deps.
struct UtcNanos;
impl UtcNanos {
    fn now() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    }
}

fn sanitize_err(s: &str) -> String {
    // Never echo anything that looks like a JWT / cookie fragment.
    if s.contains("eyJ") || s.contains("Workos") {
        "（细节已省略，避免泄露会话）".into()
    } else {
        s.chars().take(200).collect()
    }
}

/// Decrypt Chromium `encrypted_value` (v10 / v11). Best-effort; fragile.
fn decrypt_chromium_cookie(encrypted: &[u8]) -> Result<String, String> {
    if encrypted.len() < 4 {
        return Err("encrypted_value 太短".into());
    }
    let (prefix, rest) = encrypted.split_at(3);
    let prefix_str = std::str::from_utf8(prefix).unwrap_or("");
    if prefix_str != "v10" && prefix_str != "v11" {
        // Older plaintext or unknown — try as utf-8.
        return String::from_utf8(encrypted.to_vec())
            .map_err(|_| "非 v10/v11 且非 utf-8".to_string());
    }

    let key = chromium_safe_storage_key()?;
    // AES-128-CBC, IV = 16 spaces (Chromium classic).
    use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
    type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;

    if rest.len() < 16 {
        return Err("密文太短".into());
    }
    let iv = [b' '; 16];
    let mut buf = rest.to_vec();
    let dec = Aes128CbcDec::new_from_slices(&key, &iv).map_err(|_| "AES init 失败")?;
    let plain = dec
        .decrypt_padded_mut::<Pkcs7>(&mut buf)
        .map_err(|_| "AES 解密失败（钥匙串密钥可能不匹配，或浏览器改了加密）")?;
    String::from_utf8(plain.to_vec()).map_err(|_| "解密后非 utf-8".to_string())
}

fn chromium_safe_storage_key() -> Result<[u8; 16], String> {
    // PBKDF2-SHA1, salt "saltysalt", 16-byte key.
    // Password: macOS Keychain "Chrome Safe Storage" / Linux "peanuts" / etc.
    let password = chromium_safe_storage_password()?;
    let mut key = [0u8; 16];
    pbkdf2::pbkdf2_hmac::<sha1::Sha1>(password.as_bytes(), b"saltysalt", pbkdf2_iterations(), &mut key);
    Ok(key)
}

fn pbkdf2_iterations() -> u32 {
    #[cfg(target_os = "macos")]
    {
        1003
    }
    #[cfg(not(target_os = "macos"))]
    {
        1
    }
}

fn chromium_safe_storage_password() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        // Try Chrome, then Chromium, Brave, Edge, Arc variants.
        const CANDIDATES: &[(&str, &str)] = &[
            ("Chrome Safe Storage", "Chrome"),
            ("Chromium Safe Storage", "Chromium"),
            ("Brave Safe Storage", "Brave"),
            ("Microsoft Edge Safe Storage", "Microsoft Edge"),
            ("Arc Safe Storage", "Arc"),
        ];
        for (service, account) in CANDIDATES {
            if let Ok(pw) = macos_keychain_password(service, account) {
                if !pw.is_empty() {
                    return Ok(pw);
                }
            }
        }
        Err(
            "无法从钥匙串读取浏览器 Safe Storage 密码。请在弹窗中点「允许」，或在「钥匙串访问」中授权 Desktop Companion。"
                .into(),
        )
    }
    #[cfg(target_os = "linux")]
    {
        // Default Chromium password when using basic obfuscation; many distros use
        // libsecret — we try "peanuts" first (works for some installs).
        if let Ok(pw) = std::env::var("DESKTOP_COMPANION_CHROME_SAFE_STORAGE") {
            if !pw.is_empty() {
                return Ok(pw);
            }
        }
        Ok("peanuts".into())
    }
    #[cfg(target_os = "windows")]
    {
        Err("Windows DPAPI Cookie 解密尚未实现；请改用「自动：Cursor IDE」或紧急粘贴。".into())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("当前平台不支持浏览器 Cookie 解密".into())
    }
}

#[cfg(target_os = "macos")]
fn macos_keychain_password(service: &str, account: &str) -> Result<String, String> {
    use std::process::Command;
    // `security find-generic-password -w` prints only the password to stdout.
    // We never log stdout.
    let output = Command::new("security")
        .args(["find-generic-password", "-w", "-s", service, "-a", account])
        .output()
        .map_err(|e| format!("security 命令失败: {e}"))?;
    if !output.status.success() {
        return Err("钥匙串未命中".into());
    }
    let pw = String::from_utf8(output.stdout)
        .map_err(|_| "钥匙串密码非 utf-8".to_string())?
        .trim()
        .to_string();
    Ok(pw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_does_not_panic_without_dbs() {
        let attempts = probe_auto_sources("auto");
        assert!(attempts.len() >= 2);
        // On CI there is usually no Cursor/Chrome — expect failures, not panics.
        for a in &attempts {
            assert!(!a.detail.contains("eyJ"));
        }
    }

    #[test]
    fn sanitize_hides_jwt_like() {
        let s = sanitize_err("error eyJhbGciOi something");
        assert!(!s.contains("eyJ"));
    }
}
