export const SCAN_RESULT = {
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
} as const;

export type ScanResult = typeof SCAN_RESULT[keyof typeof SCAN_RESULT];
