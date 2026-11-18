/* ========================================================
   Flutter Wave Generator — Logic
   Clean rewrite: zero bugs, point inspector, dimension scaling
   ======================================================== */

// ── DOM References ──────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const canvas       = $('#wave-canvas');
const layersContainer = $('#layers-container');
const helperLines  = $('#helper-lines');
const pointsG      = $('#points-container');
const codeOutput   = $('#code-output');
const copyBtn      = $('#copy-btn');
const flipBtn      = $('#flip-btn');
const addBtn       = $('#add-wave-btn');
const removeBtn    = $('#remove-wave-btn');
const smoothBtn    = $('#smooth-btn');
const fillToggle   = $('#fill-toggle');
const modeLabel    = $('#mode-label');
const strokeGroup  = $('#stroke-group');
const strokeInput  = $('#stroke-width-input');
const fillEdgeGroup = $('#fill-edge-group');
const fillEdgeSelect = $('#fill-edge-select');
const cornerLegend = $('#corner-legend');
const widthSlider  = $('#width-slider');
const heightSlider = $('#height-slider');

const layerSelect  = $('#layer-select');
const addLayerBtn  = $('#add-layer-btn');
const removeLayerBtn = $('#remove-layer-btn');

// Inspector
const inspector    = $('#point-inspector');
const inspTitle    = $('#inspector-title');
const inspClose    = $('#inspector-close');
const inspX        = $('#inspector-x');
const inspY        = $('#inspector-y');
const inspControls = $('#inspector-controls');
const inspDelete   = $('#inspector-delete');

// ── State ───────────────────────────────────────────────────
let layers = [];
let activeLayerIndex = 0;

let isFilled    = true;
let currentEdge = 'bottom';
let strokeWidth = 3;
let lastWidth   = 100;
let lastHeight  = 100;
let svgW        = 0;
let svgH        = 0;
let dragging    = null;  // index of point being dragged
let selected    = null;  // index of point selected for inspector
let isTypingCode = false;

let points = [];
let corners = [];

function createDefaultLayer() {
    return {
        isFilled: true,
        currentEdge: 'bottom',
        strokeWidth: 3,
        lastWidth: 100,
        lastHeight: 100,
        points: [
            { type: 'start',   x: 0.00, y: 0.50 },
            { type: 'control', x: 0.25, y: 0.70 },
            { type: 'anchor',  x: 0.50, y: 0.55 },
            { type: 'control', x: 0.75, y: 0.40 },
            { type: 'anchor',  x: 1.00, y: 0.55 },
        ],
        corners: [
            { type: 'corner', x: 1.00, y: 1.00 }, // Bottom Right
            { type: 'corner', x: 0.00, y: 1.00 }, // Bottom Left
        ]
    };
}

function saveCurrentLayer() {
    layers[activeLayerIndex] = {
        isFilled,
        currentEdge,
        strokeWidth,
        lastWidth,
        lastHeight,
        points: JSON.parse(JSON.stringify(points)),
        corners: JSON.parse(JSON.stringify(corners))
    };
}

function loadLayer(idx) {
    activeLayerIndex = idx;
    const l = layers[idx];
    isFilled = l.isFilled;
    currentEdge = l.currentEdge;
    strokeWidth = l.strokeWidth;
    lastWidth = l.lastWidth;
    lastHeight = l.lastHeight;
    points = JSON.parse(JSON.stringify(l.points));
    corners = JSON.parse(JSON.stringify(l.corners));
    
    fillToggle.checked = isFilled;
    modeLabel.textContent = isFilled ? 'Fill' : 'Line';
    strokeGroup.style.display = isFilled ? 'none' : 'flex';
    fillEdgeGroup.style.display = isFilled ? 'flex' : 'none';
    cornerLegend.style.display = isFilled ? 'flex' : 'none';
    strokeInput.value = strokeWidth;
    fillEdgeSelect.value = currentEdge;
    widthSlider.value = lastWidth;
    heightSlider.value = lastHeight;
    
    selected = null;
    selectPoint(null);
}

layers.push(createDefaultLayer());
loadLayer(0);

