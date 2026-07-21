import type { ScanResultResponse } from '../types/scan.types.js';

/**
 * Parse a ClamAV INSTREAM daemon response into a scan result.
 * Exported so unit tests exercise the same logic as ClamAVService.
 */
export function parseClamAvResponse(response: string): ScanResultResponse {
  const trimmed = response.trim();

  if (trimmed.includes('OK')) {
    return {
      isClean: true,
      virusName: null,
    };
  }

  if (trimmed.includes('FOUND')) {
    const match = trimmed.match(/stream: (.+?) FOUND/);
    const virusName = match ? match[1] || null : null;
    return {
      isClean: false,
      virusName,
    };
  }

  throw new Error(`Unexpected ClamAV response: ${trimmed}`);
}
