export type MdFile = {
  filename: string
  relPath: string
  absPath: string
}

export type FolderResult = {
  rootName: string
  rootPath: string
  files: MdFile[]
}

const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

const SKIP_DIRS = new Set([
  "node_modules", ".git", "target", "dist", "build",
  ".next", ".turbo", ".cache", ".vscode", ".idea",
])

/* ─── Tauri ─────────────────────────────────────────────────────────────── */

async function scanTauri(rootPath: string): Promise<FolderResult> {
  const { invoke } = await import("@tauri-apps/api/core")
  const files = await invoke<MdFile[]>("scan_folder", { root: rootPath })
  const rootName = rootPath.split("/").filter(Boolean).pop() ?? rootPath
  return { rootName, rootPath, files }
}

async function pickFolderTauri(): Promise<FolderResult | null> {
  const { open } = await import("@tauri-apps/plugin-dialog")
  const selected = await open({ directory: true, multiple: false })
  if (!selected || typeof selected !== "string") return null
  return scanTauri(selected)
}

async function readFileTauri(absPath: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("read_file", { path: absPath })
}

/* ─── Web (File System Access API) ──────────────────────────────────────── */

type WebHandleStore = Map<string, FileSystemFileHandle>
const webHandles: WebHandleStore = new Map()
let webRootHandle: FileSystemDirectoryHandle | null = null

function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith(".md") || lower.endsWith(".markdown")
}

async function walkWeb(
  dir: FileSystemDirectoryHandle,
  rootName: string,
  prefix: string,
  out: MdFile[],
): Promise<void> {
  for await (const entry of (dir as unknown as AsyncIterable<FileSystemHandle>)) {
    if (entry.kind === "directory") {
      const name = entry.name
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue
      await walkWeb(entry as FileSystemDirectoryHandle, rootName, prefix ? `${prefix}/${name}` : name, out)
    } else if (entry.kind === "file" && isMarkdown(entry.name)) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      const absPath = `${rootName}/${relPath}`
      webHandles.set(absPath, entry as FileSystemFileHandle)
      out.push({ filename: entry.name, relPath, absPath })
    }
  }
}

async function pickFolderWeb(): Promise<FolderResult | null> {
  // Feature-detect FS Access API
  const showDirectoryPicker = (window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>
  }).showDirectoryPicker

  if (!showDirectoryPicker) {
    throw new Error(
      "Folder picking isn't supported in this browser. Use Chrome, Edge, or run the macOS app build."
    )
  }

  let handle: FileSystemDirectoryHandle
  try {
    handle = await showDirectoryPicker({ mode: "read" })
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") return null
    throw e
  }

  webRootHandle = handle
  return scanWeb(handle)
}

async function scanWeb(handle: FileSystemDirectoryHandle): Promise<FolderResult> {
  webHandles.clear()
  const files: MdFile[] = []
  await walkWeb(handle, handle.name, "", files)
  files.sort((a, b) => a.relPath.toLowerCase().localeCompare(b.relPath.toLowerCase()))
  return { rootName: handle.name, rootPath: handle.name, files }
}

async function refreshFolderWeb(): Promise<FolderResult | null> {
  if (!webRootHandle) return null
  // Re-verify read permission survived (some browsers expire it across reloads)
  const queryPerm = (webRootHandle as unknown as {
    queryPermission?: (opts: { mode: "read" }) => Promise<PermissionState>
    requestPermission?: (opts: { mode: "read" }) => Promise<PermissionState>
  })
  if (queryPerm.queryPermission) {
    const state = await queryPerm.queryPermission({ mode: "read" })
    if (state !== "granted" && queryPerm.requestPermission) {
      const next = await queryPerm.requestPermission({ mode: "read" })
      if (next !== "granted") throw new Error("Read permission denied for folder.")
    }
  }
  return scanWeb(webRootHandle)
}

async function readFileWeb(absPath: string): Promise<string> {
  const handle = webHandles.get(absPath)
  if (!handle) throw new Error(`File not in current folder: ${absPath}`)
  const file = await handle.getFile()
  return file.text()
}

/* ─── Public API ────────────────────────────────────────────────────────── */

export async function pickFolder(): Promise<FolderResult | null> {
  return isTauri() ? pickFolderTauri() : pickFolderWeb()
}

export async function refreshFolder(currentRootPath: string): Promise<FolderResult | null> {
  return isTauri() ? scanTauri(currentRootPath) : refreshFolderWeb()
}

export async function readFile(absPath: string): Promise<string> {
  return isTauri() ? readFileTauri(absPath) : readFileWeb(absPath)
}

export const runtime = {
  isTauri,
  webPickerSupported:
    typeof window !== "undefined" && "showDirectoryPicker" in window,
}
