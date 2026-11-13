import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_RELATIONSHIP_LABEL,
  doctorDisplayName,
  doctorTitleLabel,
  relationshipLabel,
} from './booking-labels';

// booking F4. BRD-05 là [đề xuất] (PLAN booking mục 7.38).
describe('booking F4 — nhãn quan hệ và chức danh', () => {
  it('BRD-05 quan hệ: đúng 8 mã của ENUM, mã lạ ⇒ "Người thân" (kể cả khoá của nguyên mẫu)', () => {
    expect(
      ['Cha', 'Me', 'Vo', 'Chong', 'Con', 'AnhChiEm', 'OngBa', 'Khac'].map(
        relationshipLabel,
      ),
    ).toEqual([
      'Cha',
      'Mẹ',
      'Vợ',
      'Chồng',
      'Con',
      'Anh/Chị/Em',
      'Ông/Bà',
      'Khác',
    ]);
    for (const unknown of ['', 'Chu', 'constructor', '__proto__', 'toString']) {
      expect(relationshipLabel(unknown)).toBe(UNKNOWN_RELATIONSHIP_LABEL);
    }
  });

  it('BRD-05 chức danh: đúng 7 mã, mã lạ hiện nguyên mã; tên hiển thị "ThS.BS. Nguyễn Minh Anh"', () => {
    expect(
      [
        'BS',
        'BS_CKI',
        'BS_CKII',
        'ThS_BS',
        'TS_BS',
        'PGS_TS_BS',
        'GS_TS_BS',
      ].map(doctorTitleLabel),
    ).toEqual([
      'BS',
      'BS.CKI',
      'BS.CKII',
      'ThS.BS',
      'TS.BS',
      'PGS.TS.BS',
      'GS.TS.BS',
    ]);
    expect(doctorTitleLabel('GS_X')).toBe('GS_X');
    expect(doctorTitleLabel('constructor')).toBe('constructor');
    expect(doctorDisplayName('ThS_BS', 'Nguyễn Minh Anh')).toBe(
      'ThS.BS. Nguyễn Minh Anh',
    );
    expect(doctorDisplayName('BS', 'Lê Văn B')).toBe('BS. Lê Văn B');
  });
});
