import {
  ADDRESS_MAX_LENGTH,
  isValidAddress,
  normalizeAddress,
} from './address-policy.js';

// patient P1 (TRACKING patient P1-C, P1-F). Test case: HS-11 ở mức luật (quyết định Q8). Giá trị đều là dữ liệu giả.
const COMPOSED = `Nguy${String.fromCodePoint(0x1ec5)}n Hu${String.fromCodePoint(0x1ec7)}`; // "Nguyễn Huệ" dạng dựng sẵn
const DECOMPOSED = `Nguye${String.fromCodePoint(0x0302, 0x0303)}n Hue${String.fromCodePoint(0x0323, 0x0302)}`; // cùng chữ, dạng tổ hợp

describe('normalizeAddress', () => {
  it('(HS-11) cắt khoảng trắng ASCII hai đầu, giữ khoảng trắng ở giữa', () => {
    expect(normalizeAddress(' \t12  Lê Lợi, Quận 1\n ')).toBe(
      '12  Lê Lợi, Quận 1',
    );
  });

  it.each(['', ' ', ' \t\r\n\f\v '])(
    '(HS-11) rỗng hoặc chỉ khoảng trắng ASCII ⇒ null: %j',
    (value) => {
      expect(normalizeAddress(value)).toBeNull();
    },
  );

  it('(HS-11) chuẩn hoá NFC: dạng tổ hợp thành dạng dựng sẵn', () => {
    expect(normalizeAddress(DECOMPOSED)).toBe(COMPOSED);
  });

  it('(HS-11) không cắt khoảng trắng ngoài ASCII (U+00A0), như họ tên', () => {
    expect(normalizeAddress(' Số 1 ')).toBe(' Số 1 ');
  });
});

describe('isValidAddress — hợp lệ', () => {
  it.each([
    ['địa chỉ thường', '12 Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh'],
    ['dạng dựng sẵn', COMPOSED],
    ['255 ký tự có dấu', 'ạ'.repeat(ADDRESS_MAX_LENGTH)],
    // 255 điểm mã nhưng 510 đơn vị UTF-16: đếm theo điểm mã như MySQL
    ['255 ký tự ngoài BMP', '😀'.repeat(ADDRESS_MAX_LENGTH)],
    ['NBSP ở giữa và hai đầu', ' Số 1 '],
  ])('(HS-11) %s', (_label, value) => {
    expect(isValidAddress(value)).toBe(true);
  });

  it('(HS-11) cận là 255', () => {
    expect(ADDRESS_MAX_LENGTH).toBe(255);
  });

  it('(HS-11) 255 ký tự kèm khoảng trắng hai đầu: độ dài đếm sau khi chuẩn hoá', () => {
    const normalized = normalizeAddress(` ${'a'.repeat(255)} `);
    expect(normalized).toHaveLength(255);
    expect(isValidAddress(normalized as string)).toBe(true);
  });
});

describe('isValidAddress — không hợp lệ', () => {
  it.each([
    ['256 ký tự', 'a'.repeat(ADDRESS_MAX_LENGTH + 1)],
    ['256 ký tự ngoài BMP', '😀'.repeat(ADDRESS_MAX_LENGTH + 1)],
    ['xuống dòng (Cc)', '12 Lê Lợi\nQuận 1'],
    ['CR (Cc)', '12 Lê Lợi\rQuận 1'],
    ['tab (Cc)', '12\tLê Lợi'],
    ['NUL (Cc)', '12\u0000Lê Lợi'],
    ['DEL (Cc)', '12\u007fLê Lợi'],
    ['C1 (Cc)', '12\u0085Lê Lợi'],
    ['rộng 0 (Cf)', '12​Lê Lợi'],
    ['đảo chiều chữ (Cf)', '12‮Lê Lợi'],
    ['BOM (Cf)', '12﻿Lê Lợi'],
    ['surrogate lẻ (Cs)', '12\ud800Lê Lợi'],
    ['dùng riêng (Co)', '12Lê Lợi'],
    ['ngắt dòng (Zl)', '12 Lê Lợi'],
    ['ngắt đoạn (Zp)', '12 Lê Lợi'],
    ['chưa cắt khoảng trắng đầu', ' 12 Lê Lợi'],
    ['chưa cắt khoảng trắng cuối', '12 Lê Lợi '],
    ['chưa chuẩn hoá NFC', DECOMPOSED],
    ['chuỗi rỗng', ''],
  ])('(HS-11) %s', (_label, value) => {
    expect(isValidAddress(value)).toBe(false);
  });
});
