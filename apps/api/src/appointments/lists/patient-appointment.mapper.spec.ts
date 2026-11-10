import 'reflect-metadata';
import { PATIENT_VISIBLE_STATES } from './patient-appointments.dto.js';
import type { PatientAppointmentDetailRow } from './patient-appointments.repository.js';
import {
  canPatientCancel,
  toDetail,
  toItem,
} from './patient-appointment.mapper.js';

// Task B2 — LSH-10, LSH-13, LSH-14, LSH-23 (PLAN booking 7.4; TRACKING 3.15.3): ánh xạ hàng thô thành JSON, không DB. Mã LSH-23 là [đề xuất].
const SERVER_TIME = new Date('2026-11-10T03:15:42.123Z');

function row(
  overrides: Partial<PatientAppointmentDetailRow> = {},
): PatientAppointmentDetailRow {
  return {
    maLichHen: 'CLX-20261110-7K3QD',
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-12T01:30:00.000Z'),
    bacSi: 'Bác sĩ A',
    chuyenKhoa: 'Nội',
    chiNhanh: 'Chi nhánh 1',
    dichVu: 'Khám nội',
    laBanThan: 1,
    nguoiKham: 'Người Khám',
    giaSnapshot: '150000.00',
    tienCoc: '50000.00',
    hanThanhToan: null,
    lichHenId: '9001',
    lyDoKham: 'Đau đầu ba ngày',
    ...overrides,
  };
}
const NO_EXTRAS = { thanhToan: null, hoanTien: null, serverTime: SERVER_TIME };

const ITEM_KEYS = [
  'bacSi',
  'chiNhanh',
  'choPhepHuy',
  'chuyenKhoa',
  'dichVu',
  'giaSnapshot',
  'hanThanhToan',
  'maLichHen',
  'nguoiKham',
  'thoiGian',
  'tienCoc',
  'trangThai',
];
const DETAIL_KEYS = [
  ...ITEM_KEYS,
  'hoanTien',
  'lyDoKham',
  'thanhToan',
  'thoiGianMayChu',
].sort();

describe('LSH-13 choPhepHuy từ ma trận P1', () => {
  it.each([
    ['ChoThanhToan', true],
    ['DaXacNhan', true],
    ['DaTiepDon', false],
    ['HoanThanh', false],
    ['DaHuy', false],
    ['VangMat', false],
  ] as const)('%s ⇒ %s', (state, expected) => {
    expect(canPatientCancel(state)).toBe(expected);
    expect(toItem(row({ trangThai: state })).choPhepHuy).toBe(expected);
    expect(toDetail(row({ trangThai: state }), NO_EXTRAS).choPhepHuy).toBe(
      expected,
    );
  });

  it('chạy đủ sáu trạng thái hiển thị và đúng hai ô được huỷ (không viết lại luật ở chỗ khác)', () => {
    const cancellable = PATIENT_VISIBLE_STATES.filter(canPatientCancel);
    expect(cancellable).toStrictEqual(['ChoThanhToan', 'DaXacNhan']);
  });
});

