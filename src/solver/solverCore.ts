import {
  Direction,
  PushDirection,
  MoveChar,
  Position,
  ParsedBoard,
  SolverResult,
} from '../types/game';
import { DIR_DELTA } from '../engine/sokoban';

interface SearchNode {
  boxes: number[];          // Sorted 1D coordinates
  playerCanonical: number;  // Minimal 1D coordinate in player's connected area
  playerActual: number;     // Actual 1D position where player stands
  g: number;                // Number of pushes
  h: number;                // Heuristic
  f: number;                // g + w * h
  parent: SearchNode | null;
  lastPush: {
    boxFrom: number;
    boxTo: number;
    pushDir: PushDirection;
    walkDirs: Direction[];
  } | null;
}

// Binary Min-Heap Priority Queue for A*
class PriorityQueue<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.heap.length;
  }

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    const item = this.heap[index];
    while (index > 0) {
      const parentIdx = (index - 1) >> 1;
      const parent = this.heap[parentIdx];
      if (this.compare(item, parent) >= 0) break;
      this.heap[index] = parent;
      index = parentIdx;
    }
    this.heap[index] = item;
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    const item = this.heap[index];
    while (true) {
      let left = (index << 1) + 1;
      let right = left + 1;
      let best = index;

      if (left < length && this.compare(this.heap[left], this.heap[best]) < 0) {
        best = left;
      }
      if (right < length && this.compare(this.heap[right], this.heap[best]) < 0) {
        best = right;
      }
      if (best === index) break;

      this.heap[index] = this.heap[best];
      index = best;
    }
    this.heap[index] = item;
  }
}

export interface SolverOptions {
  maxStates?: number;
  timeoutMs?: number;
  weight?: number;          // Weighted A* factor (default 1.3)
  shouldAbort?: () => boolean;
}

export class SokobanSolver {
  private width: number;
  private height: number;
  private size: number;
  private walls: boolean[];
  private goals: boolean[];
  private staticDeadlocks: boolean[];
  private goalCoords: number[];
  private minGoalDist: Int32Array; // Precomputed distance from any cell to nearest goal

