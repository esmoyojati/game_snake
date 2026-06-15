/* =============================================
   SCRIPT.JS — Snake Xenzia Classic
   Menggunakan Three.js untuk Grafika Komputer
   =============================================
   Konsep Three.js yang digunakan:
   - Scene, OrthographicCamera, WebGLRenderer
   - PlaneGeometry (arena), BoxGeometry (ular & makanan)
   - MeshBasicMaterial (tanpa pencahayaan, retro)
   - Transformasi: Translasi (gerak ular), Rotasi (makanan)
   - Animation Loop (requestAnimationFrame via renderer)
   ============================================= */

// ─────────────────────────────────────────────
// KONSTANTA GAME
// ─────────────────────────────────────────────
const GRID_SIZE   = 20;      // jumlah sel per baris/kolom
const CELL        = 1;       // ukuran tiap sel dalam unit Three.js
const HALF        = GRID_SIZE / 2; // offset tengah grid
const SPEED_MS    = 150;     // interval gerak ular (ms)

// Palet warna Nokia
const COLOR_BG    = 0x9bbc0f; // hijau muda — arena
const COLOR_SNAKE = 0x306230; // hijau gelap — tubuh ular
const COLOR_FOOD  = 0x0f380f; // hijau/hitam gelap — makanan

// ─────────────────────────────────────────────
// VARIABEL GLOBAL
// ─────────────────────────────────────────────
let scene, camera, renderer;
let snakeSegments = [];   // array of THREE.Mesh (tiap kotak ular)
let snakeBody     = [];   // array of {x, y} posisi grid
let foodMesh      = null; // THREE.Mesh makanan
let foodPos       = { x: 0, y: 0 };

let direction     = { x: 1, y: 0 };  // arah gerak saat ini
let nextDir       = { x: 1, y: 0 };  // arah berikutnya (buffered)
let score         = 0;
let gameRunning   = false;
let lastMoveTime  = 0;

// Elemen DOM
const container        = document.getElementById('canvas-container');
const scoreEl          = document.getElementById('score-value');
const overlay          = document.getElementById('overlay');
const gameoverOverlay  = document.getElementById('gameover-overlay');
const finalScoreEl     = document.getElementById('final-score');
const btnStart         = document.getElementById('btn-start');
const btnRestart       = document.getElementById('btn-restart');

// ─────────────────────────────────────────────
// INISIALISASI THREE.JS
// Membuat scene, kamera ortografik, dan renderer
// ─────────────────────────────────────────────
function initThree() {
  // Scene: wadah semua objek 3D
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR_BG);

  // OrthographicCamera: kamera 2D tanpa perspektif
  // Parameter: left, right, top, bottom, near, far
  const half = GRID_SIZE / 2;
  camera = new THREE.OrthographicCamera(
    -half, half,   // kiri - kanan
     half, -half,  // atas - bawah  (y-up di Three.js, tapi kita balik)
    -10, 10        // near - far
  );
  camera.position.z = 5;

  // Renderer: menggambar scene ke canvas
  renderer = new THREE.WebGLRenderer({ antialias: false }); // antialias off = piksel tajam
  renderer.setSize(328, 328);
  container.appendChild(renderer.domElement);
}

// ─────────────────────────────────────────────
// MEMBUAT ARENA
// Menggunakan PlaneGeometry sebagai latar arena
// ─────────────────────────────────────────────
function createArena() {
  const geo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
  const mat = new THREE.MeshBasicMaterial({ color: COLOR_BG });
  const plane = new THREE.Mesh(geo, mat);
  // Geser ke tengah agar sesuai grid (0,0 = kiri-atas)
  plane.position.set(0, 0, -0.1);
  scene.add(plane);
}

