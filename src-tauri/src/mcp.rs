//! 内蔵 MCP サーバー。アプリの起動中だけ、Node 版の MCP サーバー(src/mcp/main.ts)を HTTP モードで動かす。
//! Claude Code からは `claude mcp add --transport http glyphgrid-app <url>` でつなぐ。
//! MCP が書き換えたファイルは sets/ の監視で画面に反映される。

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::Duration;

const DEFAULT_PORT: u16 = 7331;
/// 起動直後に落ちていないか(ポート使用中など)を確かめるまでの待ち時間
const STARTUP_CHECK: Duration = Duration::from_millis(800);

pub struct McpProcess {
    child: Option<Child>,
    pub url: Option<String>,
    pub error: Option<String>,
}

/// glyphgrid リポジトリのルート。環境変数 GLYPHGRID_ROOT > 開発ビルドではこのクレートの親
pub fn repo_root() -> PathBuf {
    if let Ok(dir) = std::env::var("GLYPHGRID_ROOT") {
        return PathBuf::from(dir);
    }
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().map(Path::to_path_buf).unwrap_or_default()
}

impl McpProcess {
    fn failed(error: String) -> Self {
        Self { child: None, url: None, error: Some(error) }
    }

    pub fn start(sets_dir: &Path) -> Self {
        let root = repo_root();
        if !root.join("src/mcp/main.ts").exists() || !root.join("node_modules/tsx").exists() {
            return Self::failed(format!(
                "MCP サーバーのソースが見つかりません({})。GLYPHGRID_ROOT に glyphgrid リポジトリを指定し、npm install してください",
                root.display()
            ));
        }
        let port = std::env::var("GLYPHGRID_MCP_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(DEFAULT_PORT);

        let mut cmd = Command::new("node");
        cmd.args(["--import", "tsx", "src/mcp/main.ts", "--http", &port.to_string()])
            .args(["--parent", &std::process::id().to_string()])
            .arg(sets_dir)
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => return Self::failed(format!("node を起動できません: {e}")),
        };
        std::thread::sleep(STARTUP_CHECK);
        if let Ok(Some(status)) = child.try_wait() {
            return Self::failed(format!("MCP サーバーが終了しました({status})。ポート {port} が使用中かもしれません"));
        }
        Self { child: Some(child), url: Some(format!("http://127.0.0.1:{port}/mcp")), error: None }
    }

    pub fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for McpProcess {
    fn drop(&mut self) {
        self.stop();
    }
}
