import { validateClinicInfo } from './clinic-info-validation';
import type { ClinicInfoInput } from './clinic-info-types';

const VALID_INPUT: ClinicInfoInput = {
  tenThuongHieu: 'CLINIX',
  diaChiTruSo: '123 Nguyễn Thị Minh Khai',
  duongDayNong: '1900 1234',
  email: 'contact@clinix.vn',
};

describe('clinic-info validation', () => {
  it('AF4-03 chấp nhận biên độ dài PK và hotline tổng đài hợp lệ', () => {
    const errors = validateClinicInfo(
      {
        ...VALID_INPUT,
        tenThuongHieu: ` ${'A'.repeat(100)} `,
        diaChiTruSo: ` ${'Đ'.repeat(255)} `,
        duongDayNong: '1800-1234',
      },
      false,
    );

    expect(errors).toEqual({});
  });

  it('AF4-03 từ chối tên, địa chỉ, hotline và email vượt rule B4', () => {
    const errors = validateClinicInfo(
      {
        ...VALID_INPUT,
        tenThuongHieu: 'A'.repeat(101),
        diaChiTruSo: 'Đ'.repeat(256),
        duongDayNong: '1900 123',
        email: 'invalid',
      },
      true,
    );

    expect(errors).toEqual({
      tenThuongHieu: 'Tên thương hiệu cần có từ 1 đến 100 ký tự.',
      diaChiTruSo: 'Địa chỉ trụ sở chính cần có từ 1 đến 255 ký tự.',
      duongDayNong: 'Đường dây nóng không đúng định dạng.',
      email: 'Email liên hệ chung không đúng định dạng.',
    });

    expect(
      validateClinicInfo(
        { ...VALID_INPUT, tenThuongHieu: ' \t ' },
        false,
      ).tenThuongHieu,
    ).toBe('Tên thương hiệu cần có từ 1 đến 100 ký tự.');
  });
});
