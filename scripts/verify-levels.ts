import { LEVELS } from '../src/levels/levels';
import {
  parseXSB,
  isMapEnclosed,
  createInitialGameState,
  applyMove,
} from '../src/engine/sokoban';
import { SokobanSolver } from '../src/solver/solverCore';
import { Direction, ParsedBoard, Position } from '../src/types/game';

interface VerificationResult {
  id: number;
  title: string;
  chapter: number;
  boxesCount: number;
  success: boolean;
  pushes: number;
  totalSteps: number;
  switches: number;
  unGoals: number;
  states125: number;
  duration125: number;
  browserMs: number;
  gatePassed: boolean;
  error?: string;
}

function stripEdgeBlankLines(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.map(l => l.replace(/\s+$/, '')).join('\n');
}

function getDihedralWallSignature(xsb: string): string {
  const rawLines = stripEdgeBlankLines(xsb).split('\n');
  const w = Math.max(...rawLines.map(l => l.length));
  const grid: string[][] = rawLines.map(l =>
    Array.from({ length: w }, (_, x) => (l[x] === '#' ? '#' : '.'))
  );

  const serialize = (g: string[][]) => g.map(row => row.join('')).join('\n');
  const rotate90 = (g: string[][]): string[][] => {
    const rows = g.length;
    const cols = g[0].length;
    const out: string[][] = Array.from({ length: cols }, () => new Array(rows));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out[c][rows - 1 - r] = g[r][c];
      }
    }
    return out;
  };
  const flipH = (g: string[][]): string[][] => g.map(row => [...row].reverse());

  let best = '';
  let cur = grid;
  for (let rot = 0; rot < 4; rot++) {
    const s1 = serialize(cur);
    const s2 = serialize(flipH(cur));
    if (!best || s1 < best) best = s1;
    if (s2 < best) best = s2;
    cur = rotate90(cur);
  }
  return best;
}

function measureSolutionStats(
  board: ParsedBoard,
  steps: { player: Position; boxes: Position[]; moveChar: string }[]
): { switches: number; unGoals: number } {
  let lastDestKey = '';
  let switches = 0;
  let unGoals = 0;
  let pushNum = 0;

  for (const st of steps) {
    if (st.moveChar !== st.moveChar.toUpperCase()) continue;
    pushNum++;

    const fromX = st.player.x;
    const fromY = st.player.y;
    const fromKey = `${fromX},${fromY}`;

    let dx = 0;
    let dy = 0;
    if (st.moveChar === 'U') dy = -1;
    else if (st.moveChar === 'D') dy = 1;
    else if (st.moveChar === 'L') dx = -1;
    else if (st.moveChar === 'R') dx = 1;
    const toKey = `${fromX + dx},${fromY + dy}`;

    if (board.goals[fromY]?.[fromX]) {
      unGoals++;
    }
    if (pushNum > 1 && fromKey !== lastDestKey) {
      switches++;
    }
    lastDestKey = toKey;
  }

  return { switches, unGoals };
}

function replayAndVerify(board: ParsedBoard, moves: string): void {
  let state = createInitialGameState(board);
  for (let i = 0; i < moves.length; i++) {
    const dir = moves[i].toLowerCase() as Direction;
    const { nextState, moved } = applyMove(state, board, dir);
    if (!moved) {
      throw new Error(`引擎回放失败：第 ${i + 1} 步 '${moves[i]}' 无法执行`);
    }
    state = nextState;
  }
  if (!state.isWon) {
    throw new Error('引擎回放完毕后未达成胜利条件！');
  }
}

console.log('================================================================================================');
console.log('       Sokoban Studio Pro - 专业关卡拓扑唯一性、可解性与阶梯难度全自动验算脚本       ');
console.log('================================================================================================\n');

let allPassed = true;
const results: VerificationResult[] = [];
const wallSigSeen = new Map<string, number>();

