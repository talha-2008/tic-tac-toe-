const cells = document.querySelectorAll('.cell');
const gameBoard = document.getElementById('game-board');
const infoDisplay = document.getElementById('game-info');
const dualPlayerBtn = document.getElementById('dual-player-btn');
const aiPlayerBtn = document.getElementById('ai-player-btn');
const onlinePlayerBtn = document.getElementById('online-player-btn');
const restartBtn = document.getElementById('restart-btn');
const difficultySelect = document.getElementById('difficulty');
const aiDifficultyDiv = document.getElementById('ai-difficulty');
const onlineLobby = document.getElementById('online-lobby');
const gameIdInput = document.getElementById('game-id-input');
const joinGameBtn = document.getElementById('join-game-btn');
const createGameBtn = document.getElementById('create-game-btn');
const gameLinkSpan = document.getElementById('game-url');
const gameLinkDiv = document.getElementById('game-link');
const onlineStatus = document.getElementById('online-status');
const enableSoundBtn = document.getElementById('enable-sound-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');

// Audio Files (fallback to existing audio tags if present)
const moveSound = document.getElementById('move-sound') || new Audio('path/to/move-sound.mp3');
const winSound = document.getElementById('win-sound') || new Audio('path/to/win-sound.mp3');
const drawSound = document.getElementById('draw-sound') || new Audio('path/to/draw-sound.mp3');
const loseSound = document.getElementById('lose-sound') || new Audio('path/to/lose-sound.mp3');
let audioUnlocked = false;
// WebAudio fallback
let audioCtx = null;
function ensureAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}
function playTone(freq = 440, duration = 0.12) {
    try {
        const ctx = ensureAudioCtx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(ctx.destination);
        const now = ctx.currentTime;
        o.start(now);
        g.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        o.stop(now + duration + 0.02);
    } catch (e) {}
}

function audioHasValidSrc(a) {
    if (!a) return false;
    // if the src is a placeholder path we skip
    try {
        const src = a.getAttribute ? a.getAttribute('src') : a.src;
        if (!src) return false;
        if (src.includes('path/to')) return false;
        // basic check for invalid data
        if (src.startsWith('http') || src.startsWith('file:') || src.startsWith('/') || src.startsWith('data:')) return true;
        // if it's a relative path that doesn't contain placeholder, allow it
        return true;
    } catch (e) {
        return false;
    }
}

const winCombos = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

let boardState = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let isGameActive = false;
let isVsAI = false;
let isOnlineGame = false;
let gameRef = null;
let myPlayerSymbol = null;
// persistent client id for this browser to help identify creator vs joiner
let clientId = localStorage.getItem('ttt_client_id');
if (!clientId) {
    clientId = Math.random().toString(36).substring(2, 10);
    localStorage.setItem('ttt_client_id', clientId);
}
let createdGameId = null; // if this client created a game, store id

function startGame() {
    boardState = ['', '', '', '', '', '', '', '', ''];
    isGameActive = true;
    currentPlayer = 'X';

    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o');
        cell.style.pointerEvents = 'auto';
        cell.removeEventListener('click', handleCellClick);
        cell.addEventListener('click', handleCellClick);
    });

    gameBoard.classList.remove('hidden');
    restartBtn.classList.add('hidden');
    infoDisplay.textContent = "Player X's turn";

    // If AI starts and is O, trigger AI
    if (isVsAI && currentPlayer === 'O') {
        setTimeout(() => aiMove(), 350);
    }
}

// Unlock audio on first user gesture (some browsers block audio otherwise)
function unlockAudio() {
    if (audioUnlocked) return;
    try {
        [moveSound, winSound, drawSound, loseSound].forEach(a => {
            if (a && typeof a.play === 'function') {
                a.volume = 0.001;
                const p = a.play();
                if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; a.volume = 1.0; }).catch(()=>{});
            }
        });
        try { ensureAudioCtx().resume && ensureAudioCtx().resume(); } catch(e){}
    } catch (e) {}
    audioUnlocked = true;
    if (enableSoundBtn) enableSoundBtn.textContent = 'Sound Enabled';
}

