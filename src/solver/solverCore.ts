import {
  Direction,
  PushDirection,
  MoveChar,
  Position,
  ParsedBoard,
  SolverResult,
} from '../types/game';
import { DIR_DELTA } from '../engine/sokoban';

const INF_DIST = 100000;

interface SearchNode {
  boxes: number[];          // Sorted 1D coordinates
  playerCanonical: number;  // Minimal 1D coordinate in player's connected area
  playerActual: number;     // Actual 1D position where player stands
  g: number;                // Number of pushes
  h: number;                // Exact Hungarian bipartite lower-bound heuristic
  f: number;                // g + w * h
  parent: SearchNode | null;
  lastPush: {
    boxFrom: number;
    boxTo: number;
    pushDir: PushDirection;
    playerStandIdx: number;
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
      const left = (index << 1) + 1;
      const right = left + 1;
      let best = index;
      let bestItem = item;

      if (left < length && this.compare(this.heap[left], bestItem) < 0) {
        best = left;
        bestItem = this.heap[left];
      }
      if (right < length && this.compare(this.heap[right], bestItem) < 0) {
        best = right;
        bestItem = this.heap[right];
      }
      if (best === index) break;

      this.heap[index] = bestItem;
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
  private walls: Uint8Array;
  private goals: Uint8Array;
  private staticDeadlocks: Uint8Array;
  private goalCoords: number[];
  private goalPullDist: Int32Array[]; // Exact reverse-pull distance from each cell to goal[i]

  // Zero-allocation scratch buffers for hot loop
  private reachStamp: Int32Array;
  private stampCounter = 0;
  private bfsQueue: Int32Array;
  private boxGrid: Uint8Array;
  private freezeStack: Uint8Array;

  // Pre-allocated Hungarian matching buffers (size K + 1)
  private hungU: Int32Array;
  private hungV: Int32Array;
  private hungP: Int32Array;
  private hungWay: Int32Array;
  private hungMinv: Int32Array;
  private hungUsed: Uint8Array;

  constructor(board: ParsedBoard) {
    this.width = board.width;
    this.height = board.height;
    this.size = this.width * this.height;

    this.walls = new Uint8Array(this.size);
    this.goals = new Uint8Array(this.size);
    this.staticDeadlocks = new Uint8Array(this.size);
    this.goalCoords = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        if (board.walls[y][x]) {
          this.walls[idx] = 1;
        }
        if (board.goals[y][x]) {
          this.goals[idx] = 1;
          this.goalCoords.push(idx);
        }
      }
    }

    this.reachStamp = new Int32Array(this.size);
    this.bfsQueue = new Int32Array(this.size);
    this.boxGrid = new Uint8Array(this.size);
    this.freezeStack = new Uint8Array(this.size);

    const kSize = this.goalCoords.length + 1;
    this.hungU = new Int32Array(kSize);
    this.hungV = new Int32Array(kSize);
    this.hungP = new Int32Array(kSize);
    this.hungWay = new Int32Array(kSize);
    this.hungMinv = new Int32Array(kSize);
    this.hungUsed = new Uint8Array(kSize);

