export const SCAN_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type ScanStatus = typeof SCAN_STATUS[keyof typeof SCAN_STATUS];

export const SCAN_RESULT = {
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
} as const;

export type ScanResult = typeof SCAN_RESULT[keyof typeof SCAN_RESULT];

export const S3_FOLDERS = {
  CLEAN: 'clean',
  INFECTED: 'infected',
} as const;

export type S3Folder = typeof S3_FOLDERS[keyof typeof S3_FOLDERS];

export const EVENT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type EventStatus = typeof EVENT_STATUS[keyof typeof EVENT_STATUS];
