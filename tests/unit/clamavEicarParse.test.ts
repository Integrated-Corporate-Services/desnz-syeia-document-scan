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

  it('strips the trailing NUL byte clamd appends', () => {
    expect(parseClamAvResponse('stream: OK\u0000')).toEqual({
      isClean: true,
      virusName: null,
    });
  });

  it('parses NUL-terminated FOUND responses', () => {
    expect(parseClamAvResponse('stream: Win.Test.EICAR_HDB-1 FOUND\u0000')).toEqual({
      isClean: false,
      virusName: 'Win.Test.EICAR_HDB-1',
    });
  });

  it('does not misclassify a virus name containing OK as clean', () => {
    expect(parseClamAvResponse('stream: Win.Test.OK-1 FOUND')).toEqual({
      isClean: false,
      virusName: 'Win.Test.OK-1',
    });
  });

  it('uses the last status line in multi-line responses', () => {
    expect(parseClamAvResponse('\nstream: OK\n')).toEqual({
      isClean: true,
      virusName: null,
    });
  });
});
