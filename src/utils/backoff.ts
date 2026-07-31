import { WORKER_CONSTANTS } from '../constants/worker.constants.js';

/**
 * Exponential backoff for deferring an SQS message via ChangeMessageVisibility.
 *
 * Attempt 1 (first delivery, ApproximateReceiveCount=1) waits SQS_DEFER_BASE_SECONDS;
 * each subsequent attempt doubles the wait, capped at SQS_DEFER_MAX_SECONDS so a
 * message can never sit invisible for an unbounded stretch.
 *
 * @param receiveCount - SQS's ApproximateReceiveCount for this message (1 for the
 *   first delivery, 2 for the first retry, and so on).
 */
export function calculateDeferSeconds(receiveCount: number): number {
  const priorAttempts = Math.max(receiveCount - 1, 0);
  const backoffSeconds = WORKER_CONSTANTS.SQS_DEFER_BASE_SECONDS * 2 ** priorAttempts;
  return Math.min(backoffSeconds, WORKER_CONSTANTS.SQS_DEFER_MAX_SECONDS);
}
