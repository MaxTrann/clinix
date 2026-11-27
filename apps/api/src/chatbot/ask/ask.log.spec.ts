import { formatAskLog } from './ask.log.js';

// chatbot B3 — dòng log danh sách trắng khoá (PLAN 5.9, RTU-06; đột biến 12). Mã ca bổ sung `B3-nn`.

describe('formatAskLog', () => {
  it('RTU-06: đủ khoá theo đúng thứ tự ketQua, loai, lop, thoiGianMs, luat', () => {
    expect(
      formatAskLog({
        ketQua: 'KhongKhopDuLieu',
        loai: 'goiYDatLich',
        lop: 'gemini',
        thoiGianMs: 812,
        luat: 'V3',
      }),
    ).toBe(
      'Trợ lý AI: ketQua=KhongKhopDuLieu loai=goiYDatLich lop=gemini thoiGianMs=812 luat=V3',
    );
  });

  it('B3-40: khoá tuỳ chọn vắng thì không có mặt; thoiGianMs luôn có', () => {
    expect(formatAskLog({ ketQua: 'KhanCap', thoiGianMs: 3 })).toBe(
      'Trợ lý AI: ketQua=KhanCap thoiGianMs=3',
    );
  });

  it.each([
    [12.6, 'thoiGianMs=13'],
    [-5, 'thoiGianMs=0'],
    [Number.NaN, 'thoiGianMs=0'],
    [Number.POSITIVE_INFINITY, 'thoiGianMs=0'],
  ])('B3-41: thời gian %s ⇒ %s (số nguyên không âm)', (ms, expected) => {
    expect(formatAskLog({ ketQua: 'TraLoi', thoiGianMs: ms })).toContain(
      expected,
    );
  });

  it.each([
    ['luat', { luat: 'câu hỏi của người dùng' }],
    ['luat', { luat: 'V3 ghi chú' }],
    ['luat', { luat: 'a=b' }],
    ['luat', { luat: '' }],
    ['loai', { loai: 'Giá khám bao nhiêu?' }],
    ['loai', { loai: 'x'.repeat(41) }],
  ])(
    'RTU-06: giá trị tự do ở khoá %s không bao giờ vào log (ném RangeError, không ghi chữ lạ)',
    (_name, extra) => {
      expect(() =>
        formatAskLog({ ketQua: 'TraLoi', thoiGianMs: 1, ...extra }),
      ).toThrow(RangeError);
    },
  );

  it('B3-42: kiểu AskLogEntry không cho khoá lạ vào dòng log (chỉ năm khoá, kể cả khi truyền thừa ở lúc chạy)', () => {
    const entry = {
      ketQua: 'TraLoi' as const,
      thoiGianMs: 1,
      cauHoi: 'CAU_HOI_BI_MAT',
      ip: '1.2.3.4',
    };
    const line = formatAskLog(entry);
    expect(line).not.toContain('CAU_HOI_BI_MAT');
    expect(line).not.toContain('1.2.3.4');
    expect(line).toBe('Trợ lý AI: ketQua=TraLoi thoiGianMs=1');
  });
});
