//! sets/ 配下の読み書きと変更監視。Vite 開発サーバー版(src/server/sets-api.ts)と同じ振る舞いにする。

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

const ICON_EXT: &str = ".icon.json";
const STYLE_FILE: &str = "style.json";
/// フロントエンドと同じイベント名(src/ui/api.ts)
const CHANGE_EVENT: &str = "glyphgrid:change";

pub struct SetsDir {
    root: PathBuf,
}

#[derive(Serialize)]
pub struct SetInfo {
    name: String,
    icons: Vec<String>,
}

#[derive(Serialize, Clone)]
struct ChangeEvent {
    set: String,
    /// アイコン名。style.json の変更なら None
    icon: Option<String>,
}

/// セット名・アイコン名として安全か(英数字と . _ - だけ。先頭の . は不可)
fn safe(name: &str, what: &str) -> Result<String, String> {
    let ok = !name.is_empty()
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    if ok { Ok(name.to_string()) } else { Err(format!("{what} の名前が不正です: {name}")) }
}

fn read_text(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("{} を読めません: {e}", path.display()))
}

fn parse_json(path: &Path) -> Result<serde_json::Value, String> {
    serde_json::from_str(&read_text(path)?).map_err(|e| format!("{} の JSON を読めません: {e}", path.display()))
}

impl SetsDir {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn set_dir(&self, set: &str) -> Result<PathBuf, String> {
        Ok(self.root.join(safe(set, "セット")?))
    }

    fn icon_path(&self, set: &str, icon: &str) -> Result<PathBuf, String> {
        Ok(self.set_dir(set)?.join("icons").join(format!("{}{ICON_EXT}", safe(icon, "アイコン")?)))
    }

    fn list(&self) -> Result<Vec<SetInfo>, String> {
        let mut sets = Vec::new();
        let Ok(entries) = fs::read_dir(&self.root) else { return Ok(sets) };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !entry.path().is_dir() || safe(&name, "").is_err() {
                continue;
            }
            let mut icons: Vec<String> = fs::read_dir(entry.path().join("icons"))
                .map(|it| {
                    it.flatten()
                        .filter_map(|f| f.file_name().to_string_lossy().strip_suffix(ICON_EXT).map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            icons.sort();
            sets.push(SetInfo { name, icons });
        }
        sets.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(sets)
    }

    /// 変更されたファイルのパスを、通知用の { set, icon } にする。対象外なら None
    fn classify(&self, path: &Path) -> Option<ChangeEvent> {
        let rel = path.strip_prefix(&self.root).ok()?;
        let parts: Vec<String> = rel
            .components()
            .map(|c| match c {
                Component::Normal(s) => Some(s.to_string_lossy().to_string()),
                _ => None,
            })
            .collect::<Option<_>>()?;
        match parts.as_slice() {
            [set, file] if file == STYLE_FILE => Some(ChangeEvent { set: set.clone(), icon: None }),
            [set, dir, file] if dir == "icons" => {
                file.strip_suffix(ICON_EXT).map(|icon| ChangeEvent { set: set.clone(), icon: Some(icon.to_string()) })
            }
            _ => None,
        }
    }
}

#[tauri::command]
pub fn list_sets(state: State<AppState>) -> Result<Vec<SetInfo>, String> {
    state.sets.list()
}

/// style.json の中身(無ければ null)。既定値での補完と検証はフロントエンドで行う
#[tauri::command]
pub fn read_style(state: State<AppState>, set: String) -> Result<serde_json::Value, String> {
    let path = state.sets.set_dir(&set)?.join(STYLE_FILE);
    if path.exists() { parse_json(&path) } else { Ok(serde_json::Value::Null) }
}

#[tauri::command]
pub fn read_icon(state: State<AppState>, set: String, icon: String) -> Result<serde_json::Value, String> {
    let path = state.sets.icon_path(&set, &icon)?;
    if !path.exists() {
        return Err(format!("アイコンがありません: {set}/{icon}"));
    }
    parse_json(&path)
}

/// 整形済みのテキストを書く。内容が同じなら書かない(監視の無駄な発火を防ぐ)
#[tauri::command]
pub fn write_icon(state: State<AppState>, set: String, icon: String, text: String) -> Result<(), String> {
    let path = state.sets.icon_path(&set, &icon)?;
    if !path.exists() {
        return Err(format!("アイコンがありません: {set}/{icon}"));
    }
    if read_text(&path)?.replace("\r\n", "\n") != text {
        fs::write(&path, text).map_err(|e| format!("{} に書けません: {e}", path.display()))?;
    }
    Ok(())
}

/// 空のアイコンを作る。セットに style.json が無ければ style_text で作る
#[tauri::command]
pub fn create_icon(state: State<AppState>, set: String, icon: String, text: String, style_text: String) -> Result<(), String> {
    let path = state.sets.icon_path(&set, &icon)?;
    if path.exists() {
        return Err(format!("すでにあります: {set}/{icon}"));
    }
    let dir = state.sets.set_dir(&set)?;
    fs::create_dir_all(dir.join("icons")).map_err(|e| e.to_string())?;
    let style = dir.join(STYLE_FILE);
    if !style.exists() {
        fs::write(&style, style_text).map_err(|e| e.to_string())?;
    }
    fs::write(&path, text).map_err(|e| e.to_string())
}

/// sets/ を監視し、変更をフロントエンドに通知する。保存時の連続イベントは短い間隔でまとめる
pub fn watch(app: AppHandle, root: PathBuf) -> notify::Result<notify::RecommendedWatcher> {
    let classifier = SetsDir::new(root.clone());
    let (tx, rx) = std::sync::mpsc::channel::<PathBuf>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            for path in event.paths {
                let _ = tx.send(path);
            }
        }
    })?;
    watcher.watch(&root, RecursiveMode::Recursive)?;
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut paths = vec![first];
            while let Ok(p) = rx.recv_timeout(Duration::from_millis(100)) {
                paths.push(p);
            }
            paths.sort();
            paths.dedup();
            for p in paths {
                if let Some(ev) = classifier.classify(&p) {
                    let _ = app.emit(CHANGE_EVENT, ev);
                }
            }
        }
    });
    Ok(watcher)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_names() {
        assert!(safe("sample", "").is_ok());
        assert!(safe("..", "").is_err());
        assert!(safe("a/b", "").is_err());
        assert!(safe(".hidden", "").is_err());
    }

    #[test]
    fn classifies_changes() {
        let dir = SetsDir::new(PathBuf::from("/r/sets"));
        let ev = dir.classify(Path::new("/r/sets/demo/icons/a.icon.json")).unwrap();
        assert_eq!((ev.set.as_str(), ev.icon.as_deref()), ("demo", Some("a")));
        assert!(dir.classify(Path::new("/r/sets/demo/style.json")).unwrap().icon.is_none());
        assert!(dir.classify(Path::new("/r/sets/demo/notes.txt")).is_none());
        assert!(dir.classify(Path::new("/r/other/style.json")).is_none());
    }
}