function handleCellClick(e) {
    const cell = e.target;
    const index = cell.dataset.index;
    
    if (!isGameActive || boardState[index] !== '') return;
    
    if (isOnlineGame) {
        if (currentPlayer !== myPlayerSymbol) return; // Wait for your turn
    }

    boardState[index] = currentPlayer;
    cell.textContent = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase());
    
    try {
        if (audioHasValidSrc(moveSound)) moveSound.currentTime = 0, moveSound.play().catch(()=>{});
        else playTone(880, 0.08);
    } catch (e) {}

    if (isOnlineGame) {
        const nextPlayer = currentPlayer === 'X' ? 'O' : 'X';
        const winner = checkWin() ? currentPlayer : null;
        const isDrawNow = checkDraw();
        gameRef.update({
            board: boardState,
            currentPlayer: winner || isDrawNow ? null : nextPlayer,
            winner: winner,
            isDraw: isDrawNow
        });
        return; // Online will be handled by listener
    }

    if (checkWin()) {
        infoDisplay.textContent = `Player ${currentPlayer} wins!`;
        if (currentPlayer === 'X') {
            if (audioHasValidSrc(winSound)) try { winSound.play().catch(()=>{}); } catch (e) {}
            else playTone(660, 0.26);
        } else {
            if (audioHasValidSrc(loseSound)) try { loseSound.play().catch(()=>{}); } catch (e) {}
            else playTone(220, 0.26);
        }
        endGame();
        return;
    }
    
    if (checkDraw()) {
        infoDisplay.textContent = "It's a draw!";
        if (audioHasValidSrc(drawSound)) try { drawSound.play().catch(()=>{}); } catch (e) {}
        else playTone(440, 0.14);
        endGame();
        return;
    }
    
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    infoDisplay.textContent = `Player ${currentPlayer}'s turn`;

    if (isVsAI && currentPlayer === 'O') {
        cells.forEach(cell => cell.style.pointerEvents = 'none'); // Disable clicks during AI turn
        setTimeout(() => {
            aiMove();
            cells.forEach(cell => cell.style.pointerEvents = 'auto'); // Enable clicks after AI turn
        }, 500);
    }
}

function checkWin() {
    return winCombos.some(combo => {
        return combo.every(index => {
            return boardState[index] === currentPlayer;
        });
    });
}

function checkDraw() {
    return boardState.every(cell => cell !== '');
}

function endGame() {
    isGameActive = false;
    cells.forEach(cell => cell.removeEventListener('click', handleCellClick));
    restartBtn.classList.remove('hidden');
}

function aiMove() {
    const difficulty = difficultySelect.value;
    let move;

    if (difficulty === 'easy') {
        move = getRandomMove();
    } else if (difficulty === 'medium') {
        move = getMediumMove();
    } else { // Impossible
        move = getMinimaxMove();
    }
    
    if (move !== undefined) {
        const cell = cells[move];
        cell.click();
    }
}

function getRandomMove() {
    const availableCells = boardState.map((cell, index) => cell === '' ? index : null).filter(val => val !== null);
    const randomIndex = Math.floor(Math.random() * availableCells.length);
    return availableCells[randomIndex];
}

function getMediumMove() {
    let winningMove = getWinningOrBlockingMove('O');
    if (winningMove !== undefined) return winningMove;
    
    let blockingMove = getWinningOrBlockingMove('X');
    if (blockingMove !== undefined) return blockingMove;
    
    if (boardState[4] === '') return 4;
    
    return getRandomMove();
}

function getWinningOrBlockingMove(player) {
    for (const combo of winCombos) {
        let emptyCellIndex = -1;
        let filledCount = 0;
        
        for (const index of combo) {
            if (boardState[index] === player) {
                filledCount++;
            } else if (boardState[index] === '') {
                emptyCellIndex = index;
            }
        }
        if (filledCount === 2 && emptyCellIndex !== -1) {
            return emptyCellIndex;
        }
    }
    return undefined;
}

function getMinimaxMove() {
    // Use a copy of the board for minimax simulation
    let bestScore = -Infinity;
    let bestMove = undefined;
    for (let i = 0; i < boardState.length; i++) {
        if (boardState[i] === '') {
            const copy = boardState.slice();
            copy[i] = 'O';
            let score = minimax(copy, 0, false);
            if (score > bestScore) {
                bestScore = score;
                bestMove = i;
            }
        }
    }
    return bestMove;
}

