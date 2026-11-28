import {
  hashtagSortKey,
  normalizeHashtag,
  normalizeHashtagList,
  normalizeHashtagPrefix,
  sortHashtags,
} from './hashtag-name.js';

// article B1: ABT-01 (chuẩn hoá), ABT-02 (ký tự và độ dài), phần thuần của ABT-03 (bỏ trùng, giới hạn 10) và khoá sắp xếp của ABT-06.
describe('article — chuẩn hoá thẻ (ABT-01)', () => {
  it('ABT-01: "  #Trẻ Em " thành "trẻ-em"; Ho thành ho; NFD về NFC; "đau  đầu" thành "đau-đầu"; "##a" thành "a"', () => {
    expect(normalizeHashtag('  #Trẻ Em ')).toBe('trẻ-em');
    expect(normalizeHashtag('Ho')).toBe('ho');
    const nfd = 'Sốt'.normalize('NFD');
    expect(nfd).not.toBe('Sốt');
    expect(normalizeHashtag(nfd)).toBe('sốt');
    expect(normalizeHashtag('đau  đầu')).toBe('đau-đầu');
    expect(normalizeHashtag('##a')).toBe('a');
    expect(normalizeHashtag('# a')).toBe('a');
  });

  it('ABT-01: gộp "-" liền nhau, bỏ "-" hai đầu, khoảng trắng và tab thành "-"', () => {
    expect(normalizeHashtag('-a--b-')).toBe('a-b');
    expect(normalizeHashtag('a \t b')).toBe('a-b');
    expect(normalizeHashtag('a - b')).toBe('a-b');
  });

  it('ABT-01: chuẩn hoá là lũy đẳng (chạy hai lần như một)', () => {
    for (const raw of ['  #Trẻ Em ', 'Ho', '-a--b-', 'ĐAU  Đầu'])
      expect(normalizeHashtag(normalizeHashtag(raw) ?? '')).toBe(
        normalizeHashtag(raw),
      );
  });
});

describe('article — ký tự và độ dài của thẻ (ABT-02)', () => {
  it('ABT-02: "<", "/", emoji, "_", rỗng, chỉ "-", chỉ "#" đều không hợp lệ', () => {
    for (const bad of [
      '<',
      'a/b',
      '😀',
      'a_b',
      '',
      '   ',
      '-',
      '---',
      '#',
      'a<b',
      'a\x00b',
    ])
      expect(normalizeHashtag(bad), JSON.stringify(bad)).toBeNull();
  });

  it('ABT-02: chữ cái Unicode, chữ số và "-" hợp lệ', () => {
    expect(normalizeHashtag('covid-19')).toBe('covid-19');
    expect(normalizeHashtag('tiểu đường')).toBe('tiểu-đường');
    expect(normalizeHashtag('2026')).toBe('2026');
  });

  it('ABT-02: 50 điểm mã nhận, 51 từ chối; chữ tiếng Việt đếm theo điểm mã chứ không theo byte', () => {
    expect(normalizeHashtag('a'.repeat(50))).toBe('a'.repeat(50));
    expect(normalizeHashtag('a'.repeat(51))).toBeNull();
    expect(normalizeHashtag('ệ'.repeat(50))).toBe('ệ'.repeat(50));
    expect(normalizeHashtag('ệ'.repeat(51))).toBeNull();
  });
});

describe('article — mảng thẻ của một yêu cầu (ABT-03)', () => {
  const tags = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => `the${index}`);

  it('ABT-03: Ho và ho gộp thành một thẻ, giữ thứ tự xuất hiện đầu tiên', () => {
    expect(normalizeHashtagList(['Ho', 'sốt', 'ho', '#HO'])).toEqual({
      ok: true,
      names: ['ho', 'sốt'],
    });
  });

  it('ABT-03: 10 thẻ khác nhau nhận, 11 thẻ khác nhau là QUA_NHIEU_THE', () => {
    expect(normalizeHashtagList(tags(10))).toEqual({
      ok: true,
      names: tags(10),
    });
    expect(normalizeHashtagList(tags(11))).toEqual({
      ok: false,
      error: 'QUA_NHIEU_THE',
    });
  });

  it('ABT-03: giới hạn tính SAU khi bỏ trùng: 11 phần tử thô nhưng chỉ 10 thẻ khác nhau vẫn nhận', () => {
    expect(normalizeHashtagList([...tags(10), 'THE0'])).toEqual({
      ok: true,
      names: tags(10),
    });
  });

  it('ABT-03: một thẻ sai là THE_KHONG_HOP_LE (kể cả khi đứng sau thẻ đúng); mảng rỗng hợp lệ', () => {
    expect(normalizeHashtagList(['ho', 'a/b'])).toEqual({
      ok: false,
      error: 'THE_KHONG_HOP_LE',
    });
    expect(normalizeHashtagList([])).toEqual({ ok: true, names: [] });
  });
});

describe('article — tiền tố gợi ý (ABT-08)', () => {
  it('ABT-08: chuẩn hoá như thẻ nhưng giữ "-" cuối; rỗng nghĩa là không có tiền tố; sai ký tự là null', () => {
    expect(normalizeHashtagPrefix('  #Trẻ E')).toBe('trẻ-e');
    expect(normalizeHashtagPrefix('trẻ-')).toBe('trẻ-');
    expect(normalizeHashtagPrefix('')).toBe('');
    expect(normalizeHashtagPrefix('#')).toBe('');
    expect(normalizeHashtagPrefix('a/b')).toBeNull();
    expect(normalizeHashtagPrefix('a'.repeat(51))).toBeNull();
  });
});

describe('article — khoá sắp xếp thẻ (ABT-06, đột biến 6)', () => {
  it('ABT-06: khoá gập dấu: mắt, mặt, mat cùng khoá; đ gập thành d', () => {
    expect(hashtagSortKey('mắt')).toBe('mat');
    expect(hashtagSortKey('mặt')).toBe('mat');
    expect(hashtagSortKey('mat')).toBe('mat');
    expect(hashtagSortKey('đau')).toBe('dau');
  });

  it('ABT-06: mọi thứ tự đầu vào cho CÙNG một thứ tự đầu ra (x,y và y,x cùng ra x,y)', () => {
    expect(sortHashtags(['y', 'x'])).toEqual(['x', 'y']);
    expect(sortHashtags(['x', 'y'])).toEqual(['x', 'y']);
    const names = ['zebra', 'đau', 'apple', 'mắt', 'dau-đầu'];
    expect(sortHashtags(names)).toEqual(sortHashtags([...names].reverse()));
  });

  it('ABT-06: tên cùng lớp khác dấu không bị tách đôi bởi tên khác lớp (lớp "mat" liền nhau, nên hai yêu cầu không khoá chéo)', () => {
    // Sắp thô sẽ cho mắt < mắu < mặt (tách lớp "mat" bởi "mắu"); khoá gập dấu cho mắt, mặt liền nhau rồi mới tới mắu
    expect(sortHashtags(['mắu', 'mặt', 'mắt'])).toEqual(['mắt', 'mặt', 'mắu']);
    expect(['mắu', 'mặt', 'mắt'].sort()).toEqual(['mắt', 'mắu', 'mặt']);
  });
});
