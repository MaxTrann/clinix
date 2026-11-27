import {
  ID_PLACEHOLDER_KINDS,
  PLACEHOLDER_STAND_IN,
  formatPlaceholder,
  parsePlaceholders,
  placeholderKey,
  toPlaceholderRef,
  uniqueRefs,
} from './placeholder.js';

// chatbot B2 — chỗ giữ `[[LOẠI:id]]` (PLAN chatbot 5.7). Mã test: DCR-02 (dạng sai, loại lạ, `[[` dở dang) và ca cơ chế B2-nn.

describe('chatbot B2 — parsePlaceholders (hàm thuần)', () => {
  it('B2-01: chữ không có chỗ giữ trả nguyên văn, không chỗ giữ nào', () => {
    expect(parsePlaceholders('Phòng khám mở cửa vào buổi sáng.')).toEqual({
      ok: true,
      refs: [],
      stripped: 'Phòng khám mở cửa vào buổi sáng.',
    });
  });

  it('B2-02: đủ 11 loại có id và 4 loại có khoá chữ đều hợp lệ', () => {
    const tokens = [
      ...ID_PLACEHOLDER_KINDS.map((kind) => `[[${kind}:12]]`),
      '[[PK:hotline]]',
      '[[PK:email]]',
      '[[CS:giuCho]]',
      '[[CS:doiLich]]',
    ];
    const parsed = parsePlaceholders(tokens.join(' '));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.refs.map(formatPlaceholder)).toEqual(tokens);
    expect(parsed.stripped).toBe(
      Array.from({ length: tokens.length }, () => PLACEHOLDER_STAND_IN).join(
        ' ',
      ),
    );
  });

  it('B2-03: chỗ giữ nằm giữa chữ; thứ tự và trùng nhau được giữ', () => {
    const parsed = parsePlaceholders(
      'Gặp [[BS:7]] ở [[CN:3]], hỏi lại [[BS:7]].',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.refs.map(placeholderKey)).toEqual(['BS:7', 'CN:3', 'BS:7']);
    expect(parsed.stripped).toBe(
      `Gặp ${PLACEHOLDER_STAND_IN} ở ${PLACEHOLDER_STAND_IN}, hỏi lại ${PLACEHOLDER_STAND_IN}.`,
    );
    expect(uniqueRefs(parsed.refs).map(placeholderKey)).toEqual([
      'BS:7',
      'CN:3',
    ]);
  });

  it('DCR-02: loại lạ, chữ thường, khoảng trắng, thiếu id, hai dấu hai chấm đều sai', () => {
    for (const bad of [
      '[[XX:1]]',
      '[[bs:1]]',
      '[[BS: 1]]',
      '[[BS :1]]',
      '[[ BS:1]]',
      '[[BS:]]',
      '[[BS]]',
      '[[BS:1:2]]',
      '[[]]',
      '[[PK:diaChi]]',
      '[[PK:1]]',
      '[[CS:soLan]]',
      '[[BS:hotline]]',
    ]) {
      expect(parsePlaceholders(`Xin chào ${bad} nhé`)).toEqual({ ok: false });
    }
  });

  it('DCR-02: id phải là id BIGINT dạng chuỗi (số 0 đầu, số âm, thập phân, vượt BIGINT đều sai)', () => {
    for (const id of [
      '0',
      '01',
      '-1',
      '1.5',
      '1e3',
      '9223372036854775808',
      '99999999999999999999',
      'abc',
    ]) {
      expect(toPlaceholderRef('BS', id)).toBeNull();
    }
    expect(toPlaceholderRef('BS', '9223372036854775807')).toEqual({
      kind: 'BS',
      id: '9223372036854775807',
    });
  });

  it('DCR-02: `[[` hay `]]` dở dang, hoặc lồng nhau, là sai', () => {
    for (const bad of [
      'Gặp [[BS:1',
      'Gặp BS:1]]',
      'Gặp [[BS:1]',
      'Gặp [BS:1]]',
      '[[[BS:1]]',
      '[[BS:1]]]]',
      '[[BS:[[CN:1]]]]',
      'Còn [[ nữa',
    ]) {
      expect(parsePlaceholders(bad)).toEqual({ ok: false });
    }
  });

  it('B2-17: chữ gốc đã chứa ký tự giữ chỗ nội bộ là sai (mô hình không được giả một chỗ giữ để lách luật chữ)', () => {
    expect(
      parsePlaceholders(`chuyên khoa ${PLACEHOLDER_STAND_IN}huyết học`),
    ).toEqual({ ok: false });
    expect(parsePlaceholders(PLACEHOLDER_STAND_IN)).toEqual({ ok: false });
  });

  it('B2-04: một ngoặc vuông đơn vẫn là chữ thường (không phải chỗ giữ)', () => {
    const parsed = parsePlaceholders('Xem [ghi chú] và [[BS:2]]');
    expect(parsed.ok).toBe(true);
  });

  it('B2-05: chuỗi rất dài vẫn phân tích tuyến tính', () => {
    const text = '[[BS:1]] '.repeat(5000);
    const started = Date.now();
    const parsed = parsePlaceholders(text);
    expect(parsed.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