    // 预计算各目标点的精确逆向拉箱距离矩阵与静态死锁格
    this.goalPullDist = this.computeAllGoalPullDistances();
    for (let i = 0; i < this.size; i++) {
      if (this.walls[i]) continue;
      let reachableToAny = false;
      for (let gi = 0; gi < this.goalCoords.length; gi++) {
        if (this.goalPullDist[gi][i] < INF_DIST) {
          reachableToAny = true;
          break;
        }
      }
      if (!reachableToAny) {
        this.staticDeadlocks[i] = 1;
      }
    }
  }

  private toCoord(idx: number): Position {
    return { x: idx % this.width, y: Math.floor(idx / this.width) };
  }

  private toIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  /**
   * 对每个目标点独立执行逆向拉箱 BFS，得到任意格子到该目标点的精确推箱下界距离
   */
  private computeAllGoalPullDistances(): Int32Array[] {
    const width = this.width;
    const height = this.height;
    const deltas = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];

    const matrices: Int32Array[] = [];
    for (const goalIdx of this.goalCoords) {
      const dist = new Int32Array(this.size).fill(INF_DIST);
      dist[goalIdx] = 0;

      let head = 0;
      let tail = 0;
      this.bfsQueue[tail++] = goalIdx;

      while (head < tail) {
        const curr = this.bfsQueue[head++];
        const cx = curr % width;
        const cy = (curr / width) | 0;
        const nextDist = dist[curr] + 1;

        for (let d = 0; d < 4; d++) {
          const { dx, dy } = deltas[d];
          const bx = cx + dx;
          const by = cy + dy;
          const px = cx + 2 * dx;
          const py = cy + 2 * dy;

          if (
            bx >= 0 && bx < width && by >= 0 && by < height &&
            px >= 0 && px < width && py >= 0 && py < height
          ) {
            const bIdx = by * width + bx;
            const pIdx = py * width + px;
            if (!this.walls[bIdx] && !this.walls[pIdx] && dist[bIdx] > nextDist) {
              dist[bIdx] = nextDist;
              this.bfsQueue[tail++] = bIdx;
            }
          }
        }
      }

      matrices.push(dist);
    }

    return matrices;
  }

  /**
   * 启发函数：基于逆向拉箱距离矩阵的精确最小权二分匹配（Hungarian Algorithm）
   * 若不存在有限权完美匹配，直接返回 Infinity（实时二分图死锁剪枝）
   */
  private heuristic(boxes: number[]): number {
    const k = this.goalCoords.length;
    if (k === 0 || boxes.length === 0) return 0;

    if (boxes.length !== k) {
      let sum = 0;
      for (let i = 0; i < boxes.length; i++) {
        let best = INF_DIST;
        const bIdx = boxes[i];
        for (let gi = 0; gi < k; gi++) {
          const d = this.goalPullDist[gi][bIdx];
          if (d < best) best = d;
        }
        if (best >= INF_DIST) return Infinity;
        sum += best;
      }
      return sum;
    }

    const u = this.hungU;
    const v = this.hungV;
    const p = this.hungP;
    const way = this.hungWay;
    const minv = this.hungMinv;
    const used = this.hungUsed;

    u.fill(0);
    v.fill(0);
    p.fill(0);
    way.fill(0);

    for (let i = 1; i <= k; i++) {
      p[0] = i;
      let j0 = 0;
      minv.fill(0x3fffffff);
      used.fill(0);

      do {
        used[j0] = 1;
        const i0 = p[j0];
        const bIdx = boxes[i0 - 1];
        let delta = 0x3fffffff;
        let j1 = 0;

        for (let j = 1; j <= k; j++) {
          if (!used[j]) {
            const cur = this.goalPullDist[j - 1][bIdx] - u[i0] - v[j];
            if (cur < minv[j]) {
              minv[j] = cur;
              way[j] = j0;
            }
            if (minv[j] < delta) {
              delta = minv[j];
              j1 = j;
            }
          }
        }

        for (let j = 0; j <= k; j++) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }

        j0 = j1;
      } while (p[j0] !== 0);

      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }

    let total = 0;
    for (let j = 1; j <= k; j++) {
      const boxRow = p[j];
      const cost = this.goalPullDist[j - 1][boxes[boxRow - 1]];
      if (cost >= INF_DIST) return Infinity;
      total += cost;
    }
    return total;
  }

  public getStaticDeadlocks(): boolean[] {
    return Array.from(this.staticDeadlocks, v => v === 1);
  }

  /**
   * 判定某一箱子在单轴（水平或垂直）方向上是否被永久封锁
   */
  private isAxisBlocked(idx: number, isHoriz: boolean, boxGrid: Uint8Array): boolean {
    const width = this.width;
    const x = idx % width;
    const y = (idx / width) | 0;

    const prevIdx = isHoriz
      ? (x > 0 ? idx - 1 : -1)
      : (y > 0 ? idx - width : -1);
    const nextIdx = isHoriz
      ? (x + 1 < width ? idx + 1 : -1)
      : (y + 1 < this.height ? idx + width : -1);

    // 规则 1：任意一侧是墙壁或越界，则该轴向被阻断
    if (prevIdx === -1 || this.walls[prevIdx] || nextIdx === -1 || this.walls[nextIdx]) {
      return true;
    }

    // 规则 2：两侧均是静态死锁格，箱子朝哪边推都立即死锁
    if (this.staticDeadlocks[prevIdx] && this.staticDeadlocks[nextIdx]) {
      return true;
    }

    // 规则 3：若相邻格存在另一只箱子，且该箱子自身已被冻结或形成递归闭环
    if (boxGrid[prevIdx]) {
      if (this.freezeStack[prevIdx] || this.isBoxFrozen(prevIdx, boxGrid)) {
        return true;
      }
    }
    if (boxGrid[nextIdx]) {
      if (this.freezeStack[nextIdx] || this.isBoxFrozen(nextIdx, boxGrid)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 递归冻结死锁判定：箱子同时在水平和垂直双轴被封锁则永久冻结
   */
  private isBoxFrozen(boxIdx: number, boxGrid: Uint8Array): boolean {
    this.freezeStack[boxIdx] = 1;
    const frozen =
      this.isAxisBlocked(boxIdx, true, boxGrid) &&
      this.isAxisBlocked(boxIdx, false, boxGrid);
    this.freezeStack[boxIdx] = 0;
    return frozen;
  }

  public isBoxFrozenPublic(boxIdx: number, boxGrid: Uint8Array): boolean {
    this.freezeStack.fill(0);
    return this.isBoxFrozen(boxIdx, boxGrid);
  }

  /**
   * 动态冻结死锁检查（涵盖 2x2 死锁、沿墙贴死与多箱互锁）：
   * 推入 pushedBoxIdx 后，检查新箱子及 4 邻接箱子中是否存在“不在目标点且已永久冻结”的箱子
   */
  public checkFreezeDeadlock(pushedBoxIdx: number, boxGrid: Uint8Array): boolean {
    if (!this.goals[pushedBoxIdx]) {
      this.freezeStack.fill(0);
      if (this.isBoxFrozen(pushedBoxIdx, boxGrid)) {
        return true;
      }
    }

    const width = this.width;
    const x = pushedBoxIdx % width;
    const y = (pushedBoxIdx / width) | 0;

    const neighbors = [
      y > 0 ? pushedBoxIdx - width : -1,
      y + 1 < this.height ? pushedBoxIdx + width : -1,
      x > 0 ? pushedBoxIdx - 1 : -1,
      x + 1 < width ? pushedBoxIdx + 1 : -1,
    ];

    for (let i = 0; i < 4; i++) {
      const adj = neighbors[i];
      if (adj !== -1 && boxGrid[adj] && !this.goals[adj]) {
        this.freezeStack.fill(0);
        if (this.isBoxFrozen(adj, boxGrid)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 兼容保留接口：动态 2x2 实心死锁检查
   */
  public check2x2Deadlock(newBoxIdx: number, boxSet: Set<number>): boolean {
    const bx = newBoxIdx % this.width;
    const by = Math.floor(newBoxIdx / this.width);
    const offsets = [
      { ox: -1, oy: -1 },
      { ox: 0, oy: -1 },
      { ox: -1, oy: 0 },
      { ox: 0, oy: 0 },
    ];

    for (const { ox, oy } of offsets) {
      const cx = bx + ox;
      const cy = by + oy;
      if (cx < 0 || cx + 1 >= this.width || cy < 0 || cy + 1 >= this.height) continue;

      const p00 = cy * this.width + cx;
      const p10 = cy * this.width + (cx + 1);
      const p01 = (cy + 1) * this.width + cx;
      const p11 = (cy + 1) * this.width + (cx + 1);

      const isBlock00 = this.walls[p00] || boxSet.has(p00);
      const isBlock10 = this.walls[p10] || boxSet.has(p10);
      const isBlock01 = this.walls[p01] || boxSet.has(p01);
      const isBlock11 = this.walls[p11] || boxSet.has(p11);

      if (isBlock00 && isBlock10 && isBlock01 && isBlock11) {
        const hasUnplacedBox =
          (boxSet.has(p00) && !this.goals[p00]) ||
          (boxSet.has(p10) && !this.goals[p10]) ||
          (boxSet.has(p01) && !this.goals[p01]) ||
          (boxSet.has(p11) && !this.goals[p11]);
        if (hasUnplacedBox) return true;
      }
    }

    return false;
  }

  /**
   * 零分配时间戳标记 BFS：填充玩家当前连通域并返回规范最小坐标
   */
  private fillReachable(playerIdx: number, boxGrid: Uint8Array): { canonical: number; stamp: number } {
    this.stampCounter++;
    if (this.stampCounter >= 0x3fffffff) {
      this.reachStamp.fill(0);
      this.stampCounter = 1;
    }
    const stamp = this.stampCounter;
    const width = this.width;
    const height = this.height;
    const reach = this.reachStamp;
    const queue = this.bfsQueue;

    reach[playerIdx] = stamp;
    queue[0] = playerIdx;
    let head = 0;
    let tail = 1;
    let canonical = playerIdx;

    while (head < tail) {
      const curr = queue[head++];
      if (curr < canonical) canonical = curr;

      const cx = curr % width;
      const cy = (curr / width) | 0;

      if (cy > 0) {
        const n = curr - width;
        if (reach[n] !== stamp && !this.walls[n] && !boxGrid[n]) {
          reach[n] = stamp;
          queue[tail++] = n;
        }
      }
      if (cy + 1 < height) {
        const n = curr + width;
        if (reach[n] !== stamp && !this.walls[n] && !boxGrid[n]) {
          reach[n] = stamp;
          queue[tail++] = n;
        }
      }
      if (cx > 0) {
        const n = curr - 1;
        if (reach[n] !== stamp && !this.walls[n] && !boxGrid[n]) {
          reach[n] = stamp;
          queue[tail++] = n;
        }
      }
      if (cx + 1 < width) {
        const n = curr + 1;
        if (reach[n] !== stamp && !this.walls[n] && !boxGrid[n]) {
          reach[n] = stamp;
          queue[tail++] = n;
        }
      }
    }

    return { canonical, stamp };
  }

  /**
   * 仅在回溯胜利路径时调用：从 startIdx 走到 targetIdx 的最短人物步序列
   */
  private findWalkPath(
    startIdx: number,
    targetIdx: number,
    boxGrid: Uint8Array
  ): Direction[] {
    if (startIdx === targetIdx) return [];

    const width = this.width;
    const height = this.height;
    const prevArr = new Int32Array(this.size).fill(-1);
    const dirArr: (Direction | null)[] = new Array(this.size).fill(null);
    const visited = new Uint8Array(this.size);

    let head = 0;
    let tail = 0;
    this.bfsQueue[tail++] = startIdx;
    visited[startIdx] = 1;

    let found = false;
    while (head < tail) {
      const curr = this.bfsQueue[head++];
      if (curr === targetIdx) {
        found = true;
        break;
      }

      const cx = curr % width;
      const cy = (curr / width) | 0;

      const neighbors: [number, Direction][] = [
        [cy > 0 ? curr - width : -1, 'u'],
        [cy + 1 < height ? curr + width : -1, 'd'],
        [cx > 0 ? curr - 1 : -1, 'l'],
        [cx + 1 < width ? curr + 1 : -1, 'r'],
      ];

      for (let i = 0; i < 4; i++) {
        const [nIdx, d] = neighbors[i];
        if (nIdx !== -1 && !visited[nIdx] && !this.walls[nIdx] && !boxGrid[nIdx]) {
          visited[nIdx] = 1;
          prevArr[nIdx] = curr;
          dirArr[nIdx] = d;
          this.bfsQueue[tail++] = nIdx;
        }
      }
    }

    if (!found) return [];

    const path: Direction[] = [];
    let curr = targetIdx;
    while (curr !== startIdx) {
      path.push(dirArr[curr]!);
      curr = prevArr[curr];
    }
    path.reverse();
    return path;
  }

  private encodeStateKey(boxes: number[], canonicalPlayer: number): string {
    let key = String.fromCharCode(canonicalPlayer);
    for (let i = 0; i < boxes.length; i++) {
      key += String.fromCharCode(boxes[i]);
    }
    return key;
  }

  private sortNumbersInPlace(arr: number[]): void {
    // 插入排序对小数组（3~10 个箱子）比 Array.prototype.sort 更快且无回调开销
    for (let i = 1; i < arr.length; i++) {
      const val = arr[i];
      let j = i - 1;
      while (j >= 0 && arr[j] > val) {
        arr[j + 1] = arr[j];
        j--;
      }
      arr[j + 1] = val;
    }
  }

  /**
   * 求解核心：零分配推箱宏动作加权 A*（Hungarian 匹配 + 递归冻结死锁剪枝）
   */
  public solve(
    initialPlayer: Position,
    initialBoxes: Position[],
    options: SolverOptions = {}
  ): SolverResult {
    const startTime = performance.now();
    const maxStates = options.maxStates ?? 500000;
    const timeoutMs = options.timeoutMs ?? 8000;
    const weight = options.weight ?? 1.3;
    const shouldAbort = options.shouldAbort;

    const initPlayerIdx = this.toIndex(initialPlayer.x, initialPlayer.y);
    const initBoxes = initialBoxes
      .map(b => this.toIndex(b.x, b.y))
      .sort((a, b) => a - b);

    const isGoalAll = (boxes: number[]) => {
      for (let i = 0; i < boxes.length; i++) {
        if (!this.goals[boxes[i]]) return false;
      }
      return true;
    };

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

    const boxGrid = this.boxGrid;
    boxGrid.fill(0);
    for (let i = 0; i < initBoxes.length; i++) {
      boxGrid[initBoxes[i]] = 1;
    }

    const initH = this.heuristic(initBoxes);
    if (!Number.isFinite(initH)) {
      return {
        success: false,
        moves: '',
        pushMovesCount: 0,
        totalStepsCount: 0,
        exploredStates: 1,
        durationMs: performance.now() - startTime,
        reason: 'unsolvable',
      };
    }

    const { canonical: initCanonical } = this.fillReachable(initPlayerIdx, boxGrid);

    const initialNode: SearchNode = {
      boxes: initBoxes,
      playerCanonical: initCanonical,
      playerActual: initPlayerIdx,
      g: 0,
      h: initH,
      f: weight * initH,
      parent: null,
      lastPush: null,
    };

    const frontier = new PriorityQueue<SearchNode>((a, b) =>
      a.f !== b.f ? a.f - b.f : a.h - b.h
    );
    frontier.push(initialNode);

    const visited = new Map<string, number>();
    visited.set(this.encodeStateKey(initBoxes, initCanonical), 0);

    let exploredStates = 0;
    const width = this.width;
    const height = this.height;

    const pushDirections: {
      pushDir: PushDirection;
      deltaX: number;
      deltaY: number;
    }[] = [
      { pushDir: 'U', deltaX: 0, deltaY: -1 },
      { pushDir: 'D', deltaX: 0, deltaY: 1 },
      { pushDir: 'L', deltaX: -1, deltaY: 0 },
      { pushDir: 'R', deltaX: 1, deltaY: 0 },
    ];

    // 复用主连通域缓冲区
    const curReachSnap = new Int32Array(this.size);

    while (frontier.size > 0) {
      exploredStates++;

      if ((exploredStates & 1023) === 0) {
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
      const curKey = this.encodeStateKey(current.boxes, current.playerCanonical);
      const bestG = visited.get(curKey);
      if (bestG !== undefined && bestG < current.g) {
        continue;
      }

      if (isGoalAll(current.boxes)) {
        const result = this.reconstructSolution(current);
        result.exploredStates = exploredStates;
        result.durationMs = performance.now() - startTime;
        return result;
      }

      // 填充当前箱子网格与玩家可达区域
      boxGrid.fill(0);
      for (let i = 0; i < current.boxes.length; i++) {
        boxGrid[current.boxes[i]] = 1;
      }

      const { stamp: curStamp } = this.fillReachable(current.playerActual, boxGrid);
      curReachSnap.set(this.reachStamp);

      const nextG = current.g + 1;

      for (let i = 0; i < current.boxes.length; i++) {
        const boxIdx = current.boxes[i];
        const bx = boxIdx % width;
        const by = (boxIdx / width) | 0;

        for (let d = 0; d < 4; d++) {
          const p = pushDirections[d];
          const px = bx - p.deltaX;
          const py = by - p.deltaY;
          const nbx = bx + p.deltaX;
          const nby = by + p.deltaY;

          if (
            px < 0 || px >= width || py < 0 || py >= height ||
            nbx < 0 || nbx >= width || nby < 0 || nby >= height
          ) {
            continue;
          }

          const pIdx = py * width + px;
          if (curReachSnap[pIdx] !== curStamp) {
            continue;
          }

          const nbIdx = nby * width + nbx;
          if (this.walls[nbIdx] || boxGrid[nbIdx]) {
            continue;
          }

          // 剪枝 1：静态死锁格剪枝
          if (this.staticDeadlocks[nbIdx]) {
            continue;
          }

          // 临时更新 boxGrid 进行后续死锁与连通域计算
          boxGrid[boxIdx] = 0;
          boxGrid[nbIdx] = 1;

          // 剪枝 2：递归冻结死锁检测
          if (this.checkFreezeDeadlock(nbIdx, boxGrid)) {
            boxGrid[nbIdx] = 0;
            boxGrid[boxIdx] = 1;
            continue;
          }

          const nextBoxes = current.boxes.slice();
          nextBoxes[i] = nbIdx;
          this.sortNumbersInPlace(nextBoxes);

          // 剪枝 3：精确二分匹配启发与二分图死锁检测
          const h = this.heuristic(nextBoxes);
          if (!Number.isFinite(h)) {
            boxGrid[nbIdx] = 0;
            boxGrid[boxIdx] = 1;
            continue;
          }

          const { canonical: nextCanonical } = this.fillReachable(boxIdx, boxGrid);

          boxGrid[nbIdx] = 0;
          boxGrid[boxIdx] = 1;

          const key = this.encodeStateKey(nextBoxes, nextCanonical);
          const existingG = visited.get(key);
          if (existingG !== undefined && existingG <= nextG) {
            continue;
          }

          visited.set(key, nextG);

          frontier.push({
            boxes: nextBoxes,
            playerCanonical: nextCanonical,
            playerActual: boxIdx,
            g: nextG,
            h,
            f: nextG + weight * h,
            parent: current,
            lastPush: {
              boxFrom: boxIdx,
              boxTo: nbIdx,
              pushDir: p.pushDir,
              playerStandIdx: pIdx,
            },
          });
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
   * 仅针对最终胜出节点，沿反向链条展开每步实际人物寻路与推箱序列
   */
  private reconstructSolution(endNode: SearchNode): SolverResult {
    const nodes: SearchNode[] = [];
    let curr: SearchNode | null = endNode;
    while (curr) {
      nodes.push(curr);
      curr = curr.parent;
    }
    nodes.reverse();

    let fullMoves = '';
    let totalPushes = 0;

    const steps: {
      player: Position;
      boxes: Position[];
      moveChar: MoveChar;
    }[] = [];

    let curPlayerIdx = nodes[0].playerActual;
    let curPlayer = this.toCoord(curPlayerIdx);
    let curBoxes = nodes[0].boxes.map(b => this.toCoord(b));

    const simBoxGrid = new Uint8Array(this.size);
    for (const bIdx of nodes[0].boxes) {
      simBoxGrid[bIdx] = 1;
    }

    for (let i = 1; i < nodes.length; i++) {
      const pushInfo = nodes[i].lastPush!;
      const walkDirs = this.findWalkPath(curPlayerIdx, pushInfo.playerStandIdx, simBoxGrid);

      for (const w of walkDirs) {
        fullMoves += w;
        const delta = DIR_DELTA[w];
        curPlayer = { x: curPlayer.x + delta.dx, y: curPlayer.y + delta.dy };
        steps.push({
          player: { ...curPlayer },
          boxes: curBoxes.map(b => ({ ...b })),
          moveChar: w,
        });
      }

      fullMoves += pushInfo.pushDir;
      totalPushes++;

      const fromCoord = this.toCoord(pushInfo.boxFrom);
      const toCoord = this.toCoord(pushInfo.boxTo);

      simBoxGrid[pushInfo.boxFrom] = 0;
      simBoxGrid[pushInfo.boxTo] = 1;

      curPlayerIdx = pushInfo.boxFrom;
      curPlayer = { ...fromCoord };
      curBoxes = curBoxes.map(b =>
        b.x === fromCoord.x && b.y === fromCoord.y ? { ...toCoord } : { ...b }
      );

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
 * 判定当前棋盘中哪些未归位的箱子已处于静态死锁或递归冻结死锁状态
 */
export function detectDeadlockedBoxes(board: ParsedBoard, boxes: Position[]): Set<string> {
  const deadlocked = new Set<string>();

  let solver = solverCache.get(board);
  if (!solver) {
    solver = new SokobanSolver(board);
    solverCache.set(board, solver);
  }

  const staticDeadlocks = solver.getStaticDeadlocks();
  const width = board.width;
  const size = width * board.height;
  const boxGrid = new Uint8Array(size);
  for (const b of boxes) {
    boxGrid[b.y * width + b.x] = 1;
  }

  for (const b of boxes) {
    if (board.goals[b.y]?.[b.x]) continue;
    const idx = b.y * width + b.x;

    if (staticDeadlocks[idx]) {
      deadlocked.add(`${b.x},${b.y}`);
      continue;
    }

    if (solver.isBoxFrozenPublic(idx, boxGrid)) {
      deadlocked.add(`${b.x},${b.y}`);
      continue;
    }
  }

  return deadlocked;
}
