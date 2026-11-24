import React from 'react';
import {
  Undo2,
  Redo2,
  RotateCcw,
  Volume2,
  VolumeX,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { LevelDefinition } from '../types/game';

interface TopBarProps {
  currentLevel: LevelDefinition;
  levelIndex: number;
  totalLevels: number;
  movesCount: number;
  pushesCount: number;
  canUndo: boolean;
  canRedo: boolean;
  isMuted: boolean;
  showDeadlockWarning: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onToggleMute: () => void;
  onToggleDeadlockWarning: () => void;
  onOpenLevelSelector: () => void;
  onPrevLevel: () => void;
  onNextLevel: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentLevel,
  levelIndex,
  totalLevels,
  movesCount,
  pushesCount,
  canUndo,
  canRedo,
  isMuted,
  showDeadlockWarning,
  onUndo,
  onRedo,
  onReset,
  onToggleMute,
  onToggleDeadlockWarning,
  onOpenLevelSelector,
  onPrevLevel,
  onNextLevel,
}) => {
  return (
    <header className="w-full bg-studio-900/90 backdrop-blur-md border-b border-studio-800 px-3 py-2.5 sm:px-6 sm:py-3.5 flex flex-wrap items-center justify-between gap-2.5 z-20">
      {/* 品牌与当前关卡选择器 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-glow-amber">
            <Sparkles className="w-4 h-4 text-studio-950" />
          </div>
          <span className="font-bold text-lg hidden md:inline tracking-tight text-studio-100 font-sans">
            Sokoban <span className="text-amber-400">Studio</span>
          </span>
        </div>

        {/* 关卡切换与选择 */}
        <div className="flex items-center bg-studio-800/80 rounded-xl p-1 border border-studio-700">
          <button
            onClick={onPrevLevel}
            disabled={levelIndex === 0}
            className="p-1 rounded-lg text-studio-400 hover:text-studio-100 hover:bg-studio-700/60 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="上一关"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenLevelSelector}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs sm:text-sm font-medium text-studio-200 hover:text-amber-400 hover:bg-studio-700/50 transition-colors"
          >
            <span className="text-amber-400 font-semibold font-game">#{currentLevel.id}</span>
            <span className="max-w-[100px] sm:max-w-[140px] truncate">{currentLevel.title}</span>
            <LayoutGrid className="w-3.5 h-3.5 text-studio-400" />
          </button>

          <button
            onClick={onNextLevel}
            disabled={levelIndex === totalLevels - 1}
            className="p-1 rounded-lg text-studio-400 hover:text-studio-100 hover:bg-studio-700/60 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="下一关"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 状态统计面板 */}
      <div className="flex items-center gap-2 sm:gap-4 font-game text-xs sm:text-sm">
        <div className="bg-studio-850 px-3 py-1 rounded-lg border border-studio-750 flex items-center gap-2">
          <span className="text-studio-400">步数:</span>
          <span className="text-amber-400 font-bold">{movesCount}</span>
        </div>
        <div className="bg-studio-850 px-3 py-1 rounded-lg border border-studio-750 flex items-center gap-2">
          <span className="text-studio-400">推箱:</span>
          <span className="text-emerald-400 font-bold">{pushesCount}</span>
        </div>
        <div className="hidden sm:flex bg-studio-850 px-3 py-1 rounded-lg border border-studio-750 items-center gap-2">
          <span className="text-studio-400">基准:</span>
          <span className="text-studio-300">{currentLevel.parSteps}步</span>
        </div>
      </div>

      {/* 控制操作快捷栏 */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 rounded-xl bg-studio-800 hover:bg-studio-700 disabled:opacity-30 text-studio-200 hover:text-studio-50 border border-studio-700 transition-colors"
          title="撤销 (Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 rounded-xl bg-studio-800 hover:bg-studio-700 disabled:opacity-30 text-studio-200 hover:text-studio-50 border border-studio-700 transition-colors"
          title="重做 (Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onReset}
          className="p-2 rounded-xl bg-studio-800 hover:bg-studio-700 text-studio-200 hover:text-amber-400 border border-studio-700 transition-colors"
          title="重开本关 (R)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleDeadlockWarning}
          className={`p-2 rounded-xl border transition-colors ${
            showDeadlockWarning
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
              : 'bg-studio-800 border-studio-700 text-studio-500'
          }`}
          title={showDeadlockWarning ? '死锁辅助已开启（点击关闭）' : '死锁辅助已关闭（点击开启）'}
        >
          {showDeadlockWarning ? (
            <ShieldAlert className="w-4 h-4" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={onToggleMute}
          className="p-2 rounded-xl bg-studio-800 hover:bg-studio-700 text-studio-200 hover:text-studio-50 border border-studio-700 transition-colors"
          title={isMuted ? '开启音效' : '静音'}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-studio-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-emerald-400" />
          )}
        </button>
      </div>
    </header>
  );
};
