import { useEffect, useRef, useState } from "react";
import {
  Download,
  Files,
  Plus,
  RotateCw,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  buildPdf,
  readFiles,
  retain,
  savePdf,
  turn,
  type Sheet,
} from "@/lib/pdf/engine";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function moveItem(list: Sheet[], fromId: string, toId: string): Sheet[] | null {
  const from = list.findIndex((sheet) => sheet.id === fromId);
  const to = list.findIndex((sheet) => sheet.id === toId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function sameOrder(a: Sheet[], b: Sheet[]) {
  return a.length === b.length && a.every((sheet, index) => sheet.id === b[index]?.id);
}

function fileLabel(name: string) {
  const trimmed = name.trim().replace(/\.pdf$/i, "");
  return trimmed.length > 0 ? `${trimmed}.pdf` : "combined.pdf";
}

function sheetAlt(sheet: Sheet, index: number) {
  const origin = sheet.kind === "pdf" ? `page ${sheet.pageIndex + 1}` : "picture";
  const turned = sheet.rotation ? `, rotated ${sheet.rotation}°` : "";
  return `${index + 1}. ${sheet.fileName}, ${origin}${turned}`;
}

export function Desk() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [binding, setBinding] = useState(false);
  const [fileDrag, setFileDrag] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; width: number } | null>(null);
  const [fileName, setFileName] = useState("combined");

  const sheetsRef = useRef<Sheet[]>([]);
  const pastRef = useRef<Sheet[][]>([]);
  const dragOrigin = useRef<Sheet[] | null>(null);
  const dragId = useRef<string | null>(null);
  const busyRef = useRef(false);
  const queueRef = useRef<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const addFilesRef = useRef<(files: File[]) => void>(() => {});

  sheetsRef.current = sheets;

  function syncHistoryFlag() {
    setCanUndo(pastRef.current.length > 0);
  }

  function remember() {
    pastRef.current.push(sheetsRef.current);
    if (pastRef.current.length > 40) pastRef.current.shift();
    syncHistoryFlag();
  }

  function commit(next: Sheet[]) {
    remember();
    sheetsRef.current = next;
    setSheets(next);
    retain([next, ...pastRef.current]);
    if (next.length === 0) setConfirmClear(false);
  }

  function undo() {
    if (busyRef.current) return;
    const prev = pastRef.current.pop();
    if (!prev) return;
    sheetsRef.current = prev;
    setSheets(prev);
    retain([prev, ...pastRef.current]);
    syncHistoryFlag();
    setError("");
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    if (busyRef.current) {
      queueRef.current.push(...files);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    const beforeCount = sheetsRef.current.length;
    remember();
    const seen = new Set(sheetsRef.current.map((sheet) => sheet.id));
    try {
      const problems = await readFiles(files, {
        onStatus: setStatus,
        onSheet: (sheet) => {
          if (seen.has(sheet.id)) return;
          seen.add(sheet.id);
          const next = [...sheetsRef.current, sheet];
          sheetsRef.current = next;
          setSheets(next);
        },
      });
      if (problems.length) setError(problems.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read those files");
    } finally {
      if (sheetsRef.current.length === beforeCount) {
        pastRef.current.pop();
        syncHistoryFlag();
      }
      setStatus("");
      setBusy(false);
      busyRef.current = false;
      retain([sheetsRef.current, ...pastRef.current]);
      const queued = queueRef.current.splice(0);
      if (queued.length) void addFiles(queued);
    }
  }

  addFilesRef.current = (files) => {
    void addFiles(files);
  };

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setFileDrag(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        setFileDrag(false);
      }
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setFileDrag(false);
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      if (dropped.length) addFilesRef.current(dropped);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openPicker() {
    inputRef.current?.click();
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(event.target.files ?? []);
    event.target.value = "";
    void addFiles(list);
  }

  function rotate(id: string) {
    commit(
      sheets.map((sheet) => (sheet.id === id ? { ...sheet, rotation: turn(sheet.rotation) } : sheet)),
    );
  }

  function remove(id: string) {
    commit(sheets.filter((sheet) => sheet.id !== id));
  }

  function clearAll() {
    pastRef.current = [];
    sheetsRef.current = [];
    setSheets([]);
    setConfirmClear(false);
    setError("");
    setCanUndo(false);
    retain([[]]);
  }

  async function download() {
    if (sheets.length === 0 || binding) return;
    setBinding(true);
    setError("");
    setStatus("Binding the PDF…");
    try {
      const name = fileLabel(fileName);
      const bytes = await buildPdf(sheets, name.replace(/\.pdf$/i, ""));
      savePdf(bytes, name);
      setStatus("");
    } catch (err) {
      setStatus("");
      const detail = err instanceof Error ? err.message : "Something went wrong";
      setError(`Couldn't build the PDF. ${detail}`);
    } finally {
      setBinding(false);
    }
  }

  function onCardPointerDown(event: React.PointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    dragOrigin.current = sheetsRef.current;
    dragId.current = id;
    setDraggingId(id);
    setGhost({ x: event.clientX, y: event.clientY, width: rect.width });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCardPointerMove(event: React.PointerEvent<HTMLElement>) {
    const id = dragId.current;
    if (!id) return;
    setGhost((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
    const stack = document.elementsFromPoint(event.clientX, event.clientY);
    let overId: string | null = null;
    for (const node of stack) {
      const card = (node as HTMLElement).closest?.("[data-sheet-id]") as HTMLElement | null;
      const found = card?.dataset.sheetId;
      if (found && found !== id) {
        overId = found;
        break;
      }
    }
    if (!overId) return;
    const next = moveItem(sheetsRef.current, id, overId);
    if (!next) return;
    sheetsRef.current = next;
    setSheets(next);
  }

  function onCardPointerUp() {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    dragId.current = null;
    setDraggingId(null);
    setGhost(null);
    if (origin && !sameOrder(origin, sheetsRef.current)) {
      pastRef.current.push(origin);
      if (pastRef.current.length > 40) pastRef.current.shift();
      syncHistoryFlag();
      retain([sheetsRef.current, ...pastRef.current]);
    }
  }

  const fileCount = new Set(sheets.map((sheet) => sheet.sourceId)).size;
  const countLabel =
    sheets.length === 0
      ? "No pages yet"
      : `${sheets.length} ${sheets.length === 1 ? "page" : "pages"} · ${fileCount} ${fileCount === 1 ? "file" : "files"}`;

  const dragged = draggingId ? sheets.find((sheet) => sheet.id === draggingId) : undefined;
  const draggedIndex = dragged ? sheets.findIndex((sheet) => sheet.id === dragged.id) : -1;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-ink text-paper">
              <Files className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl leading-none tracking-tight">Sheaf</h1>
              <p className="text-sm text-muted">Combine pages, then download one PDF</p>
            </div>
            <p className="ml-auto hidden text-sm text-muted sm:block">{countLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openPicker}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-sheet px-3 text-sm font-medium text-ink hover:border-ink disabled:opacity-40"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add files
            </button>
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo || busy || binding}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-sheet px-3 text-sm font-medium text-ink hover:border-ink disabled:opacity-40"
            >
              <Undo2 className="size-4" aria-hidden="true" />
              Undo
            </button>
            {sheets.length > 0 &&
              (confirmClear ? (
                <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-sheet px-3">
                  <span className="text-sm text-muted">Clear every page?</span>
                  <button type="button" onClick={clearAll} className="text-sm font-medium text-copper-deep">
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="text-sm font-medium text-ink"
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm font-medium text-muted hover:text-ink"
                >
                  Start over
                </button>
              ))}

            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <label className="sr-only" htmlFor="pdf-name">
                File name
              </label>
              <input
                id="pdf-name"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void download();
                }}
                spellCheck={false}
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-sheet px-3 text-sm text-ink sm:w-40 sm:flex-none"
              />
              <span className="text-sm text-muted" aria-hidden="true">
                .pdf
              </span>
              <button
                type="button"
                onClick={() => void download()}
                disabled={sheets.length === 0 || busy || binding}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-copper px-4 text-sm font-medium text-copper-ink hover:bg-copper-deep disabled:opacity-40 sm:flex-none"
              >
                <Download className="size-4" aria-hidden="true" />
                {binding ? "Binding…" : "Download"}
              </button>
            </div>
          </div>
          <p className="text-sm text-muted sm:hidden">{countLabel}</p>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf,.png,.jpg,.jpeg,.webp"
        multiple
        onChange={onPick}
      />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {(status || error) && (
          <div className="mb-4 space-y-2">
            {status && (
              <p role="status" className="rounded-xl border border-line bg-sheet px-4 py-3 text-sm text-ink">
                {status}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-xl border border-line bg-sheet px-4 py-3 text-sm text-copper-deep">
                {error}
              </p>
            )}
          </div>
        )}

        {sheets.length === 0 ? (
          <EmptyDesk busy={busy} onBrowse={openPicker} />
        ) : (
          <>
            <button
              type="button"
              onClick={openPicker}
              className="mb-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-sheet text-sm text-muted hover:border-ink hover:text-ink"
            >
              <Plus className="size-4" aria-hidden="true" />
              Drop more PDFs or pictures, or browse
            </button>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {sheets.map((sheet, index) => (
                <li key={sheet.id} data-sheet-id={sheet.id}>
                  <article
                    className={cx(
                      "cursor-grab touch-none overflow-hidden rounded-2xl border border-line bg-sheet shadow-sm select-none active:cursor-grabbing",
                      draggingId === sheet.id && "opacity-30",
                    )}
                    onPointerDown={(event) => onCardPointerDown(event, sheet.id)}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={onCardPointerUp}
                    onPointerCancel={onCardPointerUp}
                  >
                    <div className="relative mx-3 mt-3 overflow-hidden rounded-lg border border-line bg-white">
                      <div className="grid aspect-page place-items-center">
                        <img
                          src={sheet.thumbUrl}
                          alt={sheetAlt(sheet, index)}
                          draggable={false}
                          className="pointer-events-none max-h-full max-w-full object-contain"
                          style={{
                            transform: `rotate(${sheet.rotation}deg) scale(${sheet.rotation % 180 === 0 ? 1 : 0.72})`,
                          }}
                        />
                      </div>
                      <span className="absolute top-2 left-2 rounded-md bg-ink px-1.5 py-0.5 text-xs font-medium text-paper">
                        {index + 1}
                      </span>
                    </div>
                    <div className="px-3 pt-2 pb-1">
                      <p className="truncate text-sm font-medium">{sheet.fileName}</p>
                      <p className="truncate text-xs text-muted">
                        {sheet.kind === "pdf" ? `Page ${sheet.pageIndex + 1}` : "Picture"}
                        {sheet.rotation ? ` · ${sheet.rotation}°` : ""}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 border-t border-line">
                      <IconButton label={`Rotate page ${index + 1}`} onClick={() => rotate(sheet.id)}>
                        <RotateCw className="size-4" />
                      </IconButton>
                      <IconButton label={`Remove page ${index + 1}`} onClick={() => remove(sheet.id)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">
              Drag a page to move it. New files land at the end. Nothing is uploaded.
            </p>
          </>
        )}
      </main>

      {fileDrag && (
        <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-ink/50 p-6">
          <div className="rounded-2xl bg-ink px-8 py-6 text-center text-paper">
            <p className="font-display text-3xl">Drop to add</p>
            <p className="mt-1 text-sm text-copper-ink">PDFs and pictures</p>
          </div>
        </div>
      )}

      {dragged && ghost && (
        <div
          className="pointer-events-none fixed z-40 overflow-hidden rounded-2xl border border-copper bg-sheet shadow-lg"
          style={{ left: ghost.x, top: ghost.y, width: ghost.width, transform: "translate(-50%, -60%)" }}
        >
          <div className="relative mx-3 mt-3 overflow-hidden rounded-lg border border-line bg-white">
            <div className="grid aspect-page place-items-center">
              <img
                src={dragged.thumbUrl}
                alt=""
                draggable={false}
                className="max-h-full max-w-full object-contain"
                style={{
                  transform: `rotate(${dragged.rotation}deg) scale(${dragged.rotation % 180 === 0 ? 1 : 0.72})`,
                }}
              />
            </div>
            <span className="absolute top-2 left-2 rounded-md bg-ink px-1.5 py-0.5 text-xs font-medium text-paper">
              {draggedIndex + 1}
            </span>
          </div>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{dragged.fileName}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  children,
  onPointerDown,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      className="inline-flex h-11 items-center justify-center text-ink hover:bg-paper disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}

function EmptyDesk({ busy, onBrowse }: { busy: boolean; onBrowse: () => void }) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-dashed border-line bg-sheet px-6 py-14 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink text-paper">
        <Files className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-5 font-display text-4xl leading-tight tracking-tight">Gather the pages.</h2>
      <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted">
        Drop in PDFs and pictures. Drag pages into order, rotate or remove any of them, then download a
        single PDF. Files stay in this browser.
      </p>
      <button
        type="button"
        onClick={onBrowse}
        disabled={busy}
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-copper px-5 text-sm font-medium text-copper-ink hover:bg-copper-deep disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
        {busy ? "Reading…" : "Choose files"}
      </button>
      <ul className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-medium tracking-wide text-muted uppercase">
        {["PDF", "PNG", "JPG", "WEBP"].map((type) => (
          <li key={type} className="rounded-full border border-line px-2.5 py-1">
            {type}
          </li>
        ))}
      </ul>
    </section>
  );
}
