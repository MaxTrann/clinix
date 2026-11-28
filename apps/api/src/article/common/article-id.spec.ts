import { isArticleId } from './article-id.js';

// article B2 — ABQ-03 (mức đơn vị): id ở đường dẫn công khai phải là số nguyên dương nằm trong BIGINT, dạng chuỗi. Sai dạng sẽ thành 404 cùng thân với "không có" (service).
describe('article B2 — isArticleId (ABQ-03)', () => {
  it.each(['1', '12', '987654321', '9223372036854775807'])(
    'ABQ-03: %s hợp lệ (biên: 19 chữ số cuối cùng của BIGINT)',
    (value) => {
      expect(isArticleId(value)).toBe(true);
    },
  );

  it.each([
    ['rỗng', ''],
    ['chữ', 'abc'],
    ['không', '0'],
    ['số âm', '-1'],
    ['số 0 đầu', '01'],
    ['dấu cộng', '+1'],
    ['số thập phân', '1.5'],
    ['dạng mũ', '1e3'],
    ['khoảng trắng đầu', ' 1'],
    ['khoảng trắng cuối', '1 '],
    ['id kèm slug', '5-sot-xuat-huyet'],
    ['20 chữ số', '12345678901234567890'],
    ['vượt BIGINT 19 chữ số', '9223372036854775808'],
    ['19 chữ số 9', '9999999999999999999'],
  ])('ABQ-03: %s (%j) không hợp lệ', (_name, value) => {
    expect(isArticleId(value)).toBe(false);
  });

  it('ABQ-03: giá trị không phải chuỗi (số, null, mảng, đối tượng) không hợp lệ', () => {
    for (const value of [1, 5n, null, undefined, ['1'], { id: '1' }, true])
      expect(isArticleId(value)).toBe(false);
  });
});
