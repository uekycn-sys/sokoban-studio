import React, { useState, useMemo, useEffect } from 'react';
import { X, Star, Trophy, FileCode, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { LevelDefinition, LevelProgress } from '../types/game';
import { parseXSB, isMapEnclosed } from '../engine/sokoban';
import { SokobanSolver } from '../solver/solverCore';

interface LevelSelectorModalProps {
  levels: LevelDefinition[];
  currentLevelId: number;
  progressMap: Record<number, LevelProgress>;
  isOpen: boolean;
  onClose: () => void;
  onSelectLevel: (levelId: number) => void;
  onLoadCustomLevel: (customLevel: LevelDefinition) => void;
}

// 关卡迷你 SVG 缩略图生成器
const MiniLevelThumbnail: React.FC<{ xsb: string }> = ({ xsb }) => {
  const board = useMemo(() => {
    try {
      return parseXSB(xsb);
    } catch {
      return null;
    }
  }, [xsb]);

  if (!board) return <div className="w-full h-full bg-studio-950" />;

  const cellSize = 10;
  const width = board.width * cellSize;
  const height = board.height * cellSize;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full max-h-24">
      {/* 室内地板 */}
      {Array.from({ length: board.height }).map((_, y) =>
        Array.from({ length: board.width }).map((_, x) => {
          if (!board.playable[y][x] || board.walls[y][x]) return null;
          return (
            <rect
              key={`f-${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#1e293b"
            />
          );
        })
      )}

      {/* 目标点 */}
      {board.goalPositions.map((g, idx) => (
        <circle
          key={`g-${idx}`}
          cx={(g.x + 0.5) * cellSize}
          cy={(g.y + 0.5) * cellSize}
          r={cellSize * 0.28}
          fill="#f59e0b"
        />
      ))}

      {/* 墙壁 */}
      {Array.from({ length: board.height }).map((_, y) =>
        Array.from({ length: board.width }).map((_, x) => {
          if (!board.walls[y][x]) return null;
          return (
            <rect
              key={`w-${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#475569"
            />
          );
        })
      )}

      {/* 箱子 */}
      {board.initialBoxes.map((b, idx) => {
        const onGoal = board.goals[b.y]?.[b.x];
        return (
          <rect
            key={`b-${idx}`}
            x={b.x * cellSize + 1.5}
            y={b.y * cellSize + 1.5}
            width={cellSize - 3}
            height={cellSize - 3}
            rx="1.5"
            fill={onGoal ? '#10b981' : '#b45309'}
          />
        );
      })}

      {/* 玩家 */}
      <circle
        cx={(board.initialPlayer.x + 0.5) * cellSize}
        cy={(board.initialPlayer.y + 0.5) * cellSize}
        r={cellSize * 0.38}
        fill="#f59e0b"
      />
    </svg>
  );
};

export const LevelSelectorModal: React.FC<LevelSelectorModalProps> = ({
  levels,
  currentLevelId,
  progressMap,
  isOpen,
  onClose,
  onSelectLevel,
  onLoadCustomLevel,
}) => {
  const [selectedTab, setSelectedTab] = useState<number | 'custom'>(1);
  const [customXSB, setCustomXSB] = useState<string>(`
########
#  ..  #
# $##$ #
#  $   #
# $##$ #
#  .   #
# .@.  #
########
  `.trim());
  const [customError, setCustomError] = useState<string | null>(null);
  const [customSuccessInfo, setCustomSuccessInfo] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // 打开弹窗时自动定位到当前关卡所属章节，并监听 Esc 退出
  useEffect(() => {
    if (!isOpen) return;
    const currentLvl = levels.find(l => l.id === currentLevelId);
    if (currentLvl && currentLvl.chapter >= 1 && currentLvl.chapter <= 5) {
      setSelectedTab(currentLvl.chapter);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, currentLevelId, levels, onClose]);

  const totalStats = useMemo(() => {
    let completed = 0;
    let earnedStars = 0;
    for (const lvl of levels) {
      const p = progressMap[lvl.id];
      if (p?.completed) {
        completed++;
        earnedStars += p.stars || 0;
      }
    }
    return {
      completed,
      total: levels.length,
      earnedStars,
      maxStars: levels.length * 3,
    };
  }, [levels, progressMap]);

  if (!isOpen) return null;

  const chapters = [
    { id: 1, title: '战术启蒙', desc: '绕柱借位与顺序规划' },
    { id: 2, title: '逻辑陷阱', desc: '破除贪心与窄道腾挪' },
    { id: 3, title: '拓扑迷局', desc: '动态图割与逆序填装' },
    { id: 4, title: '大师殿堂', desc: '深层暂存与反直觉拆解' },
    { id: 5, title: '宗师终局', desc: '殿堂级紧凑残局试炼' },
  ];

  const currentChapterLevels = typeof selectedTab === 'number'
    ? levels.filter(l => l.chapter === selectedTab)
    : [];

  const handleValidateAndPlayCustom = () => {
    setCustomError(null);
    setCustomSuccessInfo(null);
    setIsValidating(true);

    setTimeout(() => {
      try {
        const cleanXsb = customXSB.replace(/^\s*\n|\n\s*$/g, '');
        const board = parseXSB(cleanXsb);

        if (board.goalPositions.length === 0 || board.initialBoxes.length === 0) {
          throw new Error('关卡必须包含至少一个箱子 ($) 和目标点 (.)');
        }

        if (board.goalPositions.length !== board.initialBoxes.length) {
          throw new Error(`箱子数 (${board.initialBoxes.length}) 与目标点数 (${board.goalPositions.length}) 不一致！`);
        }

        const enclosureCheck = isMapEnclosed(board);
        if (!enclosureCheck.enclosed) {
          throw new Error(enclosureCheck.reason || '地图未完全封闭！');
        }

        const solver = new SokobanSolver(board);
        const result = solver.solve(board.initialPlayer, board.initialBoxes, {
          timeoutMs: 6000,
          maxStates: 500000,
          weight: 1.25,
        });

        if (!result.success) {
          throw new Error(`AI 求解器判定此地图无解或复杂度超出浏览器上限 (${result.reason})`);
        }

        const customLevelDef: LevelDefinition = {
          id: 999,
          chapter: 99,
          chapterTitle: '自定义关卡',
          title: '自定义挑战',
          difficulty: 'Legend',
          description: `玩家自建关卡 · AI 求解耗时 ${result.durationMs.toFixed(1)}ms (${result.pushMovesCount} 推 / ${result.totalStepsCount} 步)`,
          parSteps: result.totalStepsCount,
          xsb: cleanXsb,
        };

        setCustomSuccessInfo(`✅ 校验成功！AI 已算出最优解（${result.pushMovesCount}推 / ${result.totalStepsCount}步，耗时 ${result.durationMs.toFixed(1)}ms）`);

        setTimeout(() => {
          onLoadCustomLevel(customLevelDef);
          onClose();
        }, 300);
      } catch (err: any) {
        setCustomError(err.message || '地图解析错误');
      } finally {
        setIsValidating(false);
      }
    }, 50);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-studio-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-studio-900 border border-studio-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* 头部标题与关闭 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-800 gap-3">
          <div>
            <h2 className="text-xl font-bold text-studio-100 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              关卡选择与自定义
            </h2>
            <p className="text-xs text-studio-400 mt-0.5">循序渐进的推箱之旅，支持导入任意标准 XSB 关卡并由 AI 求解验算</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-studio-850 border border-studio-800 text-xs font-game">
              <span className="text-emerald-400 font-semibold">
                {totalStats.completed}/{totalStats.total} 关
              </span>
              <span className="text-studio-700">|</span>
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                {totalStats.earnedStars}/{totalStats.maxStars}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-studio-400 hover:text-studio-100 hover:bg-studio-800 transition-colors"
              title="关闭 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 章节标签栏 + 自定义导入 Tab */}
        <div className="flex border-b border-studio-800 px-6 overflow-x-auto no-scrollbar gap-2 bg-studio-950/40">
          {chapters.map(ch => (
            <button
              key={ch.id}
              onClick={() => setSelectedTab(ch.id)}
              className={`py-3 px-3.5 border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                selectedTab === ch.id
                  ? 'border-amber-500 text-amber-400 font-bold'
                  : 'border-transparent text-studio-400 hover:text-studio-200'
              }`}
            >
              第 {ch.id} 章：{ch.title}
            </button>
          ))}

          <button
            onClick={() => setSelectedTab('custom')}
            className={`py-3 px-3.5 border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
              selectedTab === 'custom'
                ? 'border-amber-500 text-amber-400 font-bold'
                : 'border-transparent text-studio-400 hover:text-studio-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            导入自定义关卡
          </button>
        </div>

        {/* 主内容区域 */}
        {selectedTab === 'custom' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
            <div className="text-sm text-studio-300">
              请在下方粘贴标准 XSB 格式地图代码（<span className="font-mono text-amber-400">#</span>墙、<span className="font-mono text-amber-400">@</span>人、<span className="font-mono text-amber-400">$</span>箱、<span className="font-mono text-amber-400">.</span>目标点、<span className="font-mono text-amber-400">*</span>箱在目标点）：
            </div>

            <textarea
              value={customXSB}
              onChange={e => setCustomXSB(e.target.value)}
              rows={8}
              className="w-full font-mono text-xs sm:text-sm p-4 bg-studio-950 border border-studio-800 rounded-2xl text-amber-300 focus:outline-none focus:border-amber-500 resize-none"
              placeholder="请粘贴 XSB 地图数据..."
            />

            {customError && (
              <div className="flex items-center gap-2 p-3 bg-red-950/80 border border-red-800/80 rounded-xl text-red-300 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{customError}</span>
              </div>
            )}

            {customSuccessInfo && (
              <div className="flex items-center gap-2 p-3 bg-emerald-950/80 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{customSuccessInfo}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleValidateAndPlayCustom}
                disabled={isValidating || !customXSB.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-studio-950 font-bold text-sm shadow-glow-amber transition-all disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {isValidating ? 'AI 验算中...' : '校验并立即试玩'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {currentChapterLevels.map(lvl => {
              const isCurrent = lvl.id === currentLevelId;
              const progress = progressMap[lvl.id];
              const isCompleted = progress?.completed;
              const stars = progress?.stars || 0;

              return (
                <div
                  key={lvl.id}
                  onClick={() => {
                    onSelectLevel(lvl.id);
                    onClose();
                  }}
                  className={`relative group rounded-2xl p-3 border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-amber-500/10 border-amber-500 shadow-glow-amber'
                      : isCompleted
                      ? 'bg-studio-850/80 border-emerald-500/30 hover:border-emerald-500/60'
                      : 'bg-studio-850/50 border-studio-800 hover:border-studio-700 hover:bg-studio-800/60'
                  }`}
                >
                  {/* 缩略图展示区 */}
                  <div className="w-full h-24 bg-studio-950/90 rounded-xl p-2 flex items-center justify-center border border-studio-800/80 mb-2.5 overflow-hidden group-hover:scale-[1.02] transition-transform">
                    <MiniLevelThumbnail xsb={lvl.xsb} />
                  </div>

                  {/* 关卡信息 */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-game font-bold text-amber-400">#{lvl.id}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-studio-800 text-studio-400 font-sans">
                        {lvl.difficulty}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm text-studio-100 truncate mb-1">
                      {lvl.title}
                    </h3>

                    {/* 星级展示 */}
                    <div className="flex items-center justify-between pt-1 border-t border-studio-800/60 text-[11px] font-game">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3].map(st => (
                          <Star
                            key={st}
                            className={`w-3 h-3 ${
                              st <= stars
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-studio-700'
                            }`}
                          />
                        ))}
                      </div>
                      {isCompleted ? (
                        <span className="text-emerald-400 font-medium">已通关</span>
                      ) : (
                        <span className="text-studio-500">{lvl.parSteps}步</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
