import {
  articleListPath,
  hasPublicFilters,
  normalizeKeyword,
  readPublicFilters,
  writePublicFilters,
} from './article-public-query';

// article F2, ABG-03: bộ lọc ở URL `?q=&the=&trang=` là nguồn duy nhất; hàm thuần, giá trị rác về mặc định. Ca vòng đi vòng lại có dấu (thẻ ở trang chi tiết) ở cuối.
const read = (search: string) => readPublicFilters(new URLSearchParams(search));

describe('readPublicFilters', () => {
  it('ABG-03 URL trống ⇒ mặc định: không lọc, trang 1', () => {
    expect(read('')).toEqual({ q: '', the: '', trang: 1 });
  });

  it('ABG-03 đọc đủ ba khoá; q được trim; the được chuẩn hoá như khi lưu (chữ thường, khoảng trắng thành `-`, bỏ `#`)', () => {
    expect(read('q=%20s%E1%BB%91t%20&the=%23Tr%E1%BA%BB%20Em&trang=3')).toEqual(
      {
        q: 'sốt',
        the: 'trẻ-em',
        trang: 3,
      },
    );
  });

  it('ABG-03 ca âm: `the` rác (ký tự lạ, rỗng) ⇒ bỏ lọc, không bao giờ để lọt chuỗi rỗng hay sai dạng lên máy chủ', () => {
    for (const the of [
      '',
      '   ',
      '#',
      '---',
      'a/b',
      '<script>',
      'a b!',
      'x'.repeat(51),
    ]) {
      expect(read(`the=${encodeURIComponent(the)}`).the).toBe('');
    }
  });

  it('ABG-03 ca âm: `trang` rác (0, âm, chữ, thập phân, 0 đứng đầu, quá 6 chữ số) ⇒ trang 1; biên: 1 và 999999 hợp lệ', () => {
    for (const trang of ['0', '-1', 'abc', '1.5', '01', '1000000', '', ' 2']) {
      expect(read(`trang=${encodeURIComponent(trang)}`).trang).toBe(1);
    }
    expect(read('trang=1').trang).toBe(1);
    expect(read('trang=999999').trang).toBe(999999);
  });

  it('ABG-03 hai khoá `the` ⇒ lấy khoá đầu (không lỗi)', () => {
    expect(read('the=a&the=b').the).toBe('a');
  });
});

describe('normalizeKeyword', () => {
  it('ABG-03 trim; biên 100 đơn vị: 100 giữ nguyên, 101 cắt về 100', () => {
    expect(normalizeKeyword('  sốt  ')).toBe('sốt');
    expect(normalizeKeyword('a'.repeat(100))).toBe('a'.repeat(100));
    expect(normalizeKeyword('a'.repeat(101))).toBe('a'.repeat(100));
  });

  it('ABG-03 cắt giữa cặp thay thế (emoji) thì bỏ luôn nửa cặp, kết quả không vượt 100 đơn vị', () => {
    const text = `${'a'.repeat(99)}🙂🙂`;
    const result = normalizeKeyword(text);
    expect(result).toBe('a'.repeat(99));
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('ABG-03 chỉ khoảng trắng ⇒ rỗng', () => {
    expect(normalizeKeyword('   \t ')).toBe('');
  });
});

describe('writePublicFilters', () => {
  it('ABG-03 mặc định (không lọc, trang 1) không ghi gì lên URL', () => {
    expect(writePublicFilters({ q: '', the: '', trang: 1 }).toString()).toBe(
      '',
    );
  });

  it('ABG-03 chỉ ghi khoá có giá trị; trang 1 không ghi, trang 2 trở đi ghi; the rỗng không bao giờ ghi', () => {
    expect(
      writePublicFilters({ q: 'sốt', the: '', trang: 2 }).get('the'),
    ).toBeNull();
    expect(
      writePublicFilters({ q: 'sốt', the: 'trẻ-em', trang: 2 }).toString(),
    ).toBe('q=s%E1%BB%91t&the=tr%E1%BA%BB-em&trang=2');
  });

  it('ABG-03 ghi rồi đọc lại ra đúng bộ lọc (vòng đi vòng lại)', () => {
    const filters = { q: 'đau đầu', the: 'sốt-xuất-huyết', trang: 7 };
    expect(readPublicFilters(writePublicFilters(filters))).toEqual(filters);
  });
});

describe('hasPublicFilters', () => {
  it('ABG-03 chỉ q hay the là "đang lọc"; trang thì không', () => {
    expect(hasPublicFilters({ q: '', the: '', trang: 5 })).toBe(false);
    expect(hasPublicFilters({ q: 'a', the: '', trang: 1 })).toBe(true);
    expect(hasPublicFilters({ q: '', the: 'a', trang: 1 })).toBe(true);
  });
});

describe('articleListPath', () => {
  it('ABG-03 không bộ lọc ⇒ /cam-nang trơn', () => {
    expect(articleListPath()).toBe('/cam-nang');
    expect(articleListPath({ the: '' })).toBe('/cam-nang');
  });

  it('ABG-05 thẻ có dấu được mã hoá đúng trong liên kết và đọc ngược bằng readPublicFilters ra đúng thẻ (vòng đi vòng lại có dấu)', () => {
    for (const tag of [
      'sốt-xuất-huyết',
      'trẻ-em',
      'đau-đầu',
      'tim-mạch',
      'covid-19',
      'ăn-uống',
    ]) {
      const href = articleListPath({ the: tag });
      // Mã hoá phần trăm: không còn chữ có dấu thô trong URL
      expect(href).toBe(`/cam-nang?the=${encodeURIComponent(tag)}`);
      expect(href).not.toMatch(/[^\x20-\x7e]/);
      const url = new URL(href, 'http://localhost');
      expect(url.pathname).toBe('/cam-nang');
      expect(readPublicFilters(url.searchParams)).toEqual({
        q: '',
        the: tag,
        trang: 1,
      });
    }
  });
});
