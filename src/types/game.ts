export type Direction = 'u' | 'd' | 'l' | 'r';
export type PushDirection = 'U' | 'D' | 'L' | 'R';
export type MoveChar = Direction | PushDirection;

export interface Position {
  x: number;
  y: number;
}

export type CellType = 'wall' | 'floor' | 'target' | 'void';

export interface MoveRecord {
  from: Position;
  to: Position;
  direction: Direction;
  isPush: boolean;
  boxFrom?: Position;
  boxTo?: Position;
}

export interface LevelDefinition {
  id: number;
  chapter: number;
  chapterTitle: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Master' | 'Legend';
  xsb: string;
  parSteps: number;
  description: string;
}

export interface ParsedBoard {
  width: number;
  height: number;
  walls: boolean[][];      // true if wall
  goals: boolean[][];      // true if goal/target
  playable: boolean[][];   // true if interior walkable floor/goal
  initialPlayer: Position;
  initialBoxes: Position[];
  goalPositions: Position[];
}

export interface GameState {
  player: Position;
  playerFacing: Direction;
  boxes: Position[];
  movesCount: number;
  pushesCount: number;
  isWon: boolean;
  history: MoveRecord[];
  redoStack: MoveRecord[];
}

export interface SolverResult {
  success: boolean;
  moves: string;              // Full sequence with lowercase walks and uppercase pushes
  pushMovesCount: number;
  totalStepsCount: number;
  exploredStates: number;
  durationMs: number;
  reason: 'solved' | 'timeout' | 'state_limit' | 'unsolvable' | 'cancelled';
  steps?: {
    player: Position;
    boxes: Position[];
    moveChar: MoveChar;
  }[];
}

export interface LevelProgress {
  completed: boolean;
  bestSteps: number;
  bestPushes: number;
  stars: number;
}