function minimax(board, depth, isMaximizingPlayer) {
    // Terminal checks
    if (checkWinWithPlayerBoard(board, 'O')) return 1;
    if (checkWinWithPlayerBoard(board, 'X')) return -1;
    if (board.every(cell => cell !== '')) return 0;

    if (isMaximizingPlayer) {
        let bestScore = -Infinity;
        for (let i = 0; i < board.length; i++) {
            if (board[i] === '') {
                const copy = board.slice();
                copy[i] = 'O';
                let score = minimax(copy, depth + 1, false);
                bestScore = Math.max(score, bestScore);
            }
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < board.length; i++) {
            if (board[i] === '') {
                const copy = board.slice();
                copy[i] = 'X';
                let score = minimax(copy, depth + 1, true);
                bestScore = Math.min(score, bestScore);
            }
        }
        return bestScore;
    }
}

function checkWinWithPlayer(player) {
    return winCombos.some(combo => {
        return combo.every(index => {
            return boardState[index] === player;
        });
    });
}

function checkWinWithPlayerBoard(board, player) {
    return winCombos.some(combo => combo.every(index => board[index] === player));
}

function resetUI() {
    dualPlayerBtn.classList.remove('hidden');
    aiPlayerBtn.classList.remove('hidden');
    onlinePlayerBtn.classList.remove('hidden');
    restartBtn.classList.add('hidden');
    gameBoard.classList.add('hidden');
    aiDifficultyDiv.classList.add('hidden');
    onlineLobby.classList.add('hidden');
    infoDisplay.textContent = '';
    onlineStatus && (onlineStatus.textContent = '');

    if (gameRef) {
        try { gameRef.off(); } catch (e) {}
        gameRef = null;
    }
    isOnlineGame = false;
    isVsAI = false;
    myPlayerSymbol = null;
}

function setGameMode(mode) {
    resetUI();
    if (mode === 'dual') {
        startGame();
    } else if (mode === 'ai') {
        isVsAI = true;
        aiDifficultyDiv.classList.remove('hidden');
        startGame();
    } else if (mode === 'online') {
        isOnlineGame = true;
        onlineLobby.classList.remove('hidden');
    }
}

// Online Multiplayer Functions
function createGame() {
    const gameId = Math.random().toString(36).substring(2, 9);
    if (!database) { onlineStatus && (onlineStatus.textContent = 'Firebase not initialized'); return; }
    gameRef = database.ref('games/' + gameId);
    gameRef.set({
        board: ['', '', '', '', '', '', '', '', ''],
        currentPlayer: 'X',
        winner: null,
        isDraw: false,
        player1: 'X',
        player2: null,
        player1ClientId: clientId,
        open: true,
        createdAt: Date.now()
    }).then(() => {
        // we won't auto-enter the game. Creator will see the link and can click Enter Game when ready.
        createdGameId = gameId;
        myPlayerSymbol = 'X';
        const url = window.location.href.split('?')[0] + '?game=' + gameId;
        gameLinkSpan.textContent = url;
        gameLinkDiv.classList.remove('hidden');
        if (copyLinkBtn) { copyLinkBtn.classList.remove('hidden'); }
    onlineStatus && (onlineStatus.textContent = 'Game created. Share the link. Click Enter Game to join.');
        const enterBtn = document.getElementById('enter-game-btn');
        if (enterBtn) { enterBtn.classList.remove('hidden'); }
        infoDisplay.textContent = 'Game created. Share the link!';
    }).catch(err => {
        onlineStatus && (onlineStatus.textContent = 'Error creating game: ' + err.message);
    });
}