  constructor(board: ParsedBoard) {
    this.width = board.width;
    this.height = board.height;
    this.size = this.width * this.height;

    this.walls = new Array(this.size).fill(false);
    this.goals = new Array(this.size).fill(false);
    this.goalCoords = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        if (board.walls[y][x]) {
          this.walls[idx] = true;
        }
        if (board.goals[y][x]) {
          this.goals[idx] = true;
          this.goalCoords.push(idx);
        }
      }
    }

    // 预计算静态死锁（通过目标点逆向拉箱 BFS）
    this.staticDeadlocks = this.computeStaticDeadlocks();

    // 预计算所有格子到任意目标点的真实最短网格距离
    this.minGoalDist = this.computeMinGoalDistances();
  }

  private toCoord(idx: number): { x: number; y: number } {
    return { x: idx % this.width, y: Math.floor(idx / this.width) };
  }

  private toIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  /**
   * 静态死锁预计算：
   * 从所有目标点出发，做逆向拉箱 BFS。
   * 如果某个非目标点地板永远无法通过逆向拉箱到达，则推到该格必定死锁。
   */
  private computeStaticDeadlocks(): boolean[] {
    const reachable = new Array(this.size).fill(false);
    const queue: number[] = [];

    for (const g of this.goalCoords) {
      reachable[g] = true;
      queue.push(g);
    }

    const deltas = [
      { dx: 0, dy: -1 }, // Up
      { dx: 0, dy: 1 },  // Down
      { dx: -1, dy: 0 }, // Left
      { dx: 1, dy: 0 },  // Right
    ];

    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      const cx = curr % this.width;
      const cy = Math.floor(curr / this.width);

      for (const d of deltas) {
        // 逆向拉箱：把箱子从当前位置 curr 拉到 bPos (curr + d)
        // 对应正向推箱动作：玩家必须先站在 (curr + 2*d) 处，将位于 (curr + d) 的箱子推入 curr
        const bx = cx + d.dx;
        const by = cy + d.dy;
        const px = cx + 2 * d.dx;
        const py = cy + 2 * d.dy;

        if (
          bx >= 0 && bx < this.width && by >= 0 && by < this.height &&
          px >= 0 && px < this.width && py >= 0 && py < this.height
        ) {
          const bIdx = by * this.width + bx;
          const pIdx = py * this.width + px;

          // 箱子拉向的位置与正向推箱时玩家站立的位置均不能是墙壁
          if (!this.walls[bIdx] && !this.walls[pIdx]) {
            if (!reachable[bIdx]) {
              reachable[bIdx] = true;
              queue.push(bIdx);
            }
          }
        }
      }
    }

    const deadlocks = new Array(this.size).fill(false);
    for (let i = 0; i < this.size; i++) {
      if (!this.walls[i] && !reachable[i]) {
        deadlocks[i] = true;
      }
    }

    return deadlocks;
  }

  /**
   * 预计算每个格子到最近目标点的真实路网距离
   */
  private computeMinGoalDistances(): Int32Array {
    const dist = new Int32Array(this.size).fill(999999);
    const queue: number[] = [];

    for (const g of this.goalCoords) {
      dist[g] = 0;
      queue.push(g);
    }

    const deltas = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];

    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      const cx = curr % this.width;
      const cy = Math.floor(curr / this.width);
      const curDist = dist[curr];

      for (const d of deltas) {
        const nx = cx + d.dx;
        const ny = cy + d.dy;
        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
          const nIdx = ny * this.width + nx;
          if (!this.walls[nIdx] && dist[nIdx] > curDist + 1) {
            dist[nIdx] = curDist + 1;
            queue.push(nIdx);
          }
        }
      }
    }

    return dist;
  }

  /**
   * 启发函数：各箱子到最近目标的真实路网距离之和
   */
  private heuristic(boxes: number[]): number {
    let sum = 0;
    for (let i = 0; i < boxes.length; i++) {
      sum += this.minGoalDist[boxes[i]];
    }
    return sum;
  }

  public getStaticDeadlocks(): boolean[] {
    return this.staticDeadlocks;
  }

  /**
   * 动态 2x2 死锁检测：
   * 检查箱子新位置周边构成的四个 2x2 区域，若形成实心方块且存在不在目标点的箱子，立即死锁
   */
  public check2x2Deadlock(newBoxIdx: number, boxSet: Set<number>): boolean {
    const bx = newBoxIdx % this.width;
    const by = Math.floor(newBoxIdx / this.width);

    // 四个可能的左上角起点 (cx, cy)
    const offsets = [
      { ox: -1, oy: -1 },
      { ox: 0, oy: -1 },
      { ox: -1, oy: 0 },
      { ox: 0, oy: 0 },
    ];

    for (const { ox, oy } of offsets) {
      const cx = bx + ox;
      const cy = by + oy;

      if (cx < 0 || cx + 1 >= this.width || cy < 0 || cy + 1 >= this.height) {
        continue;
      }

      const p00 = cy * this.width + cx;
      const p10 = cy * this.width + (cx + 1);
      const p01 = (cy + 1) * this.width + cx;
      const p11 = (cy + 1) * this.width + (cx + 1);

      const isBlock00 = this.walls[p00] || boxSet.has(p00);
      const isBlock10 = this.walls[p10] || boxSet.has(p10);
      const isBlock01 = this.walls[p01] || boxSet.has(p01);
      const isBlock11 = this.walls[p11] || boxSet.has(p11);

      // 全部为墙壁或箱子
      if (isBlock00 && isBlock10 && isBlock01 && isBlock11) {
        // 检查其中是否有未在目标点上的箱子
        const hasUnplacedBox =
          (boxSet.has(p00) && !this.goals[p00]) ||
          (boxSet.has(p10) && !this.goals[p10]) ||
          (boxSet.has(p01) && !this.goals[p01]) ||
          (boxSet.has(p11) && !this.goals[p11]);

        if (hasUnplacedBox) {
          return true; // 触发 2x2 死锁剪枝
        }
      }
    }

    return false;
  }

  /**
   * 计算玩家当前连通区域的规范位置（最小坐标值）和可达集合
   */
  private getPlayerReachable(
    playerIdx: number,
    boxSet: Set<number>
  ): { canonical: number; reachable: Uint8Array } {
    const reachable = new Uint8Array(this.size);
    const queue: number[] = [playerIdx];
    reachable[playerIdx] = 1;
    let canonical = playerIdx;

    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      if (curr < canonical) {
        canonical = curr;
      }

      const cx = curr % this.width;
      const cy = Math.floor(curr / this.width);

      // 4 directions
      const neighbors = [
        cy > 0 ? curr - this.width : -1,
        cy < this.height - 1 ? curr + this.width : -1,
        cx > 0 ? curr - 1 : -1,
        cx < this.width - 1 ? curr + 1 : -1,
      ];

      for (const n of neighbors) {
        if (n !== -1 && !this.walls[n] && !boxSet.has(n) && !reachable[n]) {
          reachable[n] = 1;
          queue.push(n);
        }
      }
    }

    return { canonical, reachable };
  }

  /**
   * 在玩家可达范围内，利用 BFS 寻找从 startIdx 走到 targetIdx 的具体行走方向序列
   */
  private findWalkPath(
    startIdx: number,
    targetIdx: number,
    reachable: Uint8Array
  ): Direction[] {
    if (startIdx === targetIdx) return [];

    const parent: { prev: number; dir: Direction }[] = new Array(this.size);
    const visited = new Uint8Array(this.size);
    const queue: number[] = [startIdx];
    visited[startIdx] = 1;

    let head = 0;
    let found = false;

    while (head < queue.length) {
      const curr = queue[head++];
      if (curr === targetIdx) {
        found = true;
        break;
      }

      const cx = curr % this.width;
      const cy = Math.floor(curr / this.width);

      const moves: { nIdx: number; dir: Direction }[] = [
        { nIdx: cy > 0 ? curr - this.width : -1, dir: 'u' },
        { nIdx: cy < this.height - 1 ? curr + this.width : -1, dir: 'd' },
        { nIdx: cx > 0 ? curr - 1 : -1, dir: 'l' },
        { nIdx: cx < this.width - 1 ? curr + 1 : -1, dir: 'r' },
      ];

      for (const m of moves) {
        if (m.nIdx !== -1 && reachable[m.nIdx] && !visited[m.nIdx]) {
          visited[m.nIdx] = 1;
          parent[m.nIdx] = { prev: curr, dir: m.dir };
          queue.push(m.nIdx);
        }
      }
    }

    if (!found) return [];

    const path: Direction[] = [];
    let curr = targetIdx;
    while (curr !== startIdx) {
      const info = parent[curr];
      path.unshift(info.dir);
      curr = info.prev;
    }

    return path;
  }

  /**
   * 求解核心：基于推箱宏动作的加权 A* 搜索
   */
  public solve(
    initialPlayer: Position,
    initialBoxes: Position[],
    options: SolverOptions = {}
  ): SolverResult {
    const startTime = performance.now();
    const maxStates = options.maxStates ?? 400000;
    const timeoutMs = options.timeoutMs ?? 5000;
    const weight = options.weight ?? 1.3;
    const shouldAbort = options.shouldAbort;

    const initPlayerIdx = this.toIndex(initialPlayer.x, initialPlayer.y);
    const initBoxes = initialBoxes
      .map(b => this.toIndex(b.x, b.y))
      .sort((a, b) => a - b);

    // 检查初始是否已通关
    const isGoalAll = (boxes: number[]) => boxes.every(b => this.goals[b]);
    if (isGoalAll(initBoxes)) {
      return {
        success: true,
        moves: '',
        pushMovesCount: 0,
        totalStepsCount: 0,
        exploredStates: 0,
        durationMs: 0,
        reason: 'solved',
        steps: [],
      };
    }

    const initialBoxSet = new Set(initBoxes);
    const { canonical: initCanonical, reachable: initReachable } =
      this.getPlayerReachable(initPlayerIdx, initialBoxSet);

    const initialNode: SearchNode = {
      boxes: initBoxes,
      playerCanonical: initCanonical,
      playerActual: initPlayerIdx,
      g: 0,
      h: this.heuristic(initBoxes),
      f: 0,
      parent: null,
      lastPush: null,
    };
    initialNode.f = initialNode.g + weight * initialNode.h;

    const frontier = new PriorityQueue<SearchNode>((a, b) => a.f - b.f);
    frontier.push(initialNode);

    // 状态记录表：box_key + '@' + canonicalPlayer => g_score
    const visited = new Map<string, number>();
    const stateKey = (boxes: number[], canonicalPlayer: number) =>
      `${boxes.join(',')}|${canonicalPlayer}`;

    visited.set(stateKey(initBoxes, initCanonical), 0);

    let exploredStates = 0;

    // 四个推箱方向定义
    const pushDirections: {
      dir: Direction;
      pushDir: PushDirection;
      deltaX: number;
      deltaY: number;
    }[] = [
      { dir: 'u', pushDir: 'U', deltaX: 0, deltaY: -1 },
      { dir: 'd', pushDir: 'D', deltaX: 0, deltaY: 1 },
      { dir: 'l', pushDir: 'L', deltaX: -1, deltaY: 0 },
      { dir: 'r', pushDir: 'R', deltaX: 1, deltaY: 0 },
    ];

    while (frontier.size > 0) {
      exploredStates++;

      if (exploredStates % 1024 === 0) {
        if (shouldAbort && shouldAbort()) {
          return {
            success: false,
            moves: '',
            pushMovesCount: 0,
            totalStepsCount: 0,
            exploredStates,
            durationMs: performance.now() - startTime,
            reason: 'cancelled',
          };
        }
        if (performance.now() - startTime > timeoutMs) {
          return {
            success: false,
            moves: '',
            pushMovesCount: 0,
            totalStepsCount: 0,
            exploredStates,
            durationMs: performance.now() - startTime,
            reason: 'timeout',
          };
        }
        if (exploredStates >= maxStates) {
          return {
            success: false,
            moves: '',
            pushMovesCount: 0,
            totalStepsCount: 0,
            exploredStates,
            durationMs: performance.now() - startTime,
            reason: 'state_limit',
          };
        }
      }

      const current = frontier.pop()!;

      // 目标检测
      if (isGoalAll(current.boxes)) {
        const result = this.reconstructSolution(current);
        result.exploredStates = exploredStates;
        result.durationMs = performance.now() - startTime;
        return result;
      }

      const curBoxSet = new Set(current.boxes);
      const { reachable: curReachable } = this.getPlayerReachable(
        current.playerActual,
        curBoxSet
      );

      // 枚举每个箱子的推箱可能
      for (let i = 0; i < current.boxes.length; i++) {
        const boxIdx = current.boxes[i];
        const bx = boxIdx % this.width;
        const by = Math.floor(boxIdx / this.width);

        for (const p of pushDirections) {
          // 玩家推箱前站立位置：与推箱方向相反
          const px = bx - p.deltaX;
          const py = by - p.deltaY;
          // 箱子被推入的新位置
          const nbx = bx + p.deltaX;
          const nby = by + p.deltaY;

          // 边界校验
          if (
            px < 0 || px >= this.width || py < 0 || py >= this.height ||
            nbx < 0 || nbx >= this.width || nby < 0 || nby >= this.height
          ) {
            continue;
          }

          const pIdx = py * this.width + px;
          const nbIdx = nby * this.width + nbx;

          // 玩家站位必须在当前连通可达范围内
          if (!curReachable[pIdx]) {
            continue;
          }

          // 箱子新位置不能是墙壁，也不能已有箱子
          if (this.walls[nbIdx] || curBoxSet.has(nbIdx)) {
            continue;
          }

          // 剪枝 1：静态死锁检测（推到静态死锁非目标格直接剪枝）
          if (this.staticDeadlocks[nbIdx] && !this.goals[nbIdx]) {
            continue;
          }

          // 剪枝 2：动态 2x2 死锁检测
          // 构造临时箱子集合测试
          curBoxSet.delete(boxIdx);
          curBoxSet.add(nbIdx);
          const is2x2 = this.check2x2Deadlock(nbIdx, curBoxSet);
          curBoxSet.delete(nbIdx);
          curBoxSet.add(boxIdx);

          if (is2x2) {
            continue;
          }

          // 构造新箱子位置并排序
          const nextBoxes = [...current.boxes];
          nextBoxes[i] = nbIdx;
          nextBoxes.sort((a, b) => a - b);

          // 推完后玩家站在原箱子位置 boxIdx
          const nextBoxSet = new Set(nextBoxes);
          const { canonical: nextCanonical } = this.getPlayerReachable(
            boxIdx,
            nextBoxSet
          );

          const key = stateKey(nextBoxes, nextCanonical);
          const newG = current.g + 1;

          const existingG = visited.get(key);
          if (existingG !== undefined && existingG <= newG) {
            continue;
          }

          visited.set(key, newG);

          // 记录推箱前的行走路径
          const walkDirs = this.findWalkPath(current.playerActual, pIdx, curReachable);

          const h = this.heuristic(nextBoxes);
          const nextNode: SearchNode = {
            boxes: nextBoxes,
            playerCanonical: nextCanonical,
            playerActual: boxIdx,
            g: newG,
            h,
            f: newG + weight * h,
            parent: current,
            lastPush: {
              boxFrom: boxIdx,
              boxTo: nbIdx,
              pushDir: p.pushDir,
              walkDirs,
            },
          };

          frontier.push(nextNode);
        }
      }
    }

    return {
      success: false,
      moves: '',
      pushMovesCount: 0,
      totalStepsCount: 0,
      exploredStates,
      durationMs: performance.now() - startTime,
      reason: 'unsolvable',
    };
  }

  /**
   * 从终点回溯构造完整动作序列（走+推）及各步状态快照
   */
  private reconstructSolution(endNode: SearchNode): SolverResult {
    const nodes: SearchNode[] = [];
    let curr: SearchNode | null = endNode;
    while (curr) {
      nodes.unshift(curr);
      curr = curr.parent;
    }

    let fullMoves = '';
    let totalPushes = 0;

    const steps: {
      player: Position;
      boxes: Position[];
      moveChar: MoveChar;
    }[] = [];

    // 初始位置状态
    let curPlayer = this.toCoord(nodes[0].playerActual);
    let curBoxes = nodes[0].boxes.map(b => this.toCoord(b));

    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      const pushInfo = node.lastPush!;

      // 展开行走步
      for (const w of pushInfo.walkDirs) {
        fullMoves += w;
        const delta = DIR_DELTA[w];
        curPlayer = { x: curPlayer.x + delta.dx, y: curPlayer.y + delta.dy };
        steps.push({
          player: { ...curPlayer },
          boxes: curBoxes.map(b => ({ ...b })),
          moveChar: w,
        });
      }

      // 展开推箱步
      fullMoves += pushInfo.pushDir;
      totalPushes++;
      const dirLower = pushInfo.pushDir.toLowerCase() as Direction;
      const pushDelta = DIR_DELTA[dirLower];

      const fromCoord = this.toCoord(pushInfo.boxFrom);
      const toCoord = this.toCoord(pushInfo.boxTo);

      curPlayer = { ...fromCoord };
      curBoxes = curBoxes.map(b => (b.x === fromCoord.x && b.y === fromCoord.y ? { ...toCoord } : { ...b }));

      steps.push({
        player: { ...curPlayer },
        boxes: curBoxes.map(b => ({ ...b })),
        moveChar: pushInfo.pushDir,
      });
    }

    return {
      success: true,
      moves: fullMoves,
      pushMovesCount: totalPushes,
      totalStepsCount: fullMoves.length,
      exploredStates: 0,
      durationMs: 0,
      reason: 'solved',
      steps,
    };
  }
}

