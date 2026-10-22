//! glyphgrid デスクトップアプリ。
//!
//! Rust 側はファイルの読み書き・変更監視・MCP サーバーの起動だけを受け持つ。
//! アイコン JSON の検証と整形は TypeScript の core(フロントエンド)で行い、ロジックを二重に持たない。

mod mcp;
mod sets;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, RunEvent};

pub struct AppState {
    pub sets: sets::SetsDir,
    pub mcp: Mutex<Option<mcp::McpProcess>>,
    /// 変更監視は保持しておかないと止まる
    _watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    sets_dir: String,
    mcp_url: Option<String>,
    mcp_error: Option<String>,
}

#[tauri::command]
fn app_info(state: tauri::State<AppState>) -> AppInfo {
    let mcp = state.mcp.lock().unwrap();
    AppInfo {
        sets_dir: state.sets.root().display().to_string(),
        mcp_url: mcp.as_ref().and_then(|m| m.url.clone()),
        mcp_error: mcp.as_ref().and_then(|m| m.error.clone()),
    }
}

/// sets/ の場所。環境変数 GLYPHGRID_SETS > 開発中はこのリポジトリの sets/ > ドキュメント/glyphgrid/sets
fn resolve_sets_dir(app: &tauri::App) -> PathBuf {
    if let Ok(dir) = std::env::var("GLYPHGRID_SETS") {
        return PathBuf::from(dir);
    }
    if cfg!(debug_assertions) {
        return mcp::repo_root().join("sets");
    }
    app.path()
        .document_dir()
        .map(|d| d.join("glyphgrid").join("sets"))
        .unwrap_or_else(|_| PathBuf::from("sets"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let root = resolve_sets_dir(app);
            std::fs::create_dir_all(&root)?;
            let sets = sets::SetsDir::new(root.clone());
            let watcher = sets::watch(app.handle().clone(), root.clone()).ok();
            let mcp = mcp::McpProcess::start(&root);
            app.manage(AppState {
                sets,
                mcp: Mutex::new(Some(mcp)),
                _watcher: Mutex::new(watcher),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            sets::list_sets,
            sets::read_style,
            sets::read_icon,
            sets::write_icon,
            sets::create_icon,
        ])
        .build(tauri::generate_context!())
        .expect("glyphgrid の起動に失敗しました");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<AppState>() {
                if let Some(mut mcp) = state.mcp.lock().unwrap().take() {
                    mcp.stop();
                }
            }
        }
    });
}
