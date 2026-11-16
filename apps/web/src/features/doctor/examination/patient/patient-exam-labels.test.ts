import { describe, expect, it } from 'vitest';
import {
  doctorName,
  doctorTitleLabel,
  examineeChipLabel,
  examineeValue,
  relationLabel,
  relationshipLabel,
  SELF_FILTER,
} from './patient-exam-labels';

// doctor-exam F5, WXH-13 [đề xuất]: nhãn của hai ENUM của DB (`chuc_danh` 7 giá trị, `moi_quan_he` 8 giá trị) và cách ghép tên theo Figma `414:2`, `443:2`. Chữ kỳ vọng viết NGUYÊN VĂN (đổi bảng nhãn ở mã là test đỏ).
describe('doctor-exam F5 — nhãn chức danh và quan hệ', () => {
  it.each([
    ['BS', 'BS'],
    ['BS_CKI', 'BS.CKI'],
    ['BS_CKII', 'BS.CKII'],
    ['ThS_BS', 'ThS.BS'],
    ['TS_BS', 'TS.BS'],
    ['PGS_TS_BS', 'PGS.TS.BS'],
    ['GS_TS_BS', 'GS.TS.BS'],
  ])('WXH-13 chức danh %s ⇒ "%s"', (code, label) => {
    expect(doctorTitleLabel(code)).toBe(label);
  });

  it.each([
    ['Cha', 'Cha'],
    ['Me', 'Mẹ'],
    ['Vo', 'Vợ'],
    ['Chong', 'Chồng'],
    ['Con', 'Con'],
    ['AnhChiEm', 'Anh/Chị/Em'],
    ['OngBa', 'Ông/Bà'],
    ['Khac', 'Khác'],
  ])('WXH-13 quan hệ %s ⇒ "%s"', (code, label) => {
    expect(relationshipLabel(code)).toBe(label);
  });

  it.each(['XYZ', '', 'constructor', '__proto__', 'toString'])(
    'WXH-13 mã lạ (%j) hiện NGUYÊN MÃ, không vỡ và không trúng khoá của nguyên mẫu đối tượng',
    (code) => {
      expect(doctorTitleLabel(code)).toBe(code);
      expect(relationshipLabel(code)).toBe(code);
    },
  );

  it('WXH-13 tên bác sĩ: chức danh, MỘT dấu cách, họ tên; KHÔNG chấm sau "BS" (Figma 443:2: "ThS.BS Nguyễn Minh Anh")', () => {
    expect(doctorName('ThS_BS', 'Nguyễn Minh Anh')).toBe(
      'ThS.BS Nguyễn Minh Anh',
    );
    expect(doctorName('BS', 'Lê Thảo Vy')).toBe('BS Lê Thảo Vy');
    expect(doctorName('BS_CKII', 'Trần Quốc Huy')).toBe(
      'BS.CKII Trần Quốc Huy',
    );
    expect(doctorName('LA', 'Ai Đó')).toBe('LA Ai Đó');
  });

  it('WXH-13 quan hệ của người khám: `null` là "Bản thân", còn lại theo bảng', () => {
    expect(relationLabel(null)).toBe('Bản thân');
    expect(relationLabel('Con')).toBe('Con');
    expect(relationLabel('Me')).toBe('Mẹ');
  });

  it('WXH-13 chip lọc: "Họ tên (Bản thân)" và "Họ tên · Quan hệ" (Figma 414:2)', () => {
    expect(
      examineeChipLabel({ id: null, hoTen: 'Nguyễn Văn A', quanHe: null }),
    ).toBe('Nguyễn Văn A (Bản thân)');
    expect(
      examineeChipLabel({ id: '501', hoTen: 'Bùi Minh Khoa', quanHe: 'Con' }),
    ).toBe('Bùi Minh Khoa · Con');
    expect(
      examineeChipLabel({ id: '502', hoTen: 'Trần Thị Bà', quanHe: 'OngBa' }),
    ).toBe('Trần Thị Bà · Ông/Bà');
  });

  it('WXH-13 giá trị gửi API của chip: id hồ sơ người thân, hoặc `BanThan` (cùng chữ với `hoSoNguoiThanId`, B4)', () => {
    expect(SELF_FILTER).toBe('BanThan');
    expect(examineeValue({ id: null, hoTen: 'A', quanHe: null })).toBe(
      'BanThan',
    );
    expect(examineeValue({ id: '501', hoTen: 'B', quanHe: 'Con' })).toBe('501');
  });
});
