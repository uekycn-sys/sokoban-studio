import { Position, ParsedBoard, SolverResult } from '../types/game';
import { SokobanSolver, SolverOptions } from './solverCore';

export interface WorkerSolveRequest {
  type: 'SOLVE';
  payload: {
    board: ParsedBoard;
    player: Position;
    boxes: Position[];
    options?: SolverOptions;
  };
}

export interface WorkerCancelRequest {
  type: 'CANCEL';
}

export type WorkerMessage = WorkerSolveRequest | WorkerCancelRequest;

let currentAbortFlag = false;

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const data = e.data;

  if (data.type === 'CANCEL') {
    currentAbortFlag = true;
    return;
  }

  if (data.type === 'SOLVE') {
    currentAbortFlag = false;
    const { board, player, boxes, options } = data.payload;

    try {
      const solver = new SokobanSolver(board);
      const result: SolverResult = solver.solve(player, boxes, {
        ...options,
        shouldAbort: () => currentAbortFlag,
      });

      self.postMessage({
        type: 'SOLVE_RESULT',
        payload: result,
      });
    } catch (err: any) {
      self.postMessage({
        type: 'SOLVE_RESULT',
        payload: {
          success: false,
          moves: '',
          pushMovesCount: 0,
          totalStepsCount: 0,
          exploredStates: 0,
          durationMs: 0,
          reason: 'unsolvable',
        } as SolverResult,
      });
    }
  }
};