// ─────────────────────────────────────────────
// MEMBUAT ULAR
// Tiap segmen adalah BoxGeometry kecil
// Dimulai dari tengah arena, panjang 3 kotak
// ─────────────────────────────────────────────
function createSnake() {
  // Hapus segmen lama dari scene
  snakeSegments.forEach(s => scene.remove(s));
  snakeSegments = [];
  snakeBody     = [];

  // Posisi awal: tengah grid, memanjang ke kiri
  const startX = Math.floor(GRID_SIZE / 2);
  const startY = Math.floor(GRID_SIZE / 2);

  for (let i = 0; i < 3; i++) {
    const pos = { x: startX - i, y: startY };
    snakeBody.push(pos);
    snakeSegments.push(createSegmentMesh(pos.x, pos.y));
  }
}

// Membuat satu kotak segmen ular dan menambahkannya ke scene
function createSegmentMesh(gx, gy) {
  const size = CELL * 0.88; // sedikit lebih kecil agar ada celah antar sel
  const geo  = new THREE.BoxGeometry(size, size, 0.1);
  const mat  = new THREE.MeshBasicMaterial({ color: COLOR_SNAKE });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(gridToWorldX(gx), gridToWorldY(gy), 0);
  scene.add(mesh);
  return mesh;
}

// ─────────────────────────────────────────────
// SPAWN MAKANAN
// Muncul di posisi acak yang tidak ditempati ular
// ─────────────────────────────────────────────
function spawnFood() {
  // Hapus makanan lama
  if (foodMesh) scene.remove(foodMesh);

  // Cari posisi kosong
  let pos;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE)
    };
  } while (snakeBody.some(s => s.x === pos.x && s.y === pos.y));

  foodPos = pos;

  // Buat mesh makanan (sedikit lebih kecil, persegi)
  const size = CELL * 0.7;
  const geo  = new THREE.BoxGeometry(size, size, 0.1);
  const mat  = new THREE.MeshBasicMaterial({ color: COLOR_FOOD });
  foodMesh   = new THREE.Mesh(geo, mat);
  foodMesh.position.set(gridToWorldX(pos.x), gridToWorldY(pos.y), 0);
  scene.add(foodMesh);
}

// ─────────────────────────────────────────────
// MENGGERAKKAN ULAR
// Transformasi TRANSLASI: setiap segmen berpindah posisi
// Logika: tambah kepala baru, hapus ekor (kecuali makan)
// ─────────────────────────────────────────────
function moveSnake() {
  // Terapkan arah yang di-buffer
  direction = { ...nextDir };

  // Hitung posisi kepala baru
  // direction.y: +1 = atas (grid Y berkurang), -1 = bawah (grid Y bertambah)
  const head    = snakeBody[0];
  const newHead = { x: head.x + direction.x, y: head.y - direction.y };

  // Cek tabrakan dulu sebelum bergerak
  if (checkCollision(newHead)) {
    triggerGameOver();
    return;
  }

  // Sisipkan kepala baru ke depan array
  snakeBody.unshift(newHead);

  // Buat mesh untuk kepala baru
  const newMesh = createSegmentMesh(newHead.x, newHead.y);
  snakeSegments.unshift(newMesh);

  // Cek apakah makan makanan
  if (newHead.x === foodPos.x && newHead.y === foodPos.y) {
    updateScore(score + 1);
    spawnFood();
    // Tidak hapus ekor → ular bertambah panjang
  } else {
    // Hapus ekor (segmen terakhir)
    scene.remove(snakeSegments.pop());
    snakeBody.pop();
  }
}