const solverCache = new WeakMap<ParsedBoard, SokobanSolver>();

/**
 * 实时死锁箱子快速诊断函数：
 * 判定当前棋盘中哪些未归位的箱子已处于静态死锁或 2x2 死锁状态
 */
export function detectDeadlockedBoxes(board: ParsedBoard, boxes: Position[]): Set<string> {
  const deadlocked = new Set<string>();

  // 使用 WeakMap 缓存求解器实例，避免污染 board 对象导致 Worker postMessage 序列化异常
  let solver = solverCache.get(board);
  if (!solver) {
    solver = new SokobanSolver(board);
    solverCache.set(board, solver);
  }

  const staticDeadlocks = solver.getStaticDeadlocks();
  const width = board.width;
  const boxCoordSet = new Set(boxes.map(b => b.y * width + b.x));

  for (const b of boxes) {
    // 若已在目标点上，不判定为死锁
    if (board.goals[b.y]?.[b.x]) continue;

    const idx = b.y * width + b.x;

    // 1. 静态死锁检测（永远无法到达任意目标的死角）
    if (staticDeadlocks[idx]) {
      deadlocked.add(`${b.x},${b.y}`);
      continue;
    }

    // 2. 动态 2x2 实心死锁检测
    if (solver.check2x2Deadlock(idx, boxCoordSet)) {
      deadlocked.add(`${b.x},${b.y}`);
      continue;
    }
  }

  return deadlocked;
}
