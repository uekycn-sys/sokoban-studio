import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Direction,
  GameState,
  LevelProgress,
  SolverResult,
  Position,
  LevelDefinition,
} from './types/game';
import { LEVELS } from './levels/levels';
import {
  parseXSB,
  createInitialGameState,
  applyMove,
  undoMove,
  redoMove,
  findWalkPath,
  DIR_DELTA,
  coordsEqual,
  checkIsWon,
} from './engine/sokoban';
import { SokobanSolver, detectDeadlockedBoxes } from './solver/solverCore';
import { sound } from './audio/sound';
import { TopBar } from './components/TopBar';
import { SokobanBoard } from './components/SokobanBoard';
import { AIDemoBar } from './components/AIDemoBar';
import { LevelSelectorModal } from './components/LevelSelectorModal';
import { VictoryModal } from './components/VictoryModal';
import { VirtualDPad } from './components/VirtualDPad';

interface DemoSnapshot {
  moves: number;
  pushes: number;
  player: Position;
  playerFacing: Direction;
  boxes: Position[];
  prefixPushes: number[];
}

export const App: React.FC = () => {
  // 1. 关卡与存档持久化
  const [levelIndex, setLevelIndex] = useState<number>(() => {
    const saved = localStorage.getItem('sokoban_current_level_v3');
    const idx = saved ? parseInt(saved, 10) : 0;
    return idx >= 0 && idx < LEVELS.length ? idx : 0;
  });

  const [customLevel, setCustomLevel] = useState<LevelDefinition | null>(null);

  const [progressMap, setProgressMap] = useState<Record<number, LevelProgress>>(() => {
    try {
      const saved = localStorage.getItem('sokoban_progress_v3');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isMuted, setIsMuted] = useState<boolean>(() => sound.isMuted());
  const [showDeadlockWarning, setShowDeadlockWarning] = useState<boolean>(() => {
    const saved = localStorage.getItem('sokoban_deadlock_warning');
    return saved !== null ? saved === 'true' : true;
  });

  const [isLevelSelectorOpen, setIsLevelSelectorOpen] = useState<boolean>(false);
  const [isVictoryModalOpen, setIsVictoryModalOpen] = useState<boolean>(false);
  const [isNewBest, setIsNewBest] = useState<boolean>(false);

  // 当前有效关卡对象（自定义关卡优先）
  const activeLevel = customLevel || LEVELS[levelIndex];

  // 2. 棋盘解析与游戏状态
  const board = useMemo(() => parseXSB(activeLevel.xsb), [activeLevel]);
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState(board));
  const [walkTarget, setWalkTarget] = useState<Position | null>(null);

  // 实时死锁诊断与归位进度计算
  const deadlockedBoxes = useMemo(() => {
    return detectDeadlockedBoxes(board, gameState.boxes);
  }, [board, gameState.boxes]);

  const goalsOnTarget = useMemo(() => {
    return gameState.boxes.filter(b => board.goals[b.y]?.[b.x]).length;
  }, [board.goals, gameState.boxes]);

  // 自动寻路 / 提示步骤执行定时器引用
  const walkTimerRef = useRef<number | null>(null);

  const clearWalkTimer = useCallback(() => {
    if (walkTimerRef.current !== null) {
      window.clearInterval(walkTimerRef.current);
      walkTimerRef.current = null;
    }
    setWalkTarget(null);
  }, []);

  // 3. AI 求解与演示状态
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [isDemonstrating, setIsDemonstrating] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [deadlockDetected, setDeadlockDetected] = useState<boolean>(false);
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [hintBox, setHintBox] = useState<Position | null>(null);
  const [hintDirection, setHintDirection] = useState<Direction | null>(null);

  // 演示起始快照（用于精确还原进度条跳转时的步数/推箱数）
  const demoSnapshotRef = useRef<DemoSnapshot | null>(null);
  const pendingStartSnapshotRef = useRef<{
    moves: number;
    pushes: number;
    player: Position;
    playerFacing: Direction;
    boxes: Position[];
  } | null>(null);

  // Web Worker 引用与生命周期管理
  const workerRef = useRef<Worker | null>(null);
  const solveRequestIdRef = useRef<number>(0);
  const workerResultHandlerRef = useRef<
    ((result: SolverResult, mode: 'demo' | 'hint', requestId?: number) => void) | null
  >(null);

  const spawnWorker = useCallback(() => {
    workerRef.current?.terminate();
    const worker = new Worker(
      new URL('./solver/solver.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.type === 'SOLVE_RESULT') {
        const result: SolverResult = data.payload;
        const mode: 'demo' | 'hint' = data.mode ?? 'demo';
        const requestId: number | undefined = data.requestId;
        if (requestId !== undefined && requestId !== solveRequestIdRef.current) {
          return;
        }
        setIsSolving(false);
        workerResultHandlerRef.current?.(result, mode, requestId);
      }
    };

    workerRef.current = worker;
  }, []);

  useEffect(() => {
    spawnWorker();
    return () => {
      workerRef.current?.terminate();
      clearWalkTimer();
    };
  }, [clearWalkTimer, spawnWorker]);

  // 换关或加载自定义关卡时重置状态
  useEffect(() => {
    solveRequestIdRef.current++;
    clearWalkTimer();
    setIsSolving(false);
    setGameState(createInitialGameState(board));
    setHintBox(null);
    setHintDirection(null);
    setIsDemonstrating(false);
    setIsPlaying(false);
    setDeadlockDetected(false);
    setSolverResult(null);
    setIsVictoryModalOpen(false);
    setIsNewBest(false);
    demoSnapshotRef.current = null;
    if (!customLevel) {
      localStorage.setItem('sokoban_current_level_v3', String(levelIndex));
    }
  }, [board, clearWalkTimer, customLevel, levelIndex]);

  // 4. 移动与推箱逻辑执行
  const applySingleMove = useCallback(
    (dir: Direction, clearHint = true) => {
      if (isDemonstrating) {
        setIsDemonstrating(false);
        setIsPlaying(false);
      }
      if (clearHint) {
        setHintBox(null);
        setHintDirection(null);
      }

      setGameState(prev => {
        if (prev.isWon) return prev;
        const { nextState, moved } = applyMove(prev, board, dir);
        if (!moved) return nextState;

        // 音效触发
        const lastAction = nextState.history[nextState.history.length - 1];
        if (lastAction?.isPush) {
          sound.playPush();
          if (lastAction.boxTo && board.goals[lastAction.boxTo.y]?.[lastAction.boxTo.x]) {
            sound.playTargetChime();
          }
        } else {
          sound.playStep();
        }

        // 胜利结算
        if (nextState.isWon) {
          sound.playVictory();
          setIsVictoryModalOpen(true);

          const par = activeLevel.parSteps;
          let stars = 1;
          if (nextState.movesCount <= Math.round(par * 1.15)) {
            stars = 3;
          } else if (nextState.movesCount <= Math.round(par * 1.5)) {
            stars = 2;
          }

          setProgressMap(oldProg => {
            const currentBest = oldProg[activeLevel.id];
            const brokeRecord =
              !currentBest || nextState.movesCount < currentBest.bestSteps;
            setIsNewBest(brokeRecord);

            const newBestSteps = currentBest
              ? Math.min(currentBest.bestSteps, nextState.movesCount)
              : nextState.movesCount;
            const newBestPushes = currentBest
              ? Math.min(currentBest.bestPushes, nextState.pushesCount)
              : nextState.pushesCount;
            const newStars = currentBest ? Math.max(currentBest.stars, stars) : stars;

            const updated = {
              ...oldProg,
              [activeLevel.id]: {
                completed: true,
                bestSteps: newBestSteps,
                bestPushes: newBestPushes,
                stars: newStars,
              },
            };
            localStorage.setItem('sokoban_progress_v3', JSON.stringify(updated));
            return updated;
          });
        }

        return nextState;
      });
    },
    [activeLevel, board, isDemonstrating]
  );

  const invalidatePendingSolve = useCallback(() => {
    solveRequestIdRef.current++;
    setIsSolving(false);
  }, []);

  const executeMove = useCallback(
    (dir: Direction) => {
      invalidatePendingSolve();
      clearWalkTimer();
      applySingleMove(dir, true);
    },
    [applySingleMove, clearWalkTimer, invalidatePendingSolve]
  );

  // 撤销 / 重做 / 重开
  const handleUndo = useCallback(() => {
    invalidatePendingSolve();
    clearWalkTimer();
    if (isDemonstrating) {
      setIsDemonstrating(false);
      setIsPlaying(false);
    }
    setHintBox(null);
    setHintDirection(null);
    setDeadlockDetected(false);
    setGameState(prev => {
      if (prev.history.length === 0) return prev;
      const next = undoMove(prev, board);
      sound.playUndo();
      return next;
    });
  }, [board, clearWalkTimer, invalidatePendingSolve, isDemonstrating]);

  const handleRedo = useCallback(() => {
    invalidatePendingSolve();
    clearWalkTimer();
    if (isDemonstrating) {
      setIsDemonstrating(false);
      setIsPlaying(false);
    }
    setHintBox(null);
    setHintDirection(null);
    setGameState(prev => {
      if (prev.redoStack.length === 0) return prev;
      const next = redoMove(prev, board);
      sound.playStep();
      return next;
    });
  }, [board, clearWalkTimer, invalidatePendingSolve, isDemonstrating]);

  const handleReset = useCallback(() => {
    invalidatePendingSolve();
    clearWalkTimer();
    if (isDemonstrating) {
      setIsDemonstrating(false);
      setIsPlaying(false);
    }
    setDeadlockDetected(false);
    setIsNewBest(false);
    setGameState(createInitialGameState(board));
    setHintBox(null);
    setHintDirection(null);
  }, [board, clearWalkTimer, invalidatePendingSolve, isDemonstrating]);

  // 5. 点击自动寻路 / 相邻推箱
  const handleCellClick = useCallback(
    (targetPos: Position) => {
      if (gameState.isWon || isDemonstrating) return;
      invalidatePendingSolve();
      clearWalkTimer();

      // 检查是否点击了与人物相邻的箱子（直觉点推）
      const boxIndex = gameState.boxes.findIndex(b => coordsEqual(b, targetPos));
      if (boxIndex !== -1) {
        const dx = targetPos.x - gameState.player.x;
        const dy = targetPos.y - gameState.player.y;
        if (Math.abs(dx) + Math.abs(dy) === 1) {
          let dir: Direction = 'd';
          if (dx === 1) dir = 'r';
          else if (dx === -1) dir = 'l';
          else if (dy === 1) dir = 'd';
          else if (dy === -1) dir = 'u';
          applySingleMove(dir, true);
          return;
        }
      }

      // BFS 自动沿最短路走到点击空地
      const path = findWalkPath(
        gameState.player,
        targetPos,
        gameState.boxes,
        board.walls,
        board.width,
        board.height
      );

      if (path && path.length > 0) {
        setWalkTarget(targetPos);
        let stepIdx = 0;
        walkTimerRef.current = window.setInterval(() => {
          if (stepIdx < path.length) {
            applySingleMove(path[stepIdx++], true);
          } else {
            clearWalkTimer();
          }
        }, 48);
      }
    },
    [applySingleMove, board, clearWalkTimer, gameState, invalidatePendingSolve, isDemonstrating]
  );

  const executeHintResult = useCallback(
    (res: SolverResult) => {
      if (res.success && res.steps && res.steps.length > 0) {
        const firstPushIdx = res.steps.findIndex(
          s => s.moveChar === s.moveChar.toUpperCase()
        );
        const endIdx = firstPushIdx !== -1 ? firstPushIdx : 0;
        const targetStep = res.steps[endIdx];
        const pushDir = targetStep.moveChar.toLowerCase() as Direction;

        // 若存在推箱步，高亮待推动箱子及其推进方向
        if (firstPushIdx !== -1) {
          setHintBox({ ...targetStep.player });
          setHintDirection(pushDir);
        }

        const seq = res.steps.slice(0, endIdx + 1).map(s => s.moveChar.toLowerCase() as Direction);
        let idx = 0;

        if (seq.length === 1) {
          walkTimerRef.current = window.setTimeout(() => {
            walkTimerRef.current = null;
            applySingleMove(seq[0], false);
            window.setTimeout(() => {
              setHintBox(null);
              setHintDirection(null);
            }, 320);
          }, 180) as unknown as number;
        } else {
          walkTimerRef.current = window.setInterval(() => {
            if (idx < seq.length - 1) {
              applySingleMove(seq[idx++], false);
            } else {
              clearWalkTimer();
              // 走到推箱站位后稍微停顿展示箭头，再推箱
              window.setTimeout(() => {
                applySingleMove(seq[seq.length - 1], false);
                window.setTimeout(() => {
                  setHintBox(null);
                  setHintDirection(null);
                }, 320);
              }, 160);
            }
          }, 55);
        }
      } else {
        setDeadlockDetected(true);
      }
    },
    [applySingleMove, clearWalkTimer]
  );

  workerResultHandlerRef.current = (result: SolverResult, mode: 'demo' | 'hint') => {
    if (mode === 'hint') {
      executeHintResult(result);
      return;
    }

    setSolverResult(result);
    if (result.success && result.steps && result.steps.length > 0) {
      const prefixPushes: number[] = [0];
      let pushAcc = 0;
      for (const st of result.steps) {
        if (st.moveChar === st.moveChar.toUpperCase()) {
          pushAcc++;
        }
        prefixPushes.push(pushAcc);
      }

      const base = pendingStartSnapshotRef.current;
      if (base) {
        demoSnapshotRef.current = {
          ...base,
          prefixPushes,
        };
      }

      setDeadlockDetected(false);
      setIsDemonstrating(true);
      setIsPlaying(true);
      setCurrentStepIndex(0);
    } else {
      setDeadlockDetected(true);
    }
  };

  // 6. AI 智能单步提示 (Hint)：通过 Web Worker 非阻塞求解并高亮推动下一步
  const triggerHint = useCallback(() => {
    if (gameState.isWon || isSolving) return;
    clearWalkTimer();
    setHintBox(null);
    setHintDirection(null);
    setDeadlockDetected(false);
    setIsSolving(true);

    const requestId = ++solveRequestIdRef.current;
    workerRef.current?.postMessage({
      type: 'SOLVE',
      payload: {
        board,
        player: gameState.player,
        boxes: gameState.boxes,
        mode: 'hint',
        requestId,
        options: {
          maxStates: 500000,
          timeoutMs: 6000,
          weight: 1.25,
        },
      },
    });
  }, [board, clearWalkTimer, gameState, isSolving]);

  // 演示进度手动跳转（精确同步步数与推箱计数）
  const handleSeekStep = useCallback(
    (targetStep: number) => {
      if (!solverResult?.steps) return;
      const clamped = Math.max(0, Math.min(targetStep, solverResult.steps.length));
      setCurrentStepIndex(clamped);

      const snap = demoSnapshotRef.current;
      const baseMoves = snap ? snap.moves : 0;
      const basePushes = snap ? snap.pushes : 0;
      const deltaPushes = snap ? snap.prefixPushes[clamped] || 0 : 0;

      if (clamped === 0) {
        const initPlayer = snap ? snap.player : board.initialPlayer;
        const initFacing = snap ? snap.playerFacing : 'd';
        const initBoxes = snap ? snap.boxes : board.initialBoxes;
        setGameState(old => ({
          ...old,
          player: { ...initPlayer },
          playerFacing: initFacing,
          boxes: initBoxes.map(b => ({ ...b })),
          movesCount: baseMoves,
          pushesCount: basePushes,
          isWon: checkIsWon(initBoxes, board.goals),
        }));
      } else {
        const step = solverResult.steps[clamped - 1];
        if (step) {
          setGameState(old => ({
            ...old,
            player: { ...step.player },
            playerFacing: step.moveChar.toLowerCase() as Direction,
            boxes: step.boxes.map(b => ({ ...b })),
            movesCount: baseMoves + clamped,
            pushesCount: basePushes + deltaPushes,
            isWon: checkIsWon(step.boxes, board.goals),
          }));
        }
      }
    },
    [board, solverResult]
  );

  // 7. 全局键盘热键绑定（包含最新 triggerHint 引用）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLevelSelectorOpen || isVictoryModalOpen) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          executeMove('u');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          executeMove('d');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          executeMove('l');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          executeMove('r');
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          handleUndo();
          break;
        case 'y':
        case 'Y':
          e.preventDefault();
          handleRedo();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleReset();
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          triggerHint();
          break;
        case ' ':
          e.preventDefault();
          if (isDemonstrating && solverResult?.steps) {
            if (currentStepIndex >= solverResult.steps.length) {
              // 演示结束后按空格重播
              handleSeekStep(0);
              setIsPlaying(true);
            } else {
              setIsPlaying(p => !p);
            }
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentStepIndex,
    executeMove,
    handleRedo,
    handleReset,
    handleSeekStep,
    handleUndo,
    isDemonstrating,
    isLevelSelectorOpen,
    isVictoryModalOpen,
    solverResult,
    triggerHint,
  ]);

  // 8. 启动 / 取消完整 AI 求解演示
  const startAIDemo = useCallback(() => {
    if (gameState.isWon || isSolving) return;
    clearWalkTimer();
    setHintBox(null);
    setHintDirection(null);
    setIsSolving(true);
    setDeadlockDetected(false);

    pendingStartSnapshotRef.current = {
      moves: gameState.movesCount,
      pushes: gameState.pushesCount,
      player: { ...gameState.player },
      playerFacing: gameState.playerFacing,
      boxes: gameState.boxes.map(b => ({ ...b })),
    };

    const requestId = ++solveRequestIdRef.current;
    workerRef.current?.postMessage({
      type: 'SOLVE',
      payload: {
        board,
        player: gameState.player,
        boxes: gameState.boxes,
        mode: 'demo',
        requestId,
        options: {
          maxStates: 500000,
          timeoutMs: 8000,
          weight: 1.25,
        },
      },
    });
  }, [board, clearWalkTimer, gameState, isSolving]);

  const handleCancelSolve = useCallback(() => {
    if (!isSolving) return;
    solveRequestIdRef.current++;
    setIsSolving(false);
    spawnWorker();
  }, [isSolving, spawnWorker]);

  // 9. AI 演示播放控制器计时器
  useEffect(() => {
    if (!isDemonstrating || !isPlaying || !solverResult?.steps) return;

    const intervalTime = Math.max(45, Math.round(180 / playbackSpeed));
    const timer = window.setInterval(() => {
      setCurrentStepIndex(prev => {
        const nextIdx = prev + 1;
        if (nextIdx > solverResult.steps!.length) {
          setIsPlaying(false);
          return prev;
        }

        const step = solverResult.steps![nextIdx - 1];
        if (step) {
          const isPush = step.moveChar === step.moveChar.toUpperCase();
          const dir = step.moveChar.toLowerCase() as Direction;
          const snap = demoSnapshotRef.current;
          const baseMoves = snap ? snap.moves : 0;
          const basePushes = snap ? snap.pushes : 0;
          const deltaPushes = snap ? snap.prefixPushes[nextIdx] || 0 : 0;

          setGameState(old => ({
            ...old,
            player: { ...step.player },
            playerFacing: dir,
            boxes: step.boxes.map(b => ({ ...b })),
            movesCount: baseMoves + nextIdx,
            pushesCount: basePushes + deltaPushes,
            isWon: checkIsWon(step.boxes, board.goals),
          }));

          if (isPush) {
            sound.playPush();
            const delta = DIR_DELTA[dir];
            const boxDestX = step.player.x + delta.dx;
            const boxDestY = step.player.y + delta.dy;
            if (board.goals[boxDestY]?.[boxDestX]) {
              sound.playTargetChime();
            }
          } else {
            sound.playStep();
          }

          if (nextIdx === solverResult.steps!.length) {
            sound.playVictory();
            setIsPlaying(false);
          }
        }

        return nextIdx;
      });
    }, intervalTime);

    return () => window.clearInterval(timer);
  }, [board, isDemonstrating, isPlaying, playbackSpeed, solverResult]);

  // 回退到最近可解状态
  const handleRollbackToSolvable = useCallback(() => {
    clearWalkTimer();
    setDeadlockDetected(false);
    let curState = { ...gameState };
    const solver = new SokobanSolver(board);

    while (curState.history.length > 0) {
      curState = undoMove(curState, board);
      const test = solver.solve(curState.player, curState.boxes, {
        maxStates: 120000,
        timeoutMs: 1000,
        weight: 1.5,
      });
      if (test.success) {
        setGameState(curState);
        sound.playUndo();

        pendingStartSnapshotRef.current = {
          moves: curState.movesCount,
          pushes: curState.pushesCount,
          player: { ...curState.player },
          playerFacing: curState.playerFacing,
          boxes: curState.boxes.map(b => ({ ...b })),
        };
        const requestId = ++solveRequestIdRef.current;
        setIsSolving(true);
        workerRef.current?.postMessage({
          type: 'SOLVE',
          payload: {
            board,
            player: curState.player,
            boxes: curState.boxes,
            mode: 'demo',
            requestId,
            options: {
              maxStates: 500000,
              timeoutMs: 8000,
              weight: 1.25,
            },
          },
        });
        return;
      }
    }

    handleReset();
    pendingStartSnapshotRef.current = {
      moves: 0,
      pushes: 0,
      player: { ...board.initialPlayer },
      playerFacing: 'd',
      boxes: board.initialBoxes.map(b => ({ ...b })),
    };
    const requestId = ++solveRequestIdRef.current;
    setIsSolving(true);
    workerRef.current?.postMessage({
      type: 'SOLVE',
      payload: {
        board,
        player: board.initialPlayer,
        boxes: board.initialBoxes,
        mode: 'demo',
        requestId,
        options: {
          maxStates: 500000,
          timeoutMs: 8000,
          weight: 1.25,
        },
      },
    });
  }, [board, clearWalkTimer, gameState, handleReset]);

  // 重置并从头演示
  const handleResetAndDemo = useCallback(() => {
    setDeadlockDetected(false);
    handleReset();
    pendingStartSnapshotRef.current = {
      moves: 0,
      pushes: 0,
      player: { ...board.initialPlayer },
      playerFacing: 'd',
      boxes: board.initialBoxes.map(b => ({ ...b })),
    };
    window.setTimeout(() => {
      const requestId = ++solveRequestIdRef.current;
      setIsSolving(true);
      workerRef.current?.postMessage({
        type: 'SOLVE',
        payload: {
          board,
          player: board.initialPlayer,
          boxes: board.initialBoxes,
          mode: 'demo',
          requestId,
          options: {
            maxStates: 500000,
            timeoutMs: 8000,
            weight: 1.25,
          },
        },
      });
    }, 60);
  }, [board, handleReset]);

  // 退出接管
  const handleTakeover = useCallback(() => {
    setIsDemonstrating(false);
    setIsPlaying(false);
  }, []);

  const handleToggleDeadlockWarning = useCallback(() => {
    setShowDeadlockWarning(prev => {
      const next = !prev;
      localStorage.setItem('sokoban_deadlock_warning', String(next));
      return next;
    });
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (solverResult?.steps && currentStepIndex >= solverResult.steps.length) {
      handleSeekStep(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(p => !p);
    }
  }, [currentStepIndex, handleSeekStep, solverResult]);

  return (
    <div className="relative min-h-[100dvh] bg-studio-950 text-studio-100 flex flex-col font-sans selection:bg-amber-500 selection:text-studio-950 overflow-x-hidden">
      {/* 桌面端精致环境氛围微光 */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-studio-950/80 to-studio-950 -z-10" />

      {/* 顶部状态栏 */}
      <TopBar
        currentLevel={activeLevel}
        levelIndex={levelIndex}
        totalLevels={LEVELS.length}
        movesCount={gameState.movesCount}
        pushesCount={gameState.pushesCount}
        goalsOnTarget={goalsOnTarget}
        totalGoals={board.goalPositions.length}
        canUndo={gameState.history.length > 0}
        canRedo={gameState.redoStack.length > 0}
        isMuted={isMuted}
        showDeadlockWarning={showDeadlockWarning}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onReset={handleReset}
        onToggleMute={() => setIsMuted(sound.toggleMute())}
        onToggleDeadlockWarning={handleToggleDeadlockWarning}
        onOpenLevelSelector={() => setIsLevelSelectorOpen(true)}
        onPrevLevel={() => {
          setCustomLevel(null);
          setLevelIndex(i => Math.max(0, i - 1));
        }}
        onNextLevel={() => {
          setCustomLevel(null);
          setLevelIndex(i => Math.min(LEVELS.length - 1, i + 1));
        }}
      />

      {/* 主游戏区域 */}
      <main className="flex-1 flex flex-col items-center justify-between p-2 sm:p-4 max-w-7xl mx-auto w-full">
        {/* 关卡简要导言 */}
        <div className="w-full text-center py-0.5 sm:py-1">
          <span className="text-xs text-studio-400 font-game">
            {activeLevel.chapterTitle} · {activeLevel.description}
          </span>
        </div>

        {/* 核心 2.5D SVG 棋盘 */}
        <div className="flex-1 w-full flex items-center justify-center min-h-0">
          <SokobanBoard
            board={board}
            player={gameState.player}
            playerFacing={gameState.playerFacing}
            boxes={gameState.boxes}
            hintBox={hintBox}
            hintDirection={hintDirection}
            walkTarget={walkTarget}
            deadlockedBoxes={deadlockedBoxes}
            showDeadlockWarning={showDeadlockWarning}
            onCellClick={handleCellClick}
            onSwipeMove={executeMove}
            onUndo={handleUndo}
            isAiDemonstrating={isDemonstrating}
          />
        </div>

        {/* 移动端虚拟方向键 */}
        <VirtualDPad
          onMove={executeMove}
          onUndo={handleUndo}
          canUndo={gameState.history.length > 0}
        />

        {/* 底部 AI 求解与控制条 */}
        <div className="w-full mt-2">
          <AIDemoBar
            isSolving={isSolving}
            isDemonstrating={isDemonstrating}
            isPlaying={isPlaying}
            currentStepIndex={currentStepIndex}
            totalDemoSteps={solverResult?.steps?.length || 0}
            playbackSpeed={playbackSpeed}
            deadlockDetected={deadlockDetected}
            solverResult={solverResult}
            onTriggerHint={triggerHint}
            onStartDemo={startAIDemo}
            onCancelSolve={handleCancelSolve}
            onTogglePlay={handleTogglePlay}
            onStepPrev={() => handleSeekStep(currentStepIndex - 1)}
            onStepNext={() => handleSeekStep(currentStepIndex + 1)}
            onSeekStep={handleSeekStep}
            onChangeSpeed={setPlaybackSpeed}
            onTakeover={handleTakeover}
            onRollbackToSolvable={handleRollbackToSolvable}
            onResetAndDemo={handleResetAndDemo}
            onDismissDeadlock={() => setDeadlockDetected(false)}
          />
        </div>

        {/* 桌面端操作快捷键贴心提示条 */}
        <div className="hidden sm:flex items-center justify-center py-1 text-[11px] text-studio-500 font-game tracking-wider">
          WASD / 方向键 移动 · 点击空地寻路 · Z 撤销 · Y 重做 · R 重开 · H 提示 · Space 演示播放/暂停
        </div>
      </main>

      {/* 关卡选择弹窗（含自定义 XSB 导入） */}
      <LevelSelectorModal
        levels={LEVELS}
        currentLevelId={activeLevel.id}
        progressMap={progressMap}
        isOpen={isLevelSelectorOpen}
        onClose={() => setIsLevelSelectorOpen(false)}
        onSelectLevel={id => {
          setCustomLevel(null);
          const idx = LEVELS.findIndex(l => l.id === id);
          if (idx !== -1) setLevelIndex(idx);
        }}
        onLoadCustomLevel={customDef => {
          setCustomLevel(customDef);
        }}
      />

      {/* 通关胜利弹窗 */}
      <VictoryModal
        isOpen={isVictoryModalOpen}
        level={activeLevel}
        movesCount={gameState.movesCount}
        pushesCount={gameState.pushesCount}
        stars={progressMap[activeLevel.id]?.stars || 3}
        isNewBest={isNewBest}
        onReplay={() => {
          setIsVictoryModalOpen(false);
          handleReset();
        }}
        onNextLevel={() => {
          setIsVictoryModalOpen(false);
          setCustomLevel(null);
          if (levelIndex < LEVELS.length - 1) {
            setLevelIndex(i => i + 1);
          }
        }}
        hasNextLevel={!customLevel && levelIndex < LEVELS.length - 1}
      />
    </div>
  );
};

export default App;
