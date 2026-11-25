import React, { useMemo, useRef } from 'react';
import { Direction, ParsedBoard, Position } from '../types/game';
import { DIR_DELTA } from '../engine/sokoban';
import { AlertCircle, Undo2 } from 'lucide-react';

interface SokobanBoardProps {
  board: ParsedBoard;
  player: Position;
  playerFacing: Direction;
  boxes: Position[];
  hintBox?: Position | null;
  hintDirection?: Direction | null;
  walkTarget?: Position | null;
  deadlockedBoxes?: Set<string>;
  showDeadlockWarning?: boolean;
  onCellClick: (pos: Position) => void;
  onSwipeMove?: (dir: Direction) => void;
  onUndo?: () => void;
  isAiDemonstrating?: boolean;
}

export const SokobanBoard: React.FC<SokobanBoardProps> = ({
  board,
  player,
  playerFacing,
  boxes,
  hintBox,
  hintDirection,
  walkTarget,
  deadlockedBoxes = new Set(),
  showDeadlockWarning = true,
  onCellClick,
  onSwipeMove,
  onUndo,
  isAiDemonstrating = false,
}) => {
  const cellSize = 60; // 虚拟网格单位尺寸 (px)
  const wallDepth = 10; // 2.5D 立体墙体透视厚度 (px)
  const viewBoxWidth = board.width * cellSize;
  const viewBoxHeight = board.height * cellSize + wallDepth;

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // 目标点集合快速查询
  const goalMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const g of board.goalPositions) {
      map.set(`${g.x},${g.y}`, true);
    }
    return map;
  }, [board.goalPositions]);

  // 箱子入位状态判定
  const isBoxOnGoal = (b: Position) => goalMap.has(`${b.x},${b.y}`);

  // 人物朝向旋转角度
  const facingRotation = useMemo(() => {
    switch (playerFacing) {
      case 'u': return 0;
      case 'r': return 90;
      case 'd': return 180;
      case 'l': return 270;
      default: return 180;
    }
  }, [playerFacing]);

  // 提示方向旋转角度与目标落点计算
  const hintMeta = useMemo(() => {
    if (!hintBox || !hintDirection) return null;
    const delta = DIR_DELTA[hintDirection];
    const dest = { x: hintBox.x + delta.dx, y: hintBox.y + delta.dy };
    let angle = 0;
    switch (hintDirection) {
      case 'u': angle = 0; break;
      case 'r': angle = 90; break;
      case 'd': angle = 180; break;
      case 'l': angle = 270; break;
    }
    return { dest, angle, delta };
  }, [hintBox, hintDirection]);

  const hasDeadlocks = showDeadlockWarning && deadlockedBoxes.size > 0 && !isAiDemonstrating;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !onSwipeMove || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const minSwipeDistance = 28;
    if (Math.abs(dx) < minSwipeDistance && Math.abs(dy) < minSwipeDistance) {
      return; // 视为普通点击，交给 SVG onClick 处理寻路
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      onSwipeMove(dx > 0 ? 'r' : 'l');
    } else {
      onSwipeMove(dy > 0 ? 'd' : 'u');
    }
  };

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center p-1 sm:p-2 select-none touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 实时死锁浮动非侵入提示条 */}
      {hasDeadlocks && (
        <div className="absolute top-2 sm:top-3 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-950/90 border border-red-500/60 shadow-lg backdrop-blur-md text-red-200 text-xs animate-bounce-short">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>检测到箱子陷入死锁</span>
          {onUndo && (
            <button
              onClick={onUndo}
              className="ml-1 px-2 py-0.5 rounded-md bg-red-800/80 hover:bg-red-700 text-white font-medium flex items-center gap-1 transition-colors"
            >
              <Undo2 className="w-3 h-3" />
              撤销 (Z)
            </button>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="max-w-full max-h-[56vh] sm:max-h-[68vh] w-auto h-auto drop-shadow-2xl rounded-2xl overflow-hidden transition-all duration-300"
        style={{
          filter: 'drop-shadow(0 20px 35px rgba(0, 0, 0, 0.7))',
        }}
      >
        <defs>
          {/* 室内地板材质渐变 */}
          <linearGradient id="floorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1b2434" />
            <stop offset="100%" stopColor="#151d2a" />
          </linearGradient>

          {/* 地板网格微光 */}
          <pattern id="floorGrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <rect width="60" height="60" fill="url(#floorGrad)" />
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#2a384d" strokeWidth="0.75" strokeOpacity="0.42" />
          </pattern>

          {/* 环境光遮蔽 (AO) 阴影渐变 */}
          <linearGradient id="aoTopShadow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="aoLeftShadow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="aoCornerShadow" cx="0%" cy="0%" r="100%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* 2.5D 墙体顶面细腻石材渐变 */}
          <linearGradient id="wallTopSurface" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4c5b70" />
            <stop offset="55%" stopColor="#3b495d" />
            <stop offset="100%" stopColor="#2e394b" />
          </linearGradient>

          {/* 2.5D 墙体正面深色厚度立体渐变 */}
          <linearGradient id="wallFrontFace" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1d2635" />
            <stop offset="100%" stopColor="#0b1018" />
          </linearGradient>

          {/* 目标点琥珀微光滤镜 */}
          <filter id="amberGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* 翡翠绿入位锁定滤镜 */}
          <filter id="emeraldGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* 死锁警告红光滤镜 */}
          <filter id="redDeadlockGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* 木质箱子渐变 */}
          <linearGradient id="boxWoodGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c26315" />
            <stop offset="50%" stopColor="#9a480a" />
            <stop offset="100%" stopColor="#7a3406" />
          </linearGradient>

          {/* 锁定入位箱子翡翠渐变 */}
          <linearGradient id="boxLockedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#059669" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>

          {/* 人物外套渐变 */}
          <linearGradient id="playerSuitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>

        {/* 1. 地板层（只渲染室内 playable 区域，支持 AO 墙边阴影与角落遮蔽） */}
        <g id="floors">
          {Array.from({ length: board.height }).map((_, y) =>
            Array.from({ length: board.width }).map((_, x) => {
              if (!board.playable[y][x] || board.walls[y][x]) return null;
              const px = x * cellSize;
              const py = y * cellSize;

              const hasWallAbove = y > 0 && board.walls[y - 1][x];
              const hasWallLeft = x > 0 && board.walls[y][x - 1];
              const hasWallTopLeft = y > 0 && x > 0 && board.walls[y - 1][x - 1];

              return (
                <g key={`floor-${x}-${y}`}>
                  <rect
                    x={px}
                    y={py}
                    width={cellSize}
                    height={cellSize}
                    fill="url(#floorGrid)"
                    className="cursor-pointer transition-opacity duration-150 hover:opacity-85"
                    onClick={() => onCellClick({ x, y })}
                  />

                  {/* 上边缘墙体遮蔽阴影 (AO Top) */}
                  {hasWallAbove && (
                    <rect
                      x={px}
                      y={py}
                      width={cellSize}
                      height={14}
                      fill="url(#aoTopShadow)"
                      pointerEvents="none"
                    />
                  )}

                  {/* 左边缘墙体遮蔽阴影 (AO Left) */}
                  {hasWallLeft && (
                    <rect
                      x={px}
                      y={py}
                      width={12}
                      height={cellSize}
                      fill="url(#aoLeftShadow)"
                      pointerEvents="none"
                    />
                  )}

                  {/* 左上对角墙体角隅环境遮蔽 */}
                  {hasWallTopLeft && !hasWallAbove && !hasWallLeft && (
                    <rect
                      x={px}
                      y={py}
                      width={14}
                      height={14}
                      fill="url(#aoCornerShadow)"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })
          )}
        </g>

        {/* 点击寻路目的地微光指示 */}
        {walkTarget && (
          <g
            id="walk-target"
            className="pointer-events-none"
            transform={`translate(${(walkTarget.x + 0.5) * cellSize}, ${(walkTarget.y + 0.5) * cellSize})`}
          >
            <circle
              r={cellSize * 0.25}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeOpacity="0.85"
              className="animate-ping"
            />
            <circle r={4} fill="#38bdf8" fillOpacity="0.9" />
          </g>
        )}

        {/* 2. 目标点层（优雅内嵌式微光卡槽） */}
        <g id="goals">
          {board.goalPositions.map((g, idx) => {
            const px = g.x * cellSize;
            const py = g.y * cellSize;
            const cx = (g.x + 0.5) * cellSize;
            const cy = (g.y + 0.5) * cellSize;

            return (
              <g key={`goal-${idx}`} className="cursor-pointer" onClick={() => onCellClick(g)}>
                {/* 内嵌下凹圆角边框卡槽 */}
                <rect
                  x={px + 8}
                  y={py + 8}
                  width={cellSize - 16}
                  height={cellSize - 16}
                  rx="10"
                  fill="#f59e0b"
                  fillOpacity="0.08"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                  strokeDasharray="4 2"
                />

                {/* 中心柔和呼吸宝石 */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={cellSize * 0.14}
                  fill="#f59e0b"
                  fillOpacity="0.3"
                  filter="url(#amberGlow)"
                  className="animate-pulse-subtle"
                />
                <circle cx={cx} cy={cy} r={cellSize * 0.06} fill="#fbbf24" />
              </g>
            );
          })}
        </g>

        {/* 3. 2.5D 无缝自适应拼接立体墙体层 */}
        <g id="walls">
          {Array.from({ length: board.height }).map((_, y) =>
            Array.from({ length: board.width }).map((_, x) => {
              if (!board.walls[y][x]) return null;

              const px = x * cellSize;
              const py = y * cellSize;

              // 四向邻接墙体判定
              const wallUp = y > 0 && board.walls[y - 1][x];
              const wallDown = y < board.height - 1 && board.walls[y + 1][x];
              const wallLeft = x > 0 && board.walls[y][x - 1];
              const wallRight = x < board.width - 1 && board.walls[y][x + 1];

              return (
                <g key={`wall-${x}-${y}`}>
                  {/* (A) 2.5D 正面厚度下坠面（当下方非墙体时渲染三维厚度） */}
                  {!wallDown && (
                    <>
                      <rect
                        x={px}
                        y={py + cellSize - 1}
                        width={cellSize}
                        height={wallDepth + 1}
                        fill="url(#wallFrontFace)"
                      />
                      {/* 厚度面左右边线仅在未连接相邻墙时绘制 */}
                      {!wallLeft && (
                        <line
                          x1={px + 0.5}
                          y1={py + cellSize}
                          x2={px + 0.5}
                          y2={py + cellSize + wallDepth}
                          stroke="#0a0f18"
                          strokeWidth="1"
                        />
                      )}
                      {!wallRight && (
                        <line
                          x1={px + cellSize - 0.5}
                          y1={py + cellSize}
                          x2={px + cellSize - 0.5}
                          y2={py + cellSize + wallDepth}
                          stroke="#05080f"
                          strokeWidth="1"
                        />
                      )}
                      <line
                        x1={px}
                        y1={py + cellSize + wallDepth - 0.5}
                        x2={px + cellSize}
                        y2={py + cellSize + wallDepth - 0.5}
                        stroke="#05080f"
                        strokeWidth="1.2"
                      />
                    </>
                  )}

                  {/* (B) 墙体顶面无缝石材表面（无内部硬边框，彻底融合相邻砖块） */}
                  <rect
                    x={px - (wallLeft ? 0.5 : 0)}
                    y={py - (wallUp ? 0.5 : 0)}
                    width={cellSize + (wallLeft ? 0.5 : 0) + (wallRight ? 0.5 : 0)}
                    height={cellSize + (wallUp ? 0.5 : 0) + (wallDown ? 0.5 : 0)}
                    fill="url(#wallTopSurface)"
                  />

                  {/* 细腻微妙内部石材纹理微刻线（仅装饰，不破坏连续感） */}
                  <rect
                    x={px + 8}
                    y={py + 8}
                    width={cellSize - 16}
                    height={cellSize - 16}
                    rx="4"
                    fill="#ffffff"
                    fillOpacity="0.025"
                    stroke="#0f172a"
                    strokeWidth="0.6"
                    strokeOpacity="0.22"
                  />

                  {/* (C) 仅在暴露外边缘绘制立体倒角高光与阴影边 */}
                  {!wallUp && (
                    <line
                      x1={px}
                      y1={py + 1}
                      x2={px + cellSize}
                      y2={py + 1}
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                      strokeOpacity="0.45"
                    />
                  )}
                  {!wallLeft && (
                    <line
                      x1={px + 1}
                      y1={py}
                      x2={px + 1}
                      y2={py + cellSize}
                      stroke="#64748b"
                      strokeWidth="1.2"
                      strokeOpacity="0.4"
                    />
                  )}
                  {!wallRight && (
                    <line
                      x1={px + cellSize - 0.8}
                      y1={py}
                      x2={px + cellSize - 0.8}
                      y2={py + cellSize}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                      strokeOpacity="0.75"
                    />
                  )}
                  {!wallDown && (
                    <line
                      x1={px}
                      y1={py + cellSize - 0.5}
                      x2={px + cellSize}
                      y2={py + cellSize - 0.5}
                      stroke="#0f172a"
                      strokeWidth="1.6"
                    />
                  )}
                </g>
              );
            })
          )}
        </g>

        {/* 4. 单步提示指示标记 + 推箱方向箭头 + 目标落点虚影 */}
        {hintBox && (
          <g id="hint-indicator" className="pointer-events-none">
            {/* 目标落点预测虚影 */}
            {hintMeta && (
              <rect
                x={hintMeta.dest.x * cellSize + 8}
                y={hintMeta.dest.y * cellSize + 8}
                width={cellSize - 16}
                height={cellSize - 16}
                rx="8"
                fill="#3b82f6"
                fillOpacity="0.16"
                stroke="#60a5fa"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="animate-pulse"
              />
            )}

            {/* 高亮被推箱子外框 */}
            <g transform={`translate(${hintBox.x * cellSize}, ${hintBox.y * cellSize})`}>
              <rect
                x={3}
                y={3}
                width={cellSize - 6}
                height={cellSize - 6}
                rx="10"
                fill="none"
                stroke="#60a5fa"
                strokeWidth="3"
                strokeDasharray="6 4"
              />

              {/* 推箱方向高亮引导箭头 */}
              {hintMeta && (
                <g
                  transform={`translate(${cellSize / 2 + hintMeta.delta.dx * (cellSize * 0.45)}, ${
                    cellSize / 2 + hintMeta.delta.dy * (cellSize * 0.45)
                  }) rotate(${hintMeta.angle})`}
                >
                  <path
                    d="M 0 -10 L 9 3 L 3 3 L 3 10 L -3 10 L -3 3 L -9 3 Z"
                    fill="#60a5fa"
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    className="animate-bounce-short"
                  />
                </g>
              )}
            </g>
          </g>
        )}

        {/* 5. 箱子层（带平滑移动 transition、翡翠绿锁定与实时死锁红光警告） */}
        <g id="boxes">
          {boxes.map((b, idx) => {
            const onGoal = isBoxOnGoal(b);
            const isDeadlocked = showDeadlockWarning && !onGoal && deadlockedBoxes.has(`${b.x},${b.y}`);

            return (
              <g
                key={`box-${idx}`}
                className="cursor-pointer transition-transform duration-100 ease-out"
                style={{
                  transform: `translate(${b.x * cellSize}px, ${b.y * cellSize}px)`,
                  transitionProperty: 'transform, filter',
                }}
                onClick={() => onCellClick(b)}
              >
                {/* 箱子阴影 */}
                <rect
                  x={7}
                  y={7}
                  width={cellSize - 14}
                  height={cellSize - 14}
                  rx="9"
                  fill="#000"
                  fillOpacity="0.4"
                  filter="blur(3px)"
                />

                {/* 主箱体 */}
                <rect
                  x={6}
                  y={6}
                  width={cellSize - 12}
                  height={cellSize - 12}
                  rx="8"
                  fill={
                    isDeadlocked
                      ? '#7f1d1d'
                      : onGoal
                      ? 'url(#boxLockedGrad)'
                      : 'url(#boxWoodGrad)'
                  }
                  stroke={
                    isDeadlocked
                      ? '#ef4444'
                      : onGoal
                      ? '#6ee7b7'
                      : '#d97706'
                  }
                  strokeWidth={isDeadlocked ? 2.5 : onGoal ? 2.5 : 1.5}
                  filter={
                    isDeadlocked
                      ? 'url(#redDeadlockGlow)'
                      : onGoal
                      ? 'url(#emeraldGlow)'
                      : undefined
                  }
                  className="transition-all duration-300"
                />

                {/* 金属护角与加固角纹 */}
                <path
                  d={`
                    M 6 18 L 18 6
                    M ${cellSize - 6} 18 L ${cellSize - 18} 6
                    M 6 ${cellSize - 18} L 18 ${cellSize - 6}
                    M ${cellSize - 6} ${cellSize - 18} L ${cellSize - 18} ${cellSize - 6}
                  `}
                  stroke={isDeadlocked ? '#fca5a5' : onGoal ? '#a7f3d0' : '#fde68a'}
                  strokeWidth="2"
                  strokeOpacity="0.8"
                />

                {/* 箱面装饰内框 */}
                <rect
                  x={14}
                  y={14}
                  width={cellSize - 28}
                  height={cellSize - 28}
                  rx="4"
                  fill="none"
                  stroke={isDeadlocked ? '#fca5a5' : onGoal ? '#a7f3d0' : '#fbbf24'}
                  strokeWidth="1.5"
                  strokeOpacity="0.6"
                />

                {/* 状态徽标：翡翠星符 / 死锁脉冲 / 经典木纹圆心 */}
                {isDeadlocked ? (
                  <circle cx={cellSize / 2} cy={cellSize / 2} r={3.5} fill="#f87171" className="animate-ping" />
                ) : onGoal ? (
                  <path
                    d={`M ${cellSize / 2} 20 L ${cellSize / 2 + 5} 27 L ${cellSize / 2 + 12} 28 L ${cellSize / 2 + 7} 34 L ${cellSize / 2 + 9} 41 L ${cellSize / 2} 37 L ${cellSize / 2 - 9} 41 L ${cellSize / 2 - 7} 34 L ${cellSize / 2 - 12} 28 L ${cellSize / 2 - 5} 27 Z`}
                    fill="#ffffff"
                    fillOpacity="0.95"
                    className="animate-pulse-subtle"
                  />
                ) : (
                  <circle
                    cx={cellSize / 2}
                    cy={cellSize / 2}
                    r={3}
                    fill="#fef3c7"
                    fillOpacity="0.75"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* 6. 人物层（俯视可爱推箱专家小人，支持平滑朝向与位置过渡） */}
        <g
          id="player"
          className="pointer-events-none transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${player.x * cellSize}px, ${player.y * cellSize}px)`,
          }}
        >
          {/* 人物阴影 */}
          <ellipse
            cx={cellSize * 0.5}
            cy={cellSize * 0.54}
            rx={cellSize * 0.32}
            ry={cellSize * 0.28}
            fill="#000"
            fillOpacity="0.45"
            filter="blur(2px)"
          />

          {/* 旋转小人主体 */}
          <g
            style={{
              transformOrigin: `${cellSize * 0.5}px ${cellSize * 0.5}px`,
              transform: `rotate(${facingRotation}deg)`,
              transition: 'transform 100ms ease-in-out',
            }}
          >
            {/* 工装棕色背包 */}
            <rect
              x={cellSize * 0.34}
              y={cellSize * 0.62}
              width={cellSize * 0.32}
              height={cellSize * 0.22}
              rx="4"
              fill="#78350f"
              stroke="#451a03"
              strokeWidth="1.2"
            />

            {/* 双肩与推箱工装外套 */}
            <circle
              cx={cellSize * 0.5}
              cy={cellSize * 0.5}
              r={cellSize * 0.28}
              fill="url(#playerSuitGrad)"
              stroke="#b45309"
              strokeWidth="2"
            />

            {/* 双手推箱手套 */}
            <circle
              cx={cellSize * 0.26}
              cy={cellSize * 0.28}
              r={cellSize * 0.08}
              fill="#fde68a"
              stroke="#b45309"
              strokeWidth="1.2"
            />
            <circle
              cx={cellSize * 0.74}
              cy={cellSize * 0.28}
              r={cellSize * 0.08}
              fill="#fde68a"
              stroke="#b45309"
              strokeWidth="1.2"
            />

            {/* 帽子 / 头部 */}
            <circle
              cx={cellSize * 0.5}
              cy={cellSize * 0.44}
              r={cellSize * 0.19}
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth="1.5"
            />

            {/* 帽子前沿高光（指示朝向前方） */}
            <path
              d={`M ${cellSize * 0.36} ${cellSize * 0.36} Q ${cellSize * 0.5} ${cellSize * 0.24} ${cellSize * 0.64} ${cellSize * 0.36}`}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* 灵动大眼睛 */}
            <circle cx={cellSize * 0.43} cy={cellSize * 0.39} r={cellSize * 0.035} fill="#ffffff" />
            <circle cx={cellSize * 0.57} cy={cellSize * 0.39} r={cellSize * 0.035} fill="#ffffff" />
          </g>
        </g>
      </svg>
    </div>
  );
};
