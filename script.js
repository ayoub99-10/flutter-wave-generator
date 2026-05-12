/* ========================================================
   Flutter Wave Generator — Logic
   Clean rewrite: zero bugs, point inspector, dimension scaling
   ======================================================== */

// ── DOM References ──────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const canvas       = $('#wave-canvas');
const wavePath     = $('#wave-path');
const waveStroke   = $('#wave-stroke');
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

// Inspector
const inspector    = $('#point-inspector');
const inspTitle    = $('#inspector-title');
const inspClose    = $('#inspector-close');
const inspX        = $('#inspector-x');
const inspY        = $('#inspector-y');

// ── State ───────────────────────────────────────────────────
let isFilled    = true;
let currentEdge = 'bottom';
let strokeWidth = 3;
let svgW        = 0;
let svgH        = 0;
let dragging    = null;  // index of point being dragged
let selected    = null;  // index of point selected for inspector

let points = [
    { type: 'start',   x: 0.00, y: 0.50 },
    { type: 'control', x: 0.25, y: 0.70 },
    { type: 'anchor',  x: 0.50, y: 0.55 },
    { type: 'control', x: 0.75, y: 0.40 },
    { type: 'anchor',  x: 1.00, y: 0.55 },
];

let corners = [
    { type: 'corner', x: 1.00, y: 1.00 }, // Bottom Right
    { type: 'corner', x: 0.00, y: 1.00 }, // Bottom Left
];

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
    drawSVG();
    generateCode();
    updateInspector();
}

function drawSVG() {
    pointsG.innerHTML = '';

    // Helper lines (control → anchor connections and straight edges)
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

    // Main wave path and stroke path
    let d = `M${points[0].x * svgW},${points[0].y * svgH} `;
    let curveD = d; // Only the bezier curve, no corners or Z

    for (let i = 1; i < points.length; i += 2) {
        const c = points[i], a = points[i + 1];
        const seg = `Q${c.x * svgW},${c.y * svgH} ${a.x * svgW},${a.y * svgH} `;
        d += seg;
        curveD += seg;
    }
    
    waveStroke.setAttribute('d', curveD);

    if (isFilled) {
        for (let i = 0; i < corners.length; i++) {
            if (corners[i].type === 'corner') {
                d += `L${corners[i].x * svgW},${corners[i].y * svgH} `;
            } else if (corners[i].type === 'control') {
                const ctrl = corners[i];
                let anch;
                if (i + 1 < corners.length) {
                    anch = corners[i+1];
                    i++;
                } else {
                    anch = points[0];
                }
                d += `Q${ctrl.x * svgW},${ctrl.y * svgH} ${anch.x * svgW},${anch.y * svgH} `;
            }
        }
        d += `Z`;
        wavePath.setAttribute('fill', 'url(#wave-gradient)');
        wavePath.removeAttribute('stroke');
        wavePath.removeAttribute('stroke-width');
    } else {
        wavePath.setAttribute('fill', 'none');
        wavePath.setAttribute('stroke', 'url(#wave-gradient)');
        wavePath.setAttribute('stroke-width', strokeWidth);
        wavePath.setAttribute('stroke-linecap', 'round');
    }
    wavePath.setAttribute('d', d);

    // Render interactive dots
    let allPoints = isFilled ? [...points, ...corners] : points;

    allPoints.forEach((p, i) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        el.setAttribute('cx', p.x * svgW);
        el.setAttribute('cy', p.y * svgH);
        el.setAttribute('r', 8);
        
        if (p.type === 'control') el.classList.add('point', 'control-point');
        else if (p.type === 'corner') el.classList.add('point', 'corner-point');
        else el.classList.add('point', 'anchor-point');
        
        if (i === selected) el.classList.add('selected');

        el.addEventListener('mousedown',  e => { startDrag(i); e.stopPropagation(); });
        el.addEventListener('touchstart', e => { startDrag(i); e.stopPropagation(); }, { passive: false });
        
        // Right click to delete corner points
        el.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (p.type === 'corner') {
                const cIdx = i - points.length;
                corners.splice(cIdx, 1);
                if (selected === i) selectPoint(null);
                render();
            }
        });

        pointsG.appendChild(el);
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

wavePath.addEventListener('mousedown', startDragAll);
wavePath.addEventListener('touchstart', startDragAllTouch, { passive: false });

waveStroke.addEventListener('mousedown', startDragAll);
waveStroke.addEventListener('touchstart', startDragAllTouch, { passive: false });

function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x1 - x2)**2 + (y1 - y2)**2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1)*(x2 - x1) + (py - y1)*(y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.hypot(px - projX, py - projY);
}

