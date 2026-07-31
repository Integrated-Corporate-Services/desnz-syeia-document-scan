import { WORKER_CONSTANTS } from '../constants/worker.constants.js';

export function calculateDeferSeconds(receiveCount: number): number {
  const priorAttempts = Math.max(receiveCount - 1, 0);
  const backoffSeconds = WORKER_CONSTANTS.SQS_DEFER_BASE_SECONDS * 2 ** priorAttempts;
  return Math.min(backoffSeconds, WORKER_CONSTANTS.SQS_DEFER_MAX_SECONDS);
}