function updateLayerSelect() {
    layerSelect.innerHTML = '';
    layers.forEach((_, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `Wave ${i + 1}`;
        layerSelect.appendChild(opt);
    });
    layerSelect.value = activeLayerIndex;
    removeLayerBtn.disabled = layers.length <= 1;
}
updateLayerSelect();

layerSelect.addEventListener('change', e => {
    saveCurrentLayer();
    loadLayer(parseInt(e.target.value, 10));
    render();
});

addLayerBtn.addEventListener('click', () => {
    saveCurrentLayer();
    // Offset the new layer slightly for visibility
    const newL = createDefaultLayer();
    newL.points.forEach(p => { p.y -= 0.1; });
    layers.push(newL);
    loadLayer(layers.length - 1);
    updateLayerSelect();
    render();
});

removeLayerBtn.addEventListener('click', () => {
    if (layers.length <= 1) return;
    layers.splice(activeLayerIndex, 1);
    const newIdx = Math.max(0, activeLayerIndex - 1);
    loadLayer(newIdx);
    updateLayerSelect();
    render();
});

// ── SVG size tracking ───────────────────────────────────────
const ro = new ResizeObserver(entries => {
    for (const e of entries) {
        svgW = e.contentRect.width;
        svgH = e.contentRect.height;
        render();
    }
});
ro.observe(canvas);

// ── Render ──────────────────────────────────────────────────
function render() {
    if (svgW === 0 || svgH === 0) return;
    saveCurrentLayer();
    drawSVG();
    if (!isTypingCode) {
        generateCode();
    }
    updateInspector();
}

function drawSVG() {
    layersContainer.innerHTML = '';
    
    layers.forEach((l, idx) => {
        let d = `M${l.points[0].x * svgW},${l.points[0].y * svgH} `;
        let curveD = d;
        for (let i = 1; i < l.points.length; i += 2) {
            const c = l.points[i], a = l.points[i + 1];
            const seg = `Q${c.x * svgW},${c.y * svgH} ${a.x * svgW},${a.y * svgH} `;
            d += seg;
            curveD += seg;
        }
        
        let pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        if (l.isFilled) {
            for (let i = 0; i < l.corners.length; i++) {
                if (l.corners[i].type === 'corner') {
                    d += `L${l.corners[i].x * svgW},${l.corners[i].y * svgH} `;
                } else if (l.corners[i].type === 'control') {
                    const ctrl = l.corners[i];
                    let anch = (i + 1 < l.corners.length) ? l.corners[i+1] : l.points[0];
                    if (i + 1 < l.corners.length) i++;
                    d += `Q${ctrl.x * svgW},${ctrl.y * svgH} ${anch.x * svgW},${anch.y * svgH} `;
                }
            }
            d += `Z`;
            pathEl.setAttribute('fill', `url(#wave-gradient-${idx % 4})`);
        } else {
            pathEl.setAttribute('fill', 'none');
            pathEl.setAttribute('stroke', `url(#wave-gradient-${idx % 4})`);
            pathEl.setAttribute('stroke-width', l.strokeWidth);
            pathEl.setAttribute('stroke-linecap', 'round');
        }
        pathEl.setAttribute('d', d);
        
        if (idx !== activeLayerIndex) {
            pathEl.setAttribute('opacity', '0.4');
        }
        layersContainer.appendChild(pathEl);
        
        let strokeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        strokeEl.setAttribute('fill', 'none');
        strokeEl.setAttribute('stroke', 'rgba(255,255,255,0.01)');
        strokeEl.setAttribute('stroke-width', '20');
        strokeEl.setAttribute('pointer-events', 'stroke');
        strokeEl.style.cursor = 'crosshair';
        strokeEl.setAttribute('d', curveD);
        
        const dragStart = (e) => {
            if (activeLayerIndex !== idx) {
                saveCurrentLayer();
                loadLayer(idx);
                layerSelect.value = idx;
                render();
            }
            startDragAll(e);
        };
        const touchDragStart = (e) => {
            if (activeLayerIndex !== idx) {
                saveCurrentLayer();
                loadLayer(idx);
                layerSelect.value = idx;
                render();
            }
            startDragAllTouch(e);
        };
        
        pathEl.addEventListener('mousedown', dragStart);
        pathEl.addEventListener('touchstart', touchDragStart, { passive: false });
        strokeEl.addEventListener('mousedown', dragStart);
        strokeEl.addEventListener('touchstart', touchDragStart, { passive: false });
        
        layersContainer.appendChild(strokeEl);
    });

    let hd = `M${px(points[0])} `;
    for (let i = 1; i < points.length; i++) {
        hd += `L${px(points[i])} `;
    }
    if (isFilled) {
        for (let i = 0; i < corners.length; i++) {
            hd += `L${px(corners[i])} `;
        }
        hd += `Z`;
    }
    helperLines.setAttribute('d', hd);

    let allPoints = isFilled ? [...points, ...corners] : points;

    if (pointsG.children.length !== allPoints.length) {
        pointsG.innerHTML = '';
        allPoints.forEach((p, i) => {
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            el.setAttribute('r', 8);
            
            el.addEventListener('mousedown',  e => { startDrag(i); e.stopPropagation(); });
            let pointLastTap = 0;
            el.addEventListener('touchstart', e => { 
                const now = Date.now();
                if (now - pointLastTap < 300) {
                    if (allPoints[i].type === 'corner') {
                        e.preventDefault();
                        const cIdx = i - points.length;
                        corners.splice(cIdx, 1);
                        if (selected === i) selectPoint(null);
                        render();
                        return;
                    }
                }
                pointLastTap = now;
                startDrag(i); 
                e.stopPropagation(); 
            }, { passive: false });
            
            el.addEventListener('contextmenu', e => {
                e.preventDefault();
                if (allPoints[i].type === 'corner') {
                    const cIdx = i - points.length;
                    corners.splice(cIdx, 1);
                    if (selected === i) selectPoint(null);
                    render();
                }
            });

            pointsG.appendChild(el);
        });
    }

    allPoints.forEach((p, i) => {
        const el = pointsG.children[i];
        el.setAttribute('cx', p.x * svgW);
        el.setAttribute('cy', p.y * svgH);
        
        let cls = 'point ';
        if (p.type === 'control') cls += 'control-point';
        else if (p.type === 'corner') cls += 'corner-point';
        else cls += 'anchor-point';
        
        if (i === selected) cls += ' selected';
        el.setAttribute('class', cls);
    });
}

