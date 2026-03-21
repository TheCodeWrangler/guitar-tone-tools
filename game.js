(function () {
  "use strict";

  window.__startTurtleGame = function () {}; // set by startGame() below; fallback for inline onclick

  const FRIENDS = [
    { type: "turtle", emoji: "🐢", name: "Shelly", greeting: "Shelly is safe! “Take it slow — the best shells are worth the wait!”" },
    { type: "fish", emoji: "🐠", name: "Coral", greeting: "Coral is safe! “Swim by anytime. There’s always room for one more!”" },
    { type: "octopus", emoji: "🐙", name: "Inky", greeting: "Inky is safe! “Eight arms mean eight hugs. Thank you!”" },
    { type: "seahorse", emoji: "🐴", name: "Bubbles", greeting: "Bubbles is safe! “Ride the current with me!”" },
    { type: "starfish", emoji: "🌟", name: "Stella", greeting: "Stella is safe! “You’re a star. Shine on!”" },
  ];

  const CELL_SIZE = 80;
  const COLS = 30;
  const ROWS = 10;
  const WORLD_W = COLS * CELL_SIZE;
  const WORLD_H = ROWS * CELL_SIZE;
  const VIEW_W = 960;
  const VIEW_H = 640;

  const MAZES = [
    [ // Shipwreck Bow
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,1,0,1,1,1,0,1],
      [1,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,0,1],
      [1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,0,1,1,1,0,1,0,1,1,1,1,0,1,0,1],
      [1,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
      [1,0,1,1,1,0,1,0,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1],
      [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1,1,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    [ // Cargo Hold
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,1],
      [1,0,1,0,1,1,1,1,1,1,1,1,0,1,0,1,1,1,1,0,1,1,1,1,1,1,0,1,0,1],
      [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,0,1,0,1,1,1,1,1,1,0,1],
      [1,0,0,0,1,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
      [1,1,1,0,1,0,1,0,1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    [ // Engine Room
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1,0,1,1,0,1,1,1,1,0,1],
      [1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,1],
      [1,1,1,0,1,1,1,0,1,0,1,1,1,1,1,1,0,1,1,1,1,0,1,1,1,0,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,1,1,1,0,1,1,1,0,1,1,1,0,1,0,1,1,1,1,1,0,1,1,1,0,1,1],
      [1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,0,0,1,0,0,0,0,0,0,1],
      [1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    [ // Captain's Quarters
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
      [1,0,1,1,0,1,0,1,1,1,0,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,0,1],
      [1,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,1],
      [1,1,0,1,1,1,1,1,0,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1,1,1,0,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
      [1,0,1,1,0,1,0,1,1,1,1,0,1,1,1,1,1,1,0,1,1,1,1,0,1,1,1,1,0,1],
      [1,0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
      [1,1,0,1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1,1,1,1,0,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    [ // Reef Passage
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
      [1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1],
      [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,1],
      [1,0,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,1,0,1,1,1,0,1,0,1,0,1],
      [1,0,0,0,1,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,1,0,1,0,0,0,1],
      [1,1,1,0,1,0,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,0,1,0,1,1,1,0,1],
      [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1,0,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  ];

  let currentMaze = MAZES[0];
  const SECRET_WALL_CHANCE = 0.04;

  const COLLECTIBLE_TYPES = [
    { emoji: "🦪", name: "Pearl", time: 3 },
    { emoji: "🐚", name: "Shell", time: 6 },
  ];

  const SPEED = 5;
  const MEET_RADIUS = 50;
  const COLLECT_RADIUS = 40;
  const BASE_TIME_SEC = 45;
  const TIME_PER_LEVEL = 10;
  const SPAWN_INTERVAL_MS = 5000;
  const COLLECTIBLE_INTERVAL_MS = 10000;

  const mermaidEl = document.getElementById("mermaid");
  const gameWorld = document.getElementById("game-world");
  const worldInner = document.getElementById("world-inner");
  const mazeContainer = document.getElementById("maze-container");
  const friendsContainer = document.getElementById("friends-container");
  const meetToast = document.getElementById("meet-toast");
  const meetToastMsg = document.getElementById("meet-toast-message");
  let toastTimer = null;
  const friendsCountEl = document.querySelector(".friends-count");
  const friendsGoalEl = document.getElementById("friends-goal");
  const timerEl = document.getElementById("timer-value");
  const gameOverEl = document.getElementById("game-over");
  const finalCountEl = document.getElementById("final-count");
  const finalLevelEl = document.getElementById("final-level");
  const playAgainBtn = document.getElementById("play-again");
  const startScreen = document.getElementById("start-screen");
  const startBtn = document.getElementById("start-btn");
  const levelBadge = document.getElementById("level-badge");
  const levelNumEl = document.getElementById("level-num");
  const levelCompleteEl = document.getElementById("level-complete");
  const levelCompleteTitleEl = document.getElementById("level-complete-title");
  const levelCompleteSubEl = document.getElementById("level-complete-sub");
  const nextLevelBtn = document.getElementById("next-level-btn");
  const powerupIndicator = document.getElementById("powerup-indicator");
  const powerupIcon = document.getElementById("powerup-icon");
  const powerupTimerEl = document.getElementById("powerup-timer");
  const levelTransition = document.getElementById("level-transition");
  const minimapCanvas = document.getElementById("minimap");
  const minimapCtx = minimapCanvas ? minimapCanvas.getContext("2d") : null;

  let mermaid = { x: 0, y: 0, w: 64, h: 64, facing: "right" };
  const HIT_PAD = 10;
  let keys = {};
  let friends = [];
  let collectibles = [];
  let collectibleTimer = null;
  let hazards = [];
  let stunEndMs = 0;
  const STUN_DURATION = 1500;
  const STUN_TIME_PENALTY = 8;
  const HAZARD_SPEED = 2.2;
  const POWERUP_TYPES = [
    { type: "speed", emoji: "⚡", name: "Speed Boost", duration: 5000 },
    { type: "freeze", emoji: "❄️", name: "Time Freeze", duration: 5000 },
    { type: "magnet", emoji: "🧲", name: "Magnet", duration: 5000 },
    { type: "turbo", emoji: "📦", name: "TURBO", duration: 4000 },
  ];
  const TURBO_SPEED_MULT = 3;
  let powerups = [];
  let activePowerup = null;
  let powerupEndMs = 0;
  const POWERUP_RADIUS = 40;
  const MAGNET_RADIUS = 150;

  let portals = [];
  const PORTAL_RADIUS = 22;
  const PORTAL_COOLDOWN_MS = 5000;
  let lastPortalMs = 0;
  const PORTAL_COLORS = ["#a855f7", "#06b6d4", "#f59e0b", "#ec4899"];

  let currents = [];
  const CURRENT_PUSH_SPEED = 1.2;
  const CURRENT_ARROWS = { "1,0": "▶", "-1,0": "◀", "0,1": "▼", "0,-1": "▲" };

  let gateWall = null;
  let keyItem = null;
  let hasKey = false;
  const KEY_RADIUS = 38;

  let movingWalls = [];
  const MOVING_WALL_CYCLE_MS = 3000;

  let friendsSaved = 0;
  let totalFriendsSaved = 0;
  let spawnTimer = null;
  let animId = null;
  let timeLeftSec = BASE_TIME_SEC;
  let lastTimeMs = null;
  let gameOver = false;
  let gameStarted = false;
  let levelPaused = false;
  let walls = [];
  let cameraX = 0;
  let cameraY = 0;
  let level = 1;

  const MINIMAP_CELL = 5;

  // ---- localStorage high scores ----
  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem("oceanBest")) || { level: 0, friends: 0 };
    } catch (e) { return { level: 0, friends: 0 }; }
  }
  function saveBest(lvl, fr) {
    var best = loadBest();
    var changed = false;
    if (lvl > best.level) { best.level = lvl; changed = true; }
    if (fr > best.friends) { best.friends = fr; changed = true; }
    if (changed) {
      try { localStorage.setItem("oceanBest", JSON.stringify(best)); } catch (e) {}
    }
    return best;
  }
  function showBest() {
    var best = loadBest();
    var els = [
      [document.getElementById("best-level-start"), document.getElementById("best-friends-start"), document.getElementById("best-score-start")],
      [document.getElementById("best-level-end"), document.getElementById("best-friends-end"), document.getElementById("best-score-end")],
    ];
    els.forEach(function (arr) {
      if (arr[0]) arr[0].textContent = best.level;
      if (arr[1]) arr[1].textContent = best.friends;
      if (arr[2] && best.level > 0) arr[2].classList.remove("hidden");
    });
    unlockCharacters(best.level);
    var maxUnlocked = best.level > 0 ? best.level + 1 : 1;
    window.__MAX_UNLOCKED_LEVEL = maxUnlocked;
    var picker = document.getElementById("level-picker");
    if (picker && maxUnlocked > 1) picker.classList.remove("hidden");
  }

  // ---- Star rating ----
  function calcStars(lvl, timeUsed, totalTime) {
    var pct = timeUsed / totalTime;
    if (pct <= 0.4) return 3;
    if (pct <= 0.7) return 2;
    return 1;
  }

  // ---- Unlock characters ----
  function unlockCharacters(bestLevel) {
    var locked = document.querySelectorAll(".char-option.locked");
    locked.forEach(function (btn) {
      var req = parseInt(btn.getAttribute("data-unlock"), 10);
      if (bestLevel >= req) {
        btn.classList.remove("locked");
        btn.disabled = false;
        var nameEl = btn.querySelector(".char-name");
        if (nameEl) nameEl.textContent = btn.getAttribute("data-name");
      }
    });
  }

  // ---- Biomes ----
  const BIOMES = [
    { name: "shipwreck", wallClass: "", bgGradient: null },
    { name: "coral", wallClass: "biome-coral", bgGradient: "linear-gradient(180deg, #d4788c 0%, #a85070 25%, #6b3050 55%, #2a1525 100%)" },
    { name: "cave", wallClass: "biome-cave", bgGradient: "linear-gradient(180deg, #6a6a8a 0%, #4a4a6a 25%, #2a2a4a 55%, #12122a 100%)" },
    { name: "city", wallClass: "biome-city", bgGradient: "linear-gradient(180deg, #4a9a9a 0%, #2a7a7a 25%, #1a5a5a 55%, #0a2a2a 100%)" },
  ];
  function getBiome(lvl) {
    if (lvl <= 3) return BIOMES[0];
    if (lvl <= 6) return BIOMES[1];
    if (lvl <= 9) return BIOMES[2];
    return BIOMES[3];
  }
  function applyBiome(lvl) {
    var biome = getBiome(lvl);
    var ocean = document.querySelector(".ocean");
    if (ocean && biome.bgGradient) {
      ocean.style.background = biome.bgGradient;
    } else if (ocean) {
      ocean.style.background = "";
    }
    if (mazeContainer) {
      mazeContainer.dataset.biome = biome.name;
    }
  }
  const TRAIL_MAX = 30;
  const TRAIL_INTERVAL = 3;
  let trailPositions = [];
  let trailFrame = 0;
  const trailContainer = document.getElementById("trail-container");

  function getLevelGoal(lvl) { return lvl; }
  function getLevelTime(lvl) { return BASE_TIME_SEC + (lvl - 1) * TIME_PER_LEVEL; }
  function getLevelMaxFriends(lvl) { return Math.min(lvl + 2, 10); }

  function selectMaze(lvl) {
    var idx = (lvl - 1) % MAZES.length;
    if (lvl > MAZES.length) {
      idx = Math.floor(Math.random() * MAZES.length);
    }
    currentMaze = MAZES[idx];
  }

  function getOpenCells() {
    const open = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (currentMaze[row][col] === 0) open.push({ col, row });
      }
    }
    return open;
  }

  function isEdgeWall(row, col) {
    return row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1;
  }

  function buildWalls() {
    walls = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (currentMaze[row][col] === 1) {
          var secret = !isEdgeWall(row, col) && Math.random() < SECRET_WALL_CHANCE;
          walls.push({
            x: col * CELL_SIZE,
            y: row * CELL_SIZE,
            w: CELL_SIZE,
            h: CELL_SIZE,
            secret: secret,
          });
        }
      }
    }
  }

  function renderMaze() {
    if (!mazeContainer) return;
    mazeContainer.innerHTML = "";
    walls.forEach(function (w) {
      const el = document.createElement("div");
      el.className = "maze-wall" + (w.secret ? " secret" : "");
      el.style.left = w.x + "px";
      el.style.top = w.y + "px";
      el.style.width = w.w + "px";
      el.style.height = w.h + "px";
      mazeContainer.appendChild(el);
    });
  }

  function findEdgePortalCells() {
    var cells = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (currentMaze[r][c] !== 1) continue;
        if (!isEdgeWall(r, c)) continue;
        var adj = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
        for (var a = 0; a < adj.length; a++) {
          var ar = adj[a][0], ac = adj[a][1];
          if (ar >= 0 && ar < ROWS && ac >= 0 && ac < COLS && currentMaze[ar][ac] === 0) {
            cells.push({ row: r, col: c, openRow: ar, openCol: ac });
            break;
          }
        }
      }
    }
    return cells;
  }

  function spawnPortals() {
    portals.forEach(function (p) { if (p.el && p.el.parentNode) p.el.remove(); });
    portals = [];
    var candidates = findEdgePortalCells();
    if (candidates.length < 2) return;
    for (var i = candidates.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }
    var numPairs = Math.min(Math.floor(level / 2) + 1, 3, Math.floor(candidates.length / 2));
    for (var p = 0; p < numPairs; p++) {
      var a = candidates[p * 2];
      var b = candidates[p * 2 + 1];
      var color = PORTAL_COLORS[p % PORTAL_COLORS.length];
      var portalA = makePortal(a, color, p);
      var portalB = makePortal(b, color, p);
      portalA.link = portalB;
      portalB.link = portalA;
      portals.push(portalA, portalB);
    }
  }

  function makePortal(cell, color, pairIdx) {
    var px = cell.col * CELL_SIZE + CELL_SIZE / 2;
    var py = cell.row * CELL_SIZE + CELL_SIZE / 2;
    var portal = {
      x: px, y: py,
      openRow: cell.openRow, openCol: cell.openCol,
      color: color, pairIdx: pairIdx, link: null, el: null,
    };
    var el = document.createElement("div");
    el.className = "portal";
    el.style.left = (px - 30) + "px";
    el.style.top = (py - 30) + "px";
    el.style.setProperty("--portal-color", color);
    el.innerHTML = '<span class="portal-swirl">🌀</span>';
    if (friendsContainer) friendsContainer.appendChild(el);
    portal.el = el;
    return portal;
  }

  function clearPortals() {
    portals.forEach(function (p) { if (p.el && p.el.parentNode) p.el.remove(); });
    portals = [];
  }

  function setPortalCooldown(p) {
    var pair = [p, p.link];
    pair.forEach(function (pt) {
      if (pt && pt.el) pt.el.classList.add("portal-cooldown");
    });
    setTimeout(function () {
      pair.forEach(function (pt) {
        if (pt && pt.el) pt.el.classList.remove("portal-cooldown");
      });
    }, PORTAL_COOLDOWN_MS);
  }

  function checkPortals(now) {
    if (now - lastPortalMs < PORTAL_COOLDOWN_MS) return;
    var mx = mermaid.x + mermaid.w / 2;
    var my = mermaid.y + mermaid.h / 2;
    for (var i = 0; i < portals.length; i++) {
      var p = portals[i];
      if (!p.link) continue;
      var triggerX = p.openCol * CELL_SIZE + CELL_SIZE / 2;
      var triggerY = p.openRow * CELL_SIZE + CELL_SIZE / 2;
      if (distance(mx, my, triggerX, triggerY) < PORTAL_RADIUS) {
        var dest = p.link;
        mermaid.x = dest.openCol * CELL_SIZE + (CELL_SIZE - mermaid.w) / 2;
        mermaid.y = dest.openRow * CELL_SIZE + (CELL_SIZE - mermaid.h) / 2;
        applyMermaidPosition();
        lastPortalMs = now;
        setPortalCooldown(p);
        if (audio.playSFX) audio.playSFX("powerup");
        showMeetToast("🌀 Teleported!");
        break;
      }
    }
  }

  // ---- Water Currents ----
  function corridorRun(row, col, dc, dr) {
    var len = 0;
    var r = row, c = col;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && currentMaze[r][c] === 0) {
      len++; r += dr; c += dc;
    }
    return len;
  }

  function spawnCurrents() {
    clearCurrents();
    var open = getOpenCells();
    var count = Math.floor(open.length * (0.08 + Math.random() * 0.04));
    for (var i = open.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = open[i]; open[i] = open[j]; open[j] = tmp;
    }
    var placed = 0;
    for (var k = 0; k < open.length && placed < count; k++) {
      var cell = open[k];
      var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      dirs.sort(function () { return Math.random() - 0.5; });
      var best = null, bestLen = 0;
      for (var d = 0; d < dirs.length; d++) {
        var run = corridorRun(cell.row + dirs[d][1], cell.col + dirs[d][0], dirs[d][0], dirs[d][1]);
        if (run > bestLen) { bestLen = run; best = dirs[d]; }
      }
      if (!best || bestLen < 2) continue;
      var dx = best[0], dy = best[1];
      var arrow = CURRENT_ARROWS[dx + "," + dy] || "▶";
      var el = document.createElement("div");
      el.className = "current";
      el.style.left = cell.col * CELL_SIZE + "px";
      el.style.top = cell.row * CELL_SIZE + "px";
      el.style.width = CELL_SIZE + "px";
      el.style.height = CELL_SIZE + "px";
      el.innerHTML = '<span class="current-arrow">' + arrow + '</span>';
      if (dx !== 0) el.style.setProperty("--flow-x", (dx * 12) + "px");
      if (dy !== 0) el.style.setProperty("--flow-y", (dy * 12) + "px");
      if (friendsContainer) friendsContainer.appendChild(el);
      currents.push({ row: cell.row, col: cell.col, dx: dx, dy: dy, el: el });
      placed++;
    }
  }

  function clearCurrents() {
    currents.forEach(function (c) { if (c.el && c.el.parentNode) c.el.remove(); });
    currents = [];
  }

  function applyCurrents() {
    if (isTurbo()) return;
    var cr = Math.floor((mermaid.y + mermaid.h / 2) / CELL_SIZE);
    var cc = Math.floor((mermaid.x + mermaid.w / 2) / CELL_SIZE);
    for (var i = 0; i < currents.length; i++) {
      if (currents[i].row === cr && currents[i].col === cc) {
        tryMove(currents[i].dx * CURRENT_PUSH_SPEED, currents[i].dy * CURRENT_PUSH_SPEED);
        return;
      }
    }
  }

  // ---- Keys & Locked Gates ----
  function spawnKeyGate() {
    clearKeyGate();
    if (level < 3) return;
    var open = getOpenCells();
    if (open.length < 10) return;
    var startCell = open[0];
    open.sort(function (a, b) {
      var da = Math.abs(a.col - startCell.col) + Math.abs(a.row - startCell.row);
      var db = Math.abs(b.col - startCell.col) + Math.abs(b.row - startCell.row);
      return db - da;
    });
    var gateOpenCell = null;
    var gateRow = -1, gateCol = -1;
    for (var i = 0; i < Math.min(15, open.length); i++) {
      var c = open[i];
      var adj = [[c.row-1,c.col],[c.row+1,c.col],[c.row,c.col-1],[c.row,c.col+1]];
      for (var a = 0; a < adj.length; a++) {
        var ar = adj[a][0], ac = adj[a][1];
        if (ar >= 0 && ar < ROWS && ac >= 0 && ac < COLS && currentMaze[ar][ac] === 1 && !isEdgeWall(ar, ac)) {
          gateOpenCell = c;
          gateRow = ar; gateCol = ac;
          break;
        }
      }
      if (gateOpenCell) break;
    }
    if (!gateOpenCell) return;
    for (var w = 0; w < walls.length; w++) {
      var wx = Math.round(walls[w].x / CELL_SIZE);
      var wy = Math.round(walls[w].y / CELL_SIZE);
      if (wx === gateCol && wy === gateRow) {
        walls[w].gate = true;
        gateWall = walls[w];
        var gel = document.createElement("div");
        gel.className = "maze-wall gate-wall";
        gel.style.left = walls[w].x + "px";
        gel.style.top = walls[w].y + "px";
        gel.style.width = walls[w].w + "px";
        gel.style.height = walls[w].h + "px";
        if (mazeContainer) mazeContainer.appendChild(gel);
        gateWall.gateEl = gel;
        break;
      }
    }
    var keyCandidates = open.slice().sort(function (a, b) {
      var da = Math.abs(a.col - gateCol) + Math.abs(a.row - gateRow);
      var db = Math.abs(b.col - gateCol) + Math.abs(b.row - gateRow);
      return db - da;
    });
    var keyCell = keyCandidates[Math.floor(Math.random() * Math.min(5, keyCandidates.length))];
    var kel = document.createElement("div");
    kel.className = "maze-key";
    kel.innerHTML = '<span class="key-emoji">🔑</span>';
    kel.style.left = keyCell.col * CELL_SIZE + (CELL_SIZE - 48) / 2 + "px";
    kel.style.top = keyCell.row * CELL_SIZE + (CELL_SIZE - 48) / 2 + "px";
    if (friendsContainer) friendsContainer.appendChild(kel);
    keyItem = {
      x: keyCell.col * CELL_SIZE + (CELL_SIZE - 48) / 2,
      y: keyCell.row * CELL_SIZE + (CELL_SIZE - 48) / 2,
      w: 48, h: 48, el: kel, collected: false,
    };
    hasKey = false;
  }

  function clearKeyGate() {
    if (keyItem && keyItem.el && keyItem.el.parentNode) keyItem.el.remove();
    if (gateWall && gateWall.gateEl && gateWall.gateEl.parentNode) gateWall.gateEl.remove();
    if (gateWall) gateWall.gate = false;
    keyItem = null;
    gateWall = null;
    hasKey = false;
  }

  function checkKey() {
    if (!keyItem || keyItem.collected) return;
    var mx = mermaid.x + mermaid.w / 2;
    var my = mermaid.y + mermaid.h / 2;
    var kx = keyItem.x + keyItem.w / 2;
    var ky = keyItem.y + keyItem.h / 2;
    if (distance(mx, my, kx, ky) < KEY_RADIUS) {
      hasKey = true;
      keyItem.collected = true;
      if (keyItem.el && keyItem.el.parentNode) keyItem.el.remove();
      if (audio.playSFX) audio.playSFX("collect");
      showMeetToast("🔑 Key found! Gate unlocked!");
      if (gateWall) {
        gateWall.gate = false;
        gateWall.secret = true;
        if (gateWall.gateEl) {
          gateWall.gateEl.classList.add("gate-opening");
          setTimeout(function () {
            if (gateWall && gateWall.gateEl && gateWall.gateEl.parentNode) gateWall.gateEl.remove();
          }, 600);
        }
      }
    }
  }

  // ---- Moving Walls ----
  function findMovingWallCandidates() {
    var candidates = [];
    for (var r = 1; r < ROWS - 1; r++) {
      for (var c = 1; c < COLS - 1; c++) {
        if (currentMaze[r][c] !== 1) continue;
        if (isEdgeWall(r, c)) continue;
        var horiz = (c - 1 >= 0 && currentMaze[r][c-1] === 0) && (c + 1 < COLS && currentMaze[r][c+1] === 0);
        var vert = (r - 1 >= 0 && currentMaze[r-1][c] === 0) && (r + 1 < ROWS && currentMaze[r+1][c] === 0);
        if (horiz || vert) candidates.push({ row: r, col: c });
      }
    }
    return candidates;
  }

  function spawnMovingWalls() {
    clearMovingWalls();
    if (level < 4) return;
    var candidates = findMovingWallCandidates();
    if (candidates.length === 0) return;
    for (var i = candidates.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }
    var count = Math.min(2 + Math.floor((level - 4) / 2), 4, candidates.length);
    for (var k = 0; k < count; k++) {
      var cell = candidates[k];
      for (var w = walls.length - 1; w >= 0; w--) {
        var wx = Math.round(walls[w].x / CELL_SIZE);
        var wy = Math.round(walls[w].y / CELL_SIZE);
        if (wx === cell.col && wy === cell.row && !walls[w].gate) {
          walls.splice(w, 1);
          break;
        }
      }
      var el = document.createElement("div");
      el.className = "moving-wall";
      el.style.left = cell.col * CELL_SIZE + "px";
      el.style.top = cell.row * CELL_SIZE + "px";
      el.style.width = CELL_SIZE + "px";
      el.style.height = CELL_SIZE + "px";
      if (mazeContainer) mazeContainer.appendChild(el);
      var offset = k * (MOVING_WALL_CYCLE_MS / count);
      movingWalls.push({
        row: cell.row, col: cell.col,
        x: cell.col * CELL_SIZE, y: cell.row * CELL_SIZE,
        w: CELL_SIZE, h: CELL_SIZE,
        el: el, open: false,
        lastToggle: performance.now() + offset,
      });
    }
  }

  function clearMovingWalls() {
    movingWalls.forEach(function (mw) { if (mw.el && mw.el.parentNode) mw.el.remove(); });
    movingWalls = [];
  }

  function updateMovingWalls(now) {
    for (var i = 0; i < movingWalls.length; i++) {
      var mw = movingWalls[i];
      if (now - mw.lastToggle >= MOVING_WALL_CYCLE_MS) {
        mw.open = !mw.open;
        mw.lastToggle = now;
        if (mw.el) mw.el.classList.toggle("open", mw.open);
        if (!mw.open) {
          var hb = getHitbox(mermaid.x, mermaid.y);
          if (rectOverlap(hb, mw)) {
            rescueFromWall();
          }
        }
      }
    }
  }

  function rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function getHitbox(x, y) {
    return {
      x: x + HIT_PAD,
      y: y + HIT_PAD,
      w: mermaid.w - HIT_PAD * 2,
      h: mermaid.h - HIT_PAD * 2,
    };
  }

  function tryMove(dx, dy) {
    var nx = Math.max(0, Math.min(WORLD_W - mermaid.w, mermaid.x + dx));
    var ny = Math.max(0, Math.min(WORLD_H - mermaid.h, mermaid.y + dy));
    if (!isTurbo()) {
      var hb = getHitbox(nx, ny);
      for (let i = 0; i < walls.length; i++) {
        if (walls[i].secret) continue;
        if (walls[i].gate && hasKey) continue;
        if (rectOverlap(hb, walls[i])) return;
      }
      for (let i = 0; i < movingWalls.length; i++) {
        if (movingWalls[i].open) continue;
        if (rectOverlap(hb, movingWalls[i])) return;
      }
    }
    mermaid.x = nx;
    mermaid.y = ny;
  }

  function updateCamera() {
    var cx = mermaid.x + mermaid.w / 2 - VIEW_W / 2;
    var cy = mermaid.y + mermaid.h / 2 - VIEW_H / 2;
    cameraX = Math.max(0, Math.min(WORLD_W - VIEW_W, cx));
    cameraY = Math.max(0, Math.min(WORLD_H - VIEW_H, cy));
    if (worldInner) {
      worldInner.style.transform = "translate(" + (-cameraX) + "px," + (-cameraY) + "px)";
    }
  }

  function applyMermaidPosition() {
    if (!mermaidEl) return;
    mermaidEl.style.left = mermaid.x + "px";
    mermaidEl.style.top = mermaid.y + "px";
    mermaidEl.classList.toggle("facing-left", mermaid.facing === "left");
    updateCamera();
  }

  function updateTrail() {
    trailFrame++;
    if (trailFrame % TRAIL_INTERVAL !== 0) return;
    trailPositions.push({ x: mermaid.x + mermaid.w / 2, y: mermaid.y + mermaid.h / 2 });
    if (trailPositions.length > TRAIL_MAX) trailPositions.shift();
    if (!trailContainer) return;
    trailContainer.innerHTML = "";
    for (var i = 0; i < trailPositions.length; i++) {
      var t = trailPositions[i];
      var opacity = ((i + 1) / trailPositions.length) * 0.35;
      var size = 6 + ((i + 1) / trailPositions.length) * 6;
      var dot = document.createElement("div");
      dot.className = "trail-dot";
      dot.style.left = (t.x - size / 2) + "px";
      dot.style.top = (t.y - size / 2) + "px";
      dot.style.width = size + "px";
      dot.style.height = size + "px";
      dot.style.opacity = opacity;
      trailContainer.appendChild(dot);
    }
  }

  function clearTrail() {
    trailPositions = [];
    trailFrame = 0;
    if (trailContainer) trailContainer.innerHTML = "";
  }

  function initMermaidPosition() {
    const open = getOpenCells();
    const start = open[0];
    if (start) {
      mermaid.x = start.col * CELL_SIZE + (CELL_SIZE - mermaid.w) / 2;
      mermaid.y = start.row * CELL_SIZE + (CELL_SIZE - mermaid.h) / 2;
      mermaid.x = Math.max(0, Math.min(WORLD_W - mermaid.w, mermaid.x));
      mermaid.y = Math.max(0, Math.min(WORLD_H - mermaid.h, mermaid.y));
    }
    applyMermaidPosition();
  }

  function spawnFriend() {
    const open = getOpenCells();
    if (open.length === 0) return;
    const typeInfo = FRIENDS[Math.floor(Math.random() * FRIENDS.length)];
    const cell = open[Math.floor(Math.random() * open.length)];
    const friend = {
      id: "f-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      type: typeInfo.type,
      emoji: typeInfo.emoji,
      name: typeInfo.name,
      greeting: typeInfo.greeting,
      x: cell.col * CELL_SIZE + (CELL_SIZE - 48) / 2,
      y: cell.row * CELL_SIZE + (CELL_SIZE - 48) / 2,
      w: 48,
      h: 48,
      saved: false,
    };

    const el = document.createElement("div");
    el.className = "friend";
    el.id = friend.id;
    el.dataset.type = friend.type;
    el.style.left = friend.x + "px";
    el.style.top = friend.y + "px";
    el.innerHTML = '<span class="sprite">' + friend.emoji + "</span>";
    if (friendsContainer) friendsContainer.appendChild(el);
    friend.el = el;
    friends.push(friend);
  }

  function removeFriend(friend) {
    if (friend.el && friend.el.parentNode) friend.el.remove();
    friends = friends.filter(function (f) { return f.id !== friend.id; });
  }

  function spawnCollectible() {
    var open = getOpenCells();
    if (open.length === 0) return;
    var info = COLLECTIBLE_TYPES[Math.floor(Math.random() * COLLECTIBLE_TYPES.length)];
    var cell = open[Math.floor(Math.random() * open.length)];
    var c = {
      id: "c-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      emoji: info.emoji,
      name: info.name,
      time: info.time,
      x: cell.col * CELL_SIZE + (CELL_SIZE - 36) / 2,
      y: cell.row * CELL_SIZE + (CELL_SIZE - 36) / 2,
      w: 36,
      h: 36,
    };
    var el = document.createElement("div");
    el.className = "collectible";
    el.id = c.id;
    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
    el.innerHTML = '<span class="collectible-emoji">' + c.emoji + "</span>";
    if (friendsContainer) friendsContainer.appendChild(el);
    c.el = el;
    collectibles.push(c);
  }

  function removeCollectible(c) {
    if (c.el && c.el.parentNode) c.el.remove();
    collectibles = collectibles.filter(function (x) { return x.id !== c.id; });
  }

  function checkCollectibles() {
    var mx = mermaid.x + mermaid.w / 2;
    var my = mermaid.y + mermaid.h / 2;
    collectibles.forEach(function (c) {
      var cx = c.x + c.w / 2;
      var cy = c.y + c.h / 2;
      if (distance(mx, my, cx, cy) < COLLECT_RADIUS) {
        timeLeftSec += c.time;
        if (audio.playSFX) audio.playSFX("collect");
        showMeetToast("+" + c.time + "s from " + c.name + "!");
        removeCollectible(c);
      }
    });
  }

  function getLevelHazardCount(lvl) { return Math.min(lvl + 1, 12); }

  function findPatrolPath(startCol, startRow) {
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    dirs.sort(function () { return Math.random() - 0.5; });
    for (var d = 0; d < dirs.length; d++) {
      var dc = dirs[d][0], dr = dirs[d][1];
      var len = 0;
      var c = startCol + dc, r = startRow + dr;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && currentMaze[r][c] === 0) {
        len++;
        c += dc;
        r += dr;
      }
      if (len >= 2) return { dc: dc, dr: dr, len: len };
    }
    return { dc: 1, dr: 0, len: 1 };
  }

  function spawnHazards() {
    hazards.forEach(function (h) { if (h.el && h.el.parentNode) h.el.remove(); });
    hazards = [];
    var count = getLevelHazardCount(level);
    var open = getOpenCells();
    for (var i = 0; i < count && open.length > 0; i++) {
      var idx = Math.floor(Math.random() * open.length);
      var cell = open.splice(idx, 1)[0];
      var patrol = findPatrolPath(cell.col, cell.row);
      var h = {
        x: cell.col * CELL_SIZE + (CELL_SIZE - 48) / 2,
        y: cell.row * CELL_SIZE + (CELL_SIZE - 48) / 2,
        w: 48, h: 48,
        startX: cell.col * CELL_SIZE + (CELL_SIZE - 48) / 2,
        startY: cell.row * CELL_SIZE + (CELL_SIZE - 48) / 2,
        dc: patrol.dc, dr: patrol.dr,
        dist: patrol.len * CELL_SIZE,
        traveled: 0,
        dir: 1,
      };
      var el = document.createElement("div");
      el.className = "hazard";
      el.innerHTML = '<span class="hazard-emoji">🪼</span>';
      el.style.left = h.x + "px";
      el.style.top = h.y + "px";
      if (friendsContainer) friendsContainer.appendChild(el);
      h.el = el;
      hazards.push(h);
    }
  }

  function updateHazards() {
    hazards.forEach(function (h) {
      var step = HAZARD_SPEED + (level - 1) * 0.3;
      h.traveled += step;
      if (h.traveled >= h.dist) {
        h.traveled = 0;
        h.dir *= -1;
      }
      h.x = h.startX + h.dc * h.traveled * h.dir;
      h.y = h.startY + h.dr * h.traveled * h.dir;
      if (h.el) {
        h.el.style.left = h.x + "px";
        h.el.style.top = h.y + "px";
      }
    });
  }

  function relocateHazard(h) {
    var open = getOpenCells();
    if (open.length === 0) return;
    var mx = mermaid.x + mermaid.w / 2;
    var my = mermaid.y + mermaid.h / 2;
    open.sort(function (a, b) {
      var da = distance(mx, my, a.col * CELL_SIZE + CELL_SIZE / 2, a.row * CELL_SIZE + CELL_SIZE / 2);
      var db = distance(mx, my, b.col * CELL_SIZE + CELL_SIZE / 2, b.row * CELL_SIZE + CELL_SIZE / 2);
      return db - da;
    });
    var pick = open[Math.floor(Math.random() * Math.min(5, open.length))];
    var patrol = findPatrolPath(pick.col, pick.row);
    h.startX = pick.col * CELL_SIZE + (CELL_SIZE - h.w) / 2;
    h.startY = pick.row * CELL_SIZE + (CELL_SIZE - h.h) / 2;
    h.x = h.startX;
    h.y = h.startY;
    h.dc = patrol.dc;
    h.dr = patrol.dr;
    h.dist = patrol.len * CELL_SIZE;
    h.traveled = 0;
    h.dir = 1;
    if (h.el) {
      h.el.style.left = h.x + "px";
      h.el.style.top = h.y + "px";
    }
  }

  function checkHazards(now) {
    if (now < stunEndMs) return;
    if (isTurbo()) return;
    var mx = mermaid.x + mermaid.w / 2;
    var my = mermaid.y + mermaid.h / 2;
    for (var i = 0; i < hazards.length; i++) {
      var h = hazards[i];
      var hx = h.x + h.w / 2;
      var hy = h.y + h.h / 2;
      if (distance(mx, my, hx, hy) < MEET_RADIUS) {
        stunEndMs = now + STUN_DURATION;
        timeLeftSec = Math.max(0, timeLeftSec - STUN_TIME_PENALTY);
        if (audio.playSFX) audio.playSFX("zap");
        showMeetToast("Zapped! -" + STUN_TIME_PENALTY + "s");
        if (gameWorld) gameWorld.classList.add("shake");
        setTimeout(function () { if (gameWorld) gameWorld.classList.remove("shake"); }, 300);
        if (mermaidEl) mermaidEl.classList.add("stunned");
        setTimeout(function () { if (mermaidEl) mermaidEl.classList.remove("stunned"); }, STUN_DURATION);
        relocateHazard(h);
        break;
      }
    }
  }

  function spawnPowerup() {
    var open = getOpenCells();
    if (open.length === 0) return;
    var info = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    var cell = open[Math.floor(Math.random() * open.length)];
    var p = {
      id: "p-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      type: info.type, emoji: info.emoji, name: info.name, duration: info.duration,
      x: cell.col * CELL_SIZE + (CELL_SIZE - 40) / 2,
      y: cell.row * CELL_SIZE + (CELL_SIZE - 40) / 2,
      w: 40, h: 40,
    };
    var el = document.createElement("div");
    el.className = "powerup";
    el.dataset.type = p.type;
    el.id = p.id;
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.innerHTML = '<span class="powerup-emoji">' + p.emoji + "</span>";
    if (friendsContainer) friendsContainer.appendChild(el);
    p.el = el;
    powerups.push(p);
  }

  function spawnTurboChest() {
    var open = getOpenCells();
    if (open.length === 0) return;
    var turboInfo = POWERUP_TYPES[POWERUP_TYPES.length - 1];
    var cell = open[Math.floor(Math.random() * open.length)];
    var p = {
      id: "p-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      type: turboInfo.type, emoji: turboInfo.emoji, name: turboInfo.name, duration: turboInfo.duration,
      x: cell.col * CELL_SIZE + (CELL_SIZE - 40) / 2,
      y: cell.row * CELL_SIZE + (CELL_SIZE - 40) / 2,
      w: 40, h: 40,
    };
    var el = document.createElement("div");
    el.className = "powerup turbo-chest";
    el.dataset.type = p.type;
    el.id = p.id;
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.innerHTML = '<span class="powerup-emoji">' + p.emoji + "</span>";
    if (friendsContainer) friendsContainer.appendChild(el);
    p.el = el;
    powerups.push(p);
  }

  function removePowerup(p) {
    if (p.el && p.el.parentNode) p.el.remove();
    powerups = powerups.filter(function (x) { return x.id !== p.id; });
  }

  function checkPowerups(now) {
    var mx = mermaid.x + mermaid.w / 2;
    var my = mermaid.y + mermaid.h / 2;
    powerups.forEach(function (p) {
      var px = p.x + p.w / 2;
      var py = p.y + p.h / 2;
      if (distance(mx, my, px, py) < POWERUP_RADIUS) {
        var wasTurbo = activePowerup === "turbo";
        if (wasTurbo && mermaidEl) mermaidEl.classList.remove("turbo");
        activePowerup = p.type;
        powerupEndMs = now + p.duration;
        if (wasTurbo && p.type !== "turbo") rescueFromWall();
        if (p.type === "turbo") {
          if (audio.playSFX) audio.playSFX("turbo");
          if (mermaidEl) mermaidEl.classList.add("turbo");
        } else {
          if (audio.playSFX) audio.playSFX("powerup");
        }
        showMeetToast(p.emoji + " " + p.name + " activated!");
        if (powerupIndicator) { powerupIndicator.classList.remove("hidden"); powerupIndicator.dataset.type = p.type; }
        if (powerupIcon) powerupIcon.textContent = p.emoji;
        removePowerup(p);
      }
    });
  }

  function isInsideWall() {
    var hb = getHitbox(mermaid.x, mermaid.y);
    for (var i = 0; i < walls.length; i++) {
      if (walls[i].secret) continue;
      if (walls[i].gate && hasKey) continue;
      if (rectOverlap(hb, walls[i])) return true;
    }
    for (var i = 0; i < movingWalls.length; i++) {
      if (movingWalls[i].open) continue;
      if (rectOverlap(hb, movingWalls[i])) return true;
    }
    return false;
  }

  function rescueFromWall() {
    if (!isInsideWall()) return;
    var open = getOpenCells();
    if (open.length === 0) return;
    var mx = mermaid.x + mermaid.w / 2;
    var my = mermaid.y + mermaid.h / 2;
    var bestDist = Infinity;
    var bestCell = null;
    for (var i = 0; i < open.length; i++) {
      var cx = open[i].col * CELL_SIZE + CELL_SIZE / 2;
      var cy = open[i].row * CELL_SIZE + CELL_SIZE / 2;
      var d = distance(mx, my, cx, cy);
      if (d < bestDist) { bestDist = d; bestCell = open[i]; }
    }
    if (bestCell) {
      mermaid.x = bestCell.col * CELL_SIZE + (CELL_SIZE - mermaid.w) / 2;
      mermaid.y = bestCell.row * CELL_SIZE + (CELL_SIZE - mermaid.h) / 2;
      applyMermaidPosition();
    }
  }

  function updatePowerup(now) {
    if (!activePowerup) return;
    if (now >= powerupEndMs) {
      var wasTurbo = activePowerup === "turbo";
      if (wasTurbo && mermaidEl) mermaidEl.classList.remove("turbo");
      activePowerup = null;
      if (powerupIndicator) powerupIndicator.classList.add("hidden");
      if (wasTurbo) rescueFromWall();
      return;
    }
    var secsLeft = Math.ceil((powerupEndMs - now) / 1000);
    if (powerupTimerEl) powerupTimerEl.textContent = secsLeft + "s";
  }

  function getEffectiveSpeed() {
    if (activePowerup === "turbo") return SPEED * TURBO_SPEED_MULT;
    if (activePowerup === "speed") return SPEED * 2;
    return SPEED;
  }

  function isTurbo() {
    return activePowerup === "turbo";
  }

  function getEffectiveMeetRadius() {
    return activePowerup === "magnet" ? MAGNET_RADIUS : MEET_RADIUS;
  }

  function isTimeFrozen() {
    return activePowerup === "freeze";
  }

  const PARTICLE_EMOJIS = ["💖", "✨", "🫧", "⭐", "💕", "🌟"];
  function spawnParticles(x, y) {
    var count = 10;
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
      var dist = 40 + Math.random() * 40;
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist;
      var emoji = PARTICLE_EMOJIS[Math.floor(Math.random() * PARTICLE_EMOJIS.length)];
      var el = document.createElement("div");
      el.className = "particle";
      el.textContent = emoji;
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.setProperty("--dx", dx + "px");
      el.style.setProperty("--dy", dy + "px");
      if (friendsContainer) friendsContainer.appendChild(el);
      (function (e) {
        setTimeout(function () { if (e.parentNode) e.remove(); }, 700);
      })(el);
    }
  }

  function showMeetToast(greeting) {
    if (!meetToast || !meetToastMsg) return;
    if (toastTimer) clearTimeout(toastTimer);
    meetToastMsg.textContent = greeting;
    meetToast.classList.remove("hidden");
    toastTimer = setTimeout(function () {
      meetToast.classList.add("hidden");
    }, 3000);
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function checkSaveFriend() {
    const mx = mermaid.x + mermaid.w / 2;
    const my = mermaid.y + mermaid.h / 2;
    var goal = getLevelGoal(level);
    friends.forEach(function (friend) {
      if (friend.saved) return;
      const fx = friend.x + friend.w / 2;
      const fy = friend.y + friend.h / 2;
      if (distance(mx, my, fx, fy) < getEffectiveMeetRadius()) {
        friend.saved = true;
        friendsSaved++;
        totalFriendsSaved++;
        if (friendsCountEl) friendsCountEl.textContent = friendsSaved;
        spawnParticles(fx, fy);
        if (audio.playSFX) audio.playSFX("save");
        showMeetToast(friend.greeting);
        setTimeout(function () {
          removeFriend(friend);
        }, 400);
        if (friendsSaved >= goal) {
          showLevelComplete();
        }
      }
    });
  }

  function showLevelComplete() {
    levelPaused = true;
    if (spawnTimer != null) clearTimeout(spawnTimer);
    var totalTime = getLevelTime(level);
    var timeUsed = totalTime - timeLeftSec;
    var stars = calcStars(level, timeUsed, totalTime);
    var starDisplay = document.getElementById("star-display");
    if (starDisplay) starDisplay.textContent = "⭐".repeat(stars) + "☆".repeat(3 - stars);
    if (levelCompleteTitleEl) levelCompleteTitleEl.textContent = "Level " + level + " complete!";
    if (levelCompleteSubEl) levelCompleteSubEl.textContent = "Get ready for Level " + (level + 1) + " — save " + getLevelGoal(level + 1) + " friends!";
    saveBest(level, totalFriendsSaved);
    if (audio.playSFX) audio.playSFX("levelup");
    if (levelCompleteEl) levelCompleteEl.classList.remove("hidden");
    if (nextLevelBtn) nextLevelBtn.focus();
  }

  function playTransition(callback) {
    if (!levelTransition) { callback(); return; }
    levelTransition.classList.remove("hidden");
    levelTransition.classList.add("wipe-in");
    setTimeout(function () {
      callback();
      levelTransition.classList.remove("wipe-in");
      levelTransition.classList.add("wipe-out");
      setTimeout(function () {
        levelTransition.classList.remove("wipe-out");
        levelTransition.classList.add("hidden");
      }, 400);
    }, 400);
  }

  function advanceLevel() {
    if (levelCompleteEl) levelCompleteEl.classList.add("hidden");
    playTransition(function () { doAdvanceLevel(); });
  }

  function doAdvanceLevel() {
    level++;
    levelPaused = false;
    friendsSaved = 0;
    var goal = getLevelGoal(level);
    var timeSec = getLevelTime(level);
    timeLeftSec = timeSec;
    lastTimeMs = performance.now();
    if (friendsCountEl) friendsCountEl.textContent = "0";
    if (friendsGoalEl) friendsGoalEl.textContent = goal;
    if (levelNumEl) levelNumEl.textContent = level;
    if (timerEl) { timerEl.textContent = Math.ceil(timeSec); timerEl.classList.remove("low"); }
    friends.forEach(function (f) { removeFriend(f); });
    friends = [];
    collectibles.forEach(function (c) { removeCollectible(c); });
    collectibles = [];
    if (collectibleTimer) clearTimeout(collectibleTimer);
    hazards.forEach(function (h) { if (h.el && h.el.parentNode) h.el.remove(); });
    hazards = [];
    stunEndMs = 0;
    powerups.forEach(function (p) { removePowerup(p); });
    powerups = [];
    activePowerup = null;
    powerupEndMs = 0;
    if (powerupIndicator) powerupIndicator.classList.add("hidden");
    if (mermaidEl) mermaidEl.classList.remove("turbo");
    clearTrail();
    clearPortals();
    clearCurrents();
    clearMovingWalls();
    clearKeyGate();
    selectMaze(level);
    applyBiome(level);
    buildWalls();
    renderMaze();
    spawnPortals();
    spawnCurrents();
    spawnMovingWalls();
    spawnKeyGate();
    initMermaidPosition();
    startSpawning();
    if (gameWorld) gameWorld.focus();
  }

  function endGame() {
    gameOver = true;
    if (animId != null) cancelAnimationFrame(animId);
    if (spawnTimer != null) clearTimeout(spawnTimer);
    if (collectibleTimer != null) clearTimeout(collectibleTimer);
    if (finalCountEl) finalCountEl.textContent = totalFriendsSaved;
    if (finalLevelEl) finalLevelEl.textContent = level;
    var best = saveBest(level, totalFriendsSaved);
    if (audio.playSFX) audio.playSFX("gameover");
    var blEnd = document.getElementById("best-level-end");
    var bfEnd = document.getElementById("best-friends-end");
    if (blEnd) blEnd.textContent = best.level;
    if (bfEnd) bfEnd.textContent = best.friends;
    var continueLevelEl = document.getElementById("continue-level");
    if (continueLevelEl) continueLevelEl.textContent = level;
    if (gameOverEl) gameOverEl.classList.remove("hidden");
    if (minimapCanvas) minimapCanvas.classList.remove("visible");
    var continueBtn = document.getElementById("continue-btn");
    if (continueBtn) continueBtn.focus();
  }

  function startTimer() {
    lastTimeMs = performance.now();
  }

  function updateTimer(now) {
    if (!gameStarted || gameOver || levelPaused || !lastTimeMs) return;
    const elapsed = (now - lastTimeMs) / 1000;
    lastTimeMs = now;
    if (!isTimeFrozen()) {
      timeLeftSec = Math.max(0, timeLeftSec - elapsed);
    }
    if (timerEl) {
      timerEl.textContent = Math.ceil(timeLeftSec);
      timerEl.classList.toggle("low", timeLeftSec <= 15);
    }
    if (timeLeftSec <= 0) endGame();
  }

  function gameLoop(now) {
    if (lastTimeMs == null) lastTimeMs = now;
    if (!gameStarted) {
      var shouldStart = window.__TURTLE_GAME_START;
      if (!shouldStart) {
        var screen = document.getElementById("start-screen");
        if (screen && screen.style.display === "none") shouldStart = true;
      }
      if (shouldStart) {
        gameStarted = true;
        window.__TURTLE_GAME_START = false;
        startTimer();
        startSpawning();
      }
    }
    updateTimer(now);

    if (gameStarted && !gameOver && !levelPaused) {
      var isStunned = now < stunEndMs;
      var spd = getEffectiveSpeed();
      if (!isStunned) {
        if (keys.ArrowLeft) {
          tryMove(-spd, 0);
          mermaid.facing = "left";
        }
        if (keys.ArrowRight) {
          tryMove(spd, 0);
          mermaid.facing = "right";
        }
        if (keys.ArrowUp) tryMove(0, -spd);
        if (keys.ArrowDown) tryMove(0, spd);
      }
      applyCurrents();
      updateHazards();
      updateMovingWalls(now);
      applyMermaidPosition();
      updateTrail();
      checkSaveFriend();
      checkCollectibles();
      checkKey();
      checkPowerups(now);
      updatePowerup(now);
      checkHazards(now);
      checkPortals(now);
      drawMinimap();
    }
    animId = requestAnimationFrame(gameLoop);
  }

  function startSpawning() {
    var max = getLevelMaxFriends(level);
    function tick() {
      if (!gameStarted || gameOver || levelPaused) return;
      if (friends.length < max) spawnFriend();
      spawnTimer = setTimeout(tick, SPAWN_INTERVAL_MS);
    }
    var initial = Math.min(getLevelGoal(level) + 1, max);
    for (let i = 0; i < initial; i++) spawnFriend();
    spawnTimer = setTimeout(tick, SPAWN_INTERVAL_MS);
    spawnHazards();
    spawnCollectible();
    if (level >= 3) spawnPowerup();
    if (level >= 2) spawnTurboChest();
    function ctick() {
      if (!gameStarted || gameOver || levelPaused) return;
      if (collectibles.length < 3) spawnCollectible();
      collectibleTimer = setTimeout(ctick, COLLECTIBLE_INTERVAL_MS);
    }
    collectibleTimer = setTimeout(ctick, COLLECTIBLE_INTERVAL_MS);
  }

  function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    var startLvl = window.__START_LEVEL || 1;
    level = startLvl;
    friendsSaved = 0;
    totalFriendsSaved = 0;
    timeLeftSec = getLevelTime(level);
    if (friendsCountEl) friendsCountEl.textContent = "0";
    if (friendsGoalEl) friendsGoalEl.textContent = getLevelGoal(level);
    if (levelNumEl) levelNumEl.textContent = level;
    if (timerEl) { timerEl.textContent = Math.ceil(timeLeftSec); timerEl.classList.remove("low"); }
    var screen = document.getElementById("start-screen");
    if (screen) { screen.style.display = "none"; screen.classList.add("hidden"); }
    var hint = document.getElementById("controls-hint");
    if (hint) { hint.classList.remove("hidden"); }
    if (minimapCanvas) minimapCanvas.classList.add("visible");
    selectMaze(level);
    applyBiome(level);
    buildWalls();
    renderMaze();
    spawnPortals();
    spawnCurrents();
    spawnMovingWalls();
    spawnKeyGate();
    initMermaidPosition();
    if (audio.startMusic) audio.startMusic();
    if (gameWorld) { gameWorld.focus(); }
    startTimer();
    startSpawning();
  }
  window.__startTurtleGame = startGame;

  function continueGame() {
    gameOver = false;
    gameStarted = true;
    levelPaused = false;
    friendsSaved = 0;
    timeLeftSec = getLevelTime(level);
    lastTimeMs = null;
    if (friendsCountEl) friendsCountEl.textContent = "0";
    if (friendsGoalEl) friendsGoalEl.textContent = getLevelGoal(level);
    if (levelNumEl) levelNumEl.textContent = level;
    if (timerEl) {
      timerEl.textContent = Math.ceil(timeLeftSec);
      timerEl.classList.remove("low");
    }
    friends.forEach(function (f) { removeFriend(f); });
    friends = [];
    collectibles.forEach(function (c) { removeCollectible(c); });
    collectibles = [];
    if (collectibleTimer) clearTimeout(collectibleTimer);
    hazards.forEach(function (h) { if (h.el && h.el.parentNode) h.el.remove(); });
    hazards = [];
    stunEndMs = 0;
    powerups.forEach(function (p) { removePowerup(p); });
    powerups = [];
    activePowerup = null;
    powerupEndMs = 0;
    if (powerupIndicator) powerupIndicator.classList.add("hidden");
    if (mermaidEl) mermaidEl.classList.remove("turbo");
    clearTrail();
    clearPortals();
    clearCurrents();
    clearMovingWalls();
    clearKeyGate();
    selectMaze(level);
    applyBiome(level);
    buildWalls();
    renderMaze();
    spawnPortals();
    spawnCurrents();
    spawnMovingWalls();
    spawnKeyGate();
    initMermaidPosition();
    startSpawning();
    startTimer();
    if (gameOverEl) gameOverEl.classList.add("hidden");
    if (minimapCanvas) minimapCanvas.classList.add("visible");
    if (gameWorld) gameWorld.focus();
    animId = requestAnimationFrame(gameLoop);
  }

  function resetGame() {
    gameOver = false;
    gameStarted = true;
    levelPaused = false;
    level = 1;
    friendsSaved = 0;
    totalFriendsSaved = 0;
    timeLeftSec = getLevelTime(1);
    lastTimeMs = null;
    if (friendsCountEl) friendsCountEl.textContent = "0";
    if (friendsGoalEl) friendsGoalEl.textContent = getLevelGoal(1);
    if (levelNumEl) levelNumEl.textContent = "1";
    if (timerEl) {
      timerEl.textContent = Math.ceil(timeLeftSec);
      timerEl.classList.remove("low");
    }
    friends.forEach(function (f) { removeFriend(f); });
    friends = [];
    collectibles.forEach(function (c) { removeCollectible(c); });
    collectibles = [];
    if (collectibleTimer) clearTimeout(collectibleTimer);
    hazards.forEach(function (h) { if (h.el && h.el.parentNode) h.el.remove(); });
    hazards = [];
    stunEndMs = 0;
    powerups.forEach(function (p) { removePowerup(p); });
    powerups = [];
    activePowerup = null;
    powerupEndMs = 0;
    if (powerupIndicator) powerupIndicator.classList.add("hidden");
    if (mermaidEl) mermaidEl.classList.remove("turbo");
    clearTrail();
    clearPortals();
    clearCurrents();
    clearMovingWalls();
    clearKeyGate();
    var emoji = document.querySelector('.mermaid-emoji.player-emoji');
    if (emoji && window.__GAME_CHAR) emoji.textContent = window.__GAME_CHAR;
    selectMaze(1);
    applyBiome(1);
    buildWalls();
    renderMaze();
    spawnPortals();
    spawnCurrents();
    spawnMovingWalls();
    spawnKeyGate();
    initMermaidPosition();
    startSpawning();
    startTimer();
    if (gameOverEl) gameOverEl.classList.add("hidden");
    if (minimapCanvas) minimapCanvas.classList.add("visible");
    if (gameWorld) gameWorld.focus();
  }


  function drawMinimap() {
    if (!minimapCtx) return;
    var mc = MINIMAP_CELL;
    minimapCtx.clearRect(0, 0, COLS * mc, ROWS * mc);
    for (var r = 0; r < ROWS; r++) {
      for (var col = 0; col < COLS; col++) {
        minimapCtx.fillStyle = currentMaze[r][col] === 1 ? "#5c4033" : "rgba(13,40,71,0.6)";
        minimapCtx.fillRect(col * mc, r * mc, mc, mc);
      }
    }
    hazards.forEach(function (hz) {
      var hx = Math.floor((hz.x + hz.w / 2) / CELL_SIZE);
      var hy = Math.floor((hz.y + hz.h / 2) / CELL_SIZE);
      minimapCtx.fillStyle = "#e07a5f";
      minimapCtx.beginPath();
      minimapCtx.arc(hx * mc + mc / 2, hy * mc + mc / 2, mc * 0.5, 0, Math.PI * 2);
      minimapCtx.fill();
    });
    collectibles.forEach(function (ci) {
      var cx = Math.floor((ci.x + ci.w / 2) / CELL_SIZE);
      var cy = Math.floor((ci.y + ci.h / 2) / CELL_SIZE);
      minimapCtx.fillStyle = "#5ec4e8";
      minimapCtx.beginPath();
      minimapCtx.arc(cx * mc + mc / 2, cy * mc + mc / 2, mc * 0.4, 0, Math.PI * 2);
      minimapCtx.fill();
    });
    currents.forEach(function (cu) {
      minimapCtx.fillStyle = "rgba(56,189,248,0.25)";
      minimapCtx.fillRect(cu.col * mc, cu.row * mc, mc, mc);
    });
    movingWalls.forEach(function (mw) {
      minimapCtx.fillStyle = mw.open ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.6)";
      minimapCtx.fillRect(mw.col * mc, mw.row * mc, mc, mc);
    });
    if (keyItem && !keyItem.collected) {
      var kcx = Math.floor((keyItem.x + keyItem.w / 2) / CELL_SIZE);
      var kcy = Math.floor((keyItem.y + keyItem.h / 2) / CELL_SIZE);
      minimapCtx.fillStyle = "#fbbf24";
      minimapCtx.beginPath();
      minimapCtx.arc(kcx * mc + mc / 2, kcy * mc + mc / 2, mc * 0.6, 0, Math.PI * 2);
      minimapCtx.fill();
    }
    if (gateWall && gateWall.gate) {
      var gcx = Math.round(gateWall.x / CELL_SIZE);
      var gcy = Math.round(gateWall.y / CELL_SIZE);
      minimapCtx.fillStyle = "#d97706";
      minimapCtx.fillRect(gcx * mc, gcy * mc, mc, mc);
    }
    portals.forEach(function (pt) {
      var ptx = pt.x / CELL_SIZE * mc;
      var pty = pt.y / CELL_SIZE * mc;
      minimapCtx.fillStyle = pt.color;
      minimapCtx.beginPath();
      minimapCtx.arc(ptx, pty, mc * 0.7, 0, Math.PI * 2);
      minimapCtx.fill();
    });
    friends.forEach(function (f) {
      if (f.saved) return;
      var fx = Math.floor((f.x + f.w / 2) / CELL_SIZE);
      var fy = Math.floor((f.y + f.h / 2) / CELL_SIZE);
      minimapCtx.fillStyle = "#f2cc8f";
      minimapCtx.beginPath();
      minimapCtx.arc(fx * mc + mc / 2, fy * mc + mc / 2, mc * 0.6, 0, Math.PI * 2);
      minimapCtx.fill();
    });
    var px = (mermaid.x + mermaid.w / 2) / CELL_SIZE * mc;
    var py = (mermaid.y + mermaid.h / 2) / CELL_SIZE * mc;
    minimapCtx.fillStyle = "#81b29a";
    minimapCtx.beginPath();
    minimapCtx.arc(px, py, mc * 0.8, 0, Math.PI * 2);
    minimapCtx.fill();
    minimapCtx.fillStyle = "#fff";
    minimapCtx.beginPath();
    minimapCtx.arc(px, py, mc * 0.35, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  if (nextLevelBtn) nextLevelBtn.addEventListener("click", function () {
    advanceLevel();
  });

  function bindStartButton() {
    var btn = document.getElementById("start-btn");
    if (!btn) return;
    btn.onclick = function (e) { e.preventDefault(); startGame(); return false; };
    btn.ontouchend = function (e) { e.preventDefault(); startGame(); return false; };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindStartButton);
  } else {
    bindStartButton();
  }

  if (playAgainBtn) playAgainBtn.addEventListener("click", function () {
    gameOver = false;
    gameStarted = false;
    levelPaused = false;
    lastTimeMs = null;
    friends.forEach(function (f) { removeFriend(f); });
    friends = [];
    collectibles.forEach(function (c) { removeCollectible(c); });
    collectibles = [];
    if (collectibleTimer) clearTimeout(collectibleTimer);
    if (spawnTimer) clearTimeout(spawnTimer);
    hazards.forEach(function (h) { if (h.el && h.el.parentNode) h.el.remove(); });
    hazards = [];
    stunEndMs = 0;
    powerups.forEach(function (p) { removePowerup(p); });
    powerups = [];
    activePowerup = null;
    powerupEndMs = 0;
    if (powerupIndicator) powerupIndicator.classList.add("hidden");
    if (mermaidEl) mermaidEl.classList.remove("turbo");
    clearTrail();
    clearPortals();
    clearCurrents();
    clearMovingWalls();
    clearKeyGate();
    if (gameOverEl) gameOverEl.classList.add("hidden");
    if (minimapCanvas) minimapCanvas.classList.remove("visible");
    window.__START_LEVEL = 1;
    var display = document.getElementById("start-level-display");
    if (display) display.textContent = "1";
    showBest();
    var screen = document.getElementById("start-screen");
    if (screen) { screen.style.display = ""; screen.classList.remove("hidden"); }
  });

  var continueBtn = document.getElementById("continue-btn");
  if (continueBtn) continueBtn.addEventListener("click", function () {
    continueGame();
  });

  document.addEventListener("keydown", function (e) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      keys[e.key] = true;
    }
  });
  document.addEventListener("keyup", function (e) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      keys[e.key] = false;
    }
  });

  let touchStartX = 0, touchStartY = 0, mermaidStartX = 0, mermaidStartY = 0;
  if (mermaidEl) mermaidEl.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    mermaidStartX = mermaid.x;
    mermaidStartY = mermaid.y;
  }, { passive: false });
  if (mermaidEl) mermaidEl.addEventListener("touchmove", function (e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    let nx = mermaidStartX + dx;
    let ny = mermaidStartY + dy;
    if (!isTurbo()) {
      var hb = getHitbox(nx, ny);
      var blocked = false;
      for (let i = 0; i < walls.length; i++) {
        if (walls[i].secret) continue;
        if (walls[i].gate && hasKey) continue;
        if (rectOverlap(hb, walls[i])) { blocked = true; break; }
      }
      if (!blocked) {
        for (let i = 0; i < movingWalls.length; i++) {
          if (movingWalls[i].open) continue;
          if (rectOverlap(hb, movingWalls[i])) { blocked = true; break; }
        }
      }
      if (blocked) { nx = mermaid.x; ny = mermaid.y; }
    }
    nx = Math.max(0, Math.min(WORLD_W - mermaid.w, nx));
    ny = Math.max(0, Math.min(WORLD_H - mermaid.h, ny));
    mermaid.x = nx;
    mermaid.y = ny;
    mermaid.facing = dx < 0 ? "left" : "right";
    applyMermaidPosition();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    mermaidStartX = mermaid.x;
    mermaidStartY = mermaid.y;
  }, { passive: false });

  if (gameWorld) {
    gameWorld.style.width = VIEW_W + "px";
    gameWorld.style.height = VIEW_H + "px";
  }
  if (worldInner) {
    worldInner.style.width = WORLD_W + "px";
    worldInner.style.height = WORLD_H + "px";
  }

  var audio = window.__oceanAudio || {};

  var muteBtn = document.getElementById("mute-btn");
  if (muteBtn) {
    muteBtn.addEventListener("click", function () {
      if (audio.toggleMute) {
        var m = audio.toggleMute();
        muteBtn.textContent = m ? "🔇" : "🔊";
      }
    });
  }

  function initAndStart() {
    try {
      showBest();
      selectMaze(1);
      buildWalls();
      renderMaze();
      spawnPortals();
      spawnCurrents();
      spawnMovingWalls();
      spawnKeyGate();
      initMermaidPosition();
    } catch (e) {
      console.error("Game init error:", e);
    }
    window.__startTurtleGame = startGame;
    gameLoop(performance.now());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAndStart);
  } else {
    initAndStart();
  }
})();
