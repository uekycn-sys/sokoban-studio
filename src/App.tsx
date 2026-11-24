import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Direction,
  GameState,
  LevelProgress,
  SolverResult,
  Position,
  MoveChar,
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
} from './engine/sokoban';
import { SokobanSolver, detectDeadlockedBoxes } from './solver/solverCore';
import { sound } from './audio/sound';
import { TopBar } from './components/TopBar';
import { SokobanBoard } from './components/SokobanBoard';
import { AIDemoBar } from './components/AIDemoBar';
import { LevelSelectorModal } from './components/LevelSelectorModal';
import { VictoryModal } from './components/VictoryModal';
import { VirtualDPad } from './components/VirtualDPad';

export const App: React.FC = () => {
  // 1. 关卡与存档持久化
  const [levelIndex, setLevelIndex] = useState<number>(() => {
    const saved = localStorage.getItem('sokoban_current_level');
    const idx = saved ? parseInt(saved, 10) : 0;
    return idx >= 0 && idx < LEVELS.length ? idx : 0;
  });

  const [customLevel, setCustomLevel] = useState<LevelDefinition | null>(null);

  const [progressMap, setProgressMap] = useState<Record<number, LevelProgress>>(() => {
    try {
      const saved = localStorage.getItem('sokoban_progress');
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

  // 当前有效关卡对象（自定义关卡优先）
  const activeLevel = customLevel || LEVELS[levelIndex];

  // 2. 棋盘解析与游戏状态
  const board = useMemo(() => parseXSB(activeLevel.xsb), [activeLevel]);
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState(board));

  // 实时死锁诊断计算
  const deadlockedBoxes = useMemo(() => {
    return detectDeadlockedBoxes(board, gameState.boxes);
  }, [board, gameState.boxes]);

  // 换关或加载自定义关卡时重置状态
  useEffect(() => {
    setGameState(createInitialGameState(board));
    setHintBox(null);
    setHintDirection(null);
    setIsDemonstrating(false);
    setIsPlaying(false);
    setDeadlockDetected(false);
    setSolverResult(null);
    setIsVictoryModalOpen(false);
    if (!customLevel) {
      localStorage.setItem('sokoban_current_level', String(levelIndex));
    }
  }, [board, levelIndex, customLevel]);

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

  // Web Worker 引用
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // 实例化 Web Worker
    workerRef.current = new Worker(
      new URL('./solver/solver.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.type === 'SOLVE_RESULT') {
        const result: SolverResult = data.payload;
        setIsSolving(false);
        setSolverResult(result);

        if (result.success && result.steps && result.steps.length > 0) {
          setDeadlockDetected(false);
          setIsDemonstrating(true);
          setIsPlaying(true);
          setCurrentStepIndex(0);
        } else {
          // 当前局面无解，触发死局提示
          setDeadlockDetected(true);
        }
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // 4. 移动与推箱逻辑执行
  const executeMove = useCallback((dir: Direction) => {
    if (isDemonstrating) {
      setIsDemonstrating(false);
      setIsPlaying(false);
    }
    setHintBox(null);
    setHintDirection(null);

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

        // 星级计算
        const par = activeLevel.parSteps;
        let stars = 1;
        if (nextState.movesCount <= Math.round(par * 1.15)) {
          stars = 3;
        } else if (nextState.movesCount <= Math.round(par * 1.5)) {
          stars = 2;
        }

        setProgressMap(oldProg => {
          const currentBest = oldProg[activeLevel.id];
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
          localStorage.setItem('sokoban_progress', JSON.stringify(updated));
          return updated;
        });
      }

      return nextState;
    });
  }, [activeLevel, board, isDemonstrating]);

  // 撤销 / 重做 / 重开
  const handleUndo = useCallback(() => {
    if (isDemonstrating) {
      setIsDemonstrating(false);
      setIsPlaying(false);
    }
    setGameState(prev => {
      const next = undoMove(prev, board);
      sound.playUndo();
      return next;
    });
  }, [board, isDemonstrating]);

  const handleRedo = useCallback(() => {
    if (isDemonstrating) {
      setIsDemonstrating(false);
      setIsPlaying(false);
    }
    setGameState(prev => {
      const next = redoMove(prev, board);
      sound.playStep();
      return next;
    });
  }, [board, isDemonstrating]);

  const handleReset = useCallback(() => {
    if (isDemonstrating) {
      setIsDemonstrating(false);
      setIsPlaying(false);
    }
    setDeadlockDetected(false);
    setGameState(createInitialGameState(board));
    setHintBox(null);
    setHintDirection(null);
  }, [board, isDemonstrating]);

  // 5. 点击自动寻路 / 相邻推箱
  const handleCellClick = useCallback((targetPos: Position) => {
    if (gameState.isWon || isDemonstrating) return;

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
        executeMove(dir);
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
      let stepIdx = 0;
      const timer = setInterval(() => {
        if (stepIdx < path.length) {
          executeMove(path[stepIdx++]);
        } else {
          clearInterval(timer);
        }
      }, 50);
    }
  }, [board, executeMove, gameState, isDemonstrating]);

  // 6. 全局键盘热键绑定
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
          if (isDemonstrating) {
            setIsPlaying(p => !p);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    executeMove,
    handleUndo,
    handleRedo,
    handleReset,
    isDemonstrating,
    isLevelSelectorOpen,
    isVictoryModalOpen,
  ]);

  // 7. AI 单步提示 (Hint)
  const triggerHint = useCallback(() => {
    if (gameState.isWon || isSolving) return;

    try {
      const solver = new SokobanSolver(board);
      const res = solver.solve(gameState.player, gameState.boxes, {
        maxStates: 100000,
        timeoutMs: 1500,
      });

      if (res.success && res.steps && res.steps.length > 0) {
        const firstStep = res.steps[0];
        const moveChar = firstStep.moveChar;
        const dir = moveChar.toLowerCase() as Direction;

        // 如果是推箱步，高亮当前被推的箱子
        if (moveChar === moveChar.toUpperCase()) {
          const delta = DIR_DELTA[dir];
          const boxPos = {
            x: gameState.player.x + delta.dx,
            y: gameState.player.y + delta.dy,
          };
          setHintBox(boxPos);
          setHintDirection(dir);
        }

        // 闪烁后自动执行该提示步
        setTimeout(() => {
          executeMove(dir);
        }, 120);
      } else {
        setDeadlockDetected(true);
      }
    } catch {
      setDeadlockDetected(true);
    }
  }, [board, executeMove, gameState, isSolving]);

  // 8. 启动完整 AI 求解演示
  const startAIDemo = useCallback(() => {
    if (gameState.isWon || isSolving) return;
    setIsSolving(true);
    setDeadlockDetected(false);

    workerRef.current?.postMessage({
      type: 'SOLVE',
      payload: {
        board,
        player: gameState.player,
        boxes: gameState.boxes,
        options: {
          maxStates: 400000,
          timeoutMs: 5000,
          weight: 1.3,
        },
      },
    });
  }, [board, gameState, isSolving]);

  // 9. AI 演示播放控制器计时器
  useEffect(() => {
    if (!isDemonstrating || !isPlaying || !solverResult?.steps) return;

    const intervalTime = Math.max(50, Math.round(180 / playbackSpeed));
    const timer = setInterval(() => {
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

          setGameState(old => ({
            ...old,
            player: { ...step.player },
            playerFacing: dir,
            boxes: step.boxes.map(b => ({ ...b })),
            movesCount: old.movesCount + 1,
            pushesCount: old.pushesCount + (isPush ? 1 : 0),
          }));

          if (isPush) {
            sound.playPush();
            if (board.goals[step.player.y]?.[step.player.x]) {
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

    return () => clearInterval(timer);
  }, [board, isDemonstrating, isPlaying, playbackSpeed, solverResult]);

  // 演示进度手动跳转
  const handleSeekStep = useCallback(
    (targetStep: number) => {
      if (!solverResult?.steps) return;
      const clamped = Math.max(0, Math.min(targetStep, solverResult.steps.length));
      setCurrentStepIndex(clamped);

      if (clamped === 0) {
        setGameState(old => ({
          ...old,
          player: { ...board.initialPlayer },
          boxes: board.initialBoxes.map(b => ({ ...b })),
        }));
      } else {
        const step = solverResult.steps[clamped - 1];
        if (step) {
          setGameState(old => ({
            ...old,
            player: { ...step.player },
            playerFacing: step.moveChar.toLowerCase() as Direction,
            boxes: step.boxes.map(b => ({ ...b })),
          }));
        }
      }
    },
    [board, solverResult]
  );

  // 回退到最近可解状态
  const handleRollbackToSolvable = useCallback(() => {
    setDeadlockDetected(false);
    let curState = { ...gameState };
    const solver = new SokobanSolver(board);

    // 沿撤销栈逆序回溯查找第一个可解状态
    while (curState.history.length > 0) {
      curState = undoMove(curState, board);
      const test = solver.solve(curState.player, curState.boxes, {
        maxStates: 80000,
        timeoutMs: 1200,
      });
      if (test.success) {
        setGameState(curState);
        sound.playUndo();
        // 自动触发从该状态演示
        setTimeout(() => {
          startAIDemo();
        }, 100);
        return;
      }
    }

    // 若全部无解则重置
    handleReset();
    setTimeout(() => {
      startAIDemo();
    }, 100);
  }, [board, gameState, handleReset, startAIDemo]);

  // 重置并从头演示
  const handleResetAndDemo = useCallback(() => {
    setDeadlockDetected(false);
    handleReset();
    setTimeout(() => {
      setIsSolving(true);
      workerRef.current?.postMessage({
        type: 'SOLVE',
        payload: {
          board,
          player: board.initialPlayer,
          boxes: board.initialBoxes,
          options: {
            maxStates: 400000,
            timeoutMs: 5000,
            weight: 1.3,
          },
        },
      });
    }, 80);
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

  return (
    <div className="relative min-h-screen bg-studio-950 text-studio-100 flex flex-col font-sans selection:bg-amber-500 selection:text-studio-950 overflow-hidden">
      {/* 桌面端精致环境氛围微光（消除大屏两侧死黑） */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-studio-950/80 to-studio-950 -z-10" />

      {/* 顶部状态栏 */}
      <TopBar
        currentLevel={activeLevel}
        levelIndex={levelIndex}
        totalLevels={LEVELS.length}
        movesCount={gameState.movesCount}
        pushesCount={gameState.pushesCount}
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
      <main className="flex-1 flex flex-col items-center justify-between p-2 sm:p-4 max-w-7xl mx-auto w-full overflow-hidden">
        {/* 关卡简要导言 */}
        <div className="w-full text-center py-1">
          <span className="text-xs text-studio-400 font-game">
            {activeLevel.chapterTitle} · {activeLevel.description}
          </span>
        </div>

        {/* 核心 2.5D SVG 棋盘 */}
        <div className="flex-1 w-full flex items-center justify-center">
          <SokobanBoard
            board={board}
            player={gameState.player}
            playerFacing={gameState.playerFacing}
            boxes={gameState.boxes}
            hintBox={hintBox}
            hintDirection={hintDirection}
            deadlockedBoxes={deadlockedBoxes}
            showDeadlockWarning={showDeadlockWarning}
            onCellClick={handleCellClick}
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
            onTogglePlay={() => setIsPlaying(p => !p)}
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
          WASD / 方向键 移动 · 点击空地寻路 · Z 撤销 · R 重开 · H 提示 · Space 演示播放/暂停
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
