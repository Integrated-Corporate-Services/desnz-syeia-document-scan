import type { ScanResultResponse } from '../types/scan.types.js';

/**
 * Parse a ClamAV INSTREAM daemon response into a scan result.
 * Exported so unit tests exercise the same logic as ClamAVService.
 */
export function parseClamAvResponse(response: string): ScanResultResponse {
  // clamd terminates INSTREAM replies with a NUL byte and may include blank lines;
  // strip NULs and inspect the last non-empty status line.
  const cleaned = response.replace(/\0/g, '').trim();
  const line =
    cleaned
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .pop() || '';

  // Check FOUND before OK, and anchor the match, so virus names containing "OK"
  // (e.g. "Win.Test.OK-1") are not misclassified as clean.
  const foundMatch = line.match(/^stream:\s+(.+?)\s+FOUND$/);
  if (foundMatch) {
    return {
      isClean: false,
      virusName: foundMatch[1] || null,
    };
  }

  if (/^stream:\s+OK$/.test(line)) {
    return {
      isClean: true,
      virusName: null,
    };
  }

  throw new Error(`Unexpected ClamAV response: ${cleaned}`);
}
