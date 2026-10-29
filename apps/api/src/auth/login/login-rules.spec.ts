import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import type { OtpLatestStatus } from '../otp/otp.types.js';
import {
  isLockedAt,
  loginRefusalFor,
  needsFailureReset,
  nextFailureState,
  unverifiedStatusFor,
  type LoginFacts,
} from './login-rules.js';

// Task A8 — luật đăng nhập thuần (quy tắc 18, 23; PLAN 5.3). Mã test case: DN-07, DN-08, DN-10, DN-13, DN-14, DN-15, DN-16, DN-17, DN-37,
// DN-38 và TECH_DEBT 32 (quá 24 giờ). Mã LR-nn là [đề xuất]. Mọi biên kiểm bằng đồng hồ TRUYỀN VÀO, từng giây.
const NOW = new Date('2026-11-02T01:00:00.000Z');
const at = (seconds: number): Date => new Date(NOW.getTime() + seconds * 1000);
const FIFTEEN_MINUTES = 15 * 60;

const account = (overrides: Partial<LoginFacts> = {}): LoginFacts => ({
  loaiTaiKhoan: 'BenhNhan',
  trangThai: 'DangHoatDong',
  daXacMinhEmail: true,
  thoiDiemTao: at(-3600),
  soLanDangNhapSai: 0,
  khoaDangNhapDen: null,
  ...overrides,
});

describe('loginRefusalFor — trạng thái rồi mới tới khoá tạm', () => {
  it('LR-01 tài khoản đang hoạt động, không khoá: được so mật khẩu', () => {
    expect(loginRefusalFor(account(), NOW)).toBeNull();
  });

  it('LR-02 (DN-15) ChoKichHoat: từ chối, kể cả khi cột khoá còn giá trị', () => {
    const base = { trangThai: 'ChoKichHoat' } as const;
    expect(loginRefusalFor(account(base), NOW)).toEqual({
      kind: 'PENDING_ACTIVATION',
    });
    expect(
      loginRefusalFor(account({ ...base, khoaDangNhapDen: at(600) }), NOW),
    ).toEqual({ kind: 'PENDING_ACTIVATION' });
  });

  it('LR-03 (DN-14, DN-16) NgungHoatDong: từ chối, kể cả khi đang khoá (trạng thái đứng trước khoá)', () => {
    const base = { trangThai: 'NgungHoatDong' } as const;
    expect(loginRefusalFor(account(base), NOW)).toEqual({ kind: 'SUSPENDED' });
    expect(
      loginRefusalFor(account({ ...base, khoaDangNhapDen: at(600) }), NOW),
    ).toEqual({ kind: 'SUSPENDED' });
  });

  it('LR-04 (DN-10) còn 1 giây: đang khoá; số giây còn lại và mốc khoá được trả cho FE', () => {
    const lockedUntil = at(1);
    expect(
      loginRefusalFor(account({ khoaDangNhapDen: lockedUntil }), NOW),
    ).toEqual({ kind: 'LOCKED', lockedUntil, remainingSeconds: 1 });
  });

  it('LR-05 (DN-10) ĐÚNG mốc khoá: đã hết khoá (nửa mở, cùng quy ước OTP, phiên và 24 giờ); 1 giây trước đó vẫn khoá, 1 giây sau thì vào được', () => {
    expect(
      loginRefusalFor(account({ khoaDangNhapDen: at(0) }), NOW),
    ).toBeNull();
    expect(
      loginRefusalFor(account({ khoaDangNhapDen: at(-1) }), NOW),
    ).toBeNull();
    expect(
      loginRefusalFor(account({ khoaDangNhapDen: at(1) }), NOW)?.kind,
    ).toBe('LOCKED');
  });

  it('LR-06 khoá 15 phút vừa đặt: còn đúng 900 giây; 14:59 sau đó còn 1 giây, 15:00:00 hết', () => {
    const lockedUntil = at(FIFTEEN_MINUTES);
    const locked = account({ khoaDangNhapDen: lockedUntil });
    expect(loginRefusalFor(locked, NOW)).toMatchObject({
      kind: 'LOCKED',
      remainingSeconds: 900,
    });
    expect(loginRefusalFor(locked, at(FIFTEEN_MINUTES - 1))).toMatchObject({
      kind: 'LOCKED',
      remainingSeconds: 1,
    });
    expect(loginRefusalFor(locked, at(FIFTEEN_MINUTES))).toBeNull();
    expect(loginRefusalFor(locked, at(FIFTEEN_MINUTES + 1))).toBeNull();
  });

  it('LR-07 số giây còn lại làm tròn LÊN khi đồng hồ có phần lẻ giây (không bao giờ báo 0 giây khi còn khoá)', () => {
    const now = new Date(NOW.getTime() + 400);
    expect(
      loginRefusalFor(account({ khoaDangNhapDen: at(1) }), now),
    ).toMatchObject({ kind: 'LOCKED', remainingSeconds: 1 });
  });

  it('LR-08 isLockedAt: không có khoá thì không khoá; chỉ khoá khi mốc nằm Ở TƯƠNG LAI', () => {
    expect(isLockedAt(null, NOW)).toBe(false);
    expect(isLockedAt(at(0), NOW)).toBe(false);
    expect(isLockedAt(at(1), NOW)).toBe(true);
  });
});

