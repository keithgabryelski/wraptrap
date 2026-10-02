// WrapTrap
// Written by Keith Gabryelski <keith@gabryelski.com>

// Game Constants
const CELL_SIZE = 20;
const BORDER_THICKNESS = 2;
const GROWTH_RATE = 3; // frames
const MIN_TICK_PERIOD = 40; // milliseconds
const START_SPEEDS = {
  slow: 140,
  normal: 100,
  fast: 70,
};
const SPEED_INCREASES = {
  off: 0,
  gradual: 0.05,
  rapid: 0.2,
};
const AI_DIFFICULTIES = [
  { key: "novice", label: "Novice", searchDepth: 60 },
  { key: "skilled", label: "Skilled", searchDepth: 100 },
  { key: "expert", label: "Expert", searchDepth: 150 },
  { key: "master", label: "Master", searchDepth: 200 },
];
const DIFFICULTY_INCREASES = {
  off: Infinity,
  gradual: 30000,
  rapid: 15000,
};
const SETTINGS_STORAGE_KEY = "wraptrap-options-v1";
const SETTINGS_COOKIE = SETTINGS_STORAGE_KEY;
const SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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
    this.startSpeed = "normal";
    this.speedIncrease = "gradual";
    this.startDifficulty = "skilled";
    this.difficultyIncrease = "gradual";
    this.showGameInfo = false;
    this.loadOptions();

    // Game state
    this.state = GameState.SPLASH;
    this.paused = false;
    this.gameOver = false;
    this.winner = null;
    this.frameCount = 0;
    this.activePlayTime = 0;
    this.gameLoop = null;
    this.crashes = [];

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

  loadOptions() {
    let storedOptions = null;
    let loadedFromCookie = false;
    try {
      storedOptions = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Storage can be blocked by browser privacy settings.
    }

    const cookiePrefix = `${SETTINGS_COOKIE}=`;
    if (!storedOptions) {
      try {
        const cookie = document.cookie
          .split(";")
          .map((value) => value.trim())
          .find((value) => value.startsWith(cookiePrefix));
        if (cookie) {
          storedOptions = decodeURIComponent(cookie.slice(cookiePrefix.length));
          loadedFromCookie = true;
        }
      } catch {
        // Cookies are unavailable on some local-file and privacy contexts.
      }
    }

    if (!storedOptions) return;

    try {
      this.applyStoredOptions(JSON.parse(storedOptions));
      if (loadedFromCookie) {
        try {
          window.localStorage.setItem(SETTINGS_STORAGE_KEY, storedOptions);
        } catch {
          // Continue using the cookie when local storage is unavailable.
        }
      }
    } catch {
      // Ignore settings from older or malformed versions.
    }
  }

  applyStoredOptions(options) {
    const isBoolean = (value) => typeof value === "boolean";
    const isOneOf = (allowed) => (value) => allowed.includes(value);
    const validators = {
      useFullWidth: isBoolean,
      wrapEdges: isBoolean,
      growthMode: isOneOf(["periodic", "continuous"]),
      twoPlayerMode: isBoolean,
      startSpeed: isOneOf(Object.keys(START_SPEEDS)),
      speedIncrease: isOneOf(Object.keys(SPEED_INCREASES)),
      startDifficulty: isOneOf(AI_DIFFICULTIES.map(({ key }) => key)),
      difficultyIncrease: isOneOf(Object.keys(DIFFICULTY_INCREASES)),
      showGameInfo: isBoolean,
    };

    for (const [key, isValid] of Object.entries(validators)) {
      if (isValid(options[key])) this[key] = options[key];
    }
  }

  saveOptions() {
    const options = {
      useFullWidth: this.useFullWidth,
      wrapEdges: this.wrapEdges,
      growthMode: this.growthMode,
      twoPlayerMode: this.twoPlayerMode,
      startSpeed: this.startSpeed,
      speedIncrease: this.speedIncrease,
      startDifficulty: this.startDifficulty,
      difficultyIncrease: this.difficultyIncrease,
      showGameInfo: this.showGameInfo,
    };
    const serializedOptions = JSON.stringify(options);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializedOptions);
    } catch {
      // Cookie fallback below supports browsers with blocked local storage.
    }

    try {
      document.cookie = `${SETTINGS_COOKIE}=${encodeURIComponent(serializedOptions)}; Max-Age=${SETTINGS_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    } catch {
      // Local storage may still have saved the settings.
    }
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
    if (this.state !== GameState.PLAYING || this.paused) {
      return;
    }

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
    if (this.state !== GameState.PLAYING || this.paused) {
      return;
    }

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
      } else if (key === "arrowleft") {
        this.toggleOption(-1);
      } else if (key === "arrowright") {
        this.toggleOption(1);
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
      btn.setAttribute("aria-pressed", "false");
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
    document
      .querySelector(`[data-index="4"] [data-value="${this.startSpeed}"]`)
      .classList.add("active");
    document
      .querySelector(
        `[data-index="5"] [data-value="${this.speedIncrease}"]`,
      )
      .classList.add("active");
    document
      .querySelector(
        `[data-index="6"] [data-value="${this.startDifficulty}"]`,
      )
      .classList.add("active");
    document
      .querySelector(
        `[data-index="7"] [data-value="${this.difficultyIncrease}"]`,
      )
      .classList.add("active");
    document
      .querySelector(
        `[data-index="8"] [data-value="${this.showGameInfo ? "show" : "hide"}"]`,
      )
      .classList.add("active");

    document.querySelectorAll(".option-choice.active").forEach((btn) => {
      btn.setAttribute("aria-pressed", "true");
    });

    // Update selection
    document.querySelectorAll(".option-item").forEach((item, idx) => {
      item.classList.toggle("selected", idx === this.optionsSelection);
    });
  }

  navigateOptions(delta) {
    const lastOptionIndex =
      document.querySelectorAll(".option-item").length - 1;
    this.optionsSelection = Math.max(
      0,
      Math.min(lastOptionIndex, this.optionsSelection + delta),
    );
    this.updateOptionsDisplay();
  }

  toggleOption(delta = 1) {
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
      case 4: {
        const speeds = Object.keys(START_SPEEDS);
        const index = speeds.indexOf(this.startSpeed);
        this.startSpeed = speeds[(index + delta + speeds.length) % speeds.length];
        break;
      }
      case 5: {
        const increases = Object.keys(SPEED_INCREASES);
        const index = increases.indexOf(this.speedIncrease);
        this.speedIncrease =
          increases[(index + delta + increases.length) % increases.length];
        break;
      }
      case 6: {
        const difficulties = AI_DIFFICULTIES.map(({ key }) => key);
        const index = difficulties.indexOf(this.startDifficulty);
        this.startDifficulty =
          difficulties[
            (index + delta + difficulties.length) % difficulties.length
          ];
        break;
      }
      case 7: {
        const increases = Object.keys(DIFFICULTY_INCREASES);
        const index = increases.indexOf(this.difficultyIncrease);
        this.difficultyIncrease =
          increases[(index + delta + increases.length) % increases.length];
        break;
      }
      case 8:
        this.showGameInfo = !this.showGameInfo;
        break;
    }
    this.saveOptions();
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
      case 4:
        this.startSpeed = value;
        break;
      case 5:
        this.speedIncrease = value;
        break;
      case 6:
        this.startDifficulty = value;
        break;
      case 7:
        this.difficultyIncrease = value;
        break;
      case 8:
        this.showGameInfo = value === "show";
        break;
    }

    this.saveOptions();
    this.updateOptionsDisplay();
  }

  startGame() {
    this.state = GameState.PLAYING;
    this.showScreen("game-screen");
    document.getElementById("game-screen").classList.remove("game-over");
    document.getElementById("gameover-panel").classList.add("hidden");

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
      clearTimeout(this.gameLoop);
    }
    this.scheduleNextUpdate();
  }

  scheduleNextUpdate() {
    this.gameLoop = setTimeout(() => {
      this.update();
      if (this.state === GameState.PLAYING && !this.gameOver) {
        this.scheduleNextUpdate();
      }
    }, this.getTickPeriod());
  }

  getTickPeriod() {
    const startPeriod = START_SPEEDS[this.startSpeed];
    const increasePerFrame = SPEED_INCREASES[this.speedIncrease];
    return Math.max(
      MIN_TICK_PERIOD,
      startPeriod - this.frameCount * increasePerFrame,
    );
  }

  resetGame() {
    this.paused = false;
    this.gameOver = false;
    this.winner = null;
    this.frameCount = 0;
    this.activePlayTime = 0;
    this.aiMoveHistory = [];
    this.crashes = [];

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
    return this.borderThickness();
  }
  playableXMax() {
    return this.gridWidth - this.borderThickness() - 1;
  }
  playableYMin() {
    return this.borderThickness();
  }
  playableYMax() {
    return this.gridHeight - this.borderThickness() - 1;
  }
  playableWidth() {
    return this.gridWidth - this.borderThickness() * 2;
  }
  playableHeight() {
    return this.gridHeight - this.borderThickness() * 2;
  }

  borderThickness() {
    return this.wrapEdges ? 1 : BORDER_THICKNESS;
  }

  update() {
    if (this.paused || this.gameOver) return;

    this.activePlayTime += this.getTickPeriod();
    this.frameCount++;
    const shouldGrow =
      this.growthMode === "continuous" ||
      (this.growthMode === "periodic" && this.frameCount % GROWTH_RATE === 0);

    // AI decision (if not 2-player mode)
    if (!this.twoPlayerMode) {
      const aiMove = this.getAIMove(shouldGrow);
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

    if (this.gameOver) {
      this.crashes = [];
      if (p1Crashed) {
        this.crashes.push({ player: "player1", position: { ...head1 } });
      }
      if (p2Crashed) {
        this.crashes.push({ player: "player2", position: { ...head2 } });
      }
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
  getCurrentDifficulty() {
    const startIndex = AI_DIFFICULTIES.findIndex(
      ({ key }) => key === this.startDifficulty,
    );
    const increasePeriod = DIFFICULTY_INCREASES[this.difficultyIncrease];
    const increase = Math.floor(this.activePlayTime / increasePeriod);
    return AI_DIFFICULTIES[
      Math.min(AI_DIFFICULTIES.length - 1, startIndex + increase)
    ];
  }

  getAIMove(shouldGrow = false) {
    const difficulty = this.getCurrentDifficulty();
    const difficultyIndex = AI_DIFFICULTIES.indexOf(difficulty);
    const validMoves = this.getValidMoves(this.player2);
    if (validMoves.length === 0) {
      return this.player2.direction;
    }

    let bestMove = validMoves[0];
    let bestScore = -Infinity;

    for (const move of validMoves) {
      const state = this.projectTurn(
        this.player2.body,
        this.player1.body,
        move,
        this.player1.direction,
        shouldGrow,
      );
      let score = this.scoreProjectedState(state, difficultyIndex, difficulty);

      if (difficultyIndex >= 2 && !state.aiCrashed && !state.humanCrashed) {
        score += this.scoreFutureTurn(state, difficultyIndex, difficulty);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  getValidMoves(player, body = player.body, otherBody = null) {
    const moves = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
    const head = body[0];
    const obstacleBody =
      otherBody ||
      (player === this.player1 ? this.player2.body : this.player1.body);
    const valid = [];

    for (const dir of moves) {
      // Can't reverse
      if (dir.x === -player.direction.x && dir.y === -player.direction.y)
        continue;

      const newPos = this.getNextPosition(head, dir);

      if (
        this.inBounds(newPos) &&
        !body.some((s) => s.x === newPos.x && s.y === newPos.y) &&
        !obstacleBody.some((s) => s.x === newPos.x && s.y === newPos.y)
      ) {
        valid.push(dir);
      }
    }

    return valid;
  }

  getValidStateMoves(direction, body, otherBody) {
    return [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT].filter((dir) => {
      if (dir.x === -direction.x && dir.y === -direction.y) return false;
      const next = this.getNextPosition(body[0], dir);
      return (
        this.inBounds(next) &&
        !body.some((part) => part.x === next.x && part.y === next.y) &&
        !otherBody.some((part) => part.x === next.x && part.y === next.y)
      );
    });
  }

  getNextPosition(head, direction) {
    const next = { x: head.x + direction.x, y: head.y + direction.y };
    if (this.wrapEdges) {
      const xMin = this.playableXMin();
      const yMin = this.playableYMin();
      next.x =
        xMin +
        ((next.x - xMin + this.playableWidth()) % this.playableWidth());
      next.y =
        yMin +
        ((next.y - yMin + this.playableHeight()) % this.playableHeight());
    }
    return next;
  }

  projectTurn(aiBody, humanBody, aiDirection, humanDirection, grow) {
    const aiHead = this.getNextPosition(aiBody[0], aiDirection);
    const humanHead = this.getNextPosition(humanBody[0], humanDirection);
    const nextAI = [aiHead, ...aiBody];
    const nextHuman = [humanHead, ...humanBody];
    if (!grow) {
      nextAI.pop();
      nextHuman.pop();
    }

    const sameHead = aiHead.x === humanHead.x && aiHead.y === humanHead.y;
    const aiCrashed =
      !this.inBounds(aiHead) ||
      sameHead ||
      nextAI.slice(1).some((part) => this.samePosition(part, aiHead)) ||
      nextHuman.some((part) => this.samePosition(part, aiHead));
    const humanCrashed =
      !this.inBounds(humanHead) ||
      sameHead ||
      nextHuman.slice(1).some((part) => this.samePosition(part, humanHead)) ||
      nextAI.some((part) => this.samePosition(part, humanHead));

    return {
      aiBody: nextAI,
      humanBody: nextHuman,
      aiDirection,
      humanDirection,
      aiCrashed,
      humanCrashed,
    };
  }

  scoreProjectedState(state, difficultyIndex, difficulty) {
    if (state.aiCrashed && state.humanCrashed) return -2500;
    if (state.aiCrashed) return -10000;
    if (state.humanCrashed) return 10000;

    const aiMoves = this.getValidStateMoves(
      state.aiDirection,
      state.aiBody,
      state.humanBody,
    );
    const humanMoves = this.getValidStateMoves(
      state.humanDirection,
      state.humanBody,
      state.aiBody,
    );
    const aiArea = this.floodFillState(
      state.aiBody[0],
      state.aiBody,
      state.humanBody,
      difficulty.searchDepth,
    );
    let score = aiArea * 10 + aiMoves.length * 25;

    if (difficultyIndex >= 1) {
      score -= this.distanceBetween(state.aiBody[0], state.humanBody[0]);
    }

    if (difficultyIndex >= 2) {
      const humanArea = this.floodFillState(
        state.humanBody[0],
        state.humanBody,
        state.aiBody,
        difficulty.searchDepth,
      );
      score += (aiArea - humanArea) * 4;
      score += (3 - humanMoves.length) * 100;
      if (aiMoves.length >= 2 && humanMoves.length <= 2) score += 75;
    }

    return score;
  }

  scoreFutureTurn(state, difficultyIndex, difficulty) {
    const aiMoves = this.getValidStateMoves(
      state.aiDirection,
      state.aiBody,
      state.humanBody,
    );
    const humanMoves = this.getPredictedHumanMoves(state, difficultyIndex);
    if (aiMoves.length === 0 || humanMoves.length === 0) return 0;

    let bestFutureScore = -Infinity;
    for (const aiMove of aiMoves) {
      const responseScores = humanMoves.map((humanMove) => {
        const future = this.projectTurn(
          state.aiBody,
          state.humanBody,
          aiMove,
          humanMove,
          false,
        );
        return this.scoreProjectedState(future, difficultyIndex, difficulty);
      });
      const score =
        difficultyIndex >= 3
          ? Math.min(...responseScores)
          : responseScores[0];
      bestFutureScore = Math.max(bestFutureScore, score);
    }

    return bestFutureScore * (difficultyIndex >= 3 ? 0.65 : 0.35);
  }

  getPredictedHumanMoves(state, difficultyIndex) {
    const moves = this.getValidStateMoves(
      state.humanDirection,
      state.humanBody,
      state.aiBody,
    );
    if (difficultyIndex >= 3 || moves.length < 2) return moves;

    const currentKey = this.directionKey(state.humanDirection);
    const transitionCounts = new Map();
    for (let i = 0; i < this.aiMoveHistory.length - 1; i++) {
      if (this.directionKey(this.aiMoveHistory[i]) === currentKey) {
        const nextKey = this.directionKey(this.aiMoveHistory[i + 1]);
        transitionCounts.set(nextKey, (transitionCounts.get(nextKey) || 0) + 1);
      }
    }

    return moves
      .sort((a, b) => {
        const score = (move) =>
          (transitionCounts.get(this.directionKey(move)) || 0) +
          (this.directionKey(move) === currentKey ? 1 : 0);
        return score(b) - score(a);
      })
      .slice(0, 1);
  }

  directionKey(direction) {
    return `${direction.x},${direction.y}`;
  }

  samePosition(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  distanceBetween(a, b) {
    let xDistance = Math.abs(a.x - b.x);
    let yDistance = Math.abs(a.y - b.y);
    if (this.wrapEdges) {
      xDistance = Math.min(xDistance, this.playableWidth() - xDistance);
      yDistance = Math.min(yDistance, this.playableHeight() - yDistance);
    }
    return xDistance + yDistance;
  }

  floodFillState(start, ownBody, otherBody, maxDepth) {
    const visited = new Set();
    const queue = [start];
    const blocked = new Set(
      [...ownBody, ...otherBody].map((part) => `${part.x},${part.y}`),
    );
    let queueIndex = 0;
    let count = 0;

    visited.add(`${start.x},${start.y}`);

    while (queueIndex < queue.length && count < maxDepth) {
      const pos = queue[queueIndex++];
      count++;

      for (const dir of [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT]) {
        const newPos = this.getNextPosition(pos, dir);
        const key = `${newPos.x},${newPos.y}`;

        if (
          !visited.has(key) &&
          this.inBounds(newPos) &&
          !blocked.has(key)
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
    if (this.wrapEdges) {
      const dotSize = 4;
      const dotOffset = (CELL_SIZE - dotSize) / 2;
      this.ctx.fillStyle = "#555";
      for (let x = 0; x < this.gridWidth; x++) {
        this.ctx.fillRect(x * CELL_SIZE + dotOffset, dotOffset, dotSize, dotSize);
        this.ctx.fillRect(
          x * CELL_SIZE + dotOffset,
          (this.gridHeight - 1) * CELL_SIZE + dotOffset,
          dotSize,
          dotSize,
        );
      }
      for (let y = 1; y < this.gridHeight - 1; y++) {
        this.ctx.fillRect(dotOffset, y * CELL_SIZE + dotOffset, dotSize, dotSize);
        this.ctx.fillRect(
          (this.gridWidth - 1) * CELL_SIZE + dotOffset,
          y * CELL_SIZE + dotOffset,
          dotSize,
          dotSize,
        );
      }
    } else {
      this.drawBrickBorder();
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
    this.drawCrashMarkers();
  }

  drawBrickBorder() {
    const wallSize = BORDER_THICKNESS * CELL_SIZE;
    const mortarSize = 2;
    const brickLength = CELL_SIZE * 2;
    const brickColors = ["#8f4636", "#78382c", "#9c503c"];

    this.ctx.fillStyle = "#2b1a16";
    this.ctx.fillRect(0, 0, this.canvas.width, wallSize);
    this.ctx.fillRect(
      0,
      this.canvas.height - wallSize,
      this.canvas.width,
      wallSize,
    );
    this.ctx.fillRect(0, wallSize, wallSize, this.canvas.height - wallSize * 2);
    this.ctx.fillRect(
      this.canvas.width - wallSize,
      wallSize,
      wallSize,
      this.canvas.height - wallSize * 2,
    );

    for (let course = 0; course < BORDER_THICKNESS; course++) {
      const offset = course % 2 === 0 ? -CELL_SIZE : 0;
      const topY = course * CELL_SIZE;
      const bottomY = this.canvas.height - wallSize + course * CELL_SIZE;
      let brickIndex = 0;
      for (let x = offset; x < this.canvas.width; x += brickLength) {
        const color = brickColors[(brickIndex + course) % brickColors.length];
        this.drawClippedBrick(
          x,
          topY,
          brickLength,
          CELL_SIZE,
          0,
          0,
          this.canvas.width,
          wallSize,
          color,
          mortarSize,
        );
        this.drawClippedBrick(
          x,
          bottomY,
          brickLength,
          CELL_SIZE,
          0,
          this.canvas.height - wallSize,
          this.canvas.width,
          this.canvas.height,
          color,
          mortarSize,
        );
        brickIndex++;
      }
    }

    const sideTop = wallSize;
    const sideBottom = this.canvas.height - wallSize;
    for (let course = 0; course < BORDER_THICKNESS; course++) {
      const offset = course % 2 === 0 ? -CELL_SIZE : 0;
      const leftX = course * CELL_SIZE;
      const rightX = this.canvas.width - wallSize + course * CELL_SIZE;
      let brickIndex = 0;
      for (let y = sideTop + offset; y < sideBottom; y += brickLength) {
        const color = brickColors[(brickIndex + course + 1) % brickColors.length];
        this.drawClippedBrick(
          leftX,
          y,
          CELL_SIZE,
          brickLength,
          0,
          sideTop,
          wallSize,
          sideBottom,
          color,
          mortarSize,
        );
        this.drawClippedBrick(
          rightX,
          y,
          CELL_SIZE,
          brickLength,
          this.canvas.width - wallSize,
          sideTop,
          this.canvas.width,
          sideBottom,
          color,
          mortarSize,
        );
        brickIndex++;
      }
    }
  }

  drawClippedBrick(
    x,
    y,
    width,
    height,
    minX,
    minY,
    maxX,
    maxY,
    color,
    mortarSize,
  ) {
    const clippedX = Math.max(x, minX);
    const clippedY = Math.max(y, minY);
    const clippedRight = Math.min(x + width - mortarSize, maxX);
    const clippedBottom = Math.min(y + height - mortarSize, maxY);
    if (clippedRight <= clippedX || clippedBottom <= clippedY) return;

    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      clippedX,
      clippedY,
      clippedRight - clippedX,
      clippedBottom - clippedY,
    );

    this.ctx.fillStyle = "rgba(255, 180, 145, 0.12)";
    this.ctx.fillRect(
      clippedX + 2,
      clippedY + 2,
      Math.max(0, clippedRight - clippedX - 4),
      2,
    );
  }

  drawCrashMarkers() {
    for (const crash of this.crashes) {
      const playerLabel =
        crash.player === "player1"
          ? this.twoPlayerMode
            ? "P1 CRASH"
            : "HUMAN CRASH"
          : this.twoPlayerMode
            ? "P2 CRASH"
            : "AI CRASH";
      const color = crash.player === "player1" ? "#0f0" : "#f00";
      const centerX = crash.position.x * CELL_SIZE + CELL_SIZE / 2;
      const centerY = crash.position.y * CELL_SIZE + CELL_SIZE / 2;
      this.ctx.font = "bold 14px 'Courier New', monospace";
      const labelWidth = this.ctx.measureText(playerLabel).width;
      const labelX = Math.max(
        4,
        Math.min(this.canvas.width - labelWidth - 4, centerX + 14),
      );
      const labelY = Math.max(14, Math.min(this.canvas.height - 6, centerY - 14));

      this.ctx.strokeStyle = "#fff";
      this.ctx.lineWidth = 7;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - 9, centerY - 9);
      this.ctx.lineTo(centerX + 9, centerY + 9);
      this.ctx.moveTo(centerX + 9, centerY - 9);
      this.ctx.lineTo(centerX - 9, centerY + 9);
      this.ctx.stroke();

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(labelX - 3, labelY - 12, labelWidth + 6, 16);
      this.ctx.fillStyle = color;
      this.ctx.fillText(playerLabel, labelX, labelY);
    }
  }

  updateInfo() {
    const p1Label = this.twoPlayerMode ? "Player 1" : "Human";
    const p2Label = this.twoPlayerMode ? "Player 2" : "AI";
    const gameInfo = document.getElementById("game-info");
    const difficultyLabel = document.getElementById("difficulty-label");

    document.getElementById("player1-label").innerHTML =
      `${p1Label}: <span id="player1-length">${this.player1.body.length}</span>`;
    document.getElementById("player2-label").innerHTML =
      `${p2Label}: <span id="player2-length">${this.player2.body.length}</span>`;
    document.getElementById("frame-count").textContent = this.frameCount;
    gameInfo.classList.toggle("hidden", !this.showGameInfo);
    difficultyLabel.classList.toggle("hidden", this.twoPlayerMode);
    document.getElementById("difficulty-level").textContent =
      this.getCurrentDifficulty().label;
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
    document.getElementById("game-screen").classList.add("game-over");

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
    const crashedPlayers = this.crashes
      .map(({ player }) => (player === "player1" ? p1Label : p2Label))
      .join(" and ");
    const stats = `${crashedPlayers} crashed | ${p1Label}: ${this.player1.body.length} vs ${p2Label}: ${this.player2.body.length}`;

    document.getElementById("winner-text").textContent = winnerText;
    document.getElementById("final-stats").textContent = stats;
    const gameOverPanel = document.getElementById("gameover-panel");
    gameOverPanel.classList.remove(
      "hidden",
      "panel-top-left",
      "panel-top-right",
      "panel-bottom-left",
      "panel-bottom-right",
    );
    gameOverPanel.classList.add(this.getGameOverPanelPosition());
    document.getElementById("mobile-controls").classList.remove("active");
  }

  getGameOverPanelPosition() {
    const average = this.crashes.reduce(
      (total, crash) => ({
        x: total.x + crash.position.x / this.crashes.length,
        y: total.y + crash.position.y / this.crashes.length,
      }),
      { x: 0, y: 0 },
    );
    const horizontal = average.x < this.gridWidth / 2 ? "right" : "left";
    const vertical = average.y < this.gridHeight / 2 ? "bottom" : "top";
    return `panel-${vertical}-${horizontal}`;
  }

  restartGame() {
    this.state = GameState.SPLASH;
    if (this.gameLoop) {
      clearTimeout(this.gameLoop);
      this.gameLoop = null;
    }
    // Hide mobile controls
    document.getElementById("mobile-controls").classList.remove("active");
    this.showScreen("splash-screen");
  }

  quitGame() {
    this.state = GameState.SPLASH;
    if (this.gameLoop) {
      clearTimeout(this.gameLoop);
      this.gameLoop = null;
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
