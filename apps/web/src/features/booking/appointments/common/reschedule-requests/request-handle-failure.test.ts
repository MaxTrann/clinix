import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { knownBookingErrorByCode } from '../../../api/booking-errors';
import { COMMON_ACTION_TEXT } from '../action-text';
import { BUSY_MESSAGE } from '../failure-text';
import { COMMON_LIST_TEXT } from '../list-text';
import { describeHandleFailure } from './request-handle-failure';
import { HANDLE_TEXT } from './request-handle-text';

// reschedule F4 Pha B1, WXD-84 `[đề xuất]` (PLAN reschedule 5.13; bảng mã lỗi GHI ở kế hoạch `1.16` mục 2.5): mã lỗi `maLoi` của hai route ghi ⇒ câu, loại (`final` chỉ còn đóng; `retry` bấm lại được; `uncertain`
// chưa rõ), việc tải lại chi tiết và ô thuộc về. Chọn theo `maLoi` (và `loi[].truong`), KHÔNG theo mã HTTP hay `thongBao`. Hàm thuần.
const api = (
  status: number,
  maLoi: string,
  extra: { loi?: { truong: string; ma: string }[]; chiTiet?: unknown } = {},
) =>
  new ApiError(status, {
    maLoi,
    thongBao: 'THONGBAO-LA-CUA-MAY-CHU',
    ...extra,
  });

const describe_ = (error: unknown, canPickAnother = false) =>
  describeHandleFailure(error, { canPickAnother });

describe('lỗi 400 của ghi chú', () => {
  it('WXD-84 `loi[].truong = ghiChu` ⇒ lỗi CẠNH Ô (field `reason`), bấm lại được, không tải lại; câu nhắc không nhập thông tin cá nhân', () => {
    const failure = describe_(
      api(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'ghiChu', ma: 'LY_DO_BAT_BUOC' }],
      }),
    );
    expect(failure).toEqual({
      message: HANDLE_TEXT.noteInvalid,
      kind: 'retry',
      refresh: 'none',
      field: 'reason',
    });
    expect(failure.message).toContain('Ghi chú không hợp lệ');
    expect(failure.message).toContain('thông tin cá nhân hay mật khẩu');
  });

  it('WXD-84 mọi mã trường của `ghiChu` (kể cả mã lạ) vẫn là lỗi ở ô ghi chú', () => {
    const failure = describe_(
      api(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'ghiChu', ma: 'MA_LA' }],
      }),
    );
    expect(failure.field).toBe('reason');
  });

  it('WXD-84 lỗi ở TRƯỜNG khác (`khungGioId`, `lyDo`, khoá lạ) hay không có `loi` ⇒ câu chung, KHÔNG thuộc ô ghi chú', () => {
    for (const loi of [
      [{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }],
      [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
      [{ truong: 'chiNhanhId', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      undefined,
    ]) {
      const failure = describe_(api(400, 'DU_LIEU_KHONG_HOP_LE', { loi }));
      expect(failure).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        refresh: 'none',
      });
    }
  });
});

describe('yêu cầu đã xử lý hay không có', () => {
  it('WXD-84 409 `YEU_CAU_DA_XU_LY` ⇒ chỉ còn đóng, tải lại chi tiết để thấy kết quả thật', () => {
    expect(describe_(api(409, 'YEU_CAU_DA_XU_LY'))).toEqual({
      message: HANDLE_TEXT.alreadyHandled,
      kind: 'final',
      refresh: 'detail',
    });
    expect(HANDLE_TEXT.alreadyHandled).toBe('Yêu cầu này đã được xử lý.');
  });

  it.each(['YEU_CAU_DOI_LICH_KHONG_TON_TAI', 'KHONG_TIM_THAY'])(
    'WXD-84 404 `%s` (POST của B9 và GET của B8 khác mã) ⇒ CÙNG câu "Không tìm thấy yêu cầu.", chỉ còn đóng, tải lại chi tiết',
    (code) => {
      const failure = describe_(api(404, code));
      expect(failure).toEqual({
        message: 'Không tìm thấy yêu cầu.',
        kind: 'final',
        refresh: 'detail',
      });
      // KHÔNG phải câu "lịch hẹn" của bảng chung
      expect(failure.message).not.toBe(COMMON_ACTION_TEXT.notFound);
    },
  );
});