describe('LSH-10 toDetail: đúng mười sáu khoá', () => {
  it('mười hai khoá đầu GIỐNG HỆT toItem (cùng hàm ánh xạ), cộng bốn khoá của chi tiết', () => {
    const detail = toDetail(row(), NO_EXTRAS);
    expect(Object.keys(detail).sort()).toStrictEqual(DETAIL_KEYS);
    expect(DETAIL_KEYS).toHaveLength(16);
    const item = toItem(row());
    expect(Object.keys(item).sort()).toStrictEqual(ITEM_KEYS);
    for (const key of ITEM_KEYS)
      expect(detail[key as keyof typeof detail]).toStrictEqual(
        item[key as keyof typeof item],
      );
  });

  it('LSH-14 không có lichHenId (dù hàng thô có) và không lyDoHuy, không khoá nào kết thúc bằng Id', () => {
    const detail = toDetail(row(), NO_EXTRAS);
    expect(detail).not.toHaveProperty('lichHenId');
    expect(detail).not.toHaveProperty('lyDoHuy');
    expect(JSON.stringify(detail)).not.toContain('9001');
    expect(Object.keys(detail).filter((key) => key.endsWith('Id'))).toEqual([]);
  });

  it('lyDoKham: chuỗi khi có, null khi không; thanhToan và hoanTien null khi cổng không có gì', () => {
    expect(toDetail(row(), NO_EXTRAS).lyDoKham).toBe('Đau đầu ba ngày');
    const none = toDetail(row({ lyDoKham: null }), NO_EXTRAS);
    expect(none.lyDoKham).toBeNull();
    expect(none.thanhToan).toBeNull();
    expect(none.hoanTien).toBeNull();
  });

  it('thoiGianMayChu là ISO 8601 UTC của serverTime, GIỮ mili giây; kiểu giờ và tiền như danh sách', () => {
    const detail = toDetail(
      row({
        trangThai: 'ChoThanhToan',
        hanThanhToan: new Date('2026-11-10T03:30:00.000Z'),
      }),
      NO_EXTRAS,
    );
    expect(detail.thoiGianMayChu).toBe('2026-11-10T03:15:42.123Z');
    expect(detail.thoiGian).toBe('2026-11-12T01:30:00.000Z');
    expect(detail.hanThanhToan).toBe('2026-11-10T03:30:00.000Z');
    expect(detail.giaSnapshot).toBe('150000.00');
    expect(detail.nguoiKham).toStrictEqual({
      hoTen: 'Người Khám',
      laBanThan: true,
    });
  });
});

describe('LSH-23 thanhToan, hoanTien qua cổng: ánh xạ từng khoá', () => {
  it('giá trị mẫu của cổng ra đúng hình dạng đã khai', () => {
    const thanhToan = {
      daThu: '50000.00',
      conPhaiThu: '100000.00',
      giaoDich: [
        {
          phuongThuc: 'MoMo' as const,
          soTien: '50000.00',
          thoiDiem: '2026-11-10T02:00:00.000Z',
        },
      ],
    };
    const hoanTien = {
      soTien: '50000.00',
      trangThai: 'ThanhCong' as const,
      thoiDiem: '2026-11-11T02:00:00.000Z',
    };
    const detail = toDetail(row(), {
      thanhToan,
      hoanTien,
      serverTime: SERVER_TIME,
    });
    expect(detail.thanhToan).toStrictEqual(thanhToan);
    expect(detail.hoanTien).toStrictEqual(hoanTien);
  });

  it('bản thật trả THỪA trường (mã cổng thanh toán, id ví, người thu, số lần thử) ⇒ không lọt ra JSON', () => {
    const leakyPayment = {
      daThu: '50000.00',
      conPhaiThu: '0.00',
      maGiaoDichCong: 'VNP-SECRET-1',
      viNoiBoId: '555',
      giaoDich: [
        {
          phuongThuc: 'TienMatTaiQuay' as const,
          soTien: '50000.00',
          thoiDiem: '2026-11-10T02:00:00.000Z',
          nguoiThuId: '888',
          maGiaoDichCong: 'VNP-SECRET-2',
        },
      ],
    };
    const leakyRefund = {
      soTien: '50000.00',
      trangThai: 'ThatBai' as const,
      thoiDiem: '2026-11-11T02:00:00.000Z',
      viNoiBoId: '555',
      soLanThu: 3,
    };
    const json = JSON.stringify(
      toDetail(row(), {
        thanhToan: leakyPayment,
        hoanTien: leakyRefund,
        serverTime: SERVER_TIME,
      }),
    );
    for (const secret of [
      'VNP-SECRET',
      '555',
      '888',
      'maGiaoDichCong',
      'viNoiBoId',
      'nguoiThuId',
      'soLanThu',
    ])
      expect(json).not.toContain(secret);
  });
});
