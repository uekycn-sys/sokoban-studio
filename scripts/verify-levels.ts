import { LEVELS } from '../src/levels/levels';
import { parseXSB, isMapEnclosed } from '../src/engine/sokoban';
import { SokobanSolver } from '../src/solver/solverCore';

interface VerificationResult {
  id: number;
  title: string;
  chapter: number;
  chapterTitle: string;
  boxesCount: number;
  success: boolean;
  pushes: number;
  totalSteps: number;
  durationMs: number;
  exploredStates: number;
  gatePassed: boolean;
  error?: string;
}

console.log('========================================================================');
console.log('       Sokoban Studio V2 - 关卡严格封闭性与阶梯难度全自动验证脚本       ');
console.log('========================================================================\n');

let allPassed = true;
const results: VerificationResult[] = [];

for (let i = 0; i < LEVELS.length; i++) {
  const level = LEVELS[i];
  const tag = `[关卡 ${String(level.id).padStart(2, '0')}] ${level.chapterTitle} - ${level.title}`;
  process.stdout.write(`${tag}... `);

  try {
    const board = parseXSB(level.xsb);

    // 1. 结构完整性与数量匹配校验
    const totalGoals = board.goalPositions.length;
    const totalBoxes = board.initialBoxes.length;

    if (totalGoals === 0 || totalBoxes === 0) {
      throw new Error(`目标点(${totalGoals})或箱子数(${totalBoxes})为0`);
    }

    if (totalGoals !== totalBoxes) {
      throw new Error(`箱子数量(${totalBoxes})与目标点数量(${totalGoals})不一致！`);
    }

    // 2. 严格封闭性校验（零容忍）
    const enclosureCheck = isMapEnclosed(board);
    if (!enclosureCheck.enclosed) {
      throw new Error(`封闭性失败: ${enclosureCheck.reason}`);
    }

    // 3. 求解器性能与可解性校验
    const solver = new SokobanSolver(board);
    const solution = solver.solve(board.initialPlayer, board.initialBoxes, {
      maxStates: 400000,
      timeoutMs: 5000,
      weight: 1.3,
    });

    if (!solution.success) {
      allPassed = false;
      console.log(`❌ 求解失败: ${solution.reason} (耗时: ${solution.durationMs.toFixed(1)}ms, 探索: ${solution.exploredStates})`);
      results.push({
        id: level.id,
        title: level.title,
        chapter: level.chapter,
        chapterTitle: level.chapterTitle,
        boxesCount: totalBoxes,
        success: false,
        pushes: 0,
        totalSteps: 0,
        durationMs: solution.durationMs,
        exploredStates: solution.exploredStates,
        gatePassed: false,
        error: solution.reason,
      });
      continue;
    }

    // 4. 章节阶梯难度门槛校验
    let gatePassed = true;
    let gateError = '';

    const ch = level.chapter;
    const p = solution.pushMovesCount;
    const s = solution.exploredStates;
    const t = solution.durationMs;

    if (ch === 1) {
      if (p < 4 || p > 12) {
        gatePassed = false;
        gateError = `第1章推箱步数要求 4~12，当前为 ${p}`;
      }
    } else if (ch === 2) {
      if (p < 10 || s < 25) {
        gatePassed = false;
        gateError = `第2章要求推箱 >= 10 且探索状态 >= 25，当前为 ${p}推 / ${s}状态`;
      }
    } else if (ch === 3) {
      if (p < 16 || s < 80) {
        gatePassed = false;
        gateError = `第3章要求推箱 >= 16 且探索状态 >= 80，当前为 ${p}推 / ${s}状态`;
      }
    } else if (ch === 4) {
      if (p < 22 || s < 250) {
        gatePassed = false;
        gateError = `第4章要求推箱 >= 22 且探索状态 >= 250，当前为 ${p}推 / ${s}状态`;
      }
    } else if (ch === 5) {
      if (p < 28 || s < 600 || t > 3500) {
        gatePassed = false;
        gateError = `第5章要求推箱 >= 28、状态 >= 600、耗时 <= 3500ms，当前为 ${p}推 / ${s}状态 / ${t.toFixed(1)}ms`;
      }
    }

    if (!gatePassed) {
      allPassed = false;
      console.log(`⚠️ 难度门槛未达标: ${gateError}`);
      results.push({
        id: level.id,
        title: level.title,
        chapter: level.chapter,
        chapterTitle: level.chapterTitle,
        boxesCount: totalBoxes,
        success: true,
        pushes: solution.pushMovesCount,
        totalSteps: solution.totalStepsCount,
        durationMs: solution.durationMs,
        exploredStates: solution.exploredStates,
        gatePassed: false,
        error: gateError,
      });
    } else {
      console.log(`✅ 完美! 推箱: ${solution.pushMovesCount}步, 总步数: ${solution.totalStepsCount}步, 状态: ${solution.exploredStates}, 耗时: ${solution.durationMs.toFixed(1)}ms`);
      results.push({
        id: level.id,
        title: level.title,
        chapter: level.chapter,
        chapterTitle: level.chapterTitle,
        boxesCount: totalBoxes,
        success: true,
        pushes: solution.pushMovesCount,
        totalSteps: solution.totalStepsCount,
        durationMs: solution.durationMs,
        exploredStates: solution.exploredStates,
        gatePassed: true,
      });
    }
  } catch (err: any) {
    allPassed = false;
    console.log(`❌ 校验/运行错误: ${err.message}`);
    results.push({
      id: level.id,
      title: level.title,
      chapter: level.chapter,
      chapterTitle: level.chapterTitle,
      boxesCount: 0,
      success: false,
      pushes: 0,
      totalSteps: 0,
      durationMs: 0,
      exploredStates: 0,
      gatePassed: false,
      error: err.message,
    });
  }
}

console.log('\n========================================================================');
console.log('                           验算汇总报告                                 ');
console.log('========================================================================');

const totalLevels = LEVELS.length;
const passedLevels = results.filter(r => r.success && r.gatePassed).length;

console.log(`总关卡数: ${totalLevels}`);
console.log(`达标数量: ${passedLevels} / ${totalLevels}`);
console.log(`整体状态: ${allPassed ? '🎉 全部 25 关 100% 封闭无漏墙且满足难度梯度！' : '⚠️ 存在未通过关卡，需调整地图！'}`);

console.log('\n最新参考步数 (用于同步 levels.ts 中的 parSteps):');
console.log(JSON.stringify(results.map(r => ({ id: r.id, parSteps: r.totalSteps, pushes: r.pushes, states: r.exploredStates })), null, 2));

if (!allPassed) {
  process.exit(1);
}