describe('khung giờ không dùng được', () => {
  it.each(['KHUNG_GIO_DA_DAT', 'KHUNG_GIO_DANG_GIU', 'KHUNG_GIO_DA_QUA'])(
    'WXD-84 409 `%s` ⇒ GIỮ hộp (bấm lại được), tải lại chi tiết cho trạng thái khung giờ khớp; câu theo việc có nút "Chọn khung giờ khác" hay chưa',
    (code) => {
      expect(describe_(api(409, code), true)).toEqual({
        message: HANDLE_TEXT.slotGonePick,
        kind: 'retry',
        refresh: 'detail',
      });
      expect(describe_(api(409, code), false)).toEqual({
        message: HANDLE_TEXT.slotGone,
        kind: 'retry',
        refresh: 'detail',
      });
      expect(HANDLE_TEXT.slotGonePick).toContain(
        'chọn khung giờ khác hoặc từ chối',
      );
      // Chưa có nút thì KHÔNG hứa một việc không làm được
      expect(HANDLE_TEXT.slotGone).not.toContain('chọn khung giờ khác');
      expect(HANDLE_TEXT.slotGone).toContain('từ chối');
    },
  );

  it('WXD-84 404 `KHUNG_GIO_KHONG_TON_TAI`, hai mã của khung giờ thay thế và mã khung giờ của booking ⇒ bấm lại được, giữ hộp', () => {
    for (const code of [
      'KHUNG_GIO_KHONG_TON_TAI',
      'KHUNG_GIO_TRUNG_LICH_CU',
      'KHUNG_GIO_KHAC_BAC_SI',
    ]) {
      const failure = describe_(
        api(code === 'KHUNG_GIO_KHONG_TON_TAI' ? 404 : 409, code),
      );
      expect(failure.kind, code).toBe('retry');
      expect(failure.refresh, code).toBe('none');
      expect(failure.message).not.toContain(code);
    }
    expect(describe_(api(409, 'KHUNG_GIO_TRUNG_LICH_CU')).message).toBe(
      HANDLE_TEXT.sameSlot,
    );
    expect(describe_(api(409, 'KHUNG_GIO_KHAC_BAC_SI')).message).toBe(
      HANDLE_TEXT.otherDoctor,
    );
  });

  it.each([
    'BAC_SI_NGHI_PHEP',
    'KHUNG_GIO_NGOAI_LICH_MOI',
    'NGOAI_GIO_HOAT_DONG',
    'CHI_NHANH_NGHI',
    'CHI_NHANH_CHUA_KHAI_BAO',
    'CA_KHONG_TON_TAI',
    'BAC_SI_KHONG_KHA_DUNG',
    'LICH_HEN_TRUNG_THOI_GIAN',
    'VUOT_SO_LICH_HEN_TOI_DA',
  ])(
    'WXD-84 mã đã có của booking `%s` ⇒ dùng ĐÚNG câu của `booking-errors.ts` (không bảng câu thứ hai), bấm lại được',
    (code) => {
      const failure = describe_(api(409, code));
      expect(failure.message).toBe(knownBookingErrorByCode(code)!.message);
      expect(failure).toMatchObject({ kind: 'retry', refresh: 'none' });
    },
  );
});

