const canvas = document.getElementById('wave-canvas');
const pathElement = document.getElementById('wave-path');
const linesElement = document.getElementById('helper-lines');
const pointsContainer = document.getElementById('points-container');
const codeOutput = document.getElementById('code-output');
const copyBtn = document.getElementById('copy-btn');
const addWaveBtn = document.getElementById('add-wave-btn');
const removeWaveBtn = document.getElementById('remove-wave-btn');
const smoothBtn = document.getElementById('smooth-btn');

let svgRect = canvas.getBoundingClientRect();
let width = svgRect.width;
let height = svgRect.height;

// Resize observer to update width/height
const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        render();
    }
});
resizeObserver.observe(canvas);

// State: List of points.
// Represented as normalized coordinates (0.0 to 1.0).
let points = [
    { type: 'start', x: 0.0, y: 0.8 }, // Start top-left down
    { type: 'control', x: 0.25, y: 1.0 },
    { type: 'anchor', x: 0.5, y: 0.85 },
    { type: 'control', x: 0.75, y: 0.7 },
    { type: 'anchor', x: 1.0, y: 0.85 }
];

let draggedPointIndex = null;

function render() {
    drawCanvas();
    generateCode();
}

function drawCanvas() {
    pointsContainer.innerHTML = '';
    
    // Draw helper lines between anchors and controls
    let dLines = '';
    for (let i = 1; i < points.length; i += 2) {
        const start = points[i-1];
        const ctrl = points[i];
        const end = points[i+1];
        
        dLines += `M ${start.x * width} ${start.y * height} L ${ctrl.x * width} ${ctrl.y * height} L ${end.x * width} ${end.y * height} `;
    }
    linesElement.setAttribute('d', dLines);

    // Draw main path (The actual wave)
    let dPath = `M 0 0 L 0 ${points[0].y * height} `;
    for (let i = 1; i < points.length; i += 2) {
        const ctrl = points[i];
        const end = points[i+1];
        dPath += `Q ${ctrl.x * width} ${ctrl.y * height}, ${end.x * width} ${end.y * height} `;
    }
    dPath += `L ${width} 0 Z`;
    pathElement.setAttribute('d', dPath);

    // Draw interactive points
    points.forEach((p, index) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute('cx', p.x * width);
        circle.setAttribute('cy', p.y * height);
        circle.setAttribute('r', 8);
        circle.setAttribute('class', `point ${p.type === 'control' ? 'control-point' : 'anchor-point'}`);
        circle.dataset.index = index;
        
        // Drag start event
        circle.addEventListener('mousedown', (e) => {
            draggedPointIndex = index;
            e.stopPropagation();
        });

        // Touch support
        circle.addEventListener('touchstart', (e) => {
            draggedPointIndex = index;
            e.stopPropagation();
        }, { passive: false });

        pointsContainer.appendChild(circle);
    });
}

function handleDrag(clientX, clientY) {
    if (draggedPointIndex !== null) {
        svgRect = canvas.getBoundingClientRect();
        let mouseX = clientX - svgRect.left;
        let mouseY = clientY - svgRect.top;

        // Clamp to canvas bounds
        mouseX = Math.max(0, Math.min(mouseX, width));
        mouseY = Math.max(0, Math.min(mouseY, height));

        let nx = mouseX / width;
        let ny = mouseY / height;

        const p = points[draggedPointIndex];

        // Restrict X movement for start and end points
        if (draggedPointIndex === 0) {
            nx = 0.0;
        } else if (draggedPointIndex === points.length - 1) {
            nx = 1.0;
        }

        p.x = nx;
        p.y = ny;

        render();
    }
}

function handleDragEnd() {
    draggedPointIndex = null;
}

// Mouse events for dragging
window.addEventListener('mousemove', (e) => handleDrag(e.clientX, e.clientY));
window.addEventListener('mouseup', handleDragEnd);

