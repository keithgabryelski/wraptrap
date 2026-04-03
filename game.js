// WrapTrap
// Written by Keith Gabryelski <keith@gabryelski.com>

// Game Constants
const CELL_SIZE = 20;
const BORDER_THICKNESS = 2;
const TICK_PERIOD = 100; // milliseconds
const GROWTH_RATE = 3; // frames

// Direction vectors
const DIR = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

// Game State
const GameState = {
  SPLASH: "splash",
  OPTIONS: "options",
  PLAYING: "playing",
  GAMEOVER: "gameover",
};

class WrapTrap {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d");

    // Game options
    this.gridWidth = 30;
    this.gridHeight = 30;
    this.useFullWidth = false;
    this.wrapEdges = true;
    this.growthMode = "periodic"; // 'periodic' or 'continuous'
    this.twoPlayerMode = false;

    // Game state
    this.state = GameState.SPLASH;
    this.paused = false;
    this.gameOver = false;
    this.winner = null;
    this.frameCount = 0;
    this.gameLoop = null;

    // Players
    this.player1 = { body: [], direction: DIR.RIGHT, alive: true };
    this.player2 = { body: [], direction: DIR.LEFT, alive: true };
    this.aiMoveHistory = [];

    // Options menu
    this.optionsSelection = 0;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupTouchControls();
    this.showScreen("splash-screen");
    this.drawPreview();
  }

  setupEventListeners() {
    // Keyboard
    document.addEventListener("keydown", (e) => this.handleKeyPress(e));

    // Buttons
    document
      .getElementById("start-button")
      .addEventListener("click", () => this.startGame());
    document
      .getElementById("options-button")
      .addEventListener("click", () => this.showOptions());
    document
      .getElementById("restart-button")
      .addEventListener("click", () => this.restartGame());
    document
      .getElementById("quit-button")
      .addEventListener("click", () => this.quitGame());

    // Option choices
    document.querySelectorAll(".option-choice").forEach((btn) => {
      btn.addEventListener("click", (e) => this.handleOptionClick(e));
    });
  }

  setupTouchControls() {
    // Touch state for swipe detection
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchEndX = 0;
    this.touchEndY = 0;
    this.minSwipeDistance = 30;

    // Swipe controls on canvas
    this.canvas.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
      },
      { passive: false },
    );

    this.canvas.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        this.touchEndX = touch.clientX;
        this.touchEndY = touch.clientY;
        this.handleSwipe();
      },
      { passive: false },
    );

    // D-pad buttons
    document.querySelectorAll(".dpad-button").forEach((btn) => {
      btn.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          const direction = e.target.dataset.direction;
          this.handleDpadPress(direction);
        },
        { passive: false },
      );

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const direction = e.target.dataset.direction;
        this.handleDpadPress(direction);
      });
    });

    // Mobile pause button
    const mobilePauseBtn = document.getElementById("mobile-pause");
    mobilePauseBtn.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.togglePause();
      },
      { passive: false },
    );

    mobilePauseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.togglePause();
    });
  }

  handleSwipe() {
    if (this.state !== GameState.PLAYING || this.paused) return;

    const deltaX = this.touchEndX - this.touchStartX;
    const deltaY = this.touchEndY - this.touchStartY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Check if swipe is long enough
    if (Math.max(absDeltaX, absDeltaY) < this.minSwipeDistance) return;

    // Determine swipe direction
    if (absDeltaX > absDeltaY) {
      // Horizontal swipe
      if (deltaX > 0) {
        this.changeDirection(this.player1, DIR.RIGHT);
      } else {
        this.changeDirection(this.player1, DIR.LEFT);
      }
    } else {
      // Vertical swipe
      if (deltaY > 0) {
        this.changeDirection(this.player1, DIR.DOWN);
      } else {
        this.changeDirection(this.player1, DIR.UP);
      }
    }
  }

  handleDpadPress(direction) {
    if (this.state !== GameState.PLAYING || this.paused) return;

    const player = this.twoPlayerMode ? this.player2 : this.player1;

    switch (direction) {
      case "up":
        this.changeDirection(player, DIR.UP);
        break;
      case "down":
        this.changeDirection(player, DIR.DOWN);
        break;
      case "left":
        this.changeDirection(player, DIR.LEFT);
        break;
      case "right":
        this.changeDirection(player, DIR.RIGHT);
        break;
    }
  }

  handleKeyPress(e) {
    const key = e.key.toLowerCase();

    // Global keys
    if (key === " " || key === "spacebar") {
      e.preventDefault();
      if (this.state === GameState.SPLASH || this.state === GameState.OPTIONS) {
        this.startGame();
      }
    } else if (key === "o" && this.state === GameState.SPLASH) {
      this.showOptions();
    } else if (key === "p" && this.state === GameState.PLAYING) {
      this.togglePause();
    } else if (key === "r") {
      this.restartGame();
    } else if (key === "q") {
      this.quitGame();
    }

    // Game controls
    if (this.state === GameState.PLAYING && !this.paused) {
      // Player 1 controls (WASD)
      if (key === "w") {
        this.changeDirection(this.player1, DIR.UP);
      } else if (key === "s") {
        this.changeDirection(this.player1, DIR.DOWN);
      } else if (key === "a") {
        this.changeDirection(this.player1, DIR.LEFT);
      } else if (key === "d") {
        this.changeDirection(this.player1, DIR.RIGHT);
      }

      // Arrow keys (Player 2 in 2-player mode, otherwise Player 1)
      if (this.twoPlayerMode) {
        if (key === "arrowup") {
          this.changeDirection(this.player2, DIR.UP);
        } else if (key === "arrowdown") {
          this.changeDirection(this.player2, DIR.DOWN);
        } else if (key === "arrowleft") {
          this.changeDirection(this.player2, DIR.LEFT);
        } else if (key === "arrowright") {
          this.changeDirection(this.player2, DIR.RIGHT);
        }
      } else {
        if (key === "arrowup") {
          this.changeDirection(this.player1, DIR.UP);
        } else if (key === "arrowdown") {
          this.changeDirection(this.player1, DIR.DOWN);
        } else if (key === "arrowleft") {
          this.changeDirection(this.player1, DIR.LEFT);
        } else if (key === "arrowright") {
          this.changeDirection(this.player1, DIR.RIGHT);
        }
      }
    }

    // Options navigation
    if (this.state === GameState.OPTIONS) {
      if (key === "arrowup") {
        this.navigateOptions(-1);
      } else if (key === "arrowdown") {
        this.navigateOptions(1);
      } else if (key === "arrowleft" || key === "arrowright") {
        this.toggleOption();
      }
    }
  }

  showScreen(screenId) {
    document
      .querySelectorAll(".screen")
      .forEach((s) => s.classList.add("hidden"));
    document.getElementById(screenId).classList.remove("hidden");
  }

  showOptions() {
    this.state = GameState.OPTIONS;
    this.showScreen("options-screen");
    this.updateOptionsDisplay();
  }

  updateOptionsDisplay() {
    // Update active states
    const gridChoice = this.useFullWidth ? "full" : "fixed";
    const edgeChoice = this.wrapEdges ? "wrap" : "crash";
    const growthChoice = this.growthMode;
    const playerChoice = this.twoPlayerMode ? "2p" : "ai";

    document.querySelectorAll(".option-choice").forEach((btn) => {
      btn.classList.remove("active");
    });

    document
      .querySelector(`[data-index="0"] [data-value="${gridChoice}"]`)
      .classList.add("active");
    document
      .querySelector(`[data-index="1"] [data-value="${edgeChoice}"]`)
      .classList.add("active");
    document
      .querySelector(`[data-index="2"] [data-value="${growthChoice}"]`)
      .classList.add("active");
    document
      .querySelector(`[data-index="3"] [data-value="${playerChoice}"]`)
      .classList.add("active");

    // Update selection
    document.querySelectorAll(".option-item").forEach((item, idx) => {
      item.classList.toggle("selected", idx === this.optionsSelection);
    });
  }

  navigateOptions(delta) {
    this.optionsSelection = Math.max(
      0,
      Math.min(3, this.optionsSelection + delta),
    );
    this.updateOptionsDisplay();
  }

  toggleOption() {
    switch (this.optionsSelection) {
      case 0:
        this.useFullWidth = !this.useFullWidth;
        break;
      case 1:
        this.wrapEdges = !this.wrapEdges;
        break;
      case 2:
        this.growthMode =
          this.growthMode === "periodic" ? "continuous" : "periodic";
        break;
      case 3:
        this.twoPlayerMode = !this.twoPlayerMode;
        break;
    }
    this.updateOptionsDisplay();
  }

  handleOptionClick(e) {
    const btn = e.target;
    const item = btn.closest(".option-item");
    const index = parseInt(item.dataset.index);
    const value = btn.dataset.value;

    this.optionsSelection = index;

    switch (index) {
      case 0:
        this.useFullWidth = value === "full";
        break;
      case 1:
        this.wrapEdges = value === "wrap";
        break;
      case 2:
        this.growthMode = value;
        break;
      case 3:
        this.twoPlayerMode = value === "2p";
        break;
    }

    this.updateOptionsDisplay();
  }

  startGame() {
    this.state = GameState.PLAYING;
    this.showScreen("game-screen");

    // Set grid size
    if (this.useFullWidth) {
      // Account for margins, padding, borders, and scrollbars
      // Use documentElement.clientWidth for most accurate viewport
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;

      // Subtract padding, margins, and safety buffer
      const availableWidth = viewportWidth - 80; // 40px padding + 40px buffer
      const availableHeight = viewportHeight - 250; // Header and info area

      this.gridWidth = Math.max(40, Math.floor(availableWidth / CELL_SIZE));
      this.gridHeight = Math.max(20, Math.floor(availableHeight / CELL_SIZE));
    } else {
      this.gridWidth = 30;
      this.gridHeight = 30;
    }

    // Setup canvas
    this.canvas.width = this.gridWidth * CELL_SIZE;
    this.canvas.height = this.gridHeight * CELL_SIZE;

    this.resetGame();
    this.updateInfo();
    this.render();

    // Show mobile controls
    document.getElementById("mobile-controls").classList.add("active");

    // Start game loop
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
    }
    this.gameLoop = setInterval(() => this.update(), TICK_PERIOD);
  }

  resetGame() {
    this.paused = false;
    this.gameOver = false;
    this.winner = null;
    this.frameCount = 0;
    this.aiMoveHistory = [];

    const centerY = Math.floor(this.playableHeight() / 2) + this.playableYMin();

    // Reset player 1 (green)
    this.player1.body = [{ x: this.playableXMin() + 3, y: centerY }];
    this.player1.direction = DIR.RIGHT;
    this.player1.alive = true;

    // Reset player 2 (red)
    this.player2.body = [{ x: this.playableXMax() - 3, y: centerY }];
    this.player2.direction = DIR.LEFT;
    this.player2.alive = true;
  }

  playableXMin() {
    return BORDER_THICKNESS;
  }
  playableXMax() {
    return this.gridWidth - BORDER_THICKNESS - 1;
  }
  playableYMin() {
    return BORDER_THICKNESS;
  }
  playableYMax() {
    return this.gridHeight - BORDER_THICKNESS - 1;
  }
  playableWidth() {
    return this.gridWidth - BORDER_THICKNESS * 2;
  }
  playableHeight() {
    return this.gridHeight - BORDER_THICKNESS * 2;
  }

  update() {
    if (this.paused || this.gameOver) return;

    this.frameCount++;
    const shouldGrow =
      this.growthMode === "continuous" ||
      (this.growthMode === "periodic" && this.frameCount % GROWTH_RATE === 0);

    // AI decision (if not 2-player mode)
    if (!this.twoPlayerMode) {
      const aiMove = this.getAIMove();
      this.changeDirection(this.player2, aiMove);
      this.aiMoveHistory.push(this.player1.direction);
      if (this.aiMoveHistory.length > 20) this.aiMoveHistory.shift();
    }

    // Move snakes
    this.moveSnake(this.player1, shouldGrow);
    this.moveSnake(this.player2, shouldGrow);

    // Check collisions
    this.checkCollisions();

    // Update display
    this.updateInfo();
    this.render();

    // Check game over
    if (this.gameOver) {
      clearInterval(this.gameLoop);
      this.showGameOver();
    }
  }

  moveSnake(player, grow) {
    const head = player.body[0];
    const newHead = {
      x: head.x + player.direction.x,
      y: head.y + player.direction.y,
    };

    // Wrap if enabled
    if (this.wrapEdges) {
      const xMin = this.playableXMin();
      const yMin = this.playableYMin();
      const width = this.playableWidth();
      const height = this.playableHeight();

      newHead.x = xMin + ((newHead.x - xMin + width) % width);
      newHead.y = yMin + ((newHead.y - yMin + height) % height);
    }

    player.body.unshift(newHead);
    if (!grow) player.body.pop();
  }

  changeDirection(player, newDir) {
    // Can't reverse direction
    if (newDir.x === -player.direction.x && newDir.y === -player.direction.y) {
      return;
    }
    player.direction = newDir;
  }

  inBounds(pos) {
    return (
      pos.x >= this.playableXMin() &&
      pos.x <= this.playableXMax() &&
      pos.y >= this.playableYMin() &&
      pos.y <= this.playableYMax()
    );
  }

  checkCollisions() {
    const head1 = this.player1.body[0];
    const head2 = this.player2.body[0];

    let p1Crashed = false;
    let p2Crashed = false;

    // Check player 1
    if (this.player1.alive) {
      if (!this.wrapEdges && !this.inBounds(head1)) p1Crashed = true;
      if (this.hitsSelf(this.player1)) p1Crashed = true;
      if (this.hitsOther(this.player1, this.player2)) p1Crashed = true;
    }

    // Check player 2
    if (this.player2.alive) {
      if (!this.wrapEdges && !this.inBounds(head2)) p2Crashed = true;
      if (this.hitsSelf(this.player2)) p2Crashed = true;
      if (this.hitsOther(this.player2, this.player1)) p2Crashed = true;
    }

    // Head-on collision
    if (head1.x === head2.x && head1.y === head2.y) {
      p1Crashed = p2Crashed = true;
    }

    // Update game state
    if (p1Crashed && p2Crashed) {
      this.gameOver = true;
      this.winner = "draw";
      this.player1.alive = this.player2.alive = false;
    } else if (p1Crashed) {
      this.gameOver = true;
      this.winner = "player2";
      this.player1.alive = false;
    } else if (p2Crashed) {
      this.gameOver = true;
      this.winner = "player1";
      this.player2.alive = false;
    }
  }

  hitsSelf(player) {
    const head = player.body[0];
    return player.body
      .slice(1)
      .some((seg) => seg.x === head.x && seg.y === head.y);
  }

  hitsOther(player, other) {
    const head = player.body[0];
    return other.body.some((seg) => seg.x === head.x && seg.y === head.y);
  }

  // AI Implementation
  getAIMove() {
    const validMoves = this.getValidMoves(this.player2);
    if (validMoves.length === 0) {
      return this.player2.direction;
    }

    let bestMove = validMoves[0];
    let bestScore = -Infinity;

    for (const move of validMoves) {
      const score = this.evaluateMove(move);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  getValidMoves(player) {
    const moves = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
    const head = player.body[0];
    const valid = [];

    for (const dir of moves) {
      // Can't reverse
      if (dir.x === -player.direction.x && dir.y === -player.direction.y)
        continue;

      const newPos = { x: head.x + dir.x, y: head.y + dir.y };

      // Wrap if needed
      if (this.wrapEdges) {
        const xMin = this.playableXMin();
        const yMin = this.playableYMin();
        const width = this.playableWidth();
        const height = this.playableHeight();

        newPos.x = xMin + ((newPos.x - xMin + width) % width);
        newPos.y = yMin + ((newPos.y - yMin + height) % height);
      }

      if (
        this.inBounds(newPos) &&
        !this.player1.body.some((s) => s.x === newPos.x && s.y === newPos.y) &&
        !this.player2.body.some((s) => s.x === newPos.x && s.y === newPos.y)
      ) {
        valid.push(dir);
      }
    }

    return valid;
  }

  evaluateMove(dir) {
    const head = this.player2.body[0];
    const newPos = { x: head.x + dir.x, y: head.y + dir.y };

    let score = 0;

    // 1. Available space
    score += this.floodFill(newPos) * 10;

    // 2. Distance to opponent
    const p1Head = this.player1.body[0];
    const dist = Math.abs(newPos.x - p1Head.x) + Math.abs(newPos.y - p1Head.y);
    if (dist >= 5 && dist <= 10) {
      score += 20;
    } else if (dist < 5) {
      score += 10;
    }

    // 3. Control center
    const centerX = this.playableXMin() + Math.floor(this.playableWidth() / 2);
    const centerY = this.playableYMin() + Math.floor(this.playableHeight() / 2);
    const centerDist =
      Math.abs(newPos.x - centerX) + Math.abs(newPos.y - centerY);
    score += (this.playableWidth() - centerDist) * 0.5;

    // 4. Avoid edges
    if (
      newPos.x <= this.playableXMin() + 1 ||
      newPos.x >= this.playableXMax() - 1 ||
      newPos.y <= this.playableYMin() + 1 ||
      newPos.y >= this.playableYMax() - 1
    ) {
      score -= 10;
    }

    return score;
  }

  floodFill(start, maxDepth = 150) {
    const visited = new Set();
    const queue = [start];
    let count = 0;

    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0 && count < maxDepth) {
      const pos = queue.shift();
      count++;

      for (const dir of [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT]) {
        const newPos = { x: pos.x + dir.x, y: pos.y + dir.y };
        const key = `${newPos.x},${newPos.y}`;

        if (
          !visited.has(key) &&
          this.inBounds(newPos) &&
          !this.player1.body.some(
            (s) => s.x === newPos.x && s.y === newPos.y,
          ) &&
          !this.player2.body.some((s) => s.x === newPos.x && s.y === newPos.y)
        ) {
          visited.add(key);
          queue.push(newPos);
        }
      }
    }

    return count;
  }

  render() {
    // Clear canvas
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw borders
    this.ctx.fillStyle = "#fff";
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        if (
          x < BORDER_THICKNESS ||
          x >= this.gridWidth - BORDER_THICKNESS ||
          y < BORDER_THICKNESS ||
          y >= this.gridHeight - BORDER_THICKNESS
        ) {
          this.ctx.fillRect(
            x * CELL_SIZE,
            y * CELL_SIZE,
            CELL_SIZE - 1,
            CELL_SIZE - 1,
          );
        }
      }
    }

    // Draw player 1 (green)
    this.ctx.fillStyle = "#0f0";
    for (let i = 0; i < this.player1.body.length; i++) {
      const seg = this.player1.body[i];
      const isHead = i === 0;
      this.ctx.globalAlpha = isHead ? 1.0 : 0.8;
      this.ctx.fillRect(
        seg.x * CELL_SIZE + 1,
        seg.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2,
      );
    }

    // Draw player 2 (red)
    this.ctx.fillStyle = "#f00";
    for (let i = 0; i < this.player2.body.length; i++) {
      const seg = this.player2.body[i];
      const isHead = i === 0;
      this.ctx.globalAlpha = isHead ? 1.0 : 0.8;
      this.ctx.fillRect(
        seg.x * CELL_SIZE + 1,
        seg.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2,
      );
    }

    this.ctx.globalAlpha = 1.0;
  }

  updateInfo() {
    const p1Label = this.twoPlayerMode ? "Player 1" : "Human";
    const p2Label = this.twoPlayerMode ? "Player 2" : "AI";

    document.getElementById("player1-label").innerHTML =
      `${p1Label}: <span id="player1-length">${this.player1.body.length}</span>`;
    document.getElementById("player2-label").innerHTML =
      `${p2Label}: <span id="player2-length">${this.player2.body.length}</span>`;
    document.getElementById("frame-count").textContent = this.frameCount;
  }

  togglePause() {
    this.paused = !this.paused;
    const statusElement = document.getElementById("game-status");
    const mobilePauseBtn = document.getElementById("mobile-pause");
    const isMobile = window.innerWidth <= 768;

    if (this.paused) {
      const resumeText = isMobile
        ? '<div style="font-size: 2em; margin: 20px 0;">⏸ PAUSED ⏸</div><div>Tap Resume to continue</div>'
        : '<div style="font-size: 2em; margin: 20px 0;">⏸ PAUSED ⏸</div><div>Press P to continue</div>';
      statusElement.innerHTML = resumeText;
      document.getElementById("game-screen").classList.add("paused");
      mobilePauseBtn.textContent = "Resume";
    } else {
      statusElement.textContent = "";
      document.getElementById("game-screen").classList.remove("paused");
      mobilePauseBtn.textContent = "Pause";
    }
  }

  showGameOver() {
    this.state = GameState.GAMEOVER;

    let winnerText = "GAME OVER";
    if (this.winner === "draw") {
      winnerText = "DRAW!";
    } else if (this.winner === "player1") {
      winnerText = this.twoPlayerMode ? "PLAYER 1 WINS!" : "YOU WIN!";
    } else if (this.winner === "player2") {
      winnerText = this.twoPlayerMode ? "PLAYER 2 WINS!" : "AI WINS!";
    }

    const p1Label = this.twoPlayerMode ? "Player 1" : "Human";
    const p2Label = this.twoPlayerMode ? "Player 2" : "AI";
    const stats = `${p1Label}: ${this.player1.body.length} vs ${p2Label}: ${this.player2.body.length}`;

    document.getElementById("winner-text").textContent = winnerText;
    document.getElementById("final-stats").textContent = stats;

    this.showScreen("gameover-screen");
  }

  restartGame() {
    this.state = GameState.SPLASH;
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
    }
    // Hide mobile controls
    document.getElementById("mobile-controls").classList.remove("active");
    this.showScreen("splash-screen");
  }

  quitGame() {
    this.state = GameState.SPLASH;
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
    }
    // Hide mobile controls
    document.getElementById("mobile-controls").classList.remove("active");
    this.showScreen("splash-screen");
  }

  drawPreview() {
    const previewCanvas = document.getElementById("preview-canvas");
    if (!previewCanvas) {
      return;
    }

    const ctx = previewCanvas.getContext("2d");
    const gridSize = 25;
    const cellSize = 20;

    // Clear
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    // Draw border
    ctx.fillStyle = "#fff";
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        if (x < 2 || x >= gridSize - 2 || y < 2 || y >= gridSize - 2) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }

    // game splash screen
    const greenSnake = [
      { x: 18, y: 8 }, // head - moving toward trap
      { x: 17, y: 8 },
      { x: 16, y: 8 },
      { x: 15, y: 8 },
      { x: 14, y: 8 },
      { x: 13, y: 8 },
      { x: 12, y: 8 },
      { x: 11, y: 8 },
      { x: 10, y: 8 },
      { x: 10, y: 9 },
      { x: 10, y: 10 },
      { x: 11, y: 10 },
      { x: 12, y: 10 },
      { x: 13, y: 10 },
      { x: 14, y: 10 },
      { x: 15, y: 10 },
      { x: 16, y: 10 },
      { x: 17, y: 10 },
      { x: 18, y: 10 },
      { x: 19, y: 10 },
    ];

    const redSnake = [
      { x: 8, y: 13 },
      { x: 8, y: 12 },
      { x: 8, y: 11 },
      { x: 8, y: 10 },
      { x: 8, y: 9 },
      { x: 8, y: 8 },
      { x: 8, y: 7 },
      { x: 8, y: 6 },
      { x: 8, y: 5 },
      { x: 9, y: 5 },
      { x: 10, y: 5 },
      { x: 11, y: 5 },
      { x: 12, y: 5 },
      { x: 13, y: 5 },
      { x: 14, y: 5 },
      { x: 15, y: 5 },
      { x: 16, y: 5 },
      { x: 17, y: 5 },
      { x: 18, y: 5 },
      { x: 19, y: 5 },
      { x: 20, y: 5 },
      { x: 20, y: 6 },
      { x: 20, y: 7 },
    ];

    // Draw green snake
    ctx.fillStyle = "#0f0";
    for (let i = 0; i < greenSnake.length; i++) {
      const seg = greenSnake[i];
      ctx.globalAlpha = i === 0 ? 1.0 : 0.8;
      ctx.fillRect(
        seg.x * cellSize + 1,
        seg.y * cellSize + 1,
        cellSize - 2,
        cellSize - 2,
      );
    }

    // Draw red snake
    ctx.fillStyle = "#f00";
    for (let i = 0; i < redSnake.length; i++) {
      const seg = redSnake[i];
      ctx.globalAlpha = i === 0 ? 1.0 : 0.8;
      ctx.fillRect(
        seg.x * cellSize + 1,
        seg.y * cellSize + 1,
        cellSize - 2,
        cellSize - 2,
      );
    }

    ctx.globalAlpha = 1.0;
  }
}

// Initialize game when page loads
window.addEventListener("load", () => {
  new WrapTrap();
});
