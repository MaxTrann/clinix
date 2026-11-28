import {
  articleDetailPath,
  articleIdSlug,
  parseIdSlug,
} from './article-public-paths';

// article F2, ABG-05 và ABG-06: đường dẫn chi tiết `id-slug` (PLAN article Q3, T3). Hàm thuần.
describe('parseIdSlug', () => {
  it('ABG-06 tách mã và slug: `12-sot-xuat-huyet`, `12` (không slug), `12-` (slug rỗng), slug chứa nhiều dấu gạch', () => {
    expect(parseIdSlug('12-sot-xuat-huyet')).toEqual({
      id: '12',
      slug: 'sot-xuat-huyet',
    });
    expect(parseIdSlug('12')).toEqual({ id: '12', slug: '' });
    expect(parseIdSlug('12-')).toEqual({ id: '12', slug: '' });
    expect(parseIdSlug('7-a-b-c')).toEqual({ id: '7', slug: 'a-b-c' });
  });

  it('ABG-06 mã sai dạng ⇒ null: `abc`, `0`, `012`, `12abc`, `-12`, rỗng, khoảng trắng, dấu cộng, thập phân', () => {
    for (const raw of [
      'abc',
      '0',
      '0-x',
      '012',
      '12abc',
      '12abc-x',
      '-12',
      '',
      ' 12',
      '+12',
      '1.5',
      '1e3',
      'abc-12',
    ]) {
      expect(parseIdSlug(raw)).toBeNull();
    }
  });

  it('ABG-06 biên: 19 chữ số hợp lệ, 20 chữ số sai dạng', () => {
    expect(parseIdSlug('1'.repeat(19))).toEqual({
      id: '1'.repeat(19),
      slug: '',
    });
    expect(parseIdSlug('1'.repeat(20))).toBeNull();
  });
});

describe('articleIdSlug và articleDetailPath', () => {
  it('ABG-05 id kèm slug sinh từ tiêu đề (bỏ dấu, `đ` thành `d`)', () => {
    expect(articleIdSlug('12', 'Sốt xuất huyết')).toBe('12-sot-xuat-huyet');
    expect(articleDetailPath('12', 'Đau đầu')).toBe('/cam-nang/12-dau-dau');
  });

  it('ABG-06 tiêu đề không còn chữ nào ⇒ chỉ còn mã bài (không có dấu gạch thừa)', () => {
    expect(articleIdSlug('12', '🙂!!!')).toBe('12');
    expect(articleDetailPath('12', '')).toBe('/cam-nang/12');
  });

  it('ABG-06 đường dẫn chuẩn đọc lại được bằng parseIdSlug (khép vòng)', () => {
    const path = articleDetailPath('34', 'Tim mạch và huyết áp');
    const segment = path.replace('/cam-nang/', '');
    expect(parseIdSlug(segment)).toEqual({
      id: '34',
      slug: 'tim-mach-va-huyet-ap',
    });
  });
});
