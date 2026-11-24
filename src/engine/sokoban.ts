import {
  Direction,
  PushDirection,
  MoveChar,
  Position,
  MoveRecord,
  ParsedBoard,
  GameState
} from '../types/game';

export const DIR_DELTA: Record<Direction, { dx: number; dy: number }> = {
  u: { dx: 0, dy: -1 },
  d: { dx: 0, dy: 1 },
  l: { dx: -1, dy: 0 },
  r: { dx: 1, dy: 0 },
};

export function coordsEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function parseXSB(xsbRaw: string): ParsedBoard {
  const lines = xsbRaw
    .replace(/\r/g, '')
    .split('\n')
    .filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error('XSB关卡数据为空');
  }

  const height = lines.length;
  let width = 0;
  for (const line of lines) {
    if (line.length > width) width = line.length;
  }

  const walls: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  const goals: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  const playable: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));

  let player: Position | null = null;
  const initialBoxes: Position[] = [];
  const goalPositions: Position[] = [];

  for (let y = 0; y < height; y++) {
    const line = lines[y];
    for (let x = 0; x < width; x++) {
      const char = x < line.length ? line[x] : ' ';
      switch (char) {
        case '#':
          walls[y][x] = true;
          break;
        case '@': // Player
          player = { x, y };
          break;
        case '+': // Player on goal
          player = { x, y };
          goals[y][x] = true;
          goalPositions.push({ x, y });
          break;
        case '$': // Box
          initialBoxes.push({ x, y });
          break;
        case '*': // Box on goal
          initialBoxes.push({ x, y });
          goals[y][x] = true;
          goalPositions.push({ x, y });
          break;
        case '.': // Goal
          goals[y][x] = true;
          goalPositions.push({ x, y });
          break;
        case ' ': // Empty/floor
          break;
        default:
          break;
      }
    }
  }

  if (!player) {
    throw new Error('关卡中未找到玩家起始位置 (@ 或 +)');
  }

  // 泛洪填充识别室内可达地板（区分室内地板和室外空白）
  // 必须只从玩家所在连通区进行泛洪，且视墙壁为边界
  const queue: Position[] = [{ ...player }];
  const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  visited[player.y][player.x] = true;
  playable[player.y][player.x] = true;

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const neighbors: Position[] = [
      { x: curr.x + 1, y: curr.y },
      { x: curr.x - 1, y: curr.y },
      { x: curr.x, y: curr.y + 1 },
      { x: curr.x, y: curr.y - 1 },
    ];

    for (const nb of neighbors) {
      if (nb.x >= 0 && nb.x < width && nb.y >= 0 && nb.y < height) {
        if (!walls[nb.y][nb.x] && !visited[nb.y][nb.x]) {
          visited[nb.y][nb.x] = true;
          playable[nb.y][nb.x] = true;
          queue.push(nb);
        }
      }
    }
  }

  return {
    width,
    height,
    walls,
    goals,
    playable,
    initialPlayer: player,
    initialBoxes,
    goalPositions,
  };
}

/**
 * 严格封闭性校验：
 * 从玩家初始位置出发做 4 方向泛洪填充（遇到 # 停止）。
 * 如果可达区域触碰到地图矩形的四条最外边界（r === 0 || r === rows - 1 || c === 0 || c === cols - 1），
 * 或者有任何箱子/目标点处于不可达区域，判定该关未封闭！
 */
