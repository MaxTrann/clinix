import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import {
  FORBIDDEN_MESSAGE,
  NO_SHOW_LOCK_MESSAGE,
  NOT_CONFIGURED_MESSAGE,
} from '../../api/booking-errors';
import { BUSY_MESSAGE } from '../../appointments/common/failure-text';
import { COMMON_LIST_TEXT } from '../../appointments/common/list-text';
import {
  CREATE_FAILURE_TEXT,
  describeCreateFailure,
  type CreateFailure,
} from './create-failure';

// booking F5. XNE-01…XNE-04 là [đề xuất] (PLAN booking mục 7.40): hàm thuần `describeCreateFailure`. Chọn câu theo `maLoi` (và `loi[].ma`, `chiTiet`), KHÔNG theo mã HTTP hay `thongBao`.
const api = (status: number, maLoi: string, extra: object = {}) =>
  new ApiError(status, { maLoi, thongBao: 'Câu lạ của API', ...extra });
const describe0 = (error: unknown): CreateFailure =>
  describeCreateFailure(error, { afterUncertain: false });

describe('booking F5 — câu lỗi của lời gọi tạo lịch (XNE)', () => {
  it.each<[string, ApiError, Partial<CreateFailure> & { message: string }]>([
    [
      'A2 đã đặt',
      api(409, 'KHUNG_GIO_DA_DAT'),
      {
        message:
          'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
        kind: 'final',
        links: ['reselect'],
      },
    ],
    [
      'A2 đang giữ (thử lại được)',
      api(409, 'KHUNG_GIO_DANG_GIU'),
      {
        message:
          'Khung giờ này đang được người khác giữ chỗ. Vui lòng chọn khung giờ khác hoặc thử lại sau ít phút.',
        kind: 'retry',
        links: ['reselect'],
      },
    ],
    [
      'A3/11a khung giờ đã qua',
      api(409, 'KHUNG_GIO_DA_QUA'),
      {
        message: 'Khung giờ này đã qua. Vui lòng chọn khung giờ khác.',
        kind: 'final',
        links: ['reselect'],
      },
    ],
    [
      'A6 chi nhánh nghỉ (ISO 3 là Thứ 4)',
      api(409, 'CHI_NHANH_NGHI', { chiTiet: { thuTrongTuan: 3 } }),
      {
        message: 'Chi nhánh nghỉ vào Thứ 4.',
        kind: 'final',
        links: ['reselect'],
      },
    ],
    [
      'A6 ngoài giờ hoạt động',
      api(409, 'NGOAI_GIO_HOAT_DONG', {
        chiTiet: { gioMo: '07:30', gioDong: '17:00' },
      }),
      {
        message: 'Ngoài giờ hoạt động, chi nhánh mở cửa từ 07:30 đến 17:00.',
        kind: 'final',
        links: ['reselect'],
      },
    ],
    [
      'A6 chưa khai báo',
      api(409, 'CHI_NHANH_CHUA_KHAI_BAO'),
      {
        message: 'Chi nhánh chưa công bố giờ nhận khám vào ngày này.',
        kind: 'final',
        links: ['reselect'],
      },
    ],
    [
      'A6 ca không tồn tại',
      api(409, 'CA_KHONG_TON_TAI'),
      {
        message: 'Chi nhánh không nhận khám vào buổi này.',
        kind: 'final',
        links: ['reselect'],
      },
    ],
    [
      'A3 vượt số lịch tối đa',
      api(409, 'VUOT_SO_LICH_HEN_TOI_DA', { chiTiet: { toiDa: 3 } }),
      {
        message: 'Hồ sơ này đã có 3 lịch hẹn đang hoạt động, là mức tối đa.',
        kind: 'final',
        links: ['editProfile'],
      },
    ],
    [
      'A3 trùng thời gian',
      api(409, 'LICH_HEN_TRUNG_THOI_GIAN', {
        chiTiet: { maLichHen: 'CLX-20261019-7K3M9' },
      }),
      {
        message: 'Hồ sơ này đã có lịch hẹn CLX-20261019-7K3M9 trùng thời gian.',
        kind: 'final',
        links: ['editProfile'],
      },
    ],
    [
      'hồ sơ người thân đã ngừng',
      api(409, 'HO_SO_NGUOI_THAN_DA_NGUNG'),
      {
        message: 'Hồ sơ này đã ngừng sử dụng. Vui lòng chọn hồ sơ khác.',
        kind: 'final',
        links: ['editProfile'],
      },
    ],
    [
      '404 không tìm thấy (hồ sơ hay khung giờ): câu TRUNG TÍNH, cả hai đường sửa',
      api(404, 'KHONG_TIM_THAY'),
      {
        message:
          'Không tìm thấy thông tin để đặt lịch. Vui lòng chọn lại hồ sơ đi khám hoặc khung giờ.',
        kind: 'final',
        links: ['editProfile', 'reselect'],
      },
    ],
    [
      'A4 khoá no-show',
      api(403, 'DAT_LICH_BI_KHOA_NO_SHOW'),
      { message: NO_SHOW_LOCK_MESSAGE, kind: 'final', links: [] },
    ],
    [
      '403 không đủ quyền',
      api(403, 'KHONG_DU_QUYEN'),
      { message: FORBIDDEN_MESSAGE, kind: 'final', links: [] },
    ],
    [
      'hệ thống chưa cấu hình (thử lại được)',
      api(409, 'HE_THONG_CHUA_CAU_HINH'),
      { message: NOT_CONFIGURED_MESSAGE, kind: 'retry', links: [] },
    ],
    [
      '401 hết phiên',
      api(401, 'CHUA_DANG_NHAP'),
      { message: COMMON_LIST_TEXT.sessionExpired, kind: 'final', links: [] },
    ],
    [
      '503 hệ thống bận (giao dịch hoàn tác trọn ⇒ bấm lại)',
      api(503, 'HE_THONG_DANG_BAN'),
      { message: BUSY_MESSAGE, kind: 'retry', links: [] },
    ],
    [
      '400 lý do khám không hợp lệ (mã TRƯỜNG)',
      api(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'lyDoKham', ma: 'LY_DO_KHAM_KHONG_HOP_LE' }],
      }),
      {
        message: 'Lý do khám không hợp lệ (tối đa 500 ký tự).',
        kind: 'final',
        links: ['editReason'],
      },
    ],
  ])('XNE-01 WZ-06 WZ-07 WZ-13 %s', (_name, error, expected) => {
    expect(describe0(error)).toEqual({
      kind: expected.kind,
      links: expected.links,
      message: expected.message,
    });
  });

  it('XNE-01 cùng HTTP 409 nhưng khác `maLoi` ⇒ câu khác (chọn theo mã, không theo mã HTTP)', () => {
    const a2 = describe0(api(409, 'KHUNG_GIO_DA_DAT'));
    const a6 = describe0(
      api(409, 'CHI_NHANH_NGHI', { chiTiet: { thuTrongTuan: 7 } }),
    );
    expect(a2.message).not.toBe(a6.message);
    expect(a6.message).toBe('Chi nhánh nghỉ vào Chủ nhật.');
  });

  it('XNE-02 WZ-07 `chiTiet` thiếu hay sai kiểu ⇒ câu KHÔNG số liệu (không hiện chuỗi lạ)', () => {
    expect(describe0(api(409, 'NGOAI_GIO_HOAT_DONG')).message).toBe(
      'Ngoài giờ hoạt động của chi nhánh.',
    );
    expect(
      describe0(
        api(409, 'NGOAI_GIO_HOAT_DONG', {
          chiTiet: { gioMo: 7, gioDong: '17' },
        }),
      ).message,
    ).toBe('Ngoài giờ hoạt động của chi nhánh.');
    expect(
      describe0(api(409, 'CHI_NHANH_NGHI', { chiTiet: { thuTrongTuan: 9 } }))
        .message,
    ).toBe('Chi nhánh nghỉ vào ngày này.');
    for (const toiDa of ['3', 0, -1, 1.5, null]) {
      expect(
        describe0(api(409, 'VUOT_SO_LICH_HEN_TOI_DA', { chiTiet: { toiDa } }))
          .message,
      ).toBe('Hồ sơ này đã đạt số lịch hẹn đang hoạt động tối đa.');
    }
    const injected = describe0(
      api(409, 'LICH_HEN_TRUNG_THOI_GIAN', {
        chiTiet: { maLichHen: '<b>x</b>' },
      }),
    );
    expect(injected.message).toBe('Hồ sơ này đã có lịch hẹn trùng thời gian.');
  });

  it('XNE-02 `maLoi` lạ (kể cả tên trùng nguyên mẫu), 500 JSON, 400 khác ⇒ câu chung, bấm lại được; không bao giờ dùng `thongBao` của API', () => {
    for (const maLoi of [
      'MA_LA',
      'LOI_HE_THONG',
      'constructor',
      '__proto__',
      'toString',
    ]) {
      const failure = describe0(api(500, maLoi));
      expect(failure).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        links: [],
      });
      expect(failure.message).not.toContain('Câu lạ của API');
    }
    // 400 `DU_LIEU_KHONG_HOP_LE` không có mã trường của lý do khám ⇒ câu chung
    expect(
      describe0(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }],
        }),
      ).kind,
    ).toBe('retry');
    expect(describe0(api(400, 'DU_LIEU_KHONG_HOP_LE')).message).toBe(
      GENERIC_ERROR_MESSAGE,
    );
  });

  it('XNE-03 WZ-13 lỗi KHÔNG phải ApiError (mạng, quá giờ, phản hồi sai hình dạng kể cả 502 hay 504, bị huỷ, lỗi không biết) ⇒ `uncertain`, có liên kết kiểm tra, KHÔNG bao giờ `retry` hay `final`', () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(502),
      new UnexpectedResponseError(504),
      new UnexpectedResponseError(200),
      new RequestAbortedError(),
      new TypeError('lạ'),
      'chuỗi',
      null,
    ]) {
      expect(describe0(error)).toEqual({
        message: CREATE_FAILURE_TEXT.uncertain,
        kind: 'uncertain',
        links: ['myAppointments'],
        note: CREATE_FAILURE_TEXT.uncertainNote,
      });
    }
    // Câu nói rõ KHÔNG biết kết quả và chỉ cách kiểm tra; không khẳng định thất bại hay thành công
    expect(CREATE_FAILURE_TEXT.uncertain).toContain('Chưa rõ');
    expect(CREATE_FAILURE_TEXT.uncertain).toContain('Lịch hẹn của tôi');
    expect(CREATE_FAILURE_TEXT.uncertainNote).toContain('đang được giữ');
  });

  it('XNE-04 WZ-13 sau một lần "chưa rõ", A2 (đã đặt hay đang giữ) có thêm câu "có thể chính là lịch bạn vừa đặt" và liên kết Lịch hẹn của tôi', () => {
    for (const maLoi of ['KHUNG_GIO_DA_DAT', 'KHUNG_GIO_DANG_GIU']) {
      const without = describeCreateFailure(api(409, maLoi), {
        afterUncertain: false,
      });
      const withHint = describeCreateFailure(api(409, maLoi), {
        afterUncertain: true,
      });
      expect(without.note).toBeUndefined();
      expect(without.links).toEqual(['reselect']);
      expect(withHint.note).toBe(CREATE_FAILURE_TEXT.afterUncertainNote);
      expect(withHint.links).toEqual(['reselect', 'myAppointments']);
      // Câu chính và loại không đổi vì gợi ý
      expect(withHint.message).toBe(without.message);
      expect(withHint.kind).toBe(without.kind);
    }
  });

  it('XNE-04 gợi ý CHỈ gắn vào A2: A3, A6, A4, 503 và lỗi lạ không bao giờ có, dù trước đó "chưa rõ"', () => {
    for (const error of [
      api(409, 'LICH_HEN_TRUNG_THOI_GIAN'),
      api(409, 'VUOT_SO_LICH_HEN_TOI_DA'),
      api(409, 'CHI_NHANH_NGHI'),
      api(409, 'KHUNG_GIO_DA_QUA'),
      api(403, 'DAT_LICH_BI_KHOA_NO_SHOW'),
      api(503, 'HE_THONG_DANG_BAN'),
      api(500, 'MA_LA'),
    ]) {
      const failure = describeCreateFailure(error, { afterUncertain: true });
      expect(failure.note).toBeUndefined();
      expect(failure.links).not.toContain('myAppointments');
    }
  });
});