function px(p) { return `${p.x * svgW},${p.y * svgH}`; }

// ── Drag logic ──────────────────────────────────────────────
let draggingAllStart = null;

function startDrag(idx) {
    dragging = idx;
    selectPoint(idx);
}

let longPressTimer = null;

function getStraightEdges() {
    let segments = [];
    let prev = points[points.length - 1];
    
    for (let i = 0; i < corners.length; i++) {
        if (corners[i].type === 'corner') {
            if (i === 0 || corners[i-1].type === 'corner') {
                segments.push({ p1: prev, p2: corners[i], insertIdx: i });
            }
            prev = corners[i];
        } else if (corners[i].type === 'control') {
            if (i + 1 < corners.length) {
                prev = corners[i+1];
                i++; 
            } else {
                prev = points[0];
            }
        }
    }
    
    if (corners.length === 0 || corners[corners.length - 1].type === 'corner') {
        segments.push({ p1: prev, p2: points[0], insertIdx: corners.length });
    }
    return segments;
}

function checkLongPress(cx, cy) {
    longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!isFilled) return;
        
        const edges = getStraightEdges();
        let bestEdgeDist = Infinity;
        let edgeInsertIdx = -1;
        
        edges.forEach(edge => {
            let d = distToSegment(cx, cy, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
            if (d < bestEdgeDist) { bestEdgeDist = d; edgeInsertIdx = edge.insertIdx; }
        });
        
        if (bestEdgeDist < 0.05) {
            corners.splice(edgeInsertIdx, 0, { type: 'control', x: cx, y: cy });
            draggingAllStart = null; // stop drag
            selectPoint(points.length + edgeInsertIdx);
            render();
        }
    }, 400); // 400ms hold
}

function startDragAll(e) {
    draggingAllStart = { x: e.clientX, y: e.clientY };
    selectPoint(null);
    e.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    checkLongPress((e.clientX - rect.left) / svgW, (e.clientY - rect.top) / svgH);
}

