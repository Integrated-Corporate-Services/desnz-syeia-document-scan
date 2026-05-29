export const EVENT_STATUS = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type EventStatus = typeof EVENT_STATUS[keyof typeof EVENT_STATUS];