function joinGame(gameId) {
    if (!database) { onlineStatus && (onlineStatus.textContent = 'Firebase not initialized'); return; }
    // If no gameId provided, try quick-join (find a game with player2 == null)
    if (!gameId) {
        onlineStatus && (onlineStatus.textContent = 'Searching for open games...');
        // search last 50 created games (small project, so simply scan)
        database.ref('games').orderByChild('createdAt').limitToLast(50).once('value').then(snap => {
            const games = snap.val() || {};
            let foundId = null;
            Object.keys(games).forEach(id => {
                const g = games[id];
                if (g && !g.player2) foundId = id;
            });
            if (foundId) {
                joinGame(foundId);
            } else {
                onlineStatus && (onlineStatus.textContent = 'No open games found — creating a new one...');
                createGame();
            }
        }).catch(err => {
            onlineStatus && (onlineStatus.textContent = 'Error searching games: ' + err.message);
        });
        return;
    }

    // Join by ID — use a transaction to avoid race conditions when two players try to join
    gameId = sanitizeGameId(gameId);
    if (!gameId) { onlineStatus && (onlineStatus.textContent = 'Invalid game id'); return; }
    gameRef = database.ref('games/' + gameId);
    // We attempt to join as player2. If game doesn't exist, inform user.
    gameRef.once('value').then(snapshot => {
        const cur = snapshot.val();
        if (!cur) {
            onlineStatus && (onlineStatus.textContent = 'Game not found');
            return;
        }

        // If this client is the creator and hasn't entered yet, allow Enter Game to attach as player1
        if (createdGameId === gameId || cur.player1ClientId === clientId) {
            myPlayerSymbol = 'X';
            onlineStatus && (onlineStatus.textContent = 'Entering as player X (creator)');
            setupOnlineGameListeners();
            return;
        }

        // If already joined as player2 on another session, allow re-entry
        if (cur.player2ClientId === clientId) {
            myPlayerSymbol = 'O';
            onlineStatus && (onlineStatus.textContent = 'Re-entering as player O');
            setupOnlineGameListeners();
            return;
        }

        // If both players present and neither matches this client, it's full
        if (cur.player1 && cur.player2) {
            onlineStatus && (onlineStatus.textContent = 'Unable to join — game is full');
            return;
        }

        // Try to set player2 atomically, or if open flag false but player2 missing, try anyway
        gameRef.transaction(current => {
            if (current === null) return;
            // if player2 already set, abort
            if (current.player2) return;
            // don't let creator re-assign as player2
            if (current.player1ClientId === clientId) return;
            // assign player2
            current.player2 = 'O';
            current.player2ClientId = clientId;
            current.open = false;
            return current;
        }, (err, committed, snapshot2) => {
            if (err) {
                onlineStatus && (onlineStatus.textContent = 'Error joining: ' + err.message);
                return;
            }
            if (committed) {
                // Successfully joined as player2
                myPlayerSymbol = 'O';
                onlineStatus && (onlineStatus.textContent = 'Joined as player O');
                setupOnlineGameListeners();
                return;
            }

            // Transaction not committed: re-check snapshot to determine state
            const after = snapshot2 && snapshot2.val ? snapshot2.val() : null;
            if (after) {
                if (after.player2ClientId === clientId) {
                    myPlayerSymbol = 'O';
                    onlineStatus && (onlineStatus.textContent = 'Joined as player O (recovered)');
                    setupOnlineGameListeners();
                    return;
                }
                if (after.player1ClientId === clientId) {
                    myPlayerSymbol = 'X';
                    onlineStatus && (onlineStatus.textContent = 'You are creator (X)');
                    setupOnlineGameListeners();
                    return;
                }
            }

            onlineStatus && (onlineStatus.textContent = 'Unable to join — game may be full or not exist');
        });
    }).catch(err => {
        onlineStatus && (onlineStatus.textContent = 'Error: ' + err.message);
    });
}