function startDragAllTouch(e) {
    draggingAllStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    selectPoint(null);
    e.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    checkLongPress((e.touches[0].clientX - rect.left) / svgW, (e.touches[0].clientY - rect.top) / svgH);
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x1 - x2)**2 + (y1 - y2)**2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1)*(x2 - x1) + (py - y1)*(y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.hypot(px - projX, py - projY);
}

function handleAddPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left) / svgW;
    const cy = (clientY - rect.top) / svgH;
    
    let bestDist = Infinity;
    let bestInsertIdx = -1;
    let bestT = 0;

    for (let i = 0; i < points.length - 1; i += 2) {
        const p0 = points[i];
        const p1 = points[i+1];
        const p2 = points[i+2];
        
        for(let t = 0; t <= 1; t += 0.05) {
            const x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x;
            const y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y;
            const dist = Math.hypot(cx - x, cy - y);
            if (dist < bestDist) {
                bestDist = dist;
                bestInsertIdx = i;
                bestT = t;
            }
        }
    }
    
    let bestEdgeDist = Infinity;
    let edgeInsertIdx = -1;
    
    if (isFilled) {
        const edges = getStraightEdges();
        edges.forEach(edge => {
            let d = distToSegment(cx, cy, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
            if (d < bestEdgeDist) { bestEdgeDist = d; edgeInsertIdx = edge.insertIdx; }
        });
    }

    if (bestDist < 0.05 && bestDist <= bestEdgeDist) {
        const t = Math.max(0.05, Math.min(0.95, bestT)); 
        const p0 = points[bestInsertIdx];
        const p1 = points[bestInsertIdx + 1];
        const p2 = points[bestInsertIdx + 2];
        
        const q1x = (1-t)*p0.x + t*p1.x;
        const q1y = (1-t)*p0.y + t*p1.y;

        const q2x = (1-t)*p1.x + t*p2.x;
        const q2y = (1-t)*p1.y + t*p2.y;

        const mx = (1-t)*q1x + t*q2x;
        const my = (1-t)*q1y + t*q2y;

        const q1 = { type: 'control', x: q1x, y: q1y };
        const m  = { type: 'anchor',  x: mx, y: my };
        const q2 = { type: 'control', x: q2x, y: q2y };

        points.splice(bestInsertIdx + 1, 1, q1, m, q2);
        render();
        return;
    }
    
    if (isFilled && bestEdgeDist < 0.05) {
        corners.splice(edgeInsertIdx, 0, { type: 'corner', x: cx, y: cy });
        selectPoint(points.length + edgeInsertIdx);
        render();
        return;
    }
}

$('svg').addEventListener('dblclick', e => {
    handleAddPoint(e.clientX, e.clientY);
});

let lastTapTime = 0;
$('svg').addEventListener('touchstart', e => {
    const now = Date.now();
    if (now - lastTapTime < 300) {
        lastTapTime = 0;
        handleAddPoint(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    } else {
        lastTapTime = now;
    }
}, { passive: false });

function onMove(clientX, clientY) {
    if (draggingAllStart) {
        let dx = (clientX - draggingAllStart.x) / svgW;
        let dy = (clientY - draggingAllStart.y) / svgH;
        
        if (Math.hypot(dx, dy) > 0.005 && longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        let allPoints = isFilled ? [...points, ...corners] : points;
        
        let minX = Math.min(...allPoints.map(p => p.x));
        let maxX = Math.max(...allPoints.map(p => p.x));
        let minY = Math.min(...allPoints.map(p => p.y));
        let maxY = Math.max(...allPoints.map(p => p.y));

        if (minX + dx < 0) dx = -minX;
        if (maxX + dx > 1) dx = 1 - maxX;
        if (minY + dy < 0) dy = -minY;
        if (maxY + dy > 1) dy = 1 - maxY;
        
        allPoints.forEach(p => { p.x += dx; p.y += dy; });
        
        draggingAllStart = { x: clientX, y: clientY };
        render();
        return;
    }

    if (dragging === null) return;
    const r = canvas.getBoundingClientRect();
    let nx = Math.max(0, Math.min((clientX - r.left) / svgW, 1));
    let ny = Math.max(0, Math.min((clientY - r.top)  / svgH, 1));

    if (dragging < points.length) {
        points[dragging].x = nx;
        points[dragging].y = ny;
    } else {
        const cIdx = dragging - points.length;
        corners[cIdx].x = nx;
        corners[cIdx].y = ny;
    }
    render();
}

function endDrag() { 
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    dragging = null; 
    draggingAllStart = null;
}

window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchmove', e => {
    if (dragging !== null || draggingAllStart) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }
}, { passive: false });
window.addEventListener('touchend', endDrag);

