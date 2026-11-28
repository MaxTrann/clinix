import {
  addHashtag,
  HASHTAG_MAX_COUNT,
  HASHTAG_MAX_LENGTH,
  normalizeHashtag,
} from './hashtag-name';

// article F1, ABW-04 (phần chuẩn hoá): chip hiện đúng thứ máy chủ sẽ lưu (PLAN 5.6, MH7). Hàm thuần.
const name = (raw: string) => {
  const result = normalizeHashtag(raw);
  return result.ok ? result.name : result.reason;
};

describe('normalizeHashtag (ABW-04)', () => {
  it.each([
    ['  #Trẻ Em ', 'trẻ-em'],
    ['Sức Khỏe', 'sức-khỏe'],
    ['ĐAU ĐẦU', 'đau-đầu'],
    ['tim-mạch', 'tim-mạch'],
    ['2026', '2026'],
    ['a   b', 'a-b'],
    ['a--b', 'a-b'],
    ['-a-', 'a'],
    [' - a - ', 'a'],
    ['# abc', 'abc'],
    ['\tTrẻ Em\n', 'trẻ-em'],
  ])('ABW-04 %j ⇒ %j', (raw, expected) => {
    expect(name(raw)).toBe(expected);
  });

  it('ABW-04 chuẩn hoá NFC: chữ có dấu viết rời (NFD) ra cùng thẻ với chữ viết liền', () => {
    expect(name('Trẻ em')).toBe('trẻ-em');
    expect(name('Trẻ em')).toBe(name('Trẻ em'));
  });

  it.each(['', '   ', '#', ' # ', '---', ' - '])(
    'ABW-04 %j không có chữ nào ⇒ EMPTY (không phải lỗi, nơi gọi bỏ qua)',
    (raw) => {
      expect(name(raw)).toBe('EMPTY');
    },
  );

  it.each(['a b!', 'a_b', 'a.b', 'a/b', '##abc', '<script>', 'tim😀', 'a,b'])(
    'ABW-04 %j có ký tự ngoài chữ, số, gạch ngang ⇒ INVALID',
    (raw) => {
      expect(name(raw)).toBe('INVALID');
    },
  );

  it('ABW-04 biên độ dài: 50 điểm mã nhận, 51 bị từ chối (đếm điểm mã, không đếm đơn vị UTF-16)', () => {
    expect(HASHTAG_MAX_LENGTH).toBe(50);
    expect(name('ạ'.repeat(50))).toBe('ạ'.repeat(50));
    expect(name('ạ'.repeat(51))).toBe('INVALID');
    // 49 chữ + một dấu gạch ngang ở giữa vẫn là 50
    expect(name(`${'a'.repeat(25)} ${'b'.repeat(24)}`)).toHaveLength(50);
  });

  it('ABW-04 chuẩn hoá hai lần ra cùng kết quả (idempotent)', () => {
    for (const raw of ['  #Trẻ Em ', 'Sức  Khỏe', 'ĐAU ĐẦU']) {
      const once = name(raw);
      expect(name(once)).toBe(once);
    }
  });
});

describe('addHashtag (ABW-04)', () => {
  it('ABW-04 thêm thẻ đã chuẩn hoá vào cuối, giữ thứ tự, không sửa mảng cũ', () => {
    const before = ['a'];
    const result = addHashtag(before, '  #Trẻ Em ');
    expect(result).toEqual({ ok: true, tags: ['a', 'trẻ-em'], added: true });
    expect(before).toEqual(['a']);
  });

  it('ABW-04 thẻ trùng (sau chuẩn hoá) bị bỏ, không lỗi, mảng giữ nguyên', () => {
    const before = ['trẻ-em'];
    const result = addHashtag(before, '#TRẺ  em');
    expect(result).toEqual({ ok: true, tags: before, added: false });
  });

  it('ABW-04 rỗng và sai ký tự trả đúng lý do, không thêm', () => {
    expect(addHashtag([], '  ')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(addHashtag([], 'a!')).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('ABW-04 tối đa 10 thẻ: thẻ mới thứ 11 bị chặn, thẻ trùng khi đã đủ thì vẫn không lỗi', () => {
    const full = Array.from(
      { length: HASHTAG_MAX_COUNT },
      (_, index) => `the-${index}`,
    );
    expect(HASHTAG_MAX_COUNT).toBe(10);
    expect(addHashtag(full, 'moi')).toEqual({ ok: false, reason: 'TOO_MANY' });
    expect(addHashtag(full, 'THE-3')).toEqual({
      ok: true,
      tags: full,
      added: false,
    });
    // đủ 9 thì thêm được thẻ thứ 10
    const result = addHashtag(full.slice(0, 9), 'moi');
    expect(result.ok && result.tags).toHaveLength(10);
  });
});
