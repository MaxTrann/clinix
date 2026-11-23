import type { AdminLeaveItem } from '../../api/admin-leave-api';
import { formatLeaveTime } from './approvals-format';

// Doctor UX7 (issue #582): cột Thời gian của trang Duyệt yêu cầu (cũng là "Thời gian" của ngăn chi tiết và hộp Duyệt). Hàm thuần, không render.
function item(overrides: Partial<AdminLeaveItem>): AdminLeaveItem {
  return {
    yeuCauNghiPhepId: '1',
    trangThai: 'ChoDuyet',
    hinhThuc: 'TheoCa',
    tuNgay: '2026-11-24',
    denNgay: '2026-11-24',
    ca: 'CaSang',
    lyDo: 'x',
    thoiDiemTao: '2026-11-20T03:00:00.000Z',
    thoiDiemXuLy: null,
    bacSi: { bacSiId: '1', hoTen: 'BS. Mẫu' },
    chuyenKhoa: { ten: 'Nội' },
    chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Mẫu 1' },
    soLichHenBiAnhHuong: null,
    ...overrides,
  };
}

describe('formatLeaveTime (UX7)', () => {
  it('DUX7-49 "Theo ca" một ngày giữ chữ cũ "Ca <ca> ngày <ngày>", cho cả ca sáng và ca chiều', () => {
    expect(formatLeaveTime(item({}))).toBe('Ca sáng ngày 24/11/2026');
    expect(formatLeaveTime(item({ ca: 'CaChieu' }))).toBe(
      'Ca chiều ngày 24/11/2026',
    );
  });

  it('DUX7-50 "Theo ca" nhiều ngày in cả khoảng, giữ thứ tự (đầu rồi cuối) và chữ ca; hai ca khác nhau cho ra hai chuỗi khác nhau', () => {
    expect(formatLeaveTime(item({ denNgay: '2026-11-28' }))).toBe(
      'Ca sáng 24/11/2026 – 28/11/2026',
    );
    expect(
      formatLeaveTime(item({ denNgay: '2026-11-28', ca: 'CaChieu' })),
    ).toBe('Ca chiều 24/11/2026 – 28/11/2026');
  });

  it('DUX7-51 khoảng hai ngày liền nhau và khoảng qua tháng, qua năm đều in đủ ngày tháng năm của cả hai đầu', () => {
    expect(formatLeaveTime(item({ denNgay: '2026-11-25' }))).toBe(
      'Ca sáng 24/11/2026 – 25/11/2026',
    );
    expect(
      formatLeaveTime(item({ tuNgay: '2026-12-30', denNgay: '2027-01-02' })),
    ).toBe('Ca sáng 30/12/2026 – 02/01/2027');
  });

  it('DUX7-52 "Cả ngày" không đổi: một ngày "Cả ngày <ngày>", nhiều ngày "Cả ngày <đầu> – <cuối>"', () => {
    const wholeDays = { hinhThuc: 'CaNgay', ca: null } as const;
    expect(formatLeaveTime(item({ ...wholeDays }))).toBe('Cả ngày 24/11/2026');
    expect(formatLeaveTime(item({ ...wholeDays, denNgay: '2026-11-27' }))).toBe(
      'Cả ngày 24/11/2026 – 27/11/2026',
    );
  });
});
