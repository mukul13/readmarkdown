import { useCallback, useEffect, useState } from "react"
import { Folder, FolderOpen, FileText, Loader2, RefreshCw } from "lucide-react"
import { Markdown } from "./Markdown"
import { pickFolder, refreshFolder, readFile, runtime, type MdFile, type FolderResult } from "./folderSource"

export default function App() {
  const [folder, setFolder] = useState<FolderResult | null>(null)
  const [selected, setSelected] = useState<MdFile | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loadingPick, setLoadingPick] = useState(false)
  const [loadingRefresh, setLoadingRefresh] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const onChooseFolder = useCallback(async () => {
    setError(null)
    setLoadingPick(true)
    try {
      const result = await pickFolder()
      if (!result) return
      setFolder(result)
      setSelected(null)
      setContent(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingPick(false)
    }
  }, [])

  const onRefresh = useCallback(async () => {
    if (!folder || loadingRefresh) return
    setError(null)
    setLoadingRefresh(true)
    try {
      const result = await refreshFolder(folder.rootPath)
      if (!result) return
      setFolder(result)
      // keep selection if file still exists; re-read to catch on-disk edits
      const stillThere = selected && result.files.some(f => f.absPath === selected.absPath)
      if (stillThere) {
        setReloadTick(t => t + 1)
      } else {
        setSelected(null)
        setContent(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingRefresh(false)
    }
  }, [folder, selected, loadingRefresh])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setContent(null)
    setLoadingFile(true)
    setError(null)
    readFile(selected.absPath)
      .then(text => { if (!cancelled) setContent(text) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoadingFile(false) })
    return () => { cancelled = true }
  }, [selected, reloadTick])

  const showSidebarFiles = folder && folder.files.length > 0

  return (
    <div className="isolate flex h-full antialiased bg-paper text-ink dark:bg-night dark:text-[#e8e6e2]">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-rule dark:border-night-rule">
        {folder ? (
          <div className="flex items-center gap-2 px-5 pt-6 pb-4">
            <FolderOpen className="size-4 shrink-0 text-ink-mute" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink dark:text-[#f1efeb]" title={folder.rootPath}>
              {folder.rootName}
            </p>
            <span className="rounded-full bg-paper-deep px-2 py-0.5 text-xs tabular-nums text-ink-mute dark:bg-night-2">
              {folder.files.length}
            </span>
            <button
              onClick={onRefresh}
              disabled={loadingRefresh}
              title="Refresh folder"
              aria-label="Refresh folder"
              className="-mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-mute hover:bg-paper-deep hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage disabled:opacity-60 dark:hover:bg-night-2 dark:hover:text-[#f1efeb]"
            >
              <RefreshCw className={["size-3.5 shrink-0", loadingRefresh ? "animate-spin" : ""].join(" ")} />
            </button>
          </div>
        ) : (
          <div className="px-5 pt-6 pb-4">
            <p className="text-sm font-medium text-ink dark:text-[#f1efeb]">ReadMarkdown</p>
            <p className="mt-1 text-xs text-ink-mute">No folder open.</p>
          </div>
        )}

        <div className="scrollbar-soft flex-1 overflow-y-auto">
          {showSidebarFiles ? (
            <ul role="list" className="px-2 py-2">
              {folder!.files.map(f => {
                const isSel = selected?.absPath === f.absPath
                return (
                  <li key={f.absPath}>
                    <button
                      onClick={() => setSelected(f)}
                      className={[
                        "flex w-full flex-col items-start rounded-md px-3 py-2 text-left",
                        isSel
                          ? "bg-sage-soft dark:bg-night-2"
                          : "hover:bg-paper-deep dark:hover:bg-night-2/60",
                      ].join(" ")}
                    >
                      <p className={[
                        "w-full truncate text-sm",
                        isSel ? "font-medium text-ink dark:text-[#f1efeb]" : "text-ink dark:text-[#e8e6e2]",
                      ].join(" ")}>
                        {f.filename}
                      </p>
                      <p className="mt-0.5 w-full truncate text-xs text-ink-mute" title={f.relPath}>
                        {f.relPath}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : folder && folder.files.length === 0 ? (
            <div className="px-5 pt-4 text-sm text-ink-mute">
              No Markdown files found in this folder.
            </div>
          ) : null}
        </div>

        <div className="border-t border-rule p-3 dark:border-night-rule">
          <button
            onClick={onChooseFolder}
            disabled={loadingPick}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-sage py-2 text-sm font-medium text-white shadow-sm hover:bg-sage/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage disabled:opacity-60"
          >
            {loadingPick ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <Folder className="size-4 shrink-0" />
            )}
            {folder ? "Change folder" : "Choose folder"}
          </button>
        </div>
      </aside>

      <main className="scrollbar-soft min-w-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="mx-auto w-full max-w-[60ch] px-12 py-16">
            <p className="text-sm font-medium text-ink dark:text-[#f1efeb]">Something went wrong</p>
            <p className="mt-2 font-mono text-xs break-all text-ink-mute select-all">{error}</p>
          </div>
        ) : selected && content !== null ? (
          <article key={selected.absPath} className="fade-in mx-auto w-full max-w-[68ch] px-12 py-16">
            <header>
              <h1 className="text-3xl font-semibold tracking-tight text-ink dark:text-[#f1efeb]">
                {selected.filename}
              </h1>
              <p className="mt-2 font-mono text-xs break-all text-ink-mute select-all">
                {selected.absPath}
              </p>
              <hr className="mt-6 border-rule dark:border-night-rule" />
            </header>
            <div className="mt-8">
              <Markdown content={content} />
            </div>
          </article>
        ) : selected && loadingFile ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-ink-mute" />
          </div>
        ) : folder ? (
          <SidePrompt
            icon={<FileText className="mx-auto size-6 text-ink-mute" />}
            title={folder.files.length === 0 ? "No Markdown files" : "Pick a file to read"}
            body={folder.files.length === 0
              ? "This folder doesn't contain any .md or .markdown files."
              : "Choose a file from the sidebar to start reading."}
          />
        ) : (
          <Welcome onChooseFolder={onChooseFolder} loading={loadingPick} />
        )}
      </main>
    </div>
  )
}

function Welcome({ onChooseFolder, loading }: { onChooseFolder: () => void; loading: boolean }) {
  const webBrowserUnsupported = !runtime.isTauri() && !runtime.webPickerSupported
  return (
    <div className="flex h-full items-center justify-center px-10">
      <div className="max-w-[42ch] text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-sage-soft text-sage dark:bg-night-2 dark:text-sage">
          <FolderOpen className="size-5" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink dark:text-[#f1efeb]">
          Read every Markdown file in a folder.
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft dark:text-night-mute">
          Pick a project folder. ReadMarkdown walks every nested directory, lists every <code className="font-mono text-xs">.md</code> file, and lays them out for calm reading.
        </p>
        <div className="mt-7 flex justify-center">
          <button
            onClick={onChooseFolder}
            disabled={loading || webBrowserUnsupported}
            className="inline-flex items-center gap-2 rounded-md bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sage/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Folder className="size-4 shrink-0" />}
            Choose folder
          </button>
        </div>
        {webBrowserUnsupported && (
          <p className="mt-4 text-xs text-ink-mute">
            Folder picking needs a Chromium-based browser, or run the desktop build.
          </p>
        )}
      </div>
    </div>
  )
}

function SidePrompt({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center px-10">
      <div className="max-w-[40ch] text-center">
        {icon}
        <p className="mt-3 text-sm font-medium text-ink dark:text-[#f1efeb]">{title}</p>
        <p className="mt-1 text-sm text-ink-mute">{body}</p>
      </div>
    </div>
  )
}
