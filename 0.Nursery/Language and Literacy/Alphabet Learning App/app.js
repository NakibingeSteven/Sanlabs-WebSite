const letters = [
    { letter: 'A', image: 'apple.png', sound: 'sound/a.mp3' },
    { letter: 'B', image: 'ball.png', sound: 'sound/b.mp3' },
    { letter: 'C', image: 'cat.png', sound: 'sound/c.mp3' },
    { letter: 'D', image: 'dog.png', sound: 'sound/d.mp3' },
    { letter: 'E', image: 'elephant.png', sound: 'sound/e.mp3' },
    { letter: 'F', image: 'fish.png', sound: 'sound/f.mp3' },
    { letter: 'G', image: 'giraffe.png', sound: 'sound/g.mp3' },
    { letter: 'H', image: 'hat.png', sound: 'sound/h.mp3' },
    { letter: 'I', image: 'icecream.png', sound: 'sound/i.mp3' },
    { letter: 'J', image: 'jellyfish.png', sound: 'sound/j.mp3' },
    { letter: 'K', image: 'kite.png', sound: 'sound/k.mp3' },
    { letter: 'L', image: 'lion.png', sound: 'sound/l.mp3' },
    { letter: 'M', image: 'monkey.png', sound: 'sound/m.mp3' },
    { letter: 'N', image: 'nest.png', sound: 'sound/n.mp3' },
    { letter: 'O', image: 'octopus.png', sound: 'sound/o.mp3' },
    { letter: 'P', image: 'panda.png', sound: 'sound/p.mp3' },
    { letter: 'Q', image: 'queen.png', sound: 'sound/q.mp3' },
    { letter: 'R', image: 'rabbit.png', sound: 'sound/r.mp3' },
    { letter: 'S', image: 'sun.png', sound: 'sound/s.mp3' },
    { letter: 'T', image: 'tiger.png', sound: 'sound/t.mp3' },
    { letter: 'U', image: 'umbrella.png', sound: 'sound/u.mp3' },
    { letter: 'V', image: 'violin.png', sound: 'sound/v.mp3' },
    { letter: 'W', image: 'whale.png', sound: 'sound/w.mp3' },
    { letter: 'X', image: 'xylophone.png', sound: 'sound/x.mp3' },
    { letter: 'Y', image: 'yoyo.png', sound: 'sound/y.mp3' },
    { letter: 'Z', image: 'zebra.png', sound: 'sound/z.mp3' }
];


const letterGrid = document.getElementById('letterGrid');
const letterDetail = document.getElementById('letterDetail');
const tracingArea = document.getElementById('tracingArea');
const selectedLetterElement = document.getElementById('selectedLetter');
const letterImage = document.getElementById('letterImage');

letters.forEach(l => {
    const div = document.createElement('div');
    div.className = 'letter';
    div.textContent = l.letter;
    div.onclick = () => showLetterDetail(l);
    letterGrid.appendChild(div);
});

function showLetterDetail(letterData) {
    letterGrid.style.display = 'none';
    letterDetail.style.display = 'block';
    selectedLetterElement.textContent = letterData.letter;
    letterImage.src = letterData.image;
    currentSound = letterData.sound;
}

function goBack() {
    letterDetail.style.display = 'none';
    letterGrid.style.display = 'grid';
    tracingArea.style.display = 'none';
}

let currentSound;

function playSound() {
    const audio = new Audio(currentSound);
    audio.play();
}

function startTracing() {
    tracingArea.style.display = 'block';
    const canvas = document.getElementById('tracingCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '120px Comic Sans MS';
    ctx.fillText(selectedLetterElement.textContent, 50, 150);

    let drawing = false;

    canvas.onmousedown = () => { drawing = true; };
    canvas.onmouseup = () => { drawing = false; ctx.beginPath(); };
    canvas.onmousemove = draw;

    function draw(e) {
        if (!drawing) return;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ff6f61';

        ctx.lineTo(e.clientX - canvas.offsetLeft, e.clientY - canvas.offsetTop);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(e.clientX - canvas.offsetLeft, e.clientY - canvas.offsetTop);
    }
}