const CHAPTER_GATES: Record<
  number,
  { minPushes: number; minSwitches: number; minStates: number; maxBrowserMs: number }
> = {
  1: { minPushes: 14, minSwitches: 5, minStates: 30, maxBrowserMs: 1000 },
  2: { minPushes: 22, minSwitches: 10, minStates: 150, maxBrowserMs: 1500 },
  3: { minPushes: 30, minSwitches: 10, minStates: 800, maxBrowserMs: 2500 },
  4: { minPushes: 35, minSwitches: 10, minStates: 2000, maxBrowserMs: 3500 },
  5: { minPushes: 38, minSwitches: 14, minStates: 4000, maxBrowserMs: 4500 },
};

for (let i = 0; i < LEVELS.length; i++) {
  const level = LEVELS[i];
  const tag = `[#${String(level.id).padStart(2, '0')} Ch${level.chapter}] ${level.title}`;
  process.stdout.write(`${tag}... `);

  try {
    const wallSig = getDihedralWallSignature(level.xsb);
    if (wallSigSeen.has(wallSig)) {
      throw new Error(`外墙拓扑与关卡 #${wallSigSeen.get(wallSig)} 重复（含旋转/镜像对称）`);
    }
    wallSigSeen.set(wallSig, level.id);

    const board = parseXSB(level.xsb);
    const totalGoals = board.goalPositions.length;
    const totalBoxes = board.initialBoxes.length;

    if (totalGoals === 0 || totalBoxes === 0) {
      throw new Error(`目标点(${totalGoals})或箱子数(${totalBoxes})为0`);
    }
    if (totalGoals !== totalBoxes) {
      throw new Error(`箱子数量(${totalBoxes})与目标点数量(${totalGoals})不一致！`);
    }

    const enclosureCheck = isMapEnclosed(board);
    if (!enclosureCheck.enclosed) {
      throw new Error(`封闭性失败: ${enclosureCheck.reason}`);
    }

    const solver = new SokobanSolver(board);
    const sol115 = solver.solve(board.initialPlayer, board.initialBoxes, {
      maxStates: 500000,
      timeoutMs: 8000,
      weight: 1.15,
    });

    if (!sol115.success || !sol115.steps) {
      allPassed = false;
      console.log(
        `❌ w=1.15 求解失败: ${sol115.reason} (${sol115.durationMs.toFixed(1)}ms, 状态=${sol115.exploredStates})`
      );
      results.push({
        id: level.id,
        title: level.title,
        chapter: level.chapter,
        boxesCount: totalBoxes,
        success: false,
        pushes: 0,
        totalSteps: 0,
        switches: 0,
        unGoals: 0,
        states125: sol115.exploredStates,
        duration125: sol115.durationMs,
        browserMs: 0,
        gatePassed: false,
        error: sol115.reason,
      });
      continue;
    }

    // 引擎逐步回放验证求解动作序列完全合法
    replayAndVerify(board, sol115.moves);

    const sol125 = solver.solve(board.initialPlayer, board.initialBoxes, {
      maxStates: 500000,
      timeoutMs: 8000,
      weight: 1.25,
    });

    if (!sol125.success) {
      allPassed = false;
      console.log(
        `❌ w=1.25 浏览器求解失败: ${sol125.reason} (${sol125.durationMs.toFixed(1)}ms)`
      );
      results.push({
        id: level.id,
        title: level.title,
        chapter: level.chapter,
        boxesCount: totalBoxes,
        success: false,
        pushes: sol115.pushMovesCount,
        totalSteps: sol115.totalStepsCount,
        switches: 0,
        unGoals: 0,
        states125: sol115.exploredStates,
        duration125: sol115.durationMs,
        browserMs: sol125.durationMs,
        gatePassed: false,
        error: `browser w=1.25 ${sol125.reason}`,
      });
      continue;
    }

    const { switches, unGoals } = measureSolutionStats(board, sol115.steps);
    const gate = CHAPTER_GATES[level.chapter];
    let gatePassed = true;
    const errs: string[] = [];

    if (gate) {
      if (sol115.pushMovesCount < gate.minPushes) {
        gatePassed = false;
        errs.push(`推箱 ${sol115.pushMovesCount} < ${gate.minPushes}`);
      }
      if (switches < gate.minSwitches) {
        gatePassed = false;
        errs.push(`切换 ${switches} < ${gate.minSwitches}`);
      }
      if (sol115.exploredStates < gate.minStates) {
        gatePassed = false;
        errs.push(`状态 ${sol115.exploredStates} < ${gate.minStates}`);
      }
      if (sol125.durationMs > gate.maxBrowserMs) {
        gatePassed = false;
        errs.push(`浏览器耗时 ${sol125.durationMs.toFixed(0)}ms > ${gate.maxBrowserMs}ms`);
      }
    }

    if (level.parSteps !== sol115.totalStepsCount) {
      gatePassed = false;
      errs.push(`parSteps(${level.parSteps}) != ${sol115.totalStepsCount}`);
    }

    if (!gatePassed) {
      allPassed = false;
      console.log(`⚠️ 未达标: ${errs.join(', ')}`);
    } else {
      console.log(
        `✅ 推箱:${sol115.pushMovesCount} 步:${sol115.totalStepsCount} 切换:${switches} 出位:${unGoals} 状态:${sol115.exploredStates} 浏览器:${sol125.durationMs.toFixed(1)}ms`
      );
    }

    results.push({
      id: level.id,
      title: level.title,
      chapter: level.chapter,
      boxesCount: totalBoxes,
      success: true,
      pushes: sol115.pushMovesCount,
      totalSteps: sol115.totalStepsCount,
      switches,
      unGoals,
      states125: sol115.exploredStates,
      duration125: sol115.durationMs,
      browserMs: sol125.durationMs,
      gatePassed,
      error: errs.length > 0 ? errs.join('; ') : undefined,
    });
  } catch (err: any) {
    allPassed = false;
    console.log(`❌ 错误: ${err.message}`);
    results.push({
      id: level.id,
      title: level.title,
      chapter: level.chapter,
      boxesCount: 0,
      success: false,
      pushes: 0,
      totalSteps: 0,
      switches: 0,
      unGoals: 0,
      states125: 0,
      duration125: 0,
      browserMs: 0,
      gatePassed: false,
      error: err.message,
    });
  }
}