canvas.addEventListener('mousedown', () => selectPoint(null));

// ── Point Inspector ─────────────────────────────────────────
function selectPoint(idx) {
    selected = idx;
    if (idx === null) {
        inspector.classList.add('no-selection');
        inspControls.style.display = 'none';
        inspTitle.textContent = 'Tap a point to edit';
    } else {
        inspector.classList.remove('no-selection');
        inspControls.style.display = 'flex';
        updateInspector();
    }
}

function updateInspector() {
    let allPoints = isFilled ? [...points, ...corners] : points;
    if (selected === null || selected >= allPoints.length) return;
    
    const p = allPoints[selected];
    let label = '';
    let displayIdx = selected;
    let canDelete = false;
    let deleteLabel = '';
    
    if (p.type === 'corner') {
        label = 'Corner Point';
        displayIdx = selected - points.length + 1;
        canDelete = true;
        deleteLabel = 'Delete Corner';
    } else if (p.type === 'control') {
        label = 'Control Point';
        if (selected >= points.length) {
            canDelete = true;
            deleteLabel = 'Delete Control';
        } else {
            canDelete = points.length > 3;
            deleteLabel = 'Delete Control';
        }
    } else if (p.type === 'start') {
        label = 'Start Point';
        canDelete = false;
    } else {
        label = 'Anchor Point';
        canDelete = points.length > 3;
        deleteLabel = 'Delete Anchor';
    }

    inspTitle.textContent = `${label}  #${displayIdx}`;
    inspX.value = Math.round(p.x * 100);
    inspY.value = Math.round(p.y * 100);
    
    if (canDelete) {
        inspDelete.style.display = '';
        inspDelete.textContent = '🗑 ' + deleteLabel;
    } else {
        inspDelete.style.display = 'none';
    }
}

inspX.addEventListener('input', () => {
    if (selected === null) return;
    let v = parseInt(inspX.value, 10);
    if (isNaN(v)) return;
    v = Math.max(0, Math.min(v, 100));
    
    if (selected < points.length) {
        points[selected].x = v / 100;
    } else {
        corners[selected - points.length].x = v / 100;
    }
    render();
});

inspY.addEventListener('input', () => {
    if (selected === null) return;
    let v = parseInt(inspY.value, 10);
    if (isNaN(v)) return;
    v = Math.max(0, Math.min(v, 100));
    
    if (selected < points.length) {
        points[selected].y = v / 100;
    } else {
        corners[selected - points.length].y = v / 100;
    }
    render();
});

inspDelete.addEventListener('click', () => {
    if (selected === null) return;
    let allPoints = isFilled ? [...points, ...corners] : points;
    if (selected >= allPoints.length) return;
    
    const p = allPoints[selected];
    
    if (selected >= points.length) {
        const cIdx = selected - points.length;
        corners.splice(cIdx, 1);
    } else if (p.type === 'control') {
        if (points.length <= 3) return;
        points.splice(selected, 2);
        const lastAnch = points[points.length - 1];
        if (lastAnch.x !== 0) {
            const scale = 1.0 / lastAnch.x;
            points.forEach(pt => { pt.x *= scale; });
        }
        points[points.length - 1].x = 1.0;
    } else if (p.type === 'anchor') {
        if (points.length <= 3) return;
        points.splice(selected - 1, 2);
        const lastAnch = points[points.length - 1];
        if (lastAnch.x !== 0) {
            const scale = 1.0 / lastAnch.x;
            points.forEach(pt => { pt.x *= scale; });
        }
        points[points.length - 1].x = 1.0;
    }
    
    selectPoint(null);
    render();
});

inspClose.addEventListener('click', () => selectPoint(null));

// ── Code Generation ─────────────────────────────────────────
function fmt(v) {
    const s = v.toFixed(2);
    return parseFloat(s).toString();
}

function fmtX(nx) {
    if (nx <= 0) return '0';
    if (nx >= 0.995) return 'size.width';
    return `size.width * ${fmt(nx)}`;
}