describe('đối chiếu với B9 đã merge', () => {
  // Danh sách mã lỗi của nhánh DUYỆT ở khối "reschedule B9" của TRACKING mục 7 (d6f0fd6), chép nguyên văn: MỖI mã phải có câu RIÊNG (không rơi về câu chung) và không in mã thô
  const APPROVE_ERROR_CODES = [
    ['LICH_HEN_KHONG_CHO_DOI', 409],
    ['LICH_HEN_DA_QUA_GIO', 409],
    ['KHUNG_GIO_DA_DAT', 409],
    ['KHUNG_GIO_DANG_GIU', 409],
    ['KHUNG_GIO_DA_QUA', 409],
    ['KHUNG_GIO_TRUNG_LICH_CU', 409],
    ['KHUNG_GIO_KHAC_BAC_SI', 409],
    ['BAC_SI_NGHI_PHEP', 409],
    ['BAC_SI_KHONG_KHA_DUNG', 409],
    ['KHUNG_GIO_NGOAI_LICH_MOI', 409],
    ['HO_SO_NGUOI_THAN_DA_NGUNG', 409],
    ['CHUOI_DOI_LICH_QUA_DAI', 409],
    ['LICH_HEN_KHAC_DICH_VU_HIEN_TAI', 409],
    ['LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI', 409],
    ['HE_THONG_CHUA_CAU_HINH', 409],
    ['KHUNG_GIO_KHONG_TON_TAI', 404],
    ['YEU_CAU_DA_XU_LY', 409],
    ['YEU_CAU_DOI_LICH_KHONG_TON_TAI', 404],
    ['HE_THONG_DANG_BAN', 503],
    ['LOI_HE_THONG', 500],
  ] as const;

  it.each(APPROVE_ERROR_CODES)(
    'WXD-84 mã `%s` (HTTP %i) của B9 có câu RIÊNG, không phải câu chung, không in mã',
    (code, status) => {
      const failure = describe_(api(status, code));
      expect(failure.message).not.toBe(GENERIC_ERROR_MESSAGE);
      expect(failure.message).not.toContain(code);
      expect(failure.message.length).toBeGreaterThan(10);
    },
  );

  it('WXD-84 hai mã B9 KHÔNG BAO GIỜ ra (`VUOT_SO_LAN_TU_DOI`, `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET`) mà vẫn xuất hiện thì rơi về câu chung, không vỡ', () => {
    for (const code of [
      'VUOT_SO_LAN_TU_DOI',
      'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
    ]) {
      expect(describe_(api(409, code)).message).toBe(GENERIC_ERROR_MESSAGE);
    }
  });
});

describe('lịch gốc không còn duyệt được', () => {
  it.each([
    'LICH_HEN_KHONG_CHO_DOI',
    'LICH_HEN_DA_QUA_GIO',
    'HO_SO_NGUOI_THAN_DA_NGUNG',
    'CHUOI_DOI_LICH_QUA_DAI',
    'LICH_HEN_KHAC_DICH_VU_HIEN_TAI',
    'LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI',
  ])(
    'WXD-84 409 `%s` ⇒ chỉ còn đóng, tải lại chi tiết (ra "không duyệt được"); nhắc vẫn có thể từ chối',
    (code) => {
      const failure = describe_(
        api(409, code, { chiTiet: { trangThai: 'DaHuy' } }),
      );
      expect(failure).toMatchObject({ kind: 'final', refresh: 'detail' });
      expect(failure.message).toContain('Bạn vẫn có thể từ chối.');
      expect(failure.message).not.toContain(code);
      expect(failure.message).not.toContain('DaHuy');
    },
  );

  it('WXD-84 hai mã đổi dịch vụ và đổi chi nhánh có câu RIÊNG, khác nhau', () => {
    const service = describe_(
      api(409, 'LICH_HEN_KHAC_DICH_VU_HIEN_TAI'),
    ).message;
    const branch = describe_(
      api(409, 'LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI'),
    ).message;
    expect(service).toContain('dịch vụ');
    expect(branch).toContain('chi nhánh');
    expect(service).not.toBe(branch);
  });
});

