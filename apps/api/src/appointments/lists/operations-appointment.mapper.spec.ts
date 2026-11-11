import {
  toOperationsDetail,
  toOperationsItem,
} from './operations-appointment.mapper.js';
import type {
  OperationsAppointmentDetailRow,
  OperationsAppointmentRow,
} from './operations-appointments.repository.js';

// Ánh xạ hàng thô thành JSON cho nhân sự (B3, B4; TRACKING 3.17.1). Hàm THUẦN. Mã DSV-08, DSV-13 là PLAN 7.7 và [đề xuất] (TRACKING 3.17.3).
function row(
  overrides: Partial<OperationsAppointmentRow> = {},
): OperationsAppointmentRow {
  return {
    maLichHen: 'CLX-20261110-ABCDE',
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-10T01:00:00.000Z'),
    bacSi: 'Bác sĩ A',
    chuyenKhoa: 'Nội',
    chiNhanh: 'Chi nhánh 1',
    dichVu: 'Khám nội',
    laBanThan: 0,
    nguoiKham: 'Người Thân',
    giaSnapshot: '150000.00',
    tienCoc: '50000.00',
    hanThanhToan: new Date('2026-11-10T00:15:00.000Z'),
    nguoiDatHoTen: 'Người Đặt',
    nguoiDatSoDienThoai: '0901234567',
    ...overrides,
  };
}

function detailRow(
  overrides: Partial<OperationsAppointmentDetailRow> = {},
): OperationsAppointmentDetailRow {
  return {
    ...row(),
    lichHenId: '4242',
    lyDoKham: 'Đau đầu',
    lyDoHuy: null,
    ...overrides,
  };
}

describe('toOperationsItem', () => {
  it('DSV-13 đúng MƯỜI MỘT khoá: mười khoá chung và `nguoiDat`; KHÔNG `hanThanhToan`, `choPhepHuy` (Q32: `hanThanhToan` chỉ ở chi tiết)', () => {
    const item = toOperationsItem(row());
    expect(Object.keys(item).sort()).toStrictEqual([
      'bacSi',
      'chiNhanh',
      'chuyenKhoa',
      'dichVu',
      'giaSnapshot',
      'maLichHen',
      'nguoiDat',
      'nguoiKham',
      'thoiGian',
      'tienCoc',
      'trangThai',
    ]);
  });

  it('DSV-13 `nguoiDat` là tài khoản đặt (họ tên và SĐT), `nguoiKham` là người thân: hai khoá KHÔNG lẫn, và `laBanThan` đúng', () => {
    const item = toOperationsItem(row());
    expect(item.nguoiDat).toStrictEqual({
      hoTen: 'Người Đặt',
      soDienThoai: '0901234567',
    });
    expect(item.nguoiKham).toStrictEqual({
      hoTen: 'Người Thân',
      laBanThan: false,
    });
    const self = toOperationsItem(
      row({ laBanThan: 1, nguoiKham: 'Người Đặt' }),
    );
    expect(self.nguoiKham).toStrictEqual({
      hoTen: 'Người Đặt',
      laBanThan: true,
    });
  });
});

describe('toOperationsDetail', () => {
  it('DSV-13 đúng MƯỜI BỐN khoá (dùng chung): mười một khoá của dòng cộng `lyDoKham`, `lyDoHuy`, `hanThanhToan`; chưa có `chuyenDuoc`, `conPhaiThu` (của Lễ tân)', () => {
    const detail = toOperationsDetail(detailRow());
    expect(Object.keys(detail)).toHaveLength(14);
    expect(detail).toMatchObject({
      lyDoKham: 'Đau đầu',
      lyDoHuy: null,
      hanThanhToan: '2026-11-10T00:15:00.000Z',
    });
    expect('chuyenDuoc' in detail).toBe(false);
    expect('conPhaiThu' in detail).toBe(false);
  });

  it('DSV-13 `lyDoHuy` có giá trị khi lịch đã huỷ; `hanThanhToan` và `lyDoKham` có thể là `null`', () => {
    const detail = toOperationsDetail(
      detailRow({
        trangThai: 'DaHuy',
        lyDoHuy: 'Bệnh nhân báo bận',
        lyDoKham: null,
        hanThanhToan: null,
      }),
    );
    expect(detail.lyDoHuy).toBe('Bệnh nhân báo bận');
    expect(detail.lyDoKham).toBeNull();
    expect(detail.hanThanhToan).toBeNull();
  });

  it('DSV-08 `lichHenId` (dùng gọi cổng) KHÔNG bao giờ ra JSON, kể cả khi hàng thô có thêm cột lạ', () => {
    const detail = toOperationsDetail(
      detailRow({
        ...({ benhNhanId: '7', email: 'a@b.c' } as object),
      }),
    );
    const json = JSON.stringify(detail);
    expect(json).not.toContain('4242');
    expect(json).not.toMatch(/lichHenId|benhNhanId|email|a@b\.c/);
  });
});