describe('nextFailureState — đếm sai và khoá 5 lần / 15 phút (quy tắc 18)', () => {
  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
  ])(
    'LR-10 (DN-07) đang sai %s lần, sai thêm: %s lần, chưa khoá',
    (before, after) => {
      expect(
        nextFailureState(account({ soLanDangNhapSai: before }), NOW),
      ).toEqual({ failures: after, lockedUntil: null });
    },
  );

  it('LR-11 (DN-08) lần sai thứ 5 liên tiếp: khoá đúng 15 phút kể từ lúc này', () => {
    expect(nextFailureState(account({ soLanDangNhapSai: 4 }), NOW)).toEqual({
      failures: 5,
      lockedUntil: at(FIFTEEN_MINUTES),
    });
    expect(at(FIFTEEN_MINUTES).getTime() - NOW.getTime()).toBe(900_000);
  });

  it('LR-12 (DN-13) khoá đã hết hạn: bộ đếm coi như 0, lần sai kế tiếp đếm lại từ 1 và xoá giá trị khoá cũ', () => {
    expect(
      nextFailureState(
        account({ soLanDangNhapSai: 5, khoaDangNhapDen: at(-1) }),
        NOW,
      ),
    ).toEqual({ failures: 1, lockedUntil: null });
  });

  it('LR-13 (DN-13) khoá hết ĐÚNG mốc: cũng đếm lại từ 1; khoá hết hạn nhưng bộ đếm mới 4 vẫn về 1 (không thành 5)', () => {
    expect(
      nextFailureState(
        account({ soLanDangNhapSai: 5, khoaDangNhapDen: at(0) }),
        NOW,
      ),
    ).toEqual({ failures: 1, lockedUntil: null });
    expect(
      nextFailureState(
        account({ soLanDangNhapSai: 4, khoaDangNhapDen: at(-60) }),
        NOW,
      ),
    ).toEqual({ failures: 1, lockedUntil: null });
  });

  it('LR-14 bộ đếm đã từ 5 trở lên mà không có khoá (dữ liệu lạ): vẫn khoá, không bỏ sót', () => {
    expect(nextFailureState(account({ soLanDangNhapSai: 7 }), NOW)).toEqual({
      failures: 8,
      lockedUntil: at(FIFTEEN_MINUTES),
    });
  });

  it('LR-15 không sửa tài khoản truyền vào (hàm thuần)', () => {
    const facts = account({ soLanDangNhapSai: 4 });
    const copy = { ...facts };
    nextFailureState(facts, NOW);
    expect(facts).toEqual(copy);
  });
});

