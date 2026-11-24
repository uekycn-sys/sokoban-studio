import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Sparkles,
  Bot,
  Lightbulb,
  AlertTriangle,
  History,
  X,
  Gauge,
  CheckCircle2,
} from 'lucide-react';
import { SolverResult } from '../types/game';

interface AIDemoBarProps {
  isSolving: boolean;
  isDemonstrating: boolean;
  isPlaying: boolean;
  currentStepIndex: number;
  totalDemoSteps: number;
  playbackSpeed: number;
  deadlockDetected: boolean;
  solverResult: SolverResult | null;
  onTriggerHint: () => void;
  onStartDemo: () => void;
  onTogglePlay: () => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  onSeekStep: (step: number) => void;
  onChangeSpeed: (speed: number) => void;
  onTakeover: () => void;
  onRollbackToSolvable: () => void;
  onResetAndDemo: () => void;
  onDismissDeadlock: () => void;
}

export const AIDemoBar: React.FC<AIDemoBarProps> = ({
  isSolving,
  isDemonstrating,
  isPlaying,
  currentStepIndex,
  totalDemoSteps,
  playbackSpeed,
  deadlockDetected,
  solverResult,
  onTriggerHint,
  onStartDemo,
  onTogglePlay,
  onStepPrev,
  onStepNext,
  onSeekStep,
  onChangeSpeed,
  onTakeover,
  onRollbackToSolvable,
  onResetAndDemo,
  onDismissDeadlock,
}) => {
  const speeds = [0.5, 1, 2, 4];

  // 死局提示条状态
  if (deadlockDetected) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-3 bg-red-950/80 border border-red-800/80 rounded-2xl shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 animate-bounce-short">
        <div className="flex items-center gap-2.5 text-red-200">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-red-300">智能判定：当前局面已进入死局</span>
            <p className="text-xs text-red-400/80">箱子已被卡在无法解开的死锁位置，无法继续推向目标点。</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRollbackToSolvable}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-studio-950 font-semibold text-xs transition-colors shadow-glow-amber"
          >
            <History className="w-3.5 h-3.5" />
            回退到最近可解状态
          </button>

          <button
            onClick={onResetAndDemo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-studio-800 hover:bg-studio-700 text-studio-200 text-xs border border-studio-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重置并从头演示
          </button>

          <button
            onClick={onDismissDeadlock}
            className="p-1.5 rounded-lg text-studio-400 hover:text-studio-100 hover:bg-studio-800/50"
            title="关闭提示"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 演示播放器模式
  if (isDemonstrating) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-3 bg-studio-900/90 border border-amber-500/30 rounded-2xl shadow-glow-amber backdrop-blur-md flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 演示状态标识 */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <span className="text-xs sm:text-sm font-semibold text-amber-300 font-sans">
              AI 步骤演示中
            </span>
            {solverResult && (
              <span className="text-[11px] font-game text-studio-400 hidden sm:inline">
                · 已找到 {solverResult.totalStepsCount} 步解法 (耗时 {solverResult.durationMs.toFixed(1)}ms)
              </span>
            )}
          </div>

          {/* 倍速切换 */}
          <div className="flex items-center gap-1 bg-studio-850 p-1 rounded-xl border border-studio-750">
            <Gauge className="w-3.5 h-3.5 text-studio-400 ml-1" />
            {speeds.map(sp => (
              <button
                key={sp}
                onClick={() => onChangeSpeed(sp)}
                className={`px-2 py-0.5 rounded-lg text-xs font-game transition-colors ${
                  playbackSpeed === sp
                    ? 'bg-amber-500 text-studio-950 font-bold'
                    : 'text-studio-400 hover:text-studio-200'
                }`}
              >
                {sp}x
              </button>
            ))}
          </div>

          {/* 接管操作 */}
          <button
            onClick={onTakeover}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-studio-800 hover:bg-studio-700 text-studio-100 text-xs font-medium border border-studio-700 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            接管控制
          </button>
        </div>

        {/* 进度条与播放控制器 */}
        <div className="flex items-center gap-3">
          <button
            onClick={onStepPrev}
            disabled={currentStepIndex <= 0}
            className="p-1.5 rounded-lg bg-studio-800 hover:bg-studio-700 text-studio-200 disabled:opacity-30 border border-studio-750"
            title="上一步"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={onTogglePlay}
            className="p-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-studio-950 font-bold shadow-glow-amber transition-all"
            title={isPlaying ? '暂停 (Space)' : '播放 (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={onStepNext}
            disabled={currentStepIndex >= totalDemoSteps}
            className="p-1.5 rounded-lg bg-studio-800 hover:bg-studio-700 text-studio-200 disabled:opacity-30 border border-studio-750"
            title="下一步"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* 进度滑块 */}
          <div className="flex-1 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={totalDemoSteps}
              value={currentStepIndex}
              onChange={e => onSeekStep(Number(e.target.value))}
              className="w-full h-1.5 bg-studio-750 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <span className="font-game text-xs text-studio-300 whitespace-nowrap min-w-[54px] text-right">
              {currentStepIndex} / {totalDemoSteps}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 常规待命面板
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-2.5 bg-studio-900/80 border border-studio-800 rounded-2xl shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-studio-300 text-xs sm:text-sm">
        <Bot className="w-4 h-4 text-amber-400" />
        <span className="font-semibold text-studio-200">AI 推箱助手</span>
        <span className="hidden sm:inline text-studio-400">· 卡关时可获取单步提示或完整演示</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onTriggerHint}
          disabled={isSolving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-studio-800 hover:bg-studio-750 text-studio-200 hover:text-amber-300 text-xs font-medium border border-studio-700 transition-colors disabled:opacity-50"
        >
          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          单步提示 (H)
        </button>

        <button
          onClick={onStartDemo}
          disabled={isSolving}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-studio-950 text-xs font-semibold shadow-glow-amber transition-all disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isSolving ? '深度求解中...' : '完整步骤演示'}
        </button>
      </div>
    </div>
  );
};
