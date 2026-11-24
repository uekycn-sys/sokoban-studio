import React from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Undo2 } from 'lucide-react';
import { Direction } from '../types/game';

interface VirtualDPadProps {
  onMove: (dir: Direction) => void;
  onUndo: () => void;
  canUndo: boolean;
}

export const VirtualDPad: React.FC<VirtualDPadProps> = ({
  onMove,
  onUndo,
  canUndo,
}) => {
  return (
    <div className="flex md:hidden items-center justify-center py-2 select-none">
      <div className="relative w-40 h-40 bg-studio-900/60 backdrop-blur-sm rounded-full p-2 border border-studio-800 shadow-xl flex items-center justify-center">
        {/* 上键 */}
        <button
          onClick={() => onMove('u')}
          className="absolute top-2 w-12 h-12 rounded-2xl bg-studio-800/90 active:bg-amber-500 active:text-studio-950 text-studio-200 border border-studio-700/80 flex items-center justify-center shadow-lg transition-colors"
        >
          <ArrowUp className="w-5 h-5" />
        </button>

        {/* 下键 */}
        <button
          onClick={() => onMove('d')}
          className="absolute bottom-2 w-12 h-12 rounded-2xl bg-studio-800/90 active:bg-amber-500 active:text-studio-950 text-studio-200 border border-studio-700/80 flex items-center justify-center shadow-lg transition-colors"
        >
          <ArrowDown className="w-5 h-5" />
        </button>

        {/* 左键 */}
        <button
          onClick={() => onMove('l')}
          className="absolute left-2 w-12 h-12 rounded-2xl bg-studio-800/90 active:bg-amber-500 active:text-studio-950 text-studio-200 border border-studio-700/80 flex items-center justify-center shadow-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* 右键 */}
        <button
          onClick={() => onMove('r')}
          className="absolute right-2 w-12 h-12 rounded-2xl bg-studio-800/90 active:bg-amber-500 active:text-studio-950 text-studio-200 border border-studio-700/80 flex items-center justify-center shadow-lg transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
        </button>

        {/* 中心快捷撤销键 */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="w-10 h-10 rounded-full bg-studio-850 active:bg-studio-700 text-studio-400 hover:text-studio-100 disabled:opacity-30 border border-studio-750 flex items-center justify-center"
          title="撤销"
        >
          <Undo2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
