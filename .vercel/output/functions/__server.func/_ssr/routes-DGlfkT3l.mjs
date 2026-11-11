import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Plus, c as Download, i as RotateCw, l as ChevronRight, o as GripVertical, r as Trash2, s as Files, t as Undo2, u as ChevronLeft } from "../_libs/lucide-react.mjs";
import { n as rgb, r as degrees, t as PDFDocument } from "../_libs/pdf-lib.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DGlfkT3l.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var pdf_worker_min_default = "/assets/pdf.worker.min-CIqJB0yW.mjs";
var pdfStore = /* @__PURE__ */ new Map();
var imageStore = /* @__PURE__ */ new Map();
var liveThumbs = /* @__PURE__ */ new Set();
var MAX_FILE_BYTES = 104857600;
var IMAGE_MAX_EDGE = 2400;
var PAGE_LONG_EDGE = 792;
var pdfjsReady = null;
function loadPdfjs() {
	if (!pdfjsReady) pdfjsReady = import("../_libs/pdfjs-dist.mjs").then((n) => n.t).then((pdfjs) => {
		pdfjs.GlobalWorkerOptions.workerSrc = pdf_worker_min_default;
		return pdfjs;
	});
	return pdfjsReady;
}
function turn(rotation) {
	return (rotation + 90) % 360;
}
function explain(err) {
	if (err && typeof err === "object" && "name" in err) {
		const name = String(err.name);
		if (name === "PasswordException") return "that PDF is password-protected. Remove the password and try again";
		if (name === "InvalidPDFException") return "that file isn't a readable PDF";
	}
	if (err instanceof Error && err.message) return err.message;
	return "could not read that file";
}
function kindOf(file) {
	const name = file.name.toLowerCase();
	const type = file.type.toLowerCase();
	if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
	if (name.endsWith(".svg") || type === "image/svg+xml") return "skip";
	if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/.test(name)) return "image";
	return "skip";
}
function canvasBlob(canvas, type, quality) {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => blob ? resolve(blob) : reject(/* @__PURE__ */ new Error("could not draw that page")), type, quality);
	});
}
async function thumbFromCanvas(canvas) {
	const blob = await canvasBlob(canvas, "image/jpeg", .82);
	const url = URL.createObjectURL(blob);
	liveThumbs.add(url);
	return url;
}
async function readPdf(file, onSheet, onStatus) {
	const pdfjs = await loadPdfjs();
	const sourceId = crypto.randomUUID();
	const bytes = new Uint8Array(await file.arrayBuffer());
	const pdf = await pdfjs.getDocument({
		data: bytes.slice(),
		verbosity: 0
	}).promise;
	pdfStore.set(sourceId, bytes);
	try {
		for (let i = 1; i <= pdf.numPages; i += 1) {
			onStatus(`Reading ${file.name} · page ${i} of ${pdf.numPages}`);
			const page = await pdf.getPage(i);
			const base = page.getViewport({ scale: 1 });
			const scale = Math.min(480 / base.width, 640 / base.height);
			const viewport = page.getViewport({ scale });
			const outputScale = Math.min(1.5, window.devicePixelRatio || 1);
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
			canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
			await page.render({
				canvas,
				viewport,
				transform: [
					outputScale,
					0,
					0,
					outputScale,
					0,
					0
				],
				background: "#ffffff"
			}).promise;
			const thumbUrl = await thumbFromCanvas(canvas);
			onSheet({
				id: crypto.randomUUID(),
				sourceId,
				kind: "pdf",
				fileName: file.name,
				pageIndex: i - 1,
				rotation: 0,
				thumbUrl
			});
			page.cleanup();
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	} finally {
		await pdf.cleanup();
		await pdf.loadingTask.destroy();
	}
}
async function readImage(file, onSheet) {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		bitmap.close();
		throw new Error("could not read that picture");
	}
	const keepAlpha = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
	const mime = keepAlpha ? "image/png" : "image/jpeg";
	if (!keepAlpha) {
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await canvasBlob(canvas, mime, .92);
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const sourceId = crypto.randomUUID();
	imageStore.set(sourceId, {
		bytes,
		mime
	});
	const thumbUrl = URL.createObjectURL(blob);
	liveThumbs.add(thumbUrl);
	onSheet({
		id: crypto.randomUUID(),
		sourceId,
		kind: "image",
		fileName: file.name,
		pageIndex: 0,
		rotation: 0,
		thumbUrl
	});
}
async function readFiles(files, hooks) {
	const errors = [];
	for (const file of files) {
		if (file.size > MAX_FILE_BYTES) {
			errors.push(`${file.name} is over 100 MB`);
			continue;
		}
		const kind = kindOf(file);
		if (kind === "skip") {
			errors.push(file.name.toLowerCase().endsWith(".svg") ? `${file.name}: export a PNG instead of SVG` : `${file.name}: use a PDF or a picture`);
			continue;
		}
		try {
			if (kind === "pdf") await readPdf(file, hooks.onSheet, hooks.onStatus);
			else await readImage(file, hooks.onSheet);
		} catch (err) {
			errors.push(`${file.name}: ${explain(err)}`);
		}
	}
	return errors;
}
/** Drop bytes and thumbnail URLs nothing in `lists` still points at. */
function retain(lists) {
	const ids = /* @__PURE__ */ new Set();
	const urls = /* @__PURE__ */ new Set();
	for (const list of lists) for (const sheet of list) {
		ids.add(sheet.sourceId);
		urls.add(sheet.thumbUrl);
	}
	for (const id of pdfStore.keys()) if (!ids.has(id)) pdfStore.delete(id);
	for (const id of imageStore.keys()) if (!ids.has(id)) imageStore.delete(id);
	for (const url of liveThumbs) if (!urls.has(url)) {
		URL.revokeObjectURL(url);
		liveThumbs.delete(url);
	}
}
async function rotatedImage(record, rotation) {
	if (rotation === 0) return record;
	const bitmap = await createImageBitmap(new Blob([record.bytes.slice()], { type: record.mime }));
	const swap = rotation === 90 || rotation === 270;
	const canvas = document.createElement("canvas");
	canvas.width = swap ? bitmap.height : bitmap.width;
	canvas.height = swap ? bitmap.width : bitmap.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		bitmap.close();
		throw new Error("could not rotate a picture");
	}
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.rotate(rotation * Math.PI / 180);
	ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
	bitmap.close();
	const blob = await canvasBlob(canvas, "image/jpeg", .92);
	return {
		bytes: new Uint8Array(await blob.arrayBuffer()),
		mime: "image/jpeg"
	};
}
async function buildPdf(sheets, title) {
	if (sheets.length === 0) throw new Error("Add at least one page first");
	const out = await PDFDocument.create();
	out.setTitle(title);
	out.setCreator("Quire");
	out.setProducer("Quire");
	const loaded = /* @__PURE__ */ new Map();
	for (const sheet of sheets) {
		if (sheet.kind === "pdf") {
			const bytes = pdfStore.get(sheet.sourceId);
			if (!bytes) throw new Error(`Missing source for ${sheet.fileName}`);
			let src = loaded.get(sheet.sourceId);
			if (!src) {
				src = await PDFDocument.load(bytes.slice());
				loaded.set(sheet.sourceId, src);
			}
			const [copied] = await out.copyPages(src, [sheet.pageIndex]);
			const angle = ((copied.getRotation().angle || 0) + sheet.rotation) % 360;
			copied.setRotation(degrees(angle));
			out.addPage(copied);
			continue;
		}
		const record = imageStore.get(sheet.sourceId);
		if (!record) throw new Error(`Missing picture ${sheet.fileName}`);
		const baked = await rotatedImage(record, sheet.rotation);
		const image = baked.mime === "image/png" ? await out.embedPng(baked.bytes) : await out.embedJpg(baked.bytes);
		const fit = PAGE_LONG_EDGE / Math.max(image.width, image.height);
		const width = image.width * fit;
		const height = image.height * fit;
		const page = out.addPage([width, height]);
		page.drawRectangle({
			x: 0,
			y: 0,
			width,
			height,
			color: rgb(1, 1, 1)
		});
		page.drawImage(image, {
			x: 0,
			y: 0,
			width,
			height
		});
	}
	return out.save();
}
function savePdf(bytes, filename) {
	const blob = new Blob([bytes.slice()], { type: "application/pdf" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2e3);
}
function cx(...parts) {
	return parts.filter(Boolean).join(" ");
}
function moveItem(list, fromId, toId) {
	const from = list.findIndex((sheet) => sheet.id === fromId);
	const to = list.findIndex((sheet) => sheet.id === toId);
	if (from < 0 || to < 0 || from === to) return null;
	const next = list.slice();
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}
function sameOrder(a, b) {
	return a.length === b.length && a.every((sheet, index) => sheet.id === b[index]?.id);
}
function fileLabel(name) {
	const trimmed = name.trim().replace(/\.pdf$/i, "");
	return trimmed.length > 0 ? `${trimmed}.pdf` : "combined.pdf";
}
function sheetAlt(sheet, index) {
	const origin = sheet.kind === "pdf" ? `page ${sheet.pageIndex + 1}` : "picture";
	const turned = sheet.rotation ? `, rotated ${sheet.rotation}°` : "";
	return `${index + 1}. ${sheet.fileName}, ${origin}${turned}`;
}
function Desk() {
	const [sheets, setSheets] = (0, import_react.useState)([]);
	const [status, setStatus] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [binding, setBinding] = (0, import_react.useState)(false);
	const [fileDrag, setFileDrag] = (0, import_react.useState)(false);
	const [canUndo, setCanUndo] = (0, import_react.useState)(false);
	const [confirmClear, setConfirmClear] = (0, import_react.useState)(false);
	const [draggingId, setDraggingId] = (0, import_react.useState)(null);
	const [fileName, setFileName] = (0, import_react.useState)("combined");
	const sheetsRef = (0, import_react.useRef)([]);
	const pastRef = (0, import_react.useRef)([]);
	const dragOrigin = (0, import_react.useRef)(null);
	const dragId = (0, import_react.useRef)(null);
	const busyRef = (0, import_react.useRef)(false);
	const queueRef = (0, import_react.useRef)([]);
	const inputRef = (0, import_react.useRef)(null);
	const addFilesRef = (0, import_react.useRef)(() => {});
	sheetsRef.current = sheets;
	function syncHistoryFlag() {
		setCanUndo(pastRef.current.length > 0);
	}
	function remember() {
		pastRef.current.push(sheetsRef.current);
		if (pastRef.current.length > 40) pastRef.current.shift();
		syncHistoryFlag();
	}
	function commit(next) {
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
	async function addFiles(files) {
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
				}
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
			if (queued.length) addFiles(queued);
		}
	}
	addFilesRef.current = (files) => {
		addFiles(files);
	};
	(0, import_react.useEffect)(() => {
		let depth = 0;
		const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
		const onEnter = (event) => {
			if (!hasFiles(event)) return;
			depth += 1;
			setFileDrag(true);
		};
		const onLeave = (event) => {
			if (!hasFiles(event)) return;
			depth -= 1;
			if (depth <= 0) {
				depth = 0;
				setFileDrag(false);
			}
		};
		const onOver = (event) => {
			if (!hasFiles(event)) return;
			event.preventDefault();
		};
		const onDrop = (event) => {
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
	(0, import_react.useEffect)(() => {
		const onKey = (event) => {
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
	function onPick(event) {
		const list = Array.from(event.target.files ?? []);
		event.target.value = "";
		addFiles(list);
	}
	function nudge(id, direction) {
		const index = sheets.findIndex((sheet) => sheet.id === id);
		const target = sheets[index + direction];
		if (!target) return;
		const next = moveItem(sheets, id, target.id);
		if (next) commit(next);
	}
	function rotate(id) {
		commit(sheets.map((sheet) => sheet.id === id ? {
			...sheet,
			rotation: turn(sheet.rotation)
		} : sheet));
	}
	function remove(id) {
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
			savePdf(await buildPdf(sheets, name.replace(/\.pdf$/i, "")), name);
			setStatus("");
		} catch (err) {
			setStatus("");
			const detail = err instanceof Error ? err.message : "Something went wrong";
			setError(`Couldn't build the PDF. ${detail}`);
		} finally {
			setBinding(false);
		}
	}
	function onGripDown(event, id) {
		if (event.button !== 0) return;
		event.preventDefault();
		dragOrigin.current = sheetsRef.current;
		dragId.current = id;
		setDraggingId(id);
		event.currentTarget.setPointerCapture(event.pointerId);
	}
	function onGripMove(event) {
		const id = dragId.current;
		if (!id) return;
		const stack = document.elementsFromPoint(event.clientX, event.clientY);
		let overId = null;
		for (const node of stack) {
			const found = (node.closest?.("[data-sheet-id]"))?.dataset.sheetId;
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
	function onGripUp() {
		const origin = dragOrigin.current;
		dragOrigin.current = null;
		dragId.current = null;
		setDraggingId(null);
		if (origin && !sameOrder(origin, sheetsRef.current)) {
			pastRef.current.push(origin);
			if (pastRef.current.length > 40) pastRef.current.shift();
			syncHistoryFlag();
			retain([sheetsRef.current, ...pastRef.current]);
		}
	}
	const fileCount = new Set(sheets.map((sheet) => sheet.sourceId)).size;
	const countLabel = sheets.length === 0 ? "No pages yet" : `${sheets.length} ${sheets.length === 1 ? "page" : "pages"} · ${fileCount} ${fileCount === 1 ? "file" : "files"}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "grid size-11 place-items-center rounded-xl bg-ink text-paper",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Files, {
										className: "size-5",
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
										className: "font-display text-2xl leading-none tracking-tight",
										children: "Quire"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm text-muted",
										children: "Combine pages, then download one PDF"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "ml-auto hidden text-sm text-muted sm:block",
									children: countLabel
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: openPicker,
									disabled: busy,
									className: "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-sheet px-3 text-sm font-medium text-ink hover:border-ink disabled:opacity-40",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
										className: "size-4",
										"aria-hidden": "true"
									}), "Add files"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: undo,
									disabled: !canUndo || busy || binding,
									className: "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-sheet px-3 text-sm font-medium text-ink hover:border-ink disabled:opacity-40",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Undo2, {
										className: "size-4",
										"aria-hidden": "true"
									}), "Undo"]
								}),
								sheets.length > 0 && (confirmClear ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-sheet px-3",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-sm text-muted",
											children: "Clear every page?"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											onClick: clearAll,
											className: "text-sm font-medium text-copper-deep",
											children: "Clear"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											onClick: () => setConfirmClear(false),
											className: "text-sm font-medium text-ink",
											children: "Keep"
										})
									]
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setConfirmClear(true),
									className: "inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm font-medium text-muted hover:text-ink",
									children: "Start over"
								})),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex w-full items-center gap-2 sm:ml-auto sm:w-auto",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
											className: "sr-only",
											htmlFor: "pdf-name",
											children: "File name"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											id: "pdf-name",
											value: fileName,
											onChange: (event) => setFileName(event.target.value),
											onKeyDown: (event) => {
												if (event.key === "Enter") download();
											},
											spellCheck: false,
											className: "h-11 min-w-0 flex-1 rounded-xl border border-line bg-sheet px-3 text-sm text-ink sm:w-40 sm:flex-none"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-sm text-muted",
											"aria-hidden": "true",
											children: ".pdf"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											onClick: () => void download(),
											disabled: sheets.length === 0 || busy || binding,
											className: "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-copper px-4 text-sm font-medium text-copper-ink hover:bg-copper-deep disabled:opacity-40 sm:flex-none",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {
												className: "size-4",
												"aria-hidden": "true"
											}), binding ? "Binding…" : "Download"]
										})
									]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted sm:hidden",
							children: countLabel
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: inputRef,
				type: "file",
				className: "sr-only",
				accept: "application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf,.png,.jpg,.jpeg,.webp",
				multiple: true,
				onChange: onPick
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "mx-auto max-w-6xl px-4 py-6",
				children: [(status || error) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-4 space-y-2",
					children: [status && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: "status",
						className: "rounded-xl border border-line bg-sheet px-4 py-3 text-sm text-ink",
						children: status
					}), error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "rounded-xl border border-line bg-sheet px-4 py-3 text-sm text-copper-deep",
						children: error
					})]
				}), sheets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyDesk, {
					busy,
					onBrowse: openPicker
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: openPicker,
						className: "mb-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-sheet text-sm text-muted hover:border-ink hover:text-ink",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
							className: "size-4",
							"aria-hidden": "true"
						}), "Drop more PDFs or pictures, or browse"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
						children: sheets.map((sheet, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							"data-sheet-id": sheet.id,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
								className: cx("overflow-hidden rounded-2xl border border-line bg-sheet shadow-sm", draggingId === sheet.id && "ring-2 ring-copper"),
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex h-11 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing",
										"aria-label": `Drag page ${index + 1} to reorder`,
										onPointerDown: (event) => onGripDown(event, sheet.id),
										onPointerMove: onGripMove,
										onPointerUp: onGripUp,
										onPointerCancel: onGripUp,
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GripVertical, {
											className: "size-4",
											"aria-hidden": "true"
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "relative mx-3 overflow-hidden rounded-lg border border-line bg-white",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "grid aspect-page place-items-center",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
												src: sheet.thumbUrl,
												alt: sheetAlt(sheet, index),
												draggable: false,
												className: "max-h-full max-w-full object-contain",
												style: { transform: `rotate(${sheet.rotation}deg) scale(${sheet.rotation % 180 === 0 ? 1 : .72})` }
											})
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "absolute top-2 left-2 rounded-md bg-ink px-1.5 py-0.5 text-xs font-medium text-paper",
											children: index + 1
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "px-3 pt-2 pb-1",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "truncate text-sm font-medium",
											children: sheet.fileName
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "truncate text-xs text-muted",
											children: [sheet.kind === "pdf" ? `Page ${sheet.pageIndex + 1}` : "Picture", sheet.rotation ? ` · ${sheet.rotation}°` : ""]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid grid-cols-4 border-t border-line",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
												label: `Move page ${index + 1} earlier`,
												disabled: index === 0,
												onClick: () => nudge(sheet.id, -1),
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "size-4" })
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
												label: `Move page ${index + 1} later`,
												disabled: index === sheets.length - 1,
												onClick: () => nudge(sheet.id, 1),
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "size-4" })
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
												label: `Rotate page ${index + 1}`,
												onClick: () => rotate(sheet.id),
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCw, { className: "size-4" })
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
												label: `Remove page ${index + 1}`,
												onClick: () => remove(sheet.id),
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" })
											})
										]
									})
								]
							})
						}, sheet.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 text-sm text-muted",
						children: "Drag a handle to reorder. New files land at the end. Nothing is uploaded."
					})
				] })]
			}),
			fileDrag && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none fixed inset-0 z-30 grid place-items-center bg-ink/50 p-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-2xl bg-ink px-8 py-6 text-center text-paper",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-3xl",
						children: "Drop to add"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-copper-ink",
						children: "PDFs and pictures"
					})]
				})
			})
		]
	});
}
function IconButton({ label, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		"aria-label": label,
		title: label,
		className: "inline-flex h-11 items-center justify-center text-ink hover:bg-paper disabled:opacity-30",
		...props,
		children
	});
}
function EmptyDesk({ busy, onBrowse }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mx-auto max-w-xl rounded-2xl border border-dashed border-line bg-sheet px-6 py-14 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "mx-auto grid size-14 place-items-center rounded-2xl bg-ink text-paper",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Files, {
					className: "size-6",
					"aria-hidden": "true"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-5 font-display text-4xl leading-tight tracking-tight",
				children: "Gather the pages."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mx-auto mt-3 max-w-md text-base leading-relaxed text-muted",
				children: "Drop in PDFs and pictures. Drag pages into order, rotate or remove any of them, then download a single PDF. Files stay in this browser."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: onBrowse,
				disabled: busy,
				className: "mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-copper px-5 text-sm font-medium text-copper-ink hover:bg-copper-deep disabled:opacity-40",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
					className: "size-4",
					"aria-hidden": "true"
				}), busy ? "Reading…" : "Choose files"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-medium tracking-wide text-muted uppercase",
				children: [
					"PDF",
					"PNG",
					"JPG",
					"WEBP"
				].map((type) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "rounded-full border border-line px-2.5 py-1",
					children: type
				}, type))
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Desk, {});
}
//#endregion
export { Home as component };
