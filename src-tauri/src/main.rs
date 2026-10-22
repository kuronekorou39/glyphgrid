// リリースビルドで余計なコンソールウィンドウを出さない(Windows)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    glyphgrid_lib::run();
}