describe('lỗi hệ thống và quyền', () => {
  it('WXD-84 409 `HE_THONG_CHUA_CAU_HINH` ⇒ câu chưa cấu hình có sẵn, chỉ còn đóng, tải lại chi tiết', () => {
    expect(describe_(api(409, 'HE_THONG_CHUA_CAU_HINH'))).toEqual({
      message: COMMON_ACTION_TEXT.notConfigured,
      kind: 'final',
      refresh: 'detail',
    });
  });

  it('WXD-84 503 `HE_THONG_DANG_BAN` ⇒ câu bận có sẵn, bấm lại được (giao dịch hoàn tác trọn)', () => {
    expect(describe_(api(503, 'HE_THONG_DANG_BAN'))).toEqual({
      message: BUSY_MESSAGE,
      kind: 'retry',
      refresh: 'none',
    });
  });

  it('WXD-84 500 `LOI_HE_THONG` (kể cả lỗi Audit làm hoàn tác trọn) ⇒ "Không thực hiện được, vui lòng thử lại.", gửi lại được; không lộ chữ của máy chủ', () => {
    const failure = describe_(api(500, 'LOI_HE_THONG'));
    expect(failure).toEqual({
      message: 'Không thực hiện được, vui lòng thử lại.',
      kind: 'retry',
      refresh: 'none',
    });
    expect(failure.message).not.toContain('THONGBAO');
  });

  it.each([400, 401, 403, 404, 409, 500, 502])(
    'WXD-84 HTTP %i với `maLoi` lạ ⇒ câu chung, bấm lại được, KHÔNG in `thongBao` hay mã (chọn theo `maLoi`, không theo mã HTTP)',
    (status) => {
      const failure = describe_(api(status, 'MA_LOI_LA'));
      expect(failure).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        refresh: 'none',
      });
    },
  );

  it('WXD-84 `maLoi` trùng khoá nguyên mẫu ("constructor", "__proto__") ⇒ câu chung, không vỡ', () => {
    for (const code of ['constructor', '__proto__', 'toString']) {
      expect(describe_(api(409, code)).message).toBe(GENERIC_ERROR_MESSAGE);
    }
  });

  // B9 (đã merge, TRACKING mục 7): 401 có BA mã (`CHUA_DANG_NHAP`, `TOKEN_KHONG_HOP_LE`, `PHIEN_HET_HIEU_LUC`: Lễ tân bị khoá hay thu hồi phiên); cả ba là phiên hết hiệu lực
  it.each(['CHUA_DANG_NHAP', 'TOKEN_KHONG_HOP_LE', 'PHIEN_HET_HIEU_LUC'])(
    'WXD-84 401 `%s` ⇒ câu phiên hết hạn, chỉ còn đóng, không tải lại',
    (code) => {
      expect(describe_(api(401, code))).toEqual({
        message: COMMON_LIST_TEXT.sessionExpired,
        kind: 'final',
        refresh: 'none',
      });
    },
  );

  it('WXD-84 401 `CHUA_DANG_NHAP` ⇒ câu phiên hết hạn; 403 `KHONG_DU_QUYEN` ⇒ câu không đủ quyền; cả hai chỉ còn đóng', () => {
    expect(describe_(api(401, 'CHUA_DANG_NHAP'))).toEqual({
      message: COMMON_LIST_TEXT.sessionExpired,
      kind: 'final',
      refresh: 'none',
    });
    expect(describe_(api(403, 'KHONG_DU_QUYEN'))).toEqual({
      message: COMMON_ACTION_TEXT.forbidden,
      kind: 'final',
      refresh: 'none',
    });
  });
});

describe('kết quả chưa rõ', () => {
  it.each([
    ['mạng đứt', () => new NetworkError()],
    ['quá giờ', () => new TimeoutError()],
    ['200 sai hình dạng', () => new UnexpectedResponseError(200)],
    ['502 không phải JSON', () => new UnexpectedResponseError(502)],
  ])(
    'WXD-84 %s ⇒ "chưa rõ": giữ hộp, không tải lại tự động, KHÔNG tự gửi lại',
    (_name, make) => {
      expect(describe_(make())).toEqual({
        message: HANDLE_TEXT.unsure,
        kind: 'uncertain',
        refresh: 'none',
      });
      expect(HANDLE_TEXT.unsure).toContain('Chưa rõ');
      expect(HANDLE_TEXT.unsure).toContain('tải lại chi tiết');
    },
  );

  it('WXD-84 lỗi không phải của lớp API (ném thường) ⇒ câu chung, bấm lại được', () => {
    expect(describe_(new Error('hỏng'))).toEqual({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
      refresh: 'none',
    });
  });
});