export function isMapEnclosed(board: ParsedBoard): { enclosed: boolean; reason?: string } {
  const { width, height, walls, initialPlayer, initialBoxes, goalPositions } = board;

  const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  const queue: Position[] = [{ ...initialPlayer }];
  visited[initialPlayer.y][initialPlayer.x] = true;

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];

    // 如果可达区域触碰到了地图边界，说明缺少外墙封闭，室内泄露至地图外
    if (curr.x === 0 || curr.x === width - 1 || curr.y === 0 || curr.y === height - 1) {
      return {
        enclosed: false,
        reason: `地图未封闭：可达地板在坐标 (${curr.x}, ${curr.y}) 处触碰到地图边界，存在漏墙缺口！`,
      };
    }

    const neighbors: Position[] = [
      { x: curr.x + 1, y: curr.y },
      { x: curr.x - 1, y: curr.y },
      { x: curr.x, y: curr.y + 1 },
      { x: curr.x, y: curr.y - 1 },
    ];

    for (const nb of neighbors) {
      if (nb.x >= 0 && nb.x < width && nb.y >= 0 && nb.y < height) {
        if (!walls[nb.y][nb.x] && !visited[nb.y][nb.x]) {
          visited[nb.y][nb.x] = true;
          queue.push(nb);
        }
      }
    }
  }

  // 检查所有箱子和目标点是否都在玩家可达的封闭区域内
  for (const b of initialBoxes) {
    if (!visited[b.y]?.[b.x]) {
      return {
        enclosed: false,
        reason: `箱子在坐标 (${b.x}, ${b.y}) 处于不可达或隔离区域！`,
      };
    }
  }

  for (const g of goalPositions) {
    if (!visited[g.y]?.[g.x]) {
      return {
        enclosed: false,
        reason: `目标点在坐标 (${g.x}, ${g.y}) 处于不可达或隔离区域！`,
      };
    }
  }

  return { enclosed: true };
}

export function createInitialGameState(board: ParsedBoard): GameState {
  return {
    player: { ...board.initialPlayer },
    playerFacing: 'd',
    boxes: board.initialBoxes.map(b => ({ ...b })),
    movesCount: 0,
    pushesCount: 0,
    isWon: checkIsWon(board.initialBoxes, board.goals),
    history: [],
    redoStack: [],
  };
}

export function checkIsWon(boxes: Position[], goals: boolean[][]): boolean {
  if (boxes.length === 0) return false;
  return boxes.every(b => goals[b.y]?.[b.x] === true);
}

export function canMove(
  state: GameState,
  board: ParsedBoard,
  dir: Direction
): {
  valid: boolean;
  isPush: boolean;
  nextPlayer: Position;
  nextBox?: Position;
  pushedBoxIndex?: number;
} {
  const delta = DIR_DELTA[dir];
  const targetX = state.player.x + delta.dx;
  const targetY = state.player.y + delta.dy;

  if (targetX < 0 || targetX >= board.width || targetY < 0 || targetY >= board.height) {
    return { valid: false, isPush: false, nextPlayer: state.player };
  }

  if (board.walls[targetY][targetX]) {
    return { valid: false, isPush: false, nextPlayer: state.player };
  }

  const boxIndex = state.boxes.findIndex(b => b.x === targetX && b.y === targetY);
  if (boxIndex === -1) {
    // Normal walk
    return {
      valid: true,
      isPush: false,
      nextPlayer: { x: targetX, y: targetY },
    };
  }

  // Box push
  const boxNextX = targetX + delta.dx;
  const boxNextY = targetY + delta.dy;

  if (boxNextX < 0 || boxNextX >= board.width || boxNextY < 0 || boxNextY >= board.height) {
    return { valid: false, isPush: true, nextPlayer: state.player };
  }

  if (board.walls[boxNextY][boxNextX]) {
    return { valid: false, isPush: true, nextPlayer: state.player };
  }

  const blockedByOtherBox = state.boxes.some(b => b.x === boxNextX && b.y === boxNextY);
  if (blockedByOtherBox) {
    return { valid: false, isPush: true, nextPlayer: state.player };
  }

  return {
    valid: true,
    isPush: true,
    nextPlayer: { x: targetX, y: targetY },
    nextBox: { x: boxNextX, y: boxNextY },
    pushedBoxIndex: boxIndex,
  };
}

export function applyMove(
  state: GameState,
  board: ParsedBoard,
  dir: Direction
): { nextState: GameState; moved: boolean } {
  const check = canMove(state, board, dir);
  if (!check.valid) {
    if (state.playerFacing !== dir) {
      return {
        nextState: { ...state, playerFacing: dir },
        moved: false,
      };
    }
    return { nextState: state, moved: false };
  }

  const newBoxes = state.boxes.map(b => ({ ...b }));
  const record: MoveRecord = {
    from: { ...state.player },
    to: { ...check.nextPlayer },
    direction: dir,
    isPush: check.isPush,
  };

  if (check.isPush && check.nextBox && check.pushedBoxIndex !== undefined) {
    record.boxFrom = { ...state.boxes[check.pushedBoxIndex] };
    record.boxTo = { ...check.nextBox };
    newBoxes[check.pushedBoxIndex] = { ...check.nextBox };
  }

  const isWon = checkIsWon(newBoxes, board.goals);

  const nextState: GameState = {
    player: { ...check.nextPlayer },
    playerFacing: dir,
    boxes: newBoxes,
    movesCount: state.movesCount + 1,
    pushesCount: state.pushesCount + (check.isPush ? 1 : 0),
    isWon,
    history: [...state.history, record],
    redoStack: [], // clear redo stack on new player action
  };

  return { nextState, moved: true };
}

