import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import {
  makeAdminDetail,
  makeHistoryEntry,
} from '../../../testing/fake-admin-api';
import {
  adminAppointmentApiPath,
  parseAdminAppointmentDetail,
} from './admin-appointment-detail-api';

// booking F10: bộ đọc `GET /admin/appointments/:maLichHen`. Mã AQD và AQH là [đề xuất] (PLAN booking mục 7.41). Hợp đồng đọc từ mã backend B4 (TRACKING 3.33.1, B4-E): đúng 17 khoá, `lichSuTrangThai` là
// mảng mục `{ thoiDiem, loai, tuTrangThai?, denTrangThai?, lyDo? }`.
const good = () => makeAdminDetail() as unknown as Record<string, unknown>;

describe('parseAdminAppointmentDetail', () => {
  it('AQD-02 đúng MƯỜI BẢY khoá: mười sáu khoá của Lễ tân cộng `lichSuTrangThai`; khoá thừa không lọt', () => {
    const parsed = parseAdminAppointmentDetail({
      ...good(),
      email: 'lo.ra@example.com',
      thanhToan: { da: '0' },
      lichHenId: '1',
    });
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'bacSi',
        'chiNhanh',
        'chuyenDuoc',
        'chuyenKhoa',
        'conPhaiThu',
        'dichVu',
        'giaSnapshot',
        'hanThanhToan',
        'lichSuTrangThai',
        'lyDoHuy',
        'lyDoKham',
        'maLichHen',
        'nguoiDat',
        'nguoiKham',
        'thoiGian',
        'tienCoc',
        'trangThai',
      ].sort(),
    );
  });

  it('AQD-02 thiếu từng khoá (kể cả khoá vốn có thể `null`) hay sai kiểu ⇒ phản hồi không dùng được', () => {
    for (const key of Object.keys(good())) {
      const { [key]: _removed, ...without } = good();
      void _removed;
      expect(() => parseAdminAppointmentDetail(without), key).toThrow(
        UnexpectedResponseError,
      );
    }
    expect(() =>
      parseAdminAppointmentDetail({ ...good(), chuyenDuoc: 'DaHuy' }),
    ).toThrow(UnexpectedResponseError);
    expect(() =>
      parseAdminAppointmentDetail({ ...good(), conPhaiThu: 300000 }),
    ).toThrow(UnexpectedResponseError);
    expect(() => parseAdminAppointmentDetail(null)).toThrow(
      UnexpectedResponseError,
    );
  });

  it('AQD-02 `conPhaiThu`, `hanThanhToan`, `lyDoHuy` là `null` hay giá trị; tiền giữ CHUỖI (lớn hơn 2^53 đủ chữ số)', () => {
    const parsed = parseAdminAppointmentDetail({
      ...good(),
      conPhaiThu: '9007199254740993.00',
      hanThanhToan: '2026-10-18T07:15:00.000Z',
      lyDoHuy: null,
    });
    expect(parsed.conPhaiThu).toBe('9007199254740993.00');
    expect(parsed.hanThanhToan).toBe('2026-10-18T07:15:00.000Z');
    expect(parsed.lyDoHuy).toBeNull();
  });

  it('AQH-01 ba loại mục được đọc đúng, GIỮ thứ tự máy chủ; khoá vắng hay `null` đều thành `null`', () => {
    const entries = [
      { thoiDiem: '2026-10-17T03:00:00.000Z', loai: 'TaoLich' },
      {
        thoiDiem: '2026-10-18T05:00:00.000Z',
        loai: 'OverrideLichHen',
        tuTrangThai: 'DaXacNhan',
        denTrangThai: 'VangMat',
        lyDo: 'Không đến',
      },
      {
        thoiDiem: '2026-10-19T05:00:00.000Z',
        loai: 'HuyLich',
        denTrangThai: 'DaHuy',
        lyDo: null,
      },
    ];
    const parsed = parseAdminAppointmentDetail({
      ...good(),
      lichSuTrangThai: entries,
    });
    expect(parsed.lichSuTrangThai).toEqual([
      makeHistoryEntry({
        thoiDiem: '2026-10-17T03:00:00.000Z',
        loai: 'TaoLich',
      }),
      makeHistoryEntry({
        thoiDiem: '2026-10-18T05:00:00.000Z',
        loai: 'OverrideLichHen',
        tuTrangThai: 'DaXacNhan',
        denTrangThai: 'VangMat',
        lyDo: 'Không đến',
      }),
      makeHistoryEntry({
        thoiDiem: '2026-10-19T05:00:00.000Z',
        loai: 'HuyLich',
        denTrangThai: 'DaHuy',
        lyDo: null,
      }),
    ]);
  });

  it('AQH-08 mục `loai` lạ bị bỏ (khoá cộng thêm), các mục khác giữ; mục sai hình dạng (thiếu `thoiDiem`, `thoiDiem` không phải ngày, `lyDo` sai kiểu, không phải đối tượng) ⇒ cả phản hồi không dùng được', () => {
    const parsed = parseAdminAppointmentDetail({
      ...good(),
      lichSuTrangThai: [
        { thoiDiem: '2026-10-17T03:00:00.000Z', loai: 'TaoLich' },
        { thoiDiem: '2026-10-17T03:00:00.000Z', loai: 'LoaiMoi' },
      ],
    });
    expect(parsed.lichSuTrangThai).toHaveLength(1);
    for (const bad of [
      { loai: 'TaoLich' },
      { thoiDiem: 'hôm qua', loai: 'TaoLich' },
      { thoiDiem: '2026-10-17T03:00:00.000Z' },
      { thoiDiem: '2026-10-17T03:00:00.000Z', loai: 'HuyLich', lyDo: 5 },
      'TaoLich',
      null,
    ]) {
      expect(
        () =>
          parseAdminAppointmentDetail({ ...good(), lichSuTrangThai: [bad] }),
        JSON.stringify(bad),
      ).toThrow(UnexpectedResponseError);
    }
    expect(() =>
      parseAdminAppointmentDetail({
        ...good(),
        lichSuTrangThai: 'không phải mảng',
      }),
    ).toThrow(UnexpectedResponseError);
  });

  it('AQH-04 mục lịch sử chỉ có đúng năm khoá: người thực hiện (khoá thừa) không lọt', () => {
    const parsed = parseAdminAppointmentDetail({
      ...good(),
      lichSuTrangThai: [
        {
          thoiDiem: '2026-10-17T03:00:00.000Z',
          loai: 'TaoLich',
          nguoiThucHien: 'Quản trị viên A',
          taiKhoanId: '9',
        },
      ],
    });
    expect(Object.keys(parsed.lichSuTrangThai[0]).sort()).toEqual([
      'denTrangThai',
      'loai',
      'lyDo',
      'thoiDiem',
      'tuTrangThai',
    ]);
  });
});

describe('adminAppointmentApiPath', () => {
  it('AQD-01 mã đi qua `encodeURIComponent` (không làm vỡ đường dẫn)', () => {
    expect(adminAppointmentApiPath('CP20261018001')).toBe(
      'admin/appointments/CP20261018001',
    );
    expect(adminAppointmentApiPath('a/b?c#d')).toBe(
      'admin/appointments/a%2Fb%3Fc%23d',
    );
  });
});