function fmtY(ny) {
    if (ny <= 0) return '0';
    if (ny >= 0.995) return 'size.height';
    return `size.height * ${fmt(ny)}`;
}

function generateCode() {
    let c = '';

    let allFilled = layers.every(l => l.isFilled);
    
    if (allFilled && layers.length > 1) {
        c += `Path getClip(Size size) {\n`;
        c += `  Path finalPath = Path();\n\n`;
    } else if (allFilled && layers.length === 1) {
        c += `Path getClip(Size size) {\n`;
    } else {
        c += `void paintWave(Canvas canvas, Size size) {\n\n`;
    }

    layers.forEach((l, idx) => {
        if (layers.length > 1) c += `  // --- Wave ${idx + 1} ---\n`;
        
        const pathVar = (allFilled && layers.length === 1) ? 'path' : `path${idx}`;
        
        c += `  Path ${pathVar} = Path();\n`;
        c += `  ${pathVar}.moveTo(${fmtX(l.points[0].x)}, ${fmtY(l.points[0].y)});\n\n`;

        let w = 1;
        for (let i = 1; i < l.points.length; i += 2) {
            const ctrl = l.points[i], anch = l.points[i + 1];
            c += `  ${pathVar}.quadraticBezierTo(\n`;
            c += `    ${fmtX(ctrl.x)},\n`;
            c += `    ${fmtY(ctrl.y)},\n`;
            c += `    ${fmtX(anch.x)},\n`;
            c += `    ${fmtY(anch.y)},\n`;
            c += `  );\n`;
            w++;
        }
        c += `\n`;

        if (l.isFilled) {
            for (let i = 0; i < l.corners.length; i++) {
                if (l.corners[i].type === 'corner') {
                    c += `  ${pathVar}.lineTo(${fmtX(l.corners[i].x)}, ${fmtY(l.corners[i].y)});\n`;
                } else if (l.corners[i].type === 'control') {
                    const ctrl = l.corners[i];
                    let anch = (i + 1 < l.corners.length) ? l.corners[i+1] : l.points[0];
                    if (i + 1 < l.corners.length) i++;
                    c += `  ${pathVar}.quadraticBezierTo(\n`;
                    c += `    ${fmtX(ctrl.x)},\n`;
                    c += `    ${fmtY(ctrl.y)},\n`;
                    c += `    ${fmtX(anch.x)},\n`;
                    c += `    ${fmtY(anch.y)},\n`;
                    c += `  );\n`;
                }
            }
            c += `  ${pathVar}.close();\n\n`;
        }
        
        if (allFilled && layers.length > 1) {
            c += `  finalPath.addPath(${pathVar}, Offset.zero);\n\n`;
        } else if (!allFilled) {
            c += `  final paint${idx} = Paint()\n`;
            if (l.isFilled) {
                c += `    ..color = Colors.blue.withOpacity(0.5)\n`;
                c += `    ..style = PaintingStyle.fill;\n\n`;
            } else {
                c += `    ..color = Colors.blue\n`;
                c += `    ..style = PaintingStyle.stroke\n`;
                c += `    ..strokeWidth = ${l.strokeWidth}.0;\n\n`;
            }
            c += `  canvas.drawPath(${pathVar}, paint${idx});\n\n`;
        }
    });

    if (allFilled && layers.length > 1) {
        c += `  return finalPath;\n`;
        c += `}`;
    } else if (allFilled && layers.length === 1) {
        c += `  return path;\n`;
        c += `}`;
    } else {
        c += `}`;
    }

    codeOutput.innerHTML = highlight(c);
}

function highlight(code) {
    return code
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(\/\/.+)/g, '<span class="syn-cmt">$1</span>')
        .replace(/\b(Path|Size|Paint|Canvas|Colors|PaintingStyle|CustomClipper|Offset)\b/g, '<span class="syn-kw">$1</span>')
        .replace(/\b(getClip|paintWave|quadraticBezierTo|lineTo|moveTo|close|drawPath|addPath|withOpacity)\b/g, '<span class="syn-fn">$1</span>')
        .replace(/\b(size\.width|size\.height|Offset\.zero)\b/g, '<span class="syn-prop">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="syn-num">$1</span>');
}

