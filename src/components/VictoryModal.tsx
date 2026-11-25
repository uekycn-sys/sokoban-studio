import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Star, Trophy, RotateCcw, ArrowRight, Sparkles } from 'lucide-react';
import { LevelDefinition } from '../types/game';

interface VictoryModalProps {
  isOpen: boolean;
  level: LevelDefinition;
  movesCount: number;
  pushesCount: number;
  stars: number;
  isNewBest?: boolean;
  onReplay: () => void;
  onNextLevel: () => void;
  hasNextLevel: boolean;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  isOpen,
  level,
  movesCount,
  pushesCount,
  stars,
  isNewBest = false,
  onReplay,
  onNextLevel,
  hasNextLevel,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    // 触发五彩礼花特效
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899'],
      });
    } catch {
      // 忽略异常
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && hasNextLevel) {
        e.preventDefault();
        onNextLevel();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onReplay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, hasNextLevel, onNextLevel, onReplay]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-studio-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-studio-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-center flex flex-col items-center">
        {/* 顶部冠军金杯图标 */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center mb-4 shadow-glow-amber">
          <Trophy className="w-8 h-8 text-studio-950" />
        </div>

        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-studio-100 font-sans tracking-tight">
            关卡达成！
          </h2>
          {isNewBest && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold">
              <Sparkles className="w-3 h-3" />
              新纪录
            </span>
          )}
        </div>
        <p className="text-xs text-studio-400 mt-1">
          恭喜通过第 {level.id} 关 · {level.title}
        </p>

        {/* 星级展示 */}
        <div className="flex items-center gap-2.5 my-6">
          {[1, 2, 3].map(st => (
            <div
              key={st}
              className={`p-2 rounded-2xl border transition-all duration-300 ${
                st <= stars
                  ? 'bg-amber-500/20 border-amber-500 scale-110 shadow-glow-amber'
                  : 'bg-studio-800/40 border-studio-800 opacity-40'
              }`}
            >
              <Star
                className={`w-7 h-7 ${
                  st <= stars
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-studio-600'
                }`}
              />
            </div>
          ))}
        </div>

        {/* 结算指标对比 */}
        <div className="w-full bg-studio-850 rounded-2xl p-4 border border-studio-800 grid grid-cols-3 gap-2 mb-6 font-game">
          <div>
            <div className="text-[11px] text-studio-400 mb-0.5">本局步数</div>
            <div className="text-lg font-bold text-amber-400">{movesCount}</div>
          </div>
          <div>
            <div className="text-[11px] text-studio-400 mb-0.5">推箱次数</div>
            <div className="text-lg font-bold text-emerald-400">{pushesCount}</div>
          </div>
          <div>
            <div className="text-[11px] text-studio-400 mb-0.5">参考基准</div>
            <div className="text-lg font-bold text-studio-300">{level.parSteps}步</div>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="w-full flex items-center gap-3">
          <button
            onClick={onReplay}
            className="flex-1 py-3 px-4 rounded-xl bg-studio-800 hover:bg-studio-700 text-studio-200 font-medium text-sm border border-studio-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            重玩本关 (R)
          </button>

          {hasNextLevel && (
            <button
              onClick={onNextLevel}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-studio-950 font-bold text-sm shadow-glow-amber transition-all flex items-center justify-center gap-1.5"
            >
              下一关 (Enter)
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