export function undoMove(state: GameState, board: ParsedBoard): GameState {
  if (state.history.length === 0) return state;

  const history = [...state.history];
  const lastRecord = history.pop()!;
  const newBoxes = state.boxes.map(b => ({ ...b }));

  if (lastRecord.isPush && lastRecord.boxFrom && lastRecord.boxTo) {
    const idx = newBoxes.findIndex(
      b => b.x === lastRecord.boxTo!.x && b.y === lastRecord.boxTo!.y
    );
    if (idx !== -1) {
      newBoxes[idx] = { ...lastRecord.boxFrom };
    }
  }

  const isWon = checkIsWon(newBoxes, board.goals);

  return {
    player: { ...lastRecord.from },
    playerFacing: lastRecord.direction,
    boxes: newBoxes,
    movesCount: Math.max(0, state.movesCount - 1),
    pushesCount: Math.max(0, state.pushesCount - (lastRecord.isPush ? 1 : 0)),
    isWon,
    history,
    redoStack: [lastRecord, ...state.redoStack],
  };
}

export function redoMove(state: GameState, board: ParsedBoard): GameState {
  if (state.redoStack.length === 0) return state;

  const [recordToReapply, ...remainingRedo] = state.redoStack;
  const newBoxes = state.boxes.map(b => ({ ...b }));

  if (recordToReapply.isPush && recordToReapply.boxFrom && recordToReapply.boxTo) {
    const idx = newBoxes.findIndex(
      b => b.x === recordToReapply.boxFrom!.x && b.y === recordToReapply.boxFrom!.y
    );
    if (idx !== -1) {
      newBoxes[idx] = { ...recordToReapply.boxTo };
    }
  }

  const isWon = checkIsWon(newBoxes, board.goals);

  return {
    player: { ...recordToReapply.to },
    playerFacing: recordToReapply.direction,
    boxes: newBoxes,
    movesCount: state.movesCount + 1,
    pushesCount: state.pushesCount + (recordToReapply.isPush ? 1 : 0),
    isWon,
    history: [...state.history, recordToReapply],
    redoStack: remainingRedo,
  };
}

/**
 * BFS寻路：计算玩家走到空地目标的单步序列
 */
export function findWalkPath(
  start: Position,
  target: Position,
  boxes: Position[],
  walls: boolean[][],
  width: number,
  height: number
): Direction[] | null {
  if (coordsEqual(start, target)) return [];
  if (walls[target.y]?.[target.x]) return null;
  if (boxes.some(b => b.x === target.x && b.y === target.y)) return null;

  const boxSet = new Set(boxes.map(b => `${b.x},${b.y}`));
  const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  const parent: ({ prev: Position; dir: Direction } | null)[][] = Array.from(
    { length: height },
    () => Array(width).fill(null)
  );

  const queue: Position[] = [start];
  visited[start.y][start.x] = true;

  let head = 0;
  let found = false;

  const dirs: Direction[] = ['u', 'd', 'l', 'r'];

  while (head < queue.length) {
    const curr = queue[head++];
    if (curr.x === target.x && curr.y === target.y) {
      found = true;
      break;
    }

    for (const d of dirs) {
      const delta = DIR_DELTA[d];
      const nx = curr.x + delta.dx;
      const ny = curr.y + delta.dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (!walls[ny][nx] && !boxSet.has(`${nx},${ny}`) && !visited[ny][nx]) {
          visited[ny][nx] = true;
          parent[ny][nx] = { prev: curr, dir: d };
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  if (!found) return null;

  // 回溯路径
  const path: Direction[] = [];
  let curr = target;
  while (!coordsEqual(curr, start)) {
    const info = parent[curr.y][curr.x];
    if (!info) break;
    path.unshift(info.dir);
    curr = info.prev;
  }

  return path;
}
