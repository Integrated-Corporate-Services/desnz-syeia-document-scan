import { parseClamAvResponse } from '../../src/utils/clamavParseResponse';

describe('parseClamAvResponse', () => {
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