// ─────────────────────────────────────────────
// CEK TABRAKAN
// Tabrakan dinding atau tubuh sendiri → Game Over
// ─────────────────────────────────────────────
function checkCollision(pos) {
  // Tabrakan dengan dinding
  if (pos.x < 0 || pos.x >= GRID_SIZE || pos.y < 0 || pos.y >= GRID_SIZE) {
    return true;
  }
  // Tabrakan dengan tubuh sendiri (kecuali ekor yang akan dihapus)
  for (let i = 0; i < snakeBody.length - 1; i++) {
    if (snakeBody[i].x === pos.x && snakeBody[i].y === pos.y) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
// UPDATE SKOR
// ─────────────────────────────────────────────
function updateScore(newScore) {
  score = newScore;
  scoreEl.textContent = score;
}

// ─────────────────────────────────────────────
// GAME OVER
// ─────────────────────────────────────────────
function triggerGameOver() {
  gameRunning = false;
  finalScoreEl.textContent = score;
  gameoverOverlay.classList.remove('hidden');
}

// ─────────────────────────────────────────────
// RESTART GAME
// Reset semua state dan mulai ulang
// ─────────────────────────────────────────────
function restartGame() {
  gameoverOverlay.classList.add('hidden');
  score     = 0;
  direction = { x: 1, y: 0 };
  nextDir   = { x: 1, y: 0 };
  updateScore(0);
  createSnake();
  spawnFood();
  gameRunning  = true;
  lastMoveTime = performance.now();
}

// ─────────────────────────────────────────────
// KONVERSI KOORDINAT GRID → WORLD THREE.JS
// Grid (0,0) = pojok kiri-atas
// Sumbu X: sama arah. Sumbu Y: di-flip karena
// Three.js Y positif ke atas, grid Y ke bawah.
// ─────────────────────────────────────────────
function gridToWorldX(gx) {
  return gx - HALF + CELL / 2;
}
function gridToWorldY(gy) {
  return HALF - gy - CELL / 2; // flip Y
}

// ─────────────────────────────────────────────
// ANIMATION LOOP
// Dipanggil setiap frame oleh Three.js
// Transformasi ROTASI diterapkan pada makanan di sini
// ─────────────────────────────────────────────
function animate(timestamp) {
  requestAnimationFrame(animate);

  // Transformasi ROTASI: makanan berputar perlahan
  if (foodMesh) {
    foodMesh.rotation.z += 0.04; // rotasi pada sumbu Z (2D)
  }

  // Gerakkan ular sesuai interval kecepatan
  if (gameRunning && timestamp - lastMoveTime >= SPEED_MS) {
    moveSnake();
    lastMoveTime = timestamp;
  }

  // Render scene ke canvas
  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────
// INPUT KEYBOARD — Arrow Keys
// Interaksi 1: Keyboard
// Buffer arah berikutnya (mencegah balik arah 180°)
// ─────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (!gameRunning) return;

  switch (e.key) {
    case 'ArrowUp':
      if (direction.y !== -1) nextDir = { x: 0, y: 1 }; // y positif = naik di Three.js
      break;
    case 'ArrowDown':
      if (direction.y !== 1)  nextDir = { x: 0, y: -1 };
      break;
    case 'ArrowLeft':
      if (direction.x !== 1)  nextDir = { x: -1, y: 0 };
      break;
    case 'ArrowRight':
      if (direction.x !== -1) nextDir = { x: 1, y: 0 };
      break;
  }
  // Mencegah halaman scroll saat menekan arrow key
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
});

// ─────────────────────────────────────────────
// INPUT MOUSE — Tombol Start & Restart
// Interaksi 2: Mouse Click
// ─────────────────────────────────────────────
btnStart.addEventListener('click', function() {
  overlay.classList.add('hidden');
  restartGame();
});

btnRestart.addEventListener('click', function() {
  restartGame();
});

// ─────────────────────────────────────────────
// INPUT MOUSE — Hover pada tombol sudah ditangani CSS
// (Interaksi 3: diimplementasikan via :hover di style.css)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// ENTRY POINT — Mulai program
// ─────────────────────────────────────────────
initThree();   // Setup Three.js
createArena(); // Buat arena (PlaneGeometry)
createSnake(); // Buat ular awal
spawnFood();   // Spawn makanan pertama
animate(0);    // Mulai animation loop
