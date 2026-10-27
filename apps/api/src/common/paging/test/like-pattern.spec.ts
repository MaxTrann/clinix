import { escapeLikePattern, LIKE_ESCAPE_CHARACTER } from '../like-pattern.js';

describe('escapeLikePattern (TK-06)', () => {
  it('escapes LIKE wildcards and its own escape character', () => {
    expect(LIKE_ESCAPE_CHARACTER).toBe('!');
    expect(escapeLikePattern('25%_off!')).toBe('25!%!_off!!');
  });

  it('leaves SQL punctuation for parameter binding instead of treating it as LIKE syntax', () => {
    expect(escapeLikePattern("O'Brien -- clinic")).toBe("O'Brien -- clinic");
  });
});
