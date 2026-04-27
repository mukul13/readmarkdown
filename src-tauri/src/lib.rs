use serde::Serialize;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MdFile {
    filename: String,
    rel_path: String,
    abs_path: String,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "dist", "build",
    ".next", ".turbo", ".cache", ".vscode", ".idea",
];

fn is_skipped_dir(name: &str) -> bool {
    name.starts_with('.') || SKIP_DIRS.contains(&name)
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md") | Some("markdown")
    )
}

#[tauri::command]
fn scan_folder(root: String) -> Result<Vec<MdFile>, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }

    let walker = WalkDir::new(root_path)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy();
                return !is_skipped_dir(&name);
            }
            true
        });

    let mut files: Vec<MdFile> = walker
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && is_markdown(e.path()))
        .map(|e| {
            let filename = e.file_name().to_string_lossy().to_string();
            let abs_path = e.path().to_string_lossy().to_string();
            let rel_path = e
                .path()
                .strip_prefix(root_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| filename.clone());
            MdFile { filename, rel_path, abs_path }
        })
        .collect();

    files.sort_by(|a, b| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()));
    Ok(files)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![scan_folder, read_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
