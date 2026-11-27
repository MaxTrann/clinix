import { DOCTOR_LOOKUP_PATH, entityPath, telHref } from './entity-paths';

// Chatbot F1, WTL-03 và WTL-05: đường dẫn do web dựng từ `doiTuong` và `id`, KHÔNG bịa route.
describe('entityPath', () => {
  it('WTL-03 ba loại có trang: bác sĩ, chuyên khoa, chi nhánh', () => {
    expect(entityPath('BacSi', '12')).toBe('/bac-si/12');
    expect(entityPath('ChuyenKhoa', '3')).toBe('/chuyen-khoa/3');
    expect(entityPath('ChiNhanh', '2')).toBe('/chi-nhanh/2');
    expect(DOCTOR_LOOKUP_PATH).toBe('/bac-si');
  });

  it('WTL-03 dịch vụ KHÔNG có trang theo id nên không có liên kết (Đại duyệt 27/11/2026, Đ6); loại lạ cũng không', () => {
    expect(entityPath('DichVu', '5')).toBeNull();
    expect(entityPath('LoaiMoi', '5')).toBeNull();
    expect(entityPath('', '5')).toBeNull();
  });

  it('WTL-03 khoá lạ của đối tượng (constructor, __proto__, toString) không được coi là loại có trang', () => {
    for (const key of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(entityPath(key, '5')).toBeNull();
    }
  });

  it('WTL-03 id phải là số nguyên dương dạng chuỗi (BIGINT): các dạng khác không dựng liên kết', () => {
    for (const id of [
      '0',
      '012',
      '12a',
      '-1',
      '1.5',
      ' 7',
      '7 ',
      '',
      '../admin',
      '1/2',
      '1?x=2',
      '1#a',
      '%2e',
      '9'.repeat(20),
    ]) {
      expect(entityPath('BacSi', id)).toBeNull();
    }
    expect(entityPath('BacSi', '9'.repeat(19))).toBe(
      `/bac-si/${'9'.repeat(19)}`,
    );
    expect(entityPath('BacSi', '1')).toBe('/bac-si/1');
  });
});

describe('telHref', () => {
  it('WTL-05 chuẩn hoá số điện thoại thành tel: (bỏ khoảng trắng, chấm, gạch, ngoặc)', () => {
    expect(telHref('1900 1234')).toBe('tel:19001234');
    expect(telHref('(028) 3822-1234')).toBe('tel:02838221234');
    expect(telHref('0901.234.567')).toBe('tel:0901234567');
    expect(telHref('+84 28 3822 1234')).toBe('tel:+842838221234');
  });

  it('WTL-05 chữ không phải số điện thoại thì không tạo liên kết gọi', () => {
    for (const text of [
      'liên hệ lễ tân',
      '1900 abcd',
      'javascript:alert(1)',
      '12',
      '1'.repeat(16),
      '++84123456',
      '',
    ]) {
      expect(telHref(text)).toBeNull();
    }
  });
});