function parseVal(expr) {
    expr = expr.replace(/\s+/g, '');
    if (expr === 'size.width' || expr === 'size.height') return 1.0;
    if (expr === '0' || expr === '0.0') return 0.0;
    if (expr === '-size.width' || expr === '-size.height') return -1.0;
    
    const match = expr.match(/-?\d*\.?\d+/);
    if (match) {
        return parseFloat(match[0]);
    }
    return 0.0;
}

function parseDartCode(code) {
    if (layers.length > 1) return;
    
    const isFilledCode = code.includes('getClip');
    if (isFilledCode !== isFilled) {
        isFilled = isFilledCode;
        fillToggle.checked = isFilled;
        modeLabel.textContent = isFilled ? 'Fill' : 'Line';
        strokeGroup.style.display = isFilled ? 'none' : 'flex';
        fillEdgeGroup.style.display = isFilled ? 'flex' : 'none';
        cornerLegend.style.display = isFilled ? 'flex' : 'none';
    }

    const regex = /path\.(moveTo|lineTo|quadraticBezierTo)\s*\(([^)]+)\)/g;
    let match;
    
    let parsedPoints = [];
    let parsedCorners = [];
    
    const finishShapeIndex = code.indexOf('// Finish shape');
    
    while ((match = regex.exec(code)) !== null) {
        const type = match[1];
        const argsStr = match[2];
        const args = argsStr.split(',').map(s => parseVal(s));
        
        const isCorner = finishShapeIndex !== -1 && match.index > finishShapeIndex;
        
        if (!isCorner) {
            if (type === 'moveTo' && args.length >= 2) {
                parsedPoints.push({ type: 'start', x: args[0], y: args[1] });
            } else if (type === 'quadraticBezierTo' && args.length >= 4) {
                if (parsedPoints.length === 0) {
                    parsedPoints.push({ type: 'start', x: 0, y: 0.5 });
                }
                parsedPoints.push({ type: 'control', x: args[0], y: args[1] });
                parsedPoints.push({ type: 'anchor',  x: args[2], y: args[3] });
            }
        } else {
            if (type === 'lineTo' && args.length >= 2) {
                parsedCorners.push({ type: 'corner', x: args[0], y: args[1] });
            } else if (type === 'quadraticBezierTo' && args.length >= 4) {
                parsedCorners.push({ type: 'control', x: args[0], y: args[1] });
                
                const p0 = parsedPoints[0];
                if (p0) {
                    const isClosing = Math.abs(args[2] - p0.x) < 0.01 && Math.abs(args[3] - p0.y) < 0.01;
                    if (!isClosing) {
                        parsedCorners.push({ type: 'corner', x: args[2], y: args[3] });
                    }
                } else {
                    parsedCorners.push({ type: 'corner', x: args[2], y: args[3] });
                }
            }
        }
    }
    
    if (parsedPoints.length >= 3) {
        points = parsedPoints;
    }
    if (isFilledCode) {
        corners = parsedCorners;
    } else {
        corners = [];
    }
    
    render();
}

codeOutput.addEventListener('input', () => {
    isTypingCode = true;
    try {
        parseDartCode(codeOutput.textContent);
    } catch (e) {
        console.error('Failed to parse code:', e);
    }
});

codeOutput.addEventListener('blur', () => {
    isTypingCode = false;
    render();
});

// ── Toolbar Handlers ────────────────────────────────────────

fillToggle.addEventListener('change', e => {
    isFilled = e.target.checked;
    modeLabel.textContent = isFilled ? 'Fill' : 'Line';
    strokeGroup.style.display = isFilled ? 'none' : 'flex';
    fillEdgeGroup.style.display = isFilled ? 'flex' : 'none';
    cornerLegend.style.display = isFilled ? 'flex' : 'none';
    
    if (!isFilled && selected !== null && selected >= points.length) {
        selectPoint(null);
    }
    render();
});