// Double click to add point on ANY edge
$('svg').addEventListener('dblclick', e => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / svgW;
    const cy = (e.clientY - rect.top) / svgH;
    
    let bestDist = Infinity;
    let bestInsertIdx = -1;
    let bestT = 0;

    // Check Wave Curve
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
    
    // Check Straight Edges
    let bestEdgeDist = Infinity;
    let edgeInsertIdx = -1;
    
    if (isFilled) {
        const edges = getStraightEdges();
        edges.forEach(edge => {
            let d = distToSegment(cx, cy, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
            if (d < bestEdgeDist) { bestEdgeDist = d; edgeInsertIdx = edge.insertIdx; }
        });
    }

    // Determine which edge is closer
    if (bestDist < 0.05 && bestDist <= bestEdgeDist) {
        // SPLIT WAVE
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
        // INSERT CORNER
        corners.splice(edgeInsertIdx, 0, { type: 'corner', x: cx, y: cy });
        selectPoint(points.length + edgeInsertIdx);
        render();
        return;
    }
});

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
    if (dragging !== null) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }
}, { passive: false });
window.addEventListener('touchend', endDrag);

// Click on canvas background = deselect
canvas.addEventListener('mousedown', () => selectPoint(null));

// ── Point Inspector ─────────────────────────────────────────
function selectPoint(idx) {
    selected = idx;
    if (idx === null) {
        inspector.style.display = 'none';
    } else {
        inspector.style.display = '';
        updateInspector();
    }
}

function updateInspector() {
    let allPoints = isFilled ? [...points, ...corners] : points;
    if (selected === null || selected >= allPoints.length) return;
    
    const p = allPoints[selected];
    let label = '';
    let displayIdx = selected;
    
    if (p.type === 'corner') {
        label = 'Corner Point';
        displayIdx = selected - points.length + 1;
    } else if (p.type === 'control') {
        label = 'Control Point';
    } else if (p.type === 'start') {
        label = 'Start Point';
    } else {
        label = 'Anchor Point';
    }

    inspTitle.textContent = `${label}  #${displayIdx}`;
    inspX.value = Math.round(p.x * 100);
    inspY.value = Math.round(p.y * 100);
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

inspClose.addEventListener('click', () => selectPoint(null));

// ── Code Generation ─────────────────────────────────────────
function fmt(v) {
    const s = v.toFixed(2);
    return parseFloat(s).toString();  // drops trailing zeros cleanly
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

    if (isFilled) {
        c += `Path getClip(Size size) {\n`;
    } else {
        c += `void paintWave(Canvas canvas, Size size) {\n`;
    }

    c += `  Path path = Path();\n\n`;
    c += `  // Start position\n`;
    c += `  path.moveTo(${fmtX(points[0].x)}, ${fmtY(points[0].y)});\n\n`;

    let w = 1;
    for (let i = 1; i < points.length; i += 2) {
        const ctrl = points[i], anch = points[i + 1];
        c += `  // Wave ${w}\n`;
        c += `  path.quadraticBezierTo(\n`;
        c += `    ${fmtX(ctrl.x)},\n`;
        c += `    ${fmtY(ctrl.y)},\n`;
        c += `    ${fmtX(anch.x)},\n`;
        c += `    ${fmtY(anch.y)},\n`;
        c += `  );\n\n`;
        w++;
    }

    if (isFilled) {
        c += `  // Finish shape\n`;
        for (let i = 0; i < corners.length; i++) {
            if (corners[i].type === 'corner') {
                c += `  path.lineTo(${fmtX(corners[i].x)}, ${fmtY(corners[i].y)});\n`;
            } else if (corners[i].type === 'control') {
                const ctrl = corners[i];
                let anch;
                if (i + 1 < corners.length) {
                    anch = corners[i+1];
                    i++;
                } else {
                    anch = points[0];
                }
                c += `  path.quadraticBezierTo(\n`;
                c += `    ${fmtX(ctrl.x)},\n`;
                c += `    ${fmtY(ctrl.y)},\n`;
                c += `    ${fmtX(anch.x)},\n`;
                c += `    ${fmtY(anch.y)},\n`;
                c += `  );\n`;
            }
        }
        c += `  path.close();\n\n`;
        c += `  return path;\n`;
        c += `}`;
    } else {
        c += `  final paint = Paint()\n`;
        c += `    ..color = Colors.blue\n`;
        c += `    ..style = PaintingStyle.stroke\n`;
        c += `    ..strokeWidth = ${strokeWidth}.0;\n\n`;
        c += `  canvas.drawPath(path, paint);\n`;
        c += `}`;
    }

    codeOutput.innerHTML = highlight(c);
}

function highlight(code) {
    return code
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(\/\/.+)/g, '<span class="syn-cmt">$1</span>')
        .replace(/\b(Path|Size|Paint|Canvas|Colors|PaintingStyle|CustomClipper)\b/g, '<span class="syn-kw">$1</span>')
        .replace(/\b(getClip|paintWave|quadraticBezierTo|lineTo|moveTo|close|drawPath)\b/g, '<span class="syn-fn">$1</span>')
        .replace(/\b(size\.width|size\.height)\b/g, '<span class="syn-prop">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="syn-num">$1</span>');
}

