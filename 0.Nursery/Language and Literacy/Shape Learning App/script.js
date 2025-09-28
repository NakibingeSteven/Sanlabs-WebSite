const shapes = [
    { name: 'Circle', type: 'circle' },
    { name: 'Square', type: 'rectangle' },
    { name: 'Triangle', type: 'triangle' },
    { name: 'Polygon', type: 'polygon' }
];

const shapeDisplay = document.getElementById('shape-display');
const shapeButtons = document.getElementById('shape-buttons');
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const clearButton = document.getElementById('clear-canvas');
const checkButton = document.getElementById('check-shape');
const feedback = document.getElementById('feedback');

canvas.width = 300;
canvas.height = 300;

shapes.forEach(shape => {
    const button = document.createElement('div');
    button.classList.add('shape-button');
    button.textContent = shape.name;
    button.onclick = () => {
        shapeDisplay.textContent = shape.name;
        shapeDisplay.setAttribute('data-shape', shape.type);
        resetCanvas();
    };
    shapeButtons.appendChild(button);
});

function resetCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.onmousedown = startDrawing;
    canvas.onmouseup = stopDrawing;
}

function startDrawing(event) {
    const shapeType = shapeDisplay.getAttribute('data-shape');
    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(event.offsetX, event.offsetY);
    canvas.onmousemove = (e) => draw(e, shapeType);
}

function stopDrawing() {
    isDrawing = false;
    canvas.onmousemove = null;
}

function draw(event, shapeType) {
    if (isDrawing) {
        switch (shapeType) {
            case 'circle':
                drawCircle(event.offsetX, event.offsetY);
                break;
            case 'rectangle':
                drawRectangle(event.offsetX, event.offsetY);
                break;
            case 'triangle':
                drawTriangle(event.offsetX, event.offsetY);
                break;
            case 'polygon':
                drawPolygon(event.offsetX, event.offsetY);
                break;
        }
    }
}

function drawCircle(x, y) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, 2 * Math.PI);
    ctx.stroke();
}

function drawRectangle(x, y) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.rect(x - 30, y - 20, 60, 40);
    ctx.stroke();
}

function drawTriangle(x, y) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x - 30, y + 30);
    ctx.lineTo(x + 30, y + 30);
    ctx.closePath();
    ctx.stroke();
}

function drawPolygon(x, y) {
    const sides = 6; // Example polygon: hexagon
    const radius = 30;
    const angle = 2 * Math.PI / sides;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const theta = i * angle;
        const px = x + radius * Math.cos(theta);
        const py = y + radius * Math.sin(theta);
        ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
}

function checkShape() {
    const shapeType = shapeDisplay.getAttribute('data-shape');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Simple shape recognition logic for demonstration
    if (shapeType === 'circle') {
        // Implement circle recognition logic here
        feedback.textContent = 'Circle shape drawn!';
    } else if (shapeType === 'rectangle') {
        // Implement rectangle recognition logic here
        feedback.textContent = 'Rectangle shape drawn!';
    } else if (shapeType === 'triangle') {
        // Implement triangle recognition logic here
        feedback.textContent = 'Triangle shape drawn!';
    } else if (shapeType === 'polygon') {
        // Implement polygon recognition logic here
        feedback.textContent = 'Polygon shape drawn!';
    } else {
        feedback.textContent = 'Draw a shape!';
    }
}

clearButton.onclick = resetCanvas;
checkButton.onclick = checkShape;