fillEdgeSelect.addEventListener('change', e => {
    const val = e.target.value;
    
    const wFactor = lastWidth / 100;
    const hFactor = lastHeight / 100;
    
    const transform = (arr) => {
        arr.forEach(p => {
            if (wFactor > 0) p.x /= wFactor;
            if (hFactor > 0) p.y /= hFactor;
            
            let xb = p.x, yb = p.y;
            if (currentEdge === 'top') { yb = 1 - p.y; }
            else if (currentEdge === 'left') { xb = p.y; yb = 1 - p.x; }
            else if (currentEdge === 'right') { xb = p.y; yb = p.x; }
            
            if (val === 'bottom') { p.x = xb; p.y = yb; }
            else if (val === 'top') { p.x = xb; p.y = 1 - yb; }
            else if (val === 'left') { p.x = 1 - yb; p.y = xb; }
            else if (val === 'right') { p.x = yb; p.y = xb; }
        });
    };
    
    transform(points);
    transform(corners);
    
    let newWidth = lastWidth;
    let newHeight = lastHeight;
    
    const isOldVertical = (currentEdge === 'left' || currentEdge === 'right');
    const isNewVertical = (val === 'left' || val === 'right');
    
    if (isOldVertical !== isNewVertical) {
        newWidth = lastHeight;
        newHeight = lastWidth;
        widthSlider.value = newWidth;
        heightSlider.value = newHeight;
    }
    
    const newWFactor = newWidth / 100;
    const newHFactor = newHeight / 100;
    
    const applyScale = (arr) => {
        arr.forEach(p => {
            p.x *= newWFactor;
            p.y *= newHFactor;
        });
    };
    
    applyScale(points);
    applyScale(corners);
    
    currentEdge = val;
    lastWidth = newWidth;
    lastHeight = newHeight;
    
    render();
});

strokeInput.addEventListener('input', () => {
    const v = parseInt(strokeInput.value, 10);
    strokeWidth = isNaN(v) || v < 1 ? 3 : v;
    render();
});

flipBtn.addEventListener('click', () => {
    const wFactor = lastWidth / 100;
    const hFactor = lastHeight / 100;
    
    const transform = (arr) => {
        arr.forEach(p => {
            if (wFactor > 0) p.x /= wFactor;
            if (hFactor > 0) p.y /= hFactor;
            
            if (currentEdge === 'bottom' || currentEdge === 'top') {
                p.x = 1 - p.x;
            } else {
                p.y = 1 - p.y;
            }
            
            p.x *= wFactor;
            p.y *= hFactor;
        });
    };
    
    points.reverse();
    points.forEach((p, i) => {
        if (i === 0) p.type = 'start';
        else if (i % 2 === 1) p.type = 'control';
        else p.type = 'anchor';
    });
    
    transform(points);
    corners.reverse();
    transform(corners);
    
    if (selected !== null) {
        selectPoint(null);
    }
    render();
});

addBtn.addEventListener('click', () => {
    const segs = (points.length - 1) / 2;
    const newSegs = segs + 1;
    const scale = segs / newSegs;
    points.forEach(p => { p.x *= scale; });
    const last = points[points.length - 1];
    points.push({ type: 'control', x: last.x + 0.5 / newSegs, y: last.y });
    points.push({ type: 'anchor',  x: 1.0, y: last.y });
    render();
});

removeBtn.addEventListener('click', () => {
    if (points.length <= 3) return;
    points.splice(-2, 2);
    const segs = (points.length - 1) / 2;
    const scale = (segs + 1) / segs;
    points.forEach(p => { p.x *= scale; });
    points[points.length - 1].x = 1.0;
    if (selected !== null && selected >= points.length) selectPoint(null);
    render();
});

smoothBtn.addEventListener('click', () => {
    for (let i = 2; i < points.length - 1; i += 2) {
        const prev = points[i - 1], next = points[i + 1];
        points[i].x = (prev.x + next.x) / 2;
        points[i].y = (prev.y + next.y) / 2;
    }
    render();
});

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(codeOutput.innerText).then(() => {
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 1500);
    });
});

widthSlider.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    const factor = val / lastWidth;
    points.forEach(p => { p.x *= factor; });
    corners.forEach(c => { if (c.x > 0.001) c.x *= factor; });
    lastWidth = val;
    render();
});

heightSlider.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    const factor = val / lastHeight;
    points.forEach(p => { p.y *= factor; });
    corners.forEach(c => { if (c.y > 0.001) c.y *= factor; });
    lastHeight = val;
    render();
});

setTimeout(render, 60);