console.log('\n================================================================================================');
console.log('ID | Title        | Boxes | Pushes | Steps | Switches | UnGoals | States(1.15) | BrowserMs(1.25)');
console.log('------------------------------------------------------------------------------------------------');
for (const r of results) {
  const status = r.success && r.gatePassed ? '' : ' [!FAIL]';
  console.log(
    `${String(r.id).padStart(2, '0')} | ${r.title.padEnd(10, ' ')} | ${String(r.boxesCount).padStart(5)} | ${String(r.pushes).padStart(6)} | ${String(r.totalSteps).padStart(5)} | ${String(r.switches).padStart(8)} | ${String(r.unGoals).padStart(7)} | ${String(r.states125).padStart(12)} | ${r.browserMs.toFixed(1).padStart(14)}ms${status}`
  );
}
console.log('================================================================================================');

const totalLevels = LEVELS.length;
const passedLevels = results.filter(r => r.success && r.gatePassed).length;

console.log(`总关卡数: ${totalLevels} | 达标数量: ${passedLevels} / ${totalLevels}`);
console.log(
  `整体状态: ${
    allPassed
      ? '🎉 全部 25 关拓扑唯一、100% 封闭、回放通过且满足专业阶梯难度！'
      : '⚠️ 存在未达标关卡，请检查并调整！'
  }`
);

if (!allPassed) {
  process.exit(1);
}
