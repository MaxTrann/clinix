import type { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import {
  decideIssue,
  deriveOtpState,
  refusalFor,
  resendRefusalFor,
  statusLabelOf,
} from './otp-rules.js';
import type { OtpState } from './otp.types.js';

// Task A2. Mã test case: bảng trạng thái PLAN 5.2; DK-13, DK-14 (60 giây), DK-15 (5 mã/giờ), DK-22 (599/601), DK-23, DK-26, DK-44,
// DK-48, DK-49, DK-50, QM-07, QM-10; trangThaiMa của đăng nhập chưa xác minh (N2, DN-17, DN-37, DN-38).
const NOW = new Date('2026-10-28T01:00:00.000Z'); // 08:00:00 giờ Việt Nam, đúng giây
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

type Facts = Pick<
  MaXacThuc,
  | 'loai'
  | 'daDungLuc'
  | 'daGuiLuc'
  | 'thuHoiLuc'
  | 'hetHanLuc'
  | 'hoTenDangKy'
  | 'soDienThoaiDangKy'
  | 'matKhauBamDangKy'
>;

// Hàng đang dùng được: đã gửi, chưa thu hồi, còn 10 phút, có đủ dữ liệu đăng ký
function row(overrides: Partial<Facts> = {}): Facts {
  return {
    loai: 'DangKy',
    daDungLuc: null,
    daGuiLuc: at(-5),
    thuHoiLuc: null,
    hetHanLuc: at(600),
    hoTenDangKy: 'Nguyễn Văn A',
    soDienThoaiDangKy: '0901234567',
    matKhauBamDangKy: '$argon2id$gia',
    ...overrides,
  };
}
const NO_REGISTRATION = {
  hoTenDangKy: null,
  soDienThoaiDangKy: null,
  matKhauBamDangKy: null,
};
const state = (facts: Facts, replaced = false) =>
  deriveOtpState(facts, NOW, replaced);

describe('deriveOtpState — bảng trạng thái PLAN 5.2 (OTP-05)', () => {
  it('đã gửi, chưa thu hồi, còn hạn: đang dùng được', () => {
    expect(state(row())).toBe('DANG_DUNG');
  });

  it('hạn là nửa mở: còn 1 giây thì dùng được, đúng thời điểm hết hạn là hết hạn (DK-22: 599 còn, 601 hết)', () => {
    expect(state(row({ hetHanLuc: at(1) }))).toBe('DANG_DUNG');
    expect(state(row({ hetHanLuc: at(0) }))).toBe('HET_HAN');
    expect(state(row({ hetHanLuc: at(-1) }))).toBe('HET_HAN');
  });

  it('chưa gửi hoặc gửi lỗi (da_gui_luc rỗng, có hoặc không có thu_hoi_luc): chưa gửi (DK-25, DK-49)', () => {
    expect(state(row({ daGuiLuc: null }))).toBe('CHUA_GUI');
    expect(state(row({ daGuiLuc: null, thuHoiLuc: at(-1) }))).toBe('CHUA_GUI');
  });

  it('đã gửi nhưng bị thu hồi (sai đủ số lần): thu hồi do sai (DK-20)', () => {
    expect(state(row({ thuHoiLuc: at(-1) }))).toBe('THU_HOI_SAI');
  });

  it('có hàng đã gửi thành công mới hơn: bị thay thế (DK-16, DK-43, DK-44), cả khi chính nó cũng chưa gửi (DK-48)', () => {
    expect(state(row(), true)).toBe('BI_THAY_THE');
    expect(state(row({ thuHoiLuc: at(-1) }), true)).toBe('BI_THAY_THE');
    expect(state(row({ daGuiLuc: null }), true)).toBe('BI_THAY_THE');
  });

  it('DangKy không còn dữ liệu đăng ký (đặt lại mật khẩu, N3): phải đăng ký lại (DK-50)', () => {
    expect(state(row({ thuHoiLuc: at(-1), ...NO_REGISTRATION }))).toBe(
      'CAN_DANG_KY_LAI',
    );
    // trạng thái hỏng (chưa thu hồi mà không có dữ liệu): xử lý như vậy cho an toàn
    expect(state(row({ ...NO_REGISTRATION }))).toBe('CAN_DANG_KY_LAI');
  });

  it('chỉ MỘT trong ba cột dữ liệu đăng ký NULL cũng không dùng được (CHECK của DB không cho, nhưng mã vẫn phòng thủ)', () => {
    expect(state(row({ soDienThoaiDangKy: null }))).toBe('CAN_DANG_KY_LAI');
  });

  it('QuenMatKhau không có dữ liệu đăng ký là bình thường, không phải "đăng ký lại"', () => {
    expect(state(row({ loai: 'QuenMatKhau', ...NO_REGISTRATION }))).toBe(
      'DANG_DUNG',
    );
  });

  it('đã dùng thì luôn là đã dùng, dù các điều kiện khác thế nào', () => {
    expect(state(row({ daDungLuc: at(-1) }))).toBe('DA_DUNG');
    expect(
      state(
        row({ daDungLuc: at(-1), hetHanLuc: at(-100), ...NO_REGISTRATION }),
        true,
      ),
    ).toBe('DA_DUNG');
  });

  it('thứ tự ưu tiên: đã dùng > đăng ký lại > bị thay thế > chưa gửi > thu hồi do sai > hết hạn', () => {
    const expired = { hetHanLuc: at(-1) };
    expect(
      state(row({ ...NO_REGISTRATION, ...expired, thuHoiLuc: at(-1) }), true),
    ).toBe('CAN_DANG_KY_LAI');
    expect(state(row({ daGuiLuc: null, ...expired }), true)).toBe(
      'BI_THAY_THE',
    );
    expect(state(row({ daGuiLuc: null, thuHoiLuc: at(-1), ...expired }))).toBe(
      'CHUA_GUI',
    );
    expect(state(row({ thuHoiLuc: at(-1), ...expired }))).toBe('THU_HOI_SAI');
  });
});

describe('refusalFor và resendRefusalFor (OTP-06)', () => {
  it.each<[OtpState, string | null, string | null]>([
    ['DANG_DUNG', null, null],
    ['HET_HAN', 'OTP_HET_HAN', null],
    ['THU_HOI_SAI', 'OTP_HET_LUOT', null],
    ['CHUA_GUI', 'OTP_SAI', null],
    ['BI_THAY_THE', 'OTP_BI_THAY_THE', 'OTP_BI_THAY_THE'],
    ['CAN_DANG_KY_LAI', 'CAN_DANG_KY_LAI', 'CAN_DANG_KY_LAI'],
    ['DA_DUNG', 'OTP_SAI', 'OTP_SAI'],
  ])(
    'trạng thái %s: xác minh bị từ chối bằng %s; gửi lại bị từ chối bằng %s (null = được)',
    (st, verifyCode, resendCode) => {
      expect(refusalFor(st)?.code ?? null).toBe(verifyCode);
      expect(resendRefusalFor(st)?.code ?? null).toBe(resendCode);
    },
  );

  it('"chưa gửi" và "đã dùng" dùng chung OTP_SAI nhưng khác lý do (để log và test phân biệt, HTTP không thấy)', () => {
    expect(refusalFor('CHUA_GUI')?.reason).toBe('NOT_SENT');
    expect(refusalFor('DA_DUNG')?.reason).toBe('USED');
  });
});

describe('statusLabelOf — trangThaiMa của đăng nhập chưa xác minh (OTP-07; N2)', () => {
  it.each<[OtpState, string]>([
    ['DANG_DUNG', 'ConHan'],
    ['HET_HAN', 'HetHan'],
    ['THU_HOI_SAI', 'DaThuHoi'],
    ['CHUA_GUI', 'ChuaGui'],
    ['CAN_DANG_KY_LAI', 'CanDangKyLai'],
    ['BI_THAY_THE', 'DaThuHoi'],
    ['DA_DUNG', 'DaThuHoi'],
  ])('%s → %s', (st, label) => {
    expect(statusLabelOf(st)).toBe(label);
  });
});

describe('decideIssue — giới hạn gửi lại (OTP-08; DK-13, DK-14, DK-15, QM-10)', () => {
  const ago = (...seconds: number[]) => seconds.map((s) => at(-s));

  it('chưa từng có hàng nào: được', () => {
    expect(decideIssue([], NOW)).toEqual({ allowed: true });
  });

  it('cách hàng mới nhất 59 giây: từ chối, chờ 1 giây (DK-13)', () => {
    expect(decideIssue(ago(59), NOW)).toEqual({
      allowed: false,
      reason: 'TOO_SOON',
      retryAfterSeconds: 1,
    });
  });

  it('đúng 60 giây: được (DK-14, biên); 61 giây: được', () => {
    expect(decideIssue(ago(60), NOW)).toEqual({ allowed: true });
    expect(decideIssue(ago(61), NOW)).toEqual({ allowed: true });
  });

  it('vừa tạo xong (0 giây): chờ đủ 60 giây', () => {
    expect(decideIssue(ago(0), NOW)).toMatchObject({
      allowed: false,
      reason: 'TOO_SOON',
      retryAfterSeconds: 60,
    });
  });

  it('thời gian chờ làm tròn LÊN theo giây', () => {
    expect(decideIssue([new Date(NOW.getTime() - 59_500)], NOW)).toMatchObject({
      retryAfterSeconds: 1,
    });
  });

  it('đã có 4 hàng trong 1 giờ: hàng thứ 5 vẫn được; đã có 5: hàng thứ 6 bị từ chối (DK-15, biên 5/6)', () => {
    expect(decideIssue(ago(3000, 2400, 1800, 1200), NOW)).toEqual({
      allowed: true,
    });
    expect(decideIssue(ago(3000, 2400, 1800, 1200, 600), NOW)).toMatchObject({
      allowed: false,
      reason: 'HOURLY_LIMIT',
    });
  });

  it('chờ bao lâu: tới khi hàng cũ nhất rời cửa sổ 1 giờ', () => {
    // 5 hàng, cũ nhất cách 3000 giây ⇒ còn 600 giây nữa mới ra khỏi cửa sổ
    expect(decideIssue(ago(3000, 2400, 1800, 1200, 600), NOW)).toMatchObject({
      retryAfterSeconds: 600,
    });
  });

  it('cửa sổ nửa mở: hàng đúng 1 giờ tuổi không còn được đếm; quá 1 giờ càng không', () => {
    // 5 hàng nhưng hàng cũ nhất đúng 3600 giây ⇒ chỉ còn 4 hàng trong cửa sổ ⇒ được
    expect(decideIssue(ago(3600, 2400, 1800, 1200, 600), NOW)).toEqual({
      allowed: true,
    });
    expect(decideIssue(ago(3599, 2400, 1800, 1200, 600), NOW)).toMatchObject({
      allowed: false,
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 1,
    });
    expect(decideIssue(ago(7200, 5400, 4000, 3700, 3601), NOW)).toEqual({
      allowed: true,
    });
  });

  it('cả hai giới hạn cùng vi phạm: báo thời gian chờ LỚN hơn và lý do tương ứng', () => {
    // 5 hàng; mới nhất cách 10 giây (chờ 50 giây), cũ nhất cách 3590 giây (chờ 10 giây) ⇒ 50 giây, TOO_SOON
    expect(decideIssue(ago(3590, 2400, 1800, 1200, 10), NOW)).toMatchObject({
      reason: 'TOO_SOON',
      retryAfterSeconds: 50,
    });
    // mới nhất cách 59 giây (chờ 1 giây), cũ nhất cách 3000 giây (chờ 600 giây) ⇒ 600 giây, HOURLY_LIMIT
    expect(decideIssue(ago(3000, 2400, 1800, 1200, 59), NOW)).toMatchObject({
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 600,
    });
  });

  it('không phụ thuộc thứ tự đầu vào', () => {
    const times = ago(600, 3000, 1200, 2400, 1800);
    expect(decideIssue(times, NOW)).toEqual(
      decideIssue([...times].reverse(), NOW),
    );
  });

  it('hàng gửi lỗi vẫn là một hàng: danh sách chỉ có thời điểm tạo nên không phân biệt (DK-26)', () => {
    // 5 hàng, trong đó 4 hàng đã gửi lỗi: vẫn chạm giới hạn 5/giờ
    expect(decideIssue(ago(3000, 2400, 1800, 1200, 600), NOW).allowed).toBe(
      false,
    );
  });
});
