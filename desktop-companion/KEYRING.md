# Keyring persistence (failure mode note)

## Bug (live-test 2026-09-17)

`keyring = "3"` **without** platform features uses the crate’s **in-process mock** store:

- `set_password` / `get_password` succeed inside the same process → UI showed「已保存」
- Nothing is written to macOS Keychain / Windows Credential Manager / `secrets.enc`
- After Refresh / restart → credentials appear missing

## Fix

In `src-tauri/Cargo.toml`:

```toml
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
```

| Target | Store |
| --- | --- |
| macOS | Keychain (`apple-native`) |
| Windows | Credential Manager (`windows-native`) |
| Linux | Secret Service (`sync-secret-service`) |

`secrets::set_secret` refuses mock-as-success, falls back to encrypted `secrets.enc`, and **verifies read-back** before returning `Ok`. Persist failures surface as Chinese errors (no fake success).

## Smoke test

```bash
cd desktop-companion/src-tauri
cargo test set_secret_persists_via_vault_when_keyring_mock_or_unavailable -- --nocapture
```

After rebuilding on Mac, **re-paste** Cursor API Key（以及可选用量会话）once in Settings → Save → Refresh.
