import { sortByLabel } from './sort-options';

// UX1-05 đến UX1-09 (doctor UX1, G12): lựa chọn lấy từ API sắp theo bảng chữ cái tiếng Việt, số tự nhiên, không đổi mảng gốc.

interface Option {
  id: string;
  ten: string;
}

const opt = (id: string, ten: string): Option => ({ id, ten });
const names = (items: readonly Option[]) => items.map((item) => item.ten);
const byTen = (item: Option) => item.ten;

describe('sortByLabel', () => {
  it('UX1-05 ảnh góp ý: "CLINIX Mẫu 1, 4, 3, 2" ⇒ 1, 2, 3, 4', () => {
    const sorted = sortByLabel(
      [
        opt('a', 'CLINIX Mẫu 1'),
        opt('b', 'CLINIX Mẫu 4'),
        opt('c', 'CLINIX Mẫu 3'),
        opt('d', 'CLINIX Mẫu 2'),
      ],
      byTen,
    );
    expect(names(sorted)).toEqual([
      'CLINIX Mẫu 1',
      'CLINIX Mẫu 2',
      'CLINIX Mẫu 3',
      'CLINIX Mẫu 4',
    ]);
  });

  it('UX1-06 dấu tiếng Việt: A, Ă, Â, B ... D, Đ, E (không đẩy chữ có dấu xuống cuối)', () => {
    const sorted = sortByLabel(
      [
        opt('1', 'Đông'),
        opt('2', 'Bình'),
        opt('3', 'Ân'),
        opt('4', 'Ăn'),
        opt('5', 'Anh'),
        opt('6', 'Dũng'),
        opt('7', 'Em'),
      ],
      byTen,
    );
    expect(names(sorted)).toEqual([
      'Anh',
      'Ăn',
      'Ân',
      'Bình',
      'Dũng',
      'Đông',
      'Em',
    ]);
  });

  it('UX1-07 số tự nhiên: "Mẫu 2" đứng trước "Mẫu 10" (so chuỗi thuần sẽ cho "Mẫu 10" trước)', () => {
    const sorted = sortByLabel(
      [opt('a', 'Mẫu 10'), opt('b', 'Mẫu 2'), opt('c', 'Mẫu 1')],
      byTen,
    );
    expect(names(sorted)).toEqual(['Mẫu 1', 'Mẫu 2', 'Mẫu 10']);
  });

  it('UX1-08 trả mảng MỚI, không đổi mảng gốc (thứ tự và độ dài của mảng đưa vào giữ nguyên)', () => {
    const source = [opt('a', 'Mẫu 3'), opt('b', 'Mẫu 1'), opt('c', 'Mẫu 2')];
    const before = names(source);
    const sorted = sortByLabel(source, byTen);
    expect(sorted).not.toBe(source);
    expect(names(source)).toEqual(before);
    expect(names(sorted)).toEqual(['Mẫu 1', 'Mẫu 2', 'Mẫu 3']);
  });

  it('UX1-09 biên: mảng rỗng, một phần tử, nhãn trùng giữ thứ tự gốc (ổn định)', () => {
    expect(sortByLabel([], byTen)).toEqual([]);
    expect(names(sortByLabel([opt('a', 'Mẫu 1')], byTen))).toEqual(['Mẫu 1']);
    const sorted = sortByLabel(
      [opt('x', 'Mẫu 1'), opt('y', 'Mẫu 1'), opt('z', 'Mẫu 1')],
      byTen,
    );
    expect(sorted.map((item) => item.id)).toEqual(['x', 'y', 'z']);
  });
});
