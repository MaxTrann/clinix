import {
  dayViewText,
  earliestLocalInput,
  humanTime,
  statusLabel,
  toApiDateTime,
} from './change-request-format';
import type { ChangeRequestListItem } from './change-request-types';

// Admin F6b — hàm thuần định dạng của màn yêu cầu thay đổi chi nhánh.

function item(
  overrides: Partial<ChangeRequestListItem> = {},
): ChangeRequestListItem {
  return {
    yeuCauThayDoiChiNhanhId: '7',
    chiNhanh: { chiNhanhId: '25', ten: 'Chi nhánh Quận 3' },
    nguoiDeXuat: { taiKhoanId: '3', hoTen: 'Phạm Thị Lan' },
    trangThai: 'DaDuyet',
    thoiDiemTao: '2026-11-02 07:00:00',
    thoiDiemDuyet: '2026-11-02 08:00:00',
    hieuLucTu: '2026-11-10 08:00:00',
    apDungLuc: null,
    quaHanLuc: null,
    thuThayDoi: [1],
    coDoiDichVu: false,
    laCuaToi: false,
    ...overrides,
  };
}

describe('CN-110 nhãn trạng thái suy ra (Q48)', () => {
  it('AF6B-01 DaDuyet: chưa áp dụng ⇒ "Đã duyệt"; có ap_dung_luc ⇒ "Đã áp dụng"; có qua_han_luc ⇒ "Quá hạn – chờ xử lý"', () => {
    expect(statusLabel(item())).toBe('Đã duyệt');
    expect(statusLabel(item({ apDungLuc: '2026-11-10 08:00:00' }))).toBe(
      'Đã áp dụng',
    );
    expect(statusLabel(item({ quaHanLuc: '2026-11-10 08:00:00' }))).toBe(
      'Quá hạn – chờ xử lý',
    );
  });

  it('AF6B-01 các trạng thái còn lại giữ nhãn gốc', () => {
    expect(statusLabel(item({ trangThai: 'ChoDuyet' }))).toBe('Chờ duyệt');
    expect(statusLabel(item({ trangThai: 'TuChoi' }))).toBe('Từ chối');
    expect(statusLabel(item({ trangThai: 'DaRut' }))).toBe('Đã rút');
    expect(statusLabel(item({ trangThai: 'DaHuy' }))).toBe('Đã hủy');
  });
});

describe('AF6B-02 thời gian', () => {
  it('humanTime đổi dạng API sang "HH:mm DD/MM/YYYY", chuỗi lạ để nguyên', () => {
    expect(humanTime('2026-11-05 07:00:00')).toBe('07:00 05/11/2026');
    expect(humanTime('2026-11-05T07:30')).toBe('07:30 05/11/2026');
    expect(humanTime('không phải ngày')).toBe('không phải ngày');
  });

  it('toApiDateTime: giá trị datetime-local ⇒ dạng API có giây; rỗng hay sai dạng ⇒ null', () => {
    expect(toApiDateTime('2026-11-10T08:00')).toBe('2026-11-10 08:00:00');
    expect(toApiDateTime('')).toBeNull();
    expect(toApiDateTime('2026-11-10')).toBeNull();
  });

  it('earliestLocalInput: bây giờ + N ngày theo giờ VN, làm tròn LÊN phút (biên: đúng phút tròn vẫn lên phút sau vì cần > bây giờ)', () => {
    // 07:00:00 giờ VN = 00:00:00 UTC
    const now = new Date('2026-11-02T00:00:00Z');
    expect(earliestLocalInput(now, 3)).toBe('2026-11-05T07:01');
    expect(earliestLocalInput(new Date('2026-11-02T00:00:30Z'), 3)).toBe(
      '2026-11-05T07:01',
    );
    // Qua nửa đêm giờ VN: 23:59:30 UTC ngày 2 = 06:59:30 ngày 3 giờ VN
    expect(earliestLocalInput(new Date('2026-11-02T23:59:30Z'), 0)).toBe(
      '2026-11-03T07:00',
    );
  });
});

describe('AF6B-03 một thứ của yêu cầu', () => {
  it('ngày nghỉ, hai khoảng, chỉ một khoảng, chưa khai báo, dạng cũ', () => {
    expect(dayViewText({ hoatDong: false, sang: null, chieu: null })).toBe(
      'Nghỉ',
    );
    expect(
      dayViewText({
        hoatDong: true,
        sang: { batDau: '08:00:00', ketThuc: '11:30:00' },
        chieu: { batDau: '13:30:00', ketThuc: '17:00:00' },
      }),
    ).toBe('Sáng 08:00 – 11:30 · Chiều 13:30 – 17:00');
    expect(
      dayViewText({
        hoatDong: true,
        sang: null,
        chieu: { batDau: '13:30:00', ketThuc: '17:00:00' },
      }),
    ).toBe('Chiều 13:30 – 17:00');
    expect(dayViewText(null)).toBe('Chưa khai báo');
    expect(
      dayViewText({
        hoatDong: true,
        sang: null,
        chieu: null,
        dangCu: { gioMoCua: '08:00:00', gioDongCua: '17:00:00' },
      }),
    ).toBe('08:00 – 17:00 (dạng cũ)');
  });
});
