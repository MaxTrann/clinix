import { ARTICLE_DATE_NONE, formatArticleDate } from './format-article-date';

// article F1 (MH18): `dd/MM/yyyy` theo giờ Việt Nam (+07:00) từ chuỗi ISO UTC, không phụ thuộc múi giờ của máy.
describe('formatArticleDate', () => {
  it.each([
    ['2026-11-28T03:00:00.000Z', '28/11/2026'],
    ['2026-11-28T16:59:59.999Z', '28/11/2026'],
    ['2026-11-28T17:00:00.000Z', '29/11/2026'],
    ['2026-12-31T17:30:00.000Z', '01/01/2027'],
    ['2028-02-28T17:00:00.000Z', '29/02/2028'],
    ['2026-01-05T00:00:00Z', '05/01/2026'],
  ])('MH18 %s ⇒ %s', (iso, expected) => {
    expect(formatArticleDate(iso)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'abc',
    '12',
    '2026-11-28',
    '2026-13-45T00:00:00Z',
  ])('MH18 %j không phải ngày hợp lệ ⇒ "—" (không in NaN)', (iso) => {
    expect(formatArticleDate(iso)).toBe(ARTICLE_DATE_NONE);
    expect(ARTICLE_DATE_NONE).toBe('—');
  });
});
