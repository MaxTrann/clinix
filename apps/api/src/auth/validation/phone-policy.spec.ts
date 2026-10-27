import { normalizePhone } from './phone-policy.js';

// Task A1. Test case: DK-05 (SĐT sai định dạng / rỗng; SĐT có khoảng trắng hoặc dấu chấm hợp lệ thì chuẩn hoá thành 10 số).
describe('normalizePhone (DK-05, S5)', () => {
  it.each([
    ['0901234567', '0901234567'],
    ['0901 234 567', '0901234567'],
    ['0901.234.567', '0901234567'],
    ['090 123 4567', '0901234567'],
    ['0901 234.567', '0901234567'],
    ['  0901234567  ', '0901234567'],
    ['\t0901234567\n', '0901234567'],
    ['0000000000', '0000000000'], // biên: 10 số bắt đầu 0, plan không quy định đầu số cụ thể
    ['0999999999', '0999999999'],
  ])('chuẩn hoá %j thành %j', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    ['rỗng', ''],
    ['chỉ khoảng trắng', '   '],
    ['9 số', '090123456'],
    ['11 số', '09012345678'],
    ['không bắt đầu bằng 0', '1901234567'],
    ['có chữ cái', '09012345ab'],
    ['dấu gạch nối', '0901-234-567'],
    ['đầu số quốc tế +84', '+84901234567'],
    ['84 không có 0', '849012345678'],
    ['dấu chấm ở cuối', '0901234567.'],
    ['dấu chấm ở đầu', '.0901234567'],
    ['hai dấu chấm liền nhau', '0901..234567'],
    ['hai dấu cách liền nhau', '0901  234567'],
    ['dấu cách rồi dấu chấm', '0901 .234567'],
    ['dấu ngoặc', '(090) 1234567'],
    ['chữ số toàn chiều rộng', '０９０１２３４５６７'],
    ['chữ số Ả Rập – Ấn Độ', '٠٩٠١٢٣٤٥٦٧'],
    ['U+00A0 làm dấu ngăn cách', '0901 234567'],
    ['ký tự điều khiển bên trong', '0901\t234567'],
    ['emoji', '0901234567😀'],
  ])('từ chối: %s', (_label, raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  it('kết quả chuẩn hoá luôn đúng 10 chữ số ASCII và chuẩn hoá lần hai không đổi', () => {
    const once = normalizePhone('0901 234 567');
    expect(once).toMatch(/^0[0-9]{9}$/);
    expect(normalizePhone(once as string)).toBe(once);
  });
});