describe('needsFailureReset — đăng nhập đúng chỉ ghi khi còn gì để xoá', () => {
  it.each([
    [0, null, false],
    [1, null, true],
    [0, at(-5), true],
    [5, at(900), true],
  ])(
    'LR-16 (DN-01, DN-11) đếm %s, khoá %s ⇒ phải đặt về 0: %s',
    (count, khoa, expected) => {
      expect(
        needsFailureReset(
          account({ soLanDangNhapSai: count, khoaDangNhapDen: khoa }),
        ),
      ).toBe(expected);
    },
  );
});

describe('unverifiedStatusFor — trangThaiMa của đáp ứng chưa xác minh', () => {
  const pending = (overrides: Partial<LoginFacts> = {}) =>
    account({ daXacMinhEmail: false, ...overrides });
  const latest = (
    trangThaiMa: OtpLatestStatus['trangThaiMa'],
  ): OtpLatestStatus => ({
    maXacThucId: '42',
    trangThaiMa,
    hetHanLuc: at(300),
  });

  it.each(['ConHan', 'HetHan', 'DaThuHoi', 'ChuaGui'] as const)(
    'LR-20 (DN-17, DN-37) %s: giữ nguyên mã lần gửi, trạng thái và hạn của hàng OTP',
    (trangThaiMa) => {
      expect(unverifiedStatusFor(pending(), latest(trangThaiMa), NOW)).toEqual({
        maXacThucId: '42',
        trangThaiMa,
        hetHanLuc: at(300),
      });
    },
  );

  it('LR-21 (DN-38) mã bị thu hồi do đặt lại mật khẩu: CanDangKyLai, không còn mã để nhập (id và hạn là null)', () => {
    expect(unverifiedStatusFor(pending(), latest('CanDangKyLai'), NOW)).toEqual(
      { maXacThucId: null, trangThaiMa: 'CanDangKyLai', hetHanLuc: null },
    );
  });

  it('LR-22 chưa có hàng OTP đăng ký nào: CanDangKyLai', () => {
    expect(unverifiedStatusFor(pending(), null, NOW)).toEqual({
      maXacThucId: null,
      trangThaiMa: 'CanDangKyLai',
      hetHanLuc: null,
    });
  });

  it('LR-23 (TECH_DEBT 32) Bệnh nhân quá 24 giờ mà job chưa dọn: CanDangKyLai dù vẫn còn mã trong hạn; biên nửa mở 23:59:59 / 24:00:00', () => {
    const day = UNVERIFIED_ACCOUNT_TTL_MS / 1000;
    const created = pending({ thoiDiemTao: at(-day) });
    // đúng 24:00:00 kể từ lúc tạo ⇒ đã quá hạn
    expect(unverifiedStatusFor(created, latest('ConHan'), NOW)).toEqual({
      maXacThucId: null,
      trangThaiMa: 'CanDangKyLai',
      hetHanLuc: null,
    });
    // còn 1 giây nữa mới tới 24 giờ ⇒ theo hàng OTP
    const almost = pending({ thoiDiemTao: at(-day + 1) });
    expect(unverifiedStatusFor(almost, latest('ConHan'), NOW)).toEqual({
      maXacThucId: '42',
      trangThaiMa: 'ConHan',
      hetHanLuc: at(300),
    });
  });

  it('LR-24 quy tắc 24 giờ chỉ áp cho Bệnh nhân đang hoạt động: nhân sự chưa xác minh (dữ liệu lạ) không bị coi là quá hạn mà đi theo hàng OTP', () => {
    const staff = pending({
      loaiTaiKhoan: 'BacSi',
      thoiDiemTao: at(-3 * 24 * 3600),
    });
    expect(unverifiedStatusFor(staff, latest('ConHan'), NOW)).toMatchObject({
      maXacThucId: '42',
      trangThaiMa: 'ConHan',
    });
    expect(unverifiedStatusFor(staff, null, NOW).trangThaiMa).toBe(
      'CanDangKyLai',
    );
  });
});
