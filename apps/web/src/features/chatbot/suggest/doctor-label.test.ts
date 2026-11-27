import { doctorDisplayName, doctorTitleLabel } from './doctor-label';

// Chatbot F2, F2-09: nhãn chức danh và tên hiển thị. Khoá với bản của `features/search` ở `router/chatbot-suggest-route.test.tsx` (F2-16).
describe('nhãn chức danh bác sĩ', () => {
  it('F2-09 bảy mã chức danh đúng nhãn', () => {
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
  });

  it('F2-09 mã lạ hiện nguyên mã thay vì vỡ', () => {
    expect(doctorTitleLabel('CHUC_DANH_MOI')).toBe('CHUC_DANH_MOI');
    expect(doctorDisplayName('CHUC_DANH_MOI', 'Lê Văn C')).toBe(
      'CHUC_DANH_MOI. Lê Văn C',
    );
  });

  it('F2-09 có chấm sau chữ BS nhưng KHÔNG chấm sau số La Mã CKI, CKII', () => {
    expect(doctorDisplayName('ThS_BS', 'Nguyễn Minh Anh')).toBe(
      'ThS.BS. Nguyễn Minh Anh',
    );
    expect(doctorDisplayName('TS_BS', 'Nguyễn Minh Anh')).toBe(
      'TS.BS. Nguyễn Minh Anh',
    );
    expect(doctorDisplayName('BS', 'Lê Văn C')).toBe('BS. Lê Văn C');
    expect(doctorDisplayName('BS_CKII', 'Trần Quốc Huy')).toBe(
      'BS.CKII Trần Quốc Huy',
    );
    expect(doctorDisplayName('BS_CKI', 'Phạm Thị D')).toBe('BS.CKI Phạm Thị D');
  });
});