// Touch events for dragging
window.addEventListener('touchmove', (e) => {
    if (draggedPointIndex !== null) {
        e.preventDefault(); // Prevent scrolling while dragging
        handleDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: false });
window.addEventListener('touchend', handleDragEnd);

// Dart Code Generation
function formatX(val) {
    if (val === 0) return '0';
    if (val === 1) return 'size.width';
    return `size.width * ${val.toFixed(2)}`;
}

function formatY(val) {
    if (val === 0) return '0';
    if (val === 1) return 'size.height';
    return `size.height * ${val.toFixed(2)}`;
}

function syntaxHighlight(code) {
    // Simple regex replacements for highlighting
    return code
        .replace(/(Path|Size|getClip|quadraticBezierTo|lineTo|close|return)/g, '<span style="color: #cba6f7;">$1</span>')
        .replace(/(\/\/.+)/g, '<span style="color: #6e738d; font-style: italic;">$1</span>')
        .replace(/(\d+\.\d+|\b0\b)/g, '<span style="color: #fab387;">$1</span>')
        .replace(/(size\.width|size\.height)/g, '<span style="color: #89b4fa;">$1</span>');
}

function generateCode() {
    let code = `Path getClip(Size size) {\n  Path path = Path();\n\n`;
    
    code += `  // Start position\n`;
    code += `  path.lineTo(0, ${formatY(points[0].y)});\n\n`;

    let waveNum = 1;
    for (let i = 1; i < points.length; i += 2) {
        const ctrl = points[i];
        const end = points[i+1];
        
        code += `  // Wave ${waveNum}\n`;
        code += `  path.quadraticBezierTo(\n`;
        code += `    ${formatX(ctrl.x)},\n`;
        code += `    ${formatY(ctrl.y)},\n`;
        code += `    ${formatX(end.x)},\n`;
        code += `    ${formatY(end.y)},\n`;
        code += `  );\n\n`;
        waveNum++;
    }

    code += `  // Finish shape\n`;
    code += `  path.lineTo(size.width, 0);\n`;
    code += `  path.close();\n\n`;
    code += `  return path;\n}`;

    codeOutput.innerHTML = syntaxHighlight(code);
}

// Add/Remove Waves logic
addWaveBtn.addEventListener('click', () => {
    const currentSegments = (points.length - 1) / 2;
    const newSegments = currentSegments + 1;
    const scale = currentSegments / newSegments;

    // Scale existing points X to make room
    points.forEach(p => {
        p.x = p.x * scale;
    });

    const lastAnchor = points[points.length - 1];
    
    // Add new control point and anchor point at the end
    points.push({
        type: 'control',
        x: lastAnchor.x + (0.5 / newSegments),
        y: lastAnchor.y
    });
    
    points.push({
        type: 'anchor',
        x: 1.0,
        y: lastAnchor.y
    });

    render();
});

removeWaveBtn.addEventListener('click', () => {
    if (points.length > 3) {
        // Remove last 2 points (one segment)
        points.splice(points.length - 2, 2);
        
        // Scale remaining points to fill the space
        const newSegments = (points.length - 1) / 2;
        const oldSegments = newSegments + 1;
        const scale = oldSegments / newSegments;
        
        points.forEach(p => {
            p.x = p.x * scale;
        });
        
        points[points.length - 1].x = 1.0; // Force exact 1.0
        
        render();
    }
});

smoothBtn.addEventListener('click', () => {
    // Make wave perfectly smooth by setting internal anchors to midpoints of controls
    for (let i = 2; i < points.length - 1; i += 2) {
        const prevCtrl = points[i - 1];
        const nextCtrl = points[i + 1];
        
        points[i].x = (prevCtrl.x + nextCtrl.x) / 2;
        points[i].y = (prevCtrl.y + nextCtrl.y) / 2;
    }
    render();
});

// Copy to clipboard
copyBtn.addEventListener('click', () => {
    const textToCopy = codeOutput.innerText; // Get raw text without HTML tags
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    });
});

// Initial render
// Small timeout to ensure DOM and ResizeObserver are ready
setTimeout(render, 50);