function setupOnlineGameListeners() {
    onlineLobby.classList.add('hidden');
    startGame();

    gameRef.on('value', snapshot => {
        const gameData = snapshot.val();
        if (!gameData) return;

        boardState = gameData.board || ['', '', '', '', '', '', '', '', ''];
        currentPlayer = gameData.currentPlayer || null;

        cells.forEach((cell, index) => {
            cell.textContent = boardState[index] || '';
            cell.classList.remove('x', 'o');
            if (boardState[index]) cell.classList.add(boardState[index].toLowerCase());
        });

        if (gameData.winner) {
            infoDisplay.textContent = `Player ${gameData.winner} wins!`;
            try { winSound.play(); } catch (e) {}
            endGame();
        } else if (gameData.isDraw) {
            infoDisplay.textContent = 'It\'s a draw!';
            try { drawSound.play(); } catch (e) {}
            endGame();
        } else {
            // If both players present mark game not open
            if (gameData.player1 && gameData.player2 && gameData.open) {
                try { gameRef.update({ open: false }); } catch(e){}
            }
            infoDisplay.textContent = currentPlayer ? `Player ${currentPlayer}'s turn` : 'Waiting...';
            if (currentPlayer && currentPlayer === myPlayerSymbol) {
                cells.forEach(cell => cell.style.pointerEvents = 'auto');
                onlineStatus && (onlineStatus.textContent = 'Your turn');
            } else {
                cells.forEach(cell => cell.style.pointerEvents = 'none');
                onlineStatus && (onlineStatus.textContent = 'Opponent\'s turn');
            }
            // If this client created the game but didn't enter yet, show Enter Game
            const enterBtn = document.getElementById('enter-game-btn');
            if (createdGameId && createdGameId === snapshot.key && enterBtn) {
                enterBtn.classList.remove('hidden');
            }
        }
    });
}

// Initial mode setup from URL (for joining games)
const urlParams = new URLSearchParams(window.location.search);
let gameIdFromUrl = urlParams.get('game');
function sanitizeGameId(raw) {
    if (!raw) return '';
    // If user pasted full URL, extract the last param value or the path segment
    try {
        // If it's a URL with ?game=... extract that
        if (raw.includes('?game=')) {
            raw = raw.split('?game=')[1];
        }
        // Strip to alphanumeric and hyphen/underscore
        const m = raw.match(/[a-zA-Z0-9_-]{4,}/);
        return m ? m[0] : raw.replace(/[^a-zA-Z0-9_-]/g, '');
    } catch (e) {
        return raw.replace(/[^a-zA-Z0-9_-]/g, '');
    }
}

gameIdFromUrl = sanitizeGameId(gameIdFromUrl);
if (gameIdFromUrl) {
    onlineLobby.classList.remove('hidden');
    gameIdInput.value = gameIdFromUrl;
    joinGame(gameIdFromUrl);
} else {
    resetUI(); // Show initial mode selection buttons
}


// Event Listeners
dualPlayerBtn.addEventListener('click', () => setGameMode('dual'));
aiPlayerBtn.addEventListener('click', () => setGameMode('ai'));
onlinePlayerBtn.addEventListener('click', () => setGameMode('online'));
restartBtn.addEventListener('click', () => {
    resetUI();
    startGame();
});
createGameBtn.addEventListener('click', createGame);
joinGameBtn.addEventListener('click', () => joinGame(sanitizeGameId(gameIdInput.value.trim())));
const enterGameBtn = document.getElementById('enter-game-btn');
if (enterGameBtn) {
    enterGameBtn.addEventListener('click', () => {
        if (!createdGameId) return;
        // ensure we reference the created game
        joinGame(createdGameId);
    });
}

// Copy link button
if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
        const url = gameLinkSpan.textContent;
        if (!url) return;
        try {
            navigator.clipboard.writeText(url).then(() => {
                copyLinkBtn.textContent = 'Copied!';
                setTimeout(() => copyLinkBtn.textContent = 'Copy Link', 1500);
            }).catch(() => {
                // fallback
                const inp = document.createElement('input');
                document.body.appendChild(inp);
                inp.value = url; inp.select(); document.execCommand('copy'); document.body.removeChild(inp);
                copyLinkBtn.textContent = 'Copied!';
            });
        } catch (e) {}
    });
}

// Enable sound button
if (enableSoundBtn) {
    enableSoundBtn.addEventListener('click', () => {
        unlockAudio();
    });
    // Also unlock on first global tap/click
    document.addEventListener('click', function one() { unlockAudio(); document.removeEventListener('click', one); }, { once: true });
}

// Ensure cells have handler (startGame attaches them too)
cells.forEach(cell => cell.removeEventListener('click', handleCellClick));
cells.forEach(cell => cell.addEventListener('click', handleCellClick));