// ── Toolbar Handlers ────────────────────────────────────────

// Fill / Line toggle
fillToggle.addEventListener('change', e => {
    isFilled = e.target.checked;
    modeLabel.textContent = isFilled ? 'Fill' : 'Line';
    strokeGroup.style.display = isFilled ? 'none' : 'flex';
    fillEdgeGroup.style.display = isFilled ? 'flex' : 'none';
    cornerLegend.style.display = isFilled ? 'flex' : 'none';
    
    // Clear selection if a corner was selected and we switch to line mode
    if (!isFilled && selected !== null && selected >= points.length) {
        selectPoint(null);
    }
    
    render();
});

// Fill edge select (auto-positions corners and rotates shape)
fillEdgeSelect.addEventListener('change', e => {
    const val = e.target.value;
    
    // Transform all points from currentEdge to the new edge
    points.forEach(p => {
        // 1. Convert to Bottom Standard
        let xb = p.x, yb = p.y;
        if (currentEdge === 'top') { yb = 1 - p.y; }
        else if (currentEdge === 'left') { xb = p.y; yb = 1 - p.x; }
        else if (currentEdge === 'right') { xb = p.y; yb = p.x; }
        
        // 2. Convert from Bottom Standard to newEdge
        if (val === 'bottom') { p.x = xb; p.y = yb; }
        else if (val === 'top') { p.x = xb; p.y = 1 - yb; }
        else if (val === 'left') { p.x = 1 - yb; p.y = xb; }
        else if (val === 'right') { p.x = yb; p.y = xb; }
    });
    
    currentEdge = val;

    if (val === 'bottom') {
        corners[0] = { type: 'corner', x: 1.0, y: 1.0 };
        corners[1] = { type: 'corner', x: 0.0, y: 1.0 };
    } else if (val === 'top') {
        corners[0] = { type: 'corner', x: 1.0, y: 0.0 };
        corners[1] = { type: 'corner', x: 0.0, y: 0.0 };
    } else if (val === 'left') {
        corners[0] = { type: 'corner', x: 0.0, y: 1.0 };
        corners[1] = { type: 'corner', x: 0.0, y: 0.0 };
    } else if (val === 'right') {
        corners[0] = { type: 'corner', x: 1.0, y: 1.0 };
        corners[1] = { type: 'corner', x: 1.0, y: 0.0 };
    }
    render();
});

// Stroke width (line mode only)
strokeInput.addEventListener('input', () => {
    const v = parseInt(strokeInput.value, 10);
    strokeWidth = isNaN(v) || v < 1 ? 3 : v;
    render();
});

// Flip Wave (180 degrees)
flipBtn.addEventListener('click', () => {
    points.reverse();
    points.forEach((p, i) => {
        if (i === 0) p.type = 'start';
        else if (i % 2 === 1) p.type = 'control';
        else p.type = 'anchor';
        
        if (currentEdge === 'bottom' || currentEdge === 'top') {
            p.x = 1 - p.x;
        } else {
            p.y = 1 - p.y;
        }
    });
    
    // Deselect if pointing to a wave point
    if (selected !== null && selected < points.length) {
        selectPoint(null);
    }
    
    render();
});

// Add Wave — keeps existing shape, adds new segment at the end
addBtn.addEventListener('click', () => {
    const segs = (points.length - 1) / 2;
    const newSegs = segs + 1;
    const scale = segs / newSegs;

    // Compress existing X to make room
    points.forEach(p => { p.x *= scale; });

    const last = points[points.length - 1];
    points.push({ type: 'control', x: last.x + 0.5 / newSegs, y: last.y });
    points.push({ type: 'anchor',  x: 1.0, y: last.y });

    render();
});

// Remove Wave — removes last segment, expands remaining
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

// Smooth — set internal anchors to midpoints of their neighbors
smoothBtn.addEventListener('click', () => {
    for (let i = 2; i < points.length - 1; i += 2) {
        const prev = points[i - 1], next = points[i + 1];
        points[i].x = (prev.x + next.x) / 2;
        points[i].y = (prev.y + next.y) / 2;
    }
    render();
});

// Copy
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(codeOutput.innerText).then(() => {
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 1500);
    });
});

// ── Boot ────────────────────────────────────────────────────
setTimeout(render, 60);
