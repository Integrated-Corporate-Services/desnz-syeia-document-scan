/**
 * Unit-style checks for ClamAV response parsing (EICAR / clean).
 * Mirrors ClamAVService.parseResponse behaviour without needing clamd.
 */
function parseClamAvResponse(response: string): { isClean: boolean; virusName: string | null } {
  const trimmed = response.trim();
  if (trimmed.includes('OK')) {
    return { isClean: true, virusName: null };
  }
  if (trimmed.includes('FOUND')) {
    const match = trimmed.match(/stream: (.+?) FOUND/);
    return { isClean: false, virusName: match ? match[1] || null : null };
  }
  throw new Error(`Unexpected ClamAV response: ${trimmed}`);
}

describe('ClamAV EICAR / clean response parsing', () => {
  it('marks clean stream as CLEAN', () => {
    expect(parseClamAvResponse('stream: OK')).toEqual({
      isClean: true,
      virusName: null,
    });
  });

  it('detects EICAR test signature as INFECTED', () => {
    expect(parseClamAvResponse('stream: Eicar-Test-Signature FOUND')).toEqual({
      isClean: false,
      virusName: 'Eicar-Test-Signature',
    });
  });

  it('rejects unexpected responses', () => {
    expect(() => parseClamAvResponse('stream: ERROR')).toThrow(/Unexpected ClamAV response/);
  });
});
