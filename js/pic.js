(function () {
    const MAX_EDGE = 4096;
    const MAX_DOC = 8192;
    const HISTORY_LIMIT = 20;
    const MIN_SIZE = 8;

    const view = document.getElementById("view");
    const ctx = view.getContext("2d");
    const stage = document.getElementById("stage");
    const hint = document.getElementById("hint");
    const fileInput = document.getElementById("fileInput");
    const layerList = document.getElementById("layerList");
    const layersEmpty = document.getElementById("layersEmpty");
    const layersPanel = document.getElementById("layersPanel");
    const layersBackdrop = document.getElementById("layersBackdrop");
    const cropActions = document.getElementById("cropActions");
    const toolHint = document.getElementById("toolHint");
    const opacityInput = document.getElementById("opacity");
    const blendInput = document.getElementById("blend");
    const flipHBtn = document.getElementById("flipH");
    const flipVBtn = document.getElementById("flipV");
    const docWInput = document.getElementById("docW");
    const docHInput = document.getElementById("docH");
    const bgColorInput = document.getElementById("bgColor");
    const bgTransparentInput = document.getElementById("bgTransparent");
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    const toastEl = document.getElementById("toast");

    const state = {
        docW: 800,
        docH: 600,
        bg: "transparent",
        zoom: 1,
        panX: 0,
        panY: 0,
        tool: "select",
        docResize: false,
        layers: [],
        activeId: null,
        history: [],
        future: []
    };

    let seq = 0;
    let dpr = 1;
    let draft = null;
    let drag = null;
    let pinch = null;
    let ignoreUntilEmpty = false;
    const pointers = new Map();
    let toastTimer = 0;
    let checker = null;
    let opacityArmed = false;
    let bgArmed = false;
    let brushMode = "paint";
    let hover = null;
    let guides = null;

    const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

    function $(id) { return document.getElementById(id); }

    function toast(message) {
        toastEl.textContent = message;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2800);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function activeLayer() {
        return state.layers.find(function (layer) { return layer.id === state.activeId; }) || null;
    }

    function pushHistory() {
        state.history.push(snapshot());
        if (state.history.length > HISTORY_LIMIT) state.history.shift();
        state.future = [];
        syncHistoryButtons();
    }

    function snapshot() {
        return {
            docW: state.docW,
            docH: state.docH,
            bg: state.bg,
            activeId: state.activeId,
            layers: state.layers.map(function (layer) {
                return {
                    id: layer.id,
                    name: layer.name,
                    bitmap: layer.bitmap,
                    x: layer.x,
                    y: layer.y,
                    w: layer.w,
                    h: layer.h,
                    rotation: layer.rotation,
                    opacity: layer.opacity,
                    blend: layer.blend,
                    visible: layer.visible,
                    flipH: layer.flipH,
                    flipV: layer.flipV
                };
            })
        };
    }

    function restore(snap) {
        state.docW = snap.docW;
        state.docH = snap.docH;
        state.bg = snap.bg;
        state.activeId = snap.activeId;
        state.layers = snap.layers.map(function (layer) { return Object.assign({}, layer); });
        draft = null;
        drag = null;
        syncAll();
    }

    function cloneCanvas(source) {
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext("2d").drawImage(source, 0, 0);
        return canvas;
    }

    function strokeUndoAvailable() {
        return !!(draft && draft.kind === "free" && draft.undoStack && draft.undoStack.length);
    }

    function strokeRedoAvailable() {
        return !!(draft && draft.kind === "free" && draft.redoStack && draft.redoStack.length);
    }

    function undo() {
        if (strokeUndoAvailable()) {
            drag = null;
            draft.redoStack.push(cloneCanvas(draft.mask));
            draft.mask = draft.undoStack.pop();
            draft.painted = draft.undoStack.length > 0;
            syncAll();
            return;
        }
        if (!state.history.length) return;
        state.future.push(snapshot());
        restore(state.history.pop());
        syncHistoryButtons();
    }

    function redo() {
        if (strokeRedoAvailable()) {
            drag = null;
            draft.undoStack.push(cloneCanvas(draft.mask));
            draft.mask = draft.redoStack.pop();
            draft.painted = true;
            syncAll();
            return;
        }
        if (!state.future.length) return;
        state.history.push(snapshot());
        restore(state.future.pop());
        syncHistoryButtons();
    }

    function syncHistoryButtons() {
        undoBtn.disabled = !strokeUndoAvailable() && state.history.length === 0;
        redoBtn.disabled = !strokeRedoAvailable() && state.future.length === 0;
    }

    function viewSize() {
        const rect = view.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    }

    function resizeView() {
        const box = viewSize();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        view.width = Math.max(1, Math.round(box.width * dpr));
        view.height = Math.max(1, Math.round(box.height * dpr));
        render();
    }

    function fitView() {
        const box = viewSize();
        const pad = 32;
        const zx = (box.width - pad) / state.docW;
        const zy = (box.height - pad) / state.docH;
        state.zoom = clamp(Math.min(zx, zy), 0.05, 8);
        state.panX = (box.width - state.docW * state.zoom) / 2;
        state.panY = (box.height - state.docH * state.zoom) / 2;
        render();
    }

    function screenToDoc(clientX, clientY) {
        const box = viewSize();
        const px = clientX - box.left;
        const py = clientY - box.top;
        return { x: (px - state.panX) / state.zoom, y: (py - state.panY) / state.zoom };
    }

    function docToScreen(x, y) {
        return { x: x * state.zoom + state.panX, y: y * state.zoom + state.panY };
    }

    function localToDoc(layer, lx, ly) {
        const cx = layer.x + layer.w / 2;
        const cy = layer.y + layer.h / 2;
        const dx = lx - layer.w / 2;
        const dy = ly - layer.h / 2;
        const cos = Math.cos(layer.rotation);
        const sin = Math.sin(layer.rotation);
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    }

    function docToLocal(layer, x, y) {
        const cx = layer.x + layer.w / 2;
        const cy = layer.y + layer.h / 2;
        const cos = Math.cos(-layer.rotation);
        const sin = Math.sin(-layer.rotation);
        const vx = x - cx;
        const vy = y - cy;
        const rx = vx * cos - vy * sin;
        const ry = vx * sin + vy * cos;
        return { x: rx + layer.w / 2, y: ry + layer.h / 2, cx: rx, cy: ry };
    }

    function hitLayer(doc) {
        for (let i = state.layers.length - 1; i >= 0; i--) {
            const layer = state.layers[i];
            if (!layer.visible) continue;
            const local = docToLocal(layer, doc.x, doc.y);
            if (local.x >= 0 && local.y >= 0 && local.x <= layer.w && local.y <= layer.h) return layer;
        }
        return null;
    }

    function hitRadius() {
        return window.matchMedia("(pointer: coarse)").matches ? 22 : 12;
    }

    function handlePoints(layer) {
        const w = layer.w;
        const h = layer.h;
        const map = {
            nw: [0, 0], n: [w / 2, 0], ne: [w, 0],
            e: [w, h / 2], se: [w, h], s: [w / 2, h],
            sw: [0, h], w: [0, h / 2]
        };
        const points = {};
        HANDLES.forEach(function (name) {
            const local = map[name];
            const doc = localToDoc(layer, local[0], local[1]);
            points[name] = docToScreen(doc.x, doc.y);
        });
        const top = points.n;
        const up = localToDoc(layer, w / 2, -28 / state.zoom);
        points.rotate = docToScreen(up.x, up.y);
        points.rotate.from = top;
        return points;
    }

    function hitHandle(layer, clientX, clientY) {
        const box = viewSize();
        const px = clientX - box.left;
        const py = clientY - box.top;
        const points = handlePoints(layer);
        const radius = hitRadius();
        const order = ["rotate"].concat(HANDLES);
        for (let i = 0; i < order.length; i++) {
            const name = order[i];
            const point = points[name];
            if (Math.hypot(point.x - px, point.y - py) <= radius) return name;
        }
        return null;
    }

    function render() {
        const box = viewSize();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, box.width, box.height);
        ctx.fillStyle = "#e5e7eb";
        ctx.fillRect(0, 0, box.width, box.height);

        ctx.save();
        ctx.translate(state.panX, state.panY);
        ctx.scale(state.zoom, state.zoom);
        ctx.beginPath();
        ctx.rect(0, 0, state.docW, state.docH);
        ctx.clip();
        if (state.bg === "transparent") {
            if (!checker) {
                const tile = document.createElement("canvas");
                tile.width = 16;
                tile.height = 16;
                const g = tile.getContext("2d");
                g.fillStyle = "#ffffff";
                g.fillRect(0, 0, 16, 16);
                g.fillStyle = "#d4d4d8";
                g.fillRect(0, 0, 8, 8);
                g.fillRect(8, 8, 8, 8);
                checker = ctx.createPattern(tile, "repeat");
            }
            ctx.fillStyle = checker;
            ctx.fillRect(0, 0, state.docW, state.docH);
        } else {
            ctx.fillStyle = state.bg;
            ctx.fillRect(0, 0, state.docW, state.docH);
        }
        state.layers.forEach(function (layer) {
            if (!layer.visible) return;
            drawLayer(ctx, layer);
        });
        ctx.restore();

        const origin = docToScreen(0, 0);
        const far = docToScreen(state.docW, state.docH);
        ctx.save();
        ctx.strokeStyle = "#9ca3af";
        ctx.lineWidth = 1;
        ctx.strokeRect(origin.x, origin.y, far.x - origin.x, far.y - origin.y);
        ctx.restore();
        if (state.docResize) drawDocHandles();

        const layer = activeLayer();
        if (layer && layer.visible) drawSelection(layer);
        if (draft && layer && draft.layerId === layer.id) drawDraft(layer);
        drawGuides();
        drawBrushCursor();
    }

    function drawGuides() {
        if (!guides) return;
        ctx.save();
        ctx.strokeStyle = "#e11d48";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        (guides.x || []).forEach(function (x) {
            const top = docToScreen(x, 0);
            const bottom = docToScreen(x, state.docH);
            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(bottom.x, bottom.y);
            ctx.stroke();
        });
        (guides.y || []).forEach(function (y) {
            const left = docToScreen(0, y);
            const right = docToScreen(state.docW, y);
            ctx.beginPath();
            ctx.moveTo(left.x, left.y);
            ctx.lineTo(right.x, right.y);
            ctx.stroke();
        });
        ctx.restore();
    }

    function drawDocHandles() {
        const points = docHandlePoints();
        ctx.save();
        ctx.strokeStyle = "#059669";
        ctx.fillStyle = "#fff";
        ctx.lineWidth = 1.5;
        HANDLES.forEach(function (name) {
            const point = points[name];
            ctx.fillRect(point.x - 5, point.y - 5, 10, 10);
            ctx.strokeRect(point.x - 5, point.y - 5, 10, 10);
        });
        ctx.restore();
    }

    function docHandlePoints() {
        const w = state.docW;
        const h = state.docH;
        const map = {
            nw: [0, 0], n: [w / 2, 0], ne: [w, 0],
            e: [w, h / 2], se: [w, h], s: [w / 2, h],
            sw: [0, h], w: [0, h / 2]
        };
        const points = {};
        HANDLES.forEach(function (name) {
            const local = map[name];
            points[name] = docToScreen(local[0], local[1]);
        });
        return points;
    }

    function hitDocHandle(clientX, clientY) {
        const box = viewSize();
        const px = clientX - box.left;
        const py = clientY - box.top;
        const points = docHandlePoints();
        const radius = hitRadius();
        for (let i = 0; i < HANDLES.length; i++) {
            const name = HANDLES[i];
            const point = points[name];
            if (Math.hypot(point.x - px, point.y - py) <= radius) return name;
        }
        return null;
    }

    function drawBrushCursor() {
        if (state.tool !== "crop-free" || !hover) return;
        const box = viewSize();
        ctx.save();
        ctx.beginPath();
        ctx.arc(hover.x - box.left, hover.y - box.top, brushSize() / 2, 0, Math.PI * 2);
        ctx.strokeStyle = brushMode === "erase" ? "#dc2626" : "#2563eb";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    function brushSize() {
        return Number(document.getElementById("brushSize").value) || 24;
    }

    function drawLayer(context, layer) {
        context.save();
        context.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
        context.rotate(layer.rotation);
        context.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
        context.globalAlpha = layer.opacity;
        context.globalCompositeOperation = layer.blend;
        context.imageSmoothingEnabled = true;
        context.drawImage(layer.bitmap, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
        context.restore();
    }

    function drawSelection(layer) {
        const corners = [[0, 0], [layer.w, 0], [layer.w, layer.h], [0, layer.h]];
        ctx.save();
        ctx.beginPath();
        corners.forEach(function (point, index) {
            const doc = localToDoc(layer, point[0], point[1]);
            const screen = docToScreen(doc.x, doc.y);
            if (index === 0) ctx.moveTo(screen.x, screen.y);
            else ctx.lineTo(screen.x, screen.y);
        });
        ctx.closePath();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (state.tool === "stretch") {
            const points = handlePoints(layer);
            ctx.beginPath();
            ctx.moveTo(points.n.x, points.n.y);
            ctx.lineTo(points.rotate.x, points.rotate.y);
            ctx.stroke();
            HANDLES.forEach(function (name) {
                const point = points[name];
                ctx.fillStyle = "#fff";
                ctx.strokeStyle = "#2563eb";
                ctx.fillRect(point.x - 5, point.y - 5, 10, 10);
                ctx.strokeRect(point.x - 5, point.y - 5, 10, 10);
            });
            ctx.beginPath();
            ctx.arc(points.rotate.x, points.rotate.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = "#2563eb";
            ctx.fill();
        }
        ctx.restore();
    }

    function drawDraft(layer) {
        ctx.save();
        ctx.translate(state.panX, state.panY);
        ctx.scale(state.zoom, state.zoom);
        ctx.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
        ctx.rotate(layer.rotation);
        ctx.translate(-layer.w / 2, -layer.h / 2);
        ctx.strokeStyle = "#2563eb";
        ctx.fillStyle = "rgba(37, 99, 235, 0.18)";
        ctx.lineWidth = 1.5 / state.zoom;
        if (draft.kind === "rect" || draft.kind === "ellipse") {
            ctx.beginPath();
            if (draft.kind === "ellipse") {
                ctx.ellipse(draft.x + draft.w / 2, draft.y + draft.h / 2, Math.abs(draft.w) / 2, Math.abs(draft.h) / 2, 0, 0, Math.PI * 2);
            } else {
                ctx.rect(draft.x, draft.y, draft.w, draft.h);
            }
            ctx.fill();
            ctx.stroke();
        } else if (draft.points && draft.points.length) {
            ctx.beginPath();
            draft.points.forEach(function (point, index) {
                if (index === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.fill();
            ctx.stroke();
        } else if (draft.kind === "free" && draft.mask) {
            ctx.save();
            ctx.drawImage(draft.mask, 0, 0, layer.w, layer.h);
            ctx.globalCompositeOperation = "source-in";
            ctx.fillStyle = "rgba(37, 99, 235, 0.45)";
            ctx.fillRect(0, 0, layer.w, layer.h);
            ctx.restore();
        }
        ctx.restore();
    }

    function renderDocument(target, mime) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(state.docW));
        canvas.height = Math.max(1, Math.round(state.docH));
        const context = canvas.getContext("2d");
        if (mime === "image/jpeg") {
            context.fillStyle = state.bg === "transparent" ? "#ffffff" : state.bg;
            context.fillRect(0, 0, canvas.width, canvas.height);
        } else if (state.bg !== "transparent") {
            context.fillStyle = state.bg;
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        state.layers.forEach(function (layer) {
            if (layer.visible) drawLayer(context, layer);
        });
        return canvas;
    }

    function download(mime, filename) {
        saveCanvas(renderDocument(null, mime), mime, filename);
    }

    function exportActiveLayer() {
        const layer = activeLayer();
        if (!layer) {
            toast("请先选择一个图层");
            return;
        }
        saveCanvas(bake(layer), "image/png", (layer.name || "图层") + ".png");
    }

    function saveCanvas(canvas, mime, filename) {
        const finish = function (url) {
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            if (url.indexOf("blob:") === 0) setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        };
        if (canvas.toBlob) {
            canvas.toBlob(function (blob) {
                if (!blob) { toast("导出失败"); return; }
                finish(URL.createObjectURL(blob));
            }, mime, 0.92);
        } else {
            finish(canvas.toDataURL(mime, 0.92));
        }
    }

    function loadImage(file) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = function () {
                URL.revokeObjectURL(url);
                resolve(image);
            };
            image.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("load"));
            };
            image.src = url;
        });
    }

    function rasterImage(image) {
        let width = image.naturalWidth || image.width;
        let height = image.naturalHeight || image.height;
        let shrunk = false;
        const edge = Math.max(width, height);
        if (edge > MAX_EDGE) {
            const scale = MAX_EDGE / edge;
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));
            shrunk = true;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        return { canvas: canvas, shrunk: shrunk };
    }

    async function addFiles(fileList) {
        const files = Array.from(fileList).filter(function (file) {
            return file.type.indexOf("image/") === 0;
        });
        if (!files.length) {
            toast("请选择图片文件");
            return;
        }
        const prepared = [];
        let shrunk = false;
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
            try {
                const image = await loadImage(files[i]);
                const raster = rasterImage(image);
                if (raster.shrunk) shrunk = true;
                const base = files[i].name.replace(/\.[^.]+$/, "") || "图片";
                prepared.push({
                    id: "L" + (++seq),
                    name: base.slice(0, 18),
                    bitmap: raster.canvas,
                    x: 0,
                    y: 0,
                    w: raster.canvas.width,
                    h: raster.canvas.height,
                    rotation: 0,
                    opacity: 1,
                    blend: "source-over",
                    visible: true,
                    flipH: false,
                    flipV: false
                });
            } catch (err) {
                failed += 1;
            }
        }
        if (!prepared.length) {
            toast("无法读取图片");
            return;
        }
        pushHistory();
        const firstBatch = state.layers.length === 0;
        prepared.forEach(function (layer) { state.layers.push(layer); });
        state.activeId = prepared[prepared.length - 1].id;
        if (firstBatch) {
            state.docW = prepared[0].w;
            state.docH = prepared[0].h;
        }
        prepared.forEach(function (layer) {
            state.docW = Math.max(state.docW, layer.x + layer.w);
            state.docH = Math.max(state.docH, layer.y + layer.h);
        });
        state.docW = clamp(Math.round(state.docW), 1, MAX_DOC);
        state.docH = clamp(Math.round(state.docH), 1, MAX_DOC);
        if (shrunk) toast("部分图片长边超过 4096，已缩小后载入");
        else if (failed) toast("部分图片无法读取");
        syncAll();
        if (firstBatch) fitView();
    }

    function arrange(direction) {
        if (!state.layers.length) {
            toast("请先上传图片");
            return;
        }
        pushHistory();
        let cursor = 0;
        let cross = 0;
        state.layers.forEach(function (layer) {
            layer.rotation = 0;
            if (direction === "h") {
                layer.x = cursor;
                layer.y = 0;
                cursor += layer.w;
                cross = Math.max(cross, layer.h);
            } else {
                layer.x = 0;
                layer.y = cursor;
                cursor += layer.h;
                cross = Math.max(cross, layer.w);
            }
        });
        if (direction === "h") {
            state.docW = clamp(Math.round(cursor), 1, MAX_DOC);
            state.docH = clamp(Math.round(cross), 1, MAX_DOC);
        } else {
            state.docW = clamp(Math.round(cross), 1, MAX_DOC);
            state.docH = clamp(Math.round(cursor), 1, MAX_DOC);
        }
        syncAll();
        fitView();
    }

    function moveLayer(id, step) {
        const index = state.layers.findIndex(function (layer) { return layer.id === id; });
        const next = index + step;
        if (index < 0 || next < 0 || next >= state.layers.length) return;
        pushHistory();
        const layer = state.layers[index];
        state.layers.splice(index, 1);
        state.layers.splice(next, 0, layer);
        syncAll();
    }

    function deleteLayer(id) {
        const index = state.layers.findIndex(function (layer) { return layer.id === id; });
        if (index < 0) return;
        pushHistory();
        state.layers.splice(index, 1);
        if (state.activeId === id) {
            const fallback = state.layers[index] || state.layers[index - 1] || null;
            state.activeId = fallback ? fallback.id : null;
        }
        if (draft && draft.layerId === id) draft = null;
        syncAll();
    }

    function bake(layer) {
        const width = Math.max(1, Math.round(layer.w));
        const height = Math.max(1, Math.round(layer.h));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.translate(width / 2, height / 2);
        context.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
        context.drawImage(layer.bitmap, -width / 2, -height / 2, width, height);
        return canvas;
    }

    function toBaked(layer, baked, x, y) {
        return {
            x: x / layer.w * baked.width,
            y: y / layer.h * baked.height
        };
    }

    function placeCrop(layer, pixelX, pixelY, pixelW, pixelH, baked, canvas) {
        const dispX = pixelX / baked.width * layer.w;
        const dispY = pixelY / baked.height * layer.h;
        const dispW = pixelW / baked.width * layer.w;
        const dispH = pixelH / baked.height * layer.h;
        const cx0 = layer.x + layer.w / 2;
        const cy0 = layer.y + layer.h / 2;
        const lcx = dispX + dispW / 2 - layer.w / 2;
        const lcy = dispY + dispH / 2 - layer.h / 2;
        const cos = Math.cos(layer.rotation);
        const sin = Math.sin(layer.rotation);
        const cx = cx0 + lcx * cos - lcy * sin;
        const cy = cy0 + lcx * sin + lcy * cos;
        layer.bitmap = canvas;
        layer.x = cx - dispW / 2;
        layer.y = cy - dispH / 2;
        layer.w = dispW;
        layer.h = dispH;
        layer.flipH = false;
        layer.flipV = false;
    }

    function applyCrop() {
        const layer = activeLayer();
        if (!draft || !layer || draft.layerId !== layer.id) return;
        const baked = bake(layer);
        if (draft.kind === "rect" || draft.kind === "ellipse") {
            const rect = intersectRect(draft.x, draft.y, draft.w, draft.h, 0, 0, layer.w, layer.h);
            if (rect.w < 1 || rect.h < 1) {
                toast("裁取区域太小");
                return;
            }
            const origin = toBaked(layer, baked, rect.x, rect.y);
            const size = toBaked(layer, baked, rect.w, rect.h);
            const width = Math.max(1, Math.round(size.x));
            const height = Math.max(1, Math.round(size.y));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            context.drawImage(baked, origin.x, origin.y, width, height, 0, 0, width, height);
            if (draft.kind === "ellipse") {
                context.globalCompositeOperation = "destination-in";
                context.beginPath();
                context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
                context.fill();
            }
            pushHistory();
            placeCrop(layer, origin.x, origin.y, width, height, baked, canvas);
        } else if (draft.kind === "free") {
            if (!draft.painted || !draft.mask) return;
            const masked = document.createElement("canvas");
            masked.width = baked.width;
            masked.height = baked.height;
            const context = masked.getContext("2d");
            context.drawImage(baked, 0, 0);
            context.globalCompositeOperation = "destination-in";
            context.drawImage(draft.mask, 0, 0, masked.width, masked.height);
            const bounds = alphaBounds(masked);
            if (!bounds) {
                toast("没有可保留的区域");
                return;
            }
            const canvas = document.createElement("canvas");
            canvas.width = bounds.w;
            canvas.height = bounds.h;
            canvas.getContext("2d").drawImage(masked, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
            pushHistory();
            placeCrop(layer, bounds.x, bounds.y, bounds.w, bounds.h, baked, canvas);
        } else {
            if (!draft.points || draft.points.length < 3) {
                toast("至少需要三个点");
                return;
            }
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            draft.points.forEach(function (point) {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            });
            const rect = intersectRect(minX, minY, maxX - minX, maxY - minY, 0, 0, layer.w, layer.h);
            if (rect.w < 1 || rect.h < 1) {
                toast("裁取区域太小");
                return;
            }
            const origin = toBaked(layer, baked, rect.x, rect.y);
            const far = toBaked(layer, baked, rect.x + rect.w, rect.y + rect.h);
            const width = Math.max(1, Math.round(far.x - origin.x));
            const height = Math.max(1, Math.round(far.y - origin.y));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            context.drawImage(baked, origin.x, origin.y, width, height, 0, 0, width, height);
            context.globalCompositeOperation = "destination-in";
            context.beginPath();
            draft.points.forEach(function (point, index) {
                const bakedPoint = toBaked(layer, baked, point.x, point.y);
                const x = bakedPoint.x - origin.x;
                const y = bakedPoint.y - origin.y;
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            context.closePath();
            context.fill();
            pushHistory();
            placeCrop(layer, origin.x, origin.y, width, height, baked, canvas);
        }
        draft = null;
        syncAll();
    }

    function intersectRect(x, y, w, h, bx, by, bw, bh) {
        const x1 = Math.max(bx, Math.min(x, x + w));
        const y1 = Math.max(by, Math.min(y, y + h));
        const x2 = Math.min(bx + bw, Math.max(x, x + w));
        const y2 = Math.min(by + bh, Math.max(y, y + h));
        return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
    }

    function alphaBounds(canvas) {
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                if (data[(y * canvas.width + x) * 4 + 3] > 8) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < minX) return null;
        return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    function ensureLayer() {
        if (!activeLayer() && state.layers.length === 1) state.activeId = state.layers[0].id;
        const layer = activeLayer();
        if (!layer) {
            toast("请先选择一个图层");
            return null;
        }
        return layer;
    }

    function pointerDown(event) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        view.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size >= 2) {
            drag = null;
            startPinch();
            return;
        }
        if (ignoreUntilEmpty) return;
        const doc = screenToDoc(event.clientX, event.clientY);
        if (state.docResize) {
            const handle = hitDocHandle(event.clientX, event.clientY);
            if (handle) {
                drag = {
                    type: "doc",
                    handle: handle,
                    pushed: false,
                    start: {
                        docW: state.docW,
                        docH: state.docH,
                        layers: state.layers.map(function (layer) { return { x: layer.x, y: layer.y }; })
                    }
                };
            } else {
                drag = { type: "pan", x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
            }
            render();
            return;
        }
        if (state.tool === "select") {
            const layer = hitLayer(doc);
            if (layer) {
                state.activeId = layer.id;
                drag = {
                    type: "move",
                    id: layer.id,
                    startDoc: doc,
                    x: layer.x,
                    y: layer.y,
                    pushed: false
                };
            } else {
                drag = { type: "pan", x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
            }
            syncPanels();
            render();
            return;
        }
        if (state.tool === "stretch") {
            const layer = activeLayer() || hitLayer(doc);
            if (layer) state.activeId = layer.id;
            const current = activeLayer();
            const handle = current ? hitHandle(current, event.clientX, event.clientY) : null;
            if (handle && current) {
                const center = { x: current.x + current.w / 2, y: current.y + current.h / 2 };
                drag = {
                    type: handle === "rotate" ? "rotate" : "resize",
                    handle: handle,
                    id: current.id,
                    start: snapshotLayer(current),
                    pushed: false,
                    angleOffset: Math.atan2(doc.y - center.y, doc.x - center.x) - current.rotation
                };
            } else if (hitLayer(doc)) {
                state.activeId = hitLayer(doc).id;
            } else {
                drag = { type: "pan", x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
            }
            syncPanels();
            render();
            return;
        }
        if (state.tool === "crop-polygon") {
            const layer = ensureLayer();
            if (!layer) return;
            const local = docToLocal(layer, doc.x, doc.y);
            if (local.x < 0 || local.y < 0 || local.x > layer.w || local.y > layer.h) return;
            if (!draft || draft.kind !== "polygon" || draft.layerId !== layer.id) {
                draft = { kind: "polygon", layerId: layer.id, points: [] };
            }
            if (draft.points.length >= 3) {
                const first = localToDoc(layer, draft.points[0].x, draft.points[0].y);
                const screen = docToScreen(first.x, first.y);
                const box = viewSize();
                if (Math.hypot(screen.x - (event.clientX - box.left), screen.y - (event.clientY - box.top)) <= hitRadius()) {
                    applyCrop();
                    return;
                }
            }
            draft.points.push({ x: local.x, y: local.y });
            syncPanels();
            render();
            return;
        }
        const layer = ensureLayer();
        if (!layer) return;
        const local = docToLocal(layer, doc.x, doc.y);
        if (state.tool === "crop-free") {
            if (!draft || draft.kind !== "free" || draft.layerId !== layer.id) {
                const mask = document.createElement("canvas");
                mask.width = Math.max(1, Math.round(layer.w));
                mask.height = Math.max(1, Math.round(layer.h));
                draft = { kind: "free", layerId: layer.id, mask: mask, painted: false, undoStack: [], redoStack: [] };
            }
            draft.undoStack.push(cloneCanvas(draft.mask));
            draft.redoStack = [];
            if (draft.undoStack.length > HISTORY_LIMIT) draft.undoStack.shift();
            paintStroke(layer, local, local, brushMode === "erase");
            drag = { type: "free", id: layer.id, last: local, erase: brushMode === "erase" };
        } else if (state.tool === "crop-rect" || state.tool === "crop-ellipse") {
            draft = null;
            drag = { type: "crop", id: layer.id, x: local.x, y: local.y, kind: state.tool === "crop-ellipse" ? "ellipse" : "rect" };
        }
        syncPanels();
        render();
    }

    function snapshotLayer(layer) {
        return {
            x: layer.x, y: layer.y, w: layer.w, h: layer.h, rotation: layer.rotation
        };
    }

    function pointerMove(event) {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size >= 2) {
            updatePinch();
            return;
        }
        if (!drag) return;
        const doc = screenToDoc(event.clientX, event.clientY);
        if (drag.type === "pan") {
            state.panX = drag.panX + (event.clientX - drag.x);
            state.panY = drag.panY + (event.clientY - drag.y);
            render();
            return;
        }
        if (drag.type === "doc") {
            if (!drag.pushed) {
                pushHistory();
                drag.pushed = true;
            }
            resizeDoc(drag, doc);
            docWInput.value = String(Math.round(state.docW));
            docHInput.value = String(Math.round(state.docH));
            render();
            return;
        }
        const layer = state.layers.find(function (item) { return item.id === drag.id; });
        if (!layer) return;
        if (!drag.pushed && drag.type !== "free" && drag.type !== "crop") {
            pushHistory();
            drag.pushed = true;
        }
        if (drag.type === "move") {
            const rawX = drag.x + (doc.x - drag.startDoc.x);
            const rawY = drag.y + (doc.y - drag.startDoc.y);
            const snapped = snapMove(layer, rawX, rawY);
            layer.x = snapped.x;
            layer.y = snapped.y;
        } else if (drag.type === "rotate") {
            const center = { x: drag.start.x + drag.start.w / 2, y: drag.start.y + drag.start.h / 2 };
            layer.rotation = Math.atan2(doc.y - center.y, doc.x - center.x) - drag.angleOffset;
        } else if (drag.type === "resize") {
            resizeLayer(layer, drag, doc);
        } else if (drag.type === "crop") {
            const local = docToLocal(layer, doc.x, doc.y);
            draft = {
                kind: drag.kind,
                layerId: layer.id,
                x: drag.x,
                y: drag.y,
                w: local.x - drag.x,
                h: local.y - drag.y
            };
        } else if (drag.type === "free") {
            const local = docToLocal(layer, doc.x, doc.y);
            paintStroke(layer, drag.last, local, drag.erase);
            drag.last = { x: local.x, y: local.y };
        }
        render();
        if (drag.type === "crop" || drag.type === "free") syncPanels();
    }

    function resizeLayer(layer, gesture, doc) {
        const start = gesture.start;
        const cx = start.x + start.w / 2;
        const cy = start.y + start.h / 2;
        const cos = Math.cos(-start.rotation);
        const sin = Math.sin(-start.rotation);
        const vx = doc.x - cx;
        const vy = doc.y - cy;
        const local = { x: vx * cos - vy * sin, y: vx * sin + vy * cos };
        let left = -start.w / 2;
        let right = start.w / 2;
        let top = -start.h / 2;
        let bottom = start.h / 2;
        const handle = gesture.handle;
        const keep = document.getElementById("keepRatio").checked;
        const ratio = start.w / Math.max(1, start.h);
        if (keep && handle.length === 2) {
            const anchor = {
                se: { x: -start.w / 2, y: -start.h / 2 },
                nw: { x: start.w / 2, y: start.h / 2 },
                ne: { x: -start.w / 2, y: start.h / 2 },
                sw: { x: start.w / 2, y: -start.h / 2 }
            }[handle];
            const dx = local.x - anchor.x;
            const dy = local.y - anchor.y;
            const sx = dx < 0 ? -1 : 1;
            const sy = dy < 0 ? -1 : 1;
            let aw = Math.abs(dx);
            let ah = Math.abs(dy);
            if (aw / ratio >= ah) ah = aw / ratio;
            else aw = ah * ratio;
            if (aw < MIN_SIZE) {
                aw = MIN_SIZE;
                ah = aw / ratio;
            }
            const x2 = anchor.x + sx * aw;
            const y2 = anchor.y + sy * ah;
            left = Math.min(anchor.x, x2);
            right = Math.max(anchor.x, x2);
            top = Math.min(anchor.y, y2);
            bottom = Math.max(anchor.y, y2);
        } else if (keep && (handle === "e" || handle === "w")) {
            if (handle === "e") right = local.x;
            else left = local.x;
            if (right - left < MIN_SIZE) {
                if (handle === "w") left = right - MIN_SIZE;
                else right = left + MIN_SIZE;
            }
            const newH = (right - left) / ratio;
            top = -newH / 2;
            bottom = newH / 2;
        } else if (keep && (handle === "n" || handle === "s")) {
            if (handle === "s") bottom = local.y;
            else top = local.y;
            if (bottom - top < MIN_SIZE) {
                if (handle === "n") top = bottom - MIN_SIZE;
                else bottom = top + MIN_SIZE;
            }
            const newW = (bottom - top) * ratio;
            left = -newW / 2;
            right = newW / 2;
        } else {
            if (handle.indexOf("e") >= 0) right = local.x;
            if (handle.indexOf("w") >= 0) left = local.x;
            if (handle.indexOf("s") >= 0) bottom = local.y;
            if (handle.indexOf("n") >= 0) top = local.y;
            if (right - left < MIN_SIZE) {
                if (handle.indexOf("w") >= 0 && handle.indexOf("e") < 0) left = right - MIN_SIZE;
                else right = left + MIN_SIZE;
            }
            if (bottom - top < MIN_SIZE) {
                if (handle.indexOf("n") >= 0 && handle.indexOf("s") < 0) top = bottom - MIN_SIZE;
                else bottom = top + MIN_SIZE;
            }
        }
        const newW = right - left;
        const newH = bottom - top;
        const lcx = (left + right) / 2;
        const lcy = (top + bottom) / 2;
        const c = Math.cos(start.rotation);
        const s = Math.sin(start.rotation);
        const ncx = cx + lcx * c - lcy * s;
        const ncy = cy + lcx * s + lcy * c;
        layer.w = newW;
        layer.h = newH;
        layer.x = ncx - newW / 2;
        layer.y = ncy - newH / 2;
        layer.rotation = start.rotation;
    }

    function resizeDoc(gesture, docPoint) {
        const start = gesture.start;
        let left = 0;
        let top = 0;
        let right = start.docW;
        let bottom = start.docH;
        const handle = gesture.handle;
        if (handle.indexOf("e") >= 0) right = docPoint.x;
        if (handle.indexOf("w") >= 0) left = docPoint.x;
        if (handle.indexOf("s") >= 0) bottom = docPoint.y;
        if (handle.indexOf("n") >= 0) top = docPoint.y;
        if (right - left < MIN_SIZE) {
            if (handle.indexOf("w") >= 0 && handle.indexOf("e") < 0) left = right - MIN_SIZE;
            else right = left + MIN_SIZE;
        }
        if (bottom - top < MIN_SIZE) {
            if (handle.indexOf("n") >= 0 && handle.indexOf("s") < 0) top = bottom - MIN_SIZE;
            else bottom = top + MIN_SIZE;
        }
        let newW = right - left;
        let newH = bottom - top;
        let shiftX = -left;
        let shiftY = -top;
        if (newW > MAX_DOC) {
            if (left !== 0) shiftX -= newW - MAX_DOC;
            newW = MAX_DOC;
        }
        if (newH > MAX_DOC) {
            if (top !== 0) shiftY -= newH - MAX_DOC;
            newH = MAX_DOC;
        }
        state.docW = Math.max(1, Math.round(newW));
        state.docH = Math.max(1, Math.round(newH));
        state.layers.forEach(function (layer, index) {
            layer.x = start.layers[index].x + shiftX;
            layer.y = start.layers[index].y + shiftY;
        });
    }

    function paintStroke(layer, from, to, erase) {
        if (!draft || !draft.mask) return;
        const mask = draft.mask;
        const context = mask.getContext("2d");
        const sx = mask.width / layer.w;
        const sy = mask.height / layer.h;
        const width = Math.max(1, (brushSize() / state.zoom) * ((sx + sy) / 2));
        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = width;
        context.strokeStyle = "#000";
        context.fillStyle = "#000";
        context.globalCompositeOperation = erase ? "destination-out" : "source-over";
        context.beginPath();
        context.moveTo(from.x * sx, from.y * sy);
        context.lineTo(to.x * sx, to.y * sy);
        context.stroke();
        context.beginPath();
        context.arc(to.x * sx, to.y * sy, width / 2, 0, Math.PI * 2);
        context.fill();
        context.restore();
        draft.painted = true;
    }

    function pointerUp(event) {
        pointers.delete(event.pointerId);
        if (pointers.size >= 2) {
            startPinch();
            return;
        }
        if (pinch) {
            pinch = null;
            ignoreUntilEmpty = pointers.size > 0;
            drag = null;
            return;
        }
        if (pointers.size === 0) ignoreUntilEmpty = false;
        drag = null;
        guides = null;
        syncPanels();
        render();
    }

    function startPinch() {
        const pts = Array.from(pointers.values());
        if (pts.length < 2) return;
        const box = viewSize();
        const midX = (pts[0].x + pts[1].x) / 2 - box.left;
        const midY = (pts[0].y + pts[1].y) / 2 - box.top;
        pinch = {
            dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
            zoom: state.zoom,
            panX: state.panX,
            panY: state.panY,
            midX: midX,
            midY: midY
        };
    }

    function updatePinch() {
        if (!pinch) startPinch();
        const pts = Array.from(pointers.values());
        if (pts.length < 2 || !pinch) return;
        const box = viewSize();
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const midX = (pts[0].x + pts[1].x) / 2 - box.left;
        const midY = (pts[0].y + pts[1].y) / 2 - box.top;
        const zoom = clamp(pinch.zoom * (dist / pinch.dist), 0.05, 8);
        const docX = (pinch.midX - pinch.panX) / pinch.zoom;
        const docY = (pinch.midY - pinch.panY) / pinch.zoom;
        state.zoom = zoom;
        state.panX = midX - docX * zoom;
        state.panY = midY - docY * zoom;
        render();
    }

    function layerBounds(layer, x, y) {
        const probe = { x: x, y: y, w: layer.w, h: layer.h, rotation: layer.rotation };
        const corners = [[0, 0], [layer.w, 0], [layer.w, layer.h], [0, layer.h]];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        corners.forEach(function (point) {
            const doc = localToDoc(probe, point[0], point[1]);
            minX = Math.min(minX, doc.x);
            minY = Math.min(minY, doc.y);
            maxX = Math.max(maxX, doc.x);
            maxY = Math.max(maxY, doc.y);
        });
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    function snapMove(layer, x, y) {
        const threshold = 8 / state.zoom;
        const box = layerBounds(layer, x, y);
        const guidesX = [0, state.docW / 2, state.docW];
        const guidesY = [0, state.docH / 2, state.docH];
        state.layers.forEach(function (other) {
            if (!other.visible || other.id === layer.id) return;
            const bounds = layerBounds(other, other.x, other.y);
            guidesX.push(bounds.minX, (bounds.minX + bounds.maxX) / 2, bounds.maxX);
            guidesY.push(bounds.minY, (bounds.minY + bounds.maxY) / 2, bounds.maxY);
        });
        const xs = [box.minX, (box.minX + box.maxX) / 2, box.maxX];
        const ys = [box.minY, (box.minY + box.maxY) / 2, box.maxY];
        let bestX = Infinity;
        let dx = 0;
        let guideX = null;
        xs.forEach(function (edge) {
            guidesX.forEach(function (guide) {
                const delta = guide - edge;
                if (Math.abs(delta) < Math.abs(bestX)) {
                    bestX = delta;
                    dx = delta;
                    guideX = guide;
                }
            });
        });
        if (Math.abs(bestX) > threshold) {
            dx = 0;
            guideX = null;
        }
        let bestY = Infinity;
        let dy = 0;
        let guideY = null;
        ys.forEach(function (edge) {
            guidesY.forEach(function (guide) {
                const delta = guide - edge;
                if (Math.abs(delta) < Math.abs(bestY)) {
                    bestY = delta;
                    dy = delta;
                    guideY = guide;
                }
            });
        });
        if (Math.abs(bestY) > threshold) {
            dy = 0;
            guideY = null;
        }
        guides = {
            x: guideX === null ? [] : [guideX],
            y: guideY === null ? [] : [guideY]
        };
        return { x: x + dx, y: y + dy };
    }

    function duplicateLayer(id) {
        const index = state.layers.findIndex(function (layer) { return layer.id === id; });
        if (index < 0) return;
        const layer = state.layers[index];
        pushHistory();
        const copy = {
            id: "L" + (++seq),
            name: (layer.name + " 副本").slice(0, 18),
            bitmap: layer.bitmap,
            x: layer.x + 16,
            y: layer.y + 16,
            w: layer.w,
            h: layer.h,
            rotation: layer.rotation,
            opacity: layer.opacity,
            blend: layer.blend,
            visible: true,
            flipH: layer.flipH,
            flipV: layer.flipV
        };
        state.layers.splice(index + 1, 0, copy);
        state.activeId = copy.id;
        syncAll();
    }

    function addRotation(delta) {
        const layer = activeLayer();
        if (!layer) return;
        pushHistory();
        layer.rotation += delta;
        syncAll();
    }

    function syncPanels() {
        hint.hidden = state.layers.length > 0;
        const layer = activeLayer();
        const hasLayer = !!layer;
        opacityInput.disabled = !hasLayer;
        blendInput.disabled = !hasLayer;
        flipHBtn.disabled = !hasLayer;
        flipVBtn.disabled = !hasLayer;
        document.getElementById("rotateLeft").disabled = !hasLayer;
        document.getElementById("rotateRight").disabled = !hasLayer;
        document.getElementById("angleInput").disabled = !hasLayer;
        document.getElementById("exportLayer").disabled = !hasLayer;
        if (hasLayer && document.activeElement !== document.getElementById("angleInput")) {
            document.getElementById("angleInput").value = String(Math.round(layer.rotation * 180 / Math.PI));
        }
        if (hasLayer && document.activeElement !== opacityInput) {
            opacityInput.value = String(Math.round(layer.opacity * 100));
        }
        if (hasLayer) blendInput.value = layer.blend;
        docWInput.value = String(Math.round(state.docW));
        docHInput.value = String(Math.round(state.docH));
        bgTransparentInput.checked = state.bg === "transparent";
        if (state.bg !== "transparent") bgColorInput.value = state.bg;
        const showCrop = !!(draft && (
            ((draft.kind === "rect" || draft.kind === "ellipse") && Math.abs(draft.w) > 1 && Math.abs(draft.h) > 1) ||
            (draft.kind === "polygon" && draft.points && draft.points.length >= 1) ||
            (draft.kind === "free" && draft.painted)
        ));
        cropActions.hidden = !showCrop;
        document.getElementById("keepRatioWrap").hidden = state.tool !== "stretch";
        document.getElementById("brushTools").hidden = state.tool !== "crop-free";
        document.getElementById("docResizeBtn").classList.toggle("active", state.docResize);
        document.getElementById("brushPaint").classList.toggle("active", brushMode === "paint");
        document.getElementById("brushErase").classList.toggle("active", brushMode === "erase");
        const hints = {
            select: "点选图层后拖动，靠近边缘或中线时会吸附。空白处拖动画布。",
            stretch: "拖动手柄改变宽高，圆点旋转。勾选保持比例后按原比例缩放。",
            "crop-rect": "在当前图层上拖出矩形，确认后保留内部。",
            "crop-ellipse": "拖出椭圆，确认后保留椭圆内部。",
            "crop-polygon": "逐点点击，靠近起点或点完成闭合。",
            "crop-free": "涂抹保留区域，擦除取消已选部分。撤销可逐步去掉每一笔。"
        };
        toolHint.textContent = state.docResize
            ? "拖动画布边缘或四角改变尺寸。再次点击「调整画布」退出。"
            : (hints[state.tool] || "");
        document.querySelectorAll(".tool").forEach(function (button) {
            button.classList.toggle("active", button.dataset.tool === state.tool);
        });
        view.style.cursor = state.docResize || state.tool === "select" || state.tool === "stretch" ? "default" : "crosshair";
        renderLayerList();
        syncHistoryButtons();
    }

    function renderLayerList() {
        layerList.innerHTML = "";
        layersEmpty.hidden = state.layers.length > 0;
        for (let i = state.layers.length - 1; i >= 0; i--) {
            const layer = state.layers[i];
            const item = document.createElement("li");
            item.className = "layer-item" + (layer.id === state.activeId ? " active" : "");
            const thumb = document.createElement("img");
            thumb.className = "thumb";
            thumb.alt = "";
            thumb.src = thumbURL(layer);
            const name = document.createElement("button");
            name.type = "button";
            name.className = "btn layer-name";
            name.textContent = layer.name;
            name.addEventListener("click", function () {
                state.activeId = layer.id;
                if (draft && draft.layerId !== layer.id) draft = null;
                syncAll();
            });
            item.appendChild(thumb);
            item.appendChild(name);
            item.appendChild(iconButton("复制", function () { duplicateLayer(layer.id); }));
            item.appendChild(iconButton(layer.visible ? "隐藏" : "显示", function () {
                pushHistory();
                layer.visible = !layer.visible;
                syncAll();
            }));
            item.appendChild(iconButton("上", function () { moveLayer(layer.id, 1); }, i === state.layers.length - 1));
            item.appendChild(iconButton("下", function () { moveLayer(layer.id, -1); }, i === 0));
            item.appendChild(iconButton("删除", function () { deleteLayer(layer.id); }));
            layerList.appendChild(item);
        }
    }

    function thumbURL(layer) {
        if (layer.thumbURL && layer.thumbBitmap === layer.bitmap) return layer.thumbURL;
        const size = 36;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        const scale = Math.min(size / layer.bitmap.width, size / layer.bitmap.height);
        const width = layer.bitmap.width * scale;
        const height = layer.bitmap.height * scale;
        context.drawImage(layer.bitmap, (size - width) / 2, (size - height) / 2, width, height);
        layer.thumbURL = canvas.toDataURL("image/png");
        layer.thumbBitmap = layer.bitmap;
        return layer.thumbURL;
    }

    function iconButton(label, onClick, disabled) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn icon-btn";
        button.textContent = label;
        button.disabled = !!disabled;
        button.addEventListener("click", onClick);
        return button;
    }

    function syncAll() {
        syncPanels();
        render();
    }

    function setTool(tool) {
        state.tool = tool;
        draft = null;
        drag = null;
        syncAll();
    }

    function openLayers(open) {
        layersPanel.classList.toggle("open", open);
        layersBackdrop.hidden = !open;
    }

    $("uploadBtn").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
        addFiles(fileInput.files);
        fileInput.value = "";
    });
    undoBtn.addEventListener("click", undo);
    redoBtn.addEventListener("click", redo);
    $("exportPng").addEventListener("click", function () { download("image/png", "图片.png"); });
    $("exportJpg").addEventListener("click", function () { download("image/jpeg", "图片.jpg"); });
    $("exportLayer").addEventListener("click", exportActiveLayer);
    $("cropApply").addEventListener("click", applyCrop);
    $("cropCancel").addEventListener("click", function () {
        draft = null;
        syncAll();
    });
    $("arrangeH").addEventListener("click", function () { arrange("h"); });
    $("arrangeV").addEventListener("click", function () { arrange("v"); });
    $("fitBtn").addEventListener("click", fitView);
    $("docResizeBtn").addEventListener("click", function () {
        state.docResize = !state.docResize;
        drag = null;
        syncAll();
    });
    $("brushPaint").addEventListener("click", function () {
        brushMode = "paint";
        syncPanels();
        render();
    });
    $("brushErase").addEventListener("click", function () {
        brushMode = "erase";
        syncPanels();
        render();
    });
    $("brushSize").addEventListener("input", function () { render(); });
    $("layersToggle").addEventListener("click", function () { openLayers(true); });
    $("layersClose").addEventListener("click", function () { openLayers(false); });
    layersBackdrop.addEventListener("click", function () { openLayers(false); });

    document.querySelectorAll(".tool").forEach(function (button) {
        button.addEventListener("click", function () { setTool(button.dataset.tool); });
    });

    opacityInput.addEventListener("pointerdown", function () { opacityArmed = false; });
    opacityInput.addEventListener("input", function () {
        const layer = activeLayer();
        if (!layer) return;
        if (!opacityArmed) {
            pushHistory();
            opacityArmed = true;
        }
        layer.opacity = Number(opacityInput.value) / 100;
        render();
    });
    blendInput.addEventListener("change", function () {
        const layer = activeLayer();
        if (!layer) return;
        pushHistory();
        layer.blend = blendInput.value;
        render();
    });
    flipHBtn.addEventListener("click", function () {
        const layer = activeLayer();
        if (!layer) return;
        pushHistory();
        layer.flipH = !layer.flipH;
        render();
    });
    flipVBtn.addEventListener("click", function () {
        const layer = activeLayer();
        if (!layer) return;
        pushHistory();
        layer.flipV = !layer.flipV;
        render();
    });
    $("rotateLeft").addEventListener("click", function () { addRotation(-Math.PI / 2); });
    $("rotateRight").addEventListener("click", function () { addRotation(Math.PI / 2); });
    $("angleInput").addEventListener("change", function () {
        const layer = activeLayer();
        const degrees = Number(document.getElementById("angleInput").value);
        if (!layer || !isFinite(degrees)) return;
        pushHistory();
        layer.rotation = degrees * Math.PI / 180;
        syncAll();
    });

    function commitDocSize() {
        const width = clamp(Math.round(Number(docWInput.value) || state.docW), 1, MAX_DOC);
        const height = clamp(Math.round(Number(docHInput.value) || state.docH), 1, MAX_DOC);
        if (width === Math.round(state.docW) && height === Math.round(state.docH)) {
            syncPanels();
            return;
        }
        pushHistory();
        state.docW = width;
        state.docH = height;
        syncAll();
    }
    docWInput.addEventListener("change", commitDocSize);
    docHInput.addEventListener("change", commitDocSize);
    bgTransparentInput.addEventListener("change", function () {
        pushHistory();
        state.bg = bgTransparentInput.checked ? "transparent" : bgColorInput.value;
        syncAll();
    });
    bgColorInput.addEventListener("pointerdown", function () { bgArmed = false; });
    bgColorInput.addEventListener("input", function () {
        if (!bgArmed) {
            pushHistory();
            bgArmed = true;
            bgTransparentInput.checked = false;
        }
        state.bg = bgColorInput.value;
        render();
    });

    view.addEventListener("pointerdown", pointerDown);
    view.addEventListener("pointermove", pointerMove);
    view.addEventListener("pointermove", function (event) {
        if (state.tool !== "crop-free" || state.docResize) {
            if (hover) {
                hover = null;
                if (!drag) render();
            }
            return;
        }
        hover = { x: event.clientX, y: event.clientY };
        if (!drag) render();
    });
    view.addEventListener("pointerup", pointerUp);
    view.addEventListener("pointercancel", pointerUp);
    view.addEventListener("wheel", function (event) {
        event.preventDefault();
        const box = viewSize();
        const px = event.clientX - box.left;
        const py = event.clientY - box.top;
        const doc = screenToDoc(event.clientX, event.clientY);
        const zoom = clamp(state.zoom * (event.deltaY < 0 ? 1.1 : 0.9), 0.05, 8);
        state.zoom = zoom;
        state.panX = px - doc.x * zoom;
        state.panY = py - doc.y * zoom;
        render();
    }, { passive: false });
    view.addEventListener("contextmenu", function (event) { event.preventDefault(); });

    document.addEventListener("dragover", function (event) { event.preventDefault(); });
    document.addEventListener("drop", function (event) {
        event.preventDefault();
        if (event.dataTransfer && event.dataTransfer.files) addFiles(event.dataTransfer.files);
    });
    document.addEventListener("keydown", function (event) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
            event.preventDefault();
            redo();
        }
    });

    window.addEventListener("resize", resizeView);
    if (window.ResizeObserver) new ResizeObserver(resizeView).observe(stage);

    syncAll();
    requestAnimationFrame(fitView);
})();
