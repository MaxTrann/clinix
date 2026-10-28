import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertBenhNhan } from '../entities/testing/auth-fixtures.js';
import type { VerifiedContext } from '../otp/otp.types.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { at, wrongCodeFor } from '../testing/otp-int-helpers.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import {
  REGISTER_PASSWORD,
  allAccounts,
  allOtpRows,
  registerBody,
} from '../testing/register-int-helpers.js';
import {
  exposedBy,
  expectNoSecrets,
  type Secrets,
} from '../testing/secret-scan.js';
import {
  createVerificationFixture,
  registerPatient,
  resendBody,
  verifyBody,
  type VerificationFixture,
} from '../testing/verification-int-helpers.js';

// Task A6 — mật khẩu, băm, OTP và email KHÔNG lọt vào log, kết quả, lỗi (cả inspect đầy đủ nguyên nhân và stack) ở MỌI nhánh của verify-otp và
// resend-otp (DK-39, DK-40, SE-04), kiểm bằng giá trị THẬT sinh ra trong luồng: mật khẩu của test, băm Argon2id và HMAC đọc từ DB (cả trước lẫn
// sau thao tác, vì xác minh xoá băm khỏi hàng OTP), mã OTP đọc từ thư giả. Mã LG-Vnn là [đề xuất]. Thông tin chẩn đoán (mã tài khoản, mã lần gửi,
// số lần sai) vẫn phải còn: che quá tay làm mất khả năng truy vết cũng là lỗi.
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;
const EMAIL = registerBody().email;

let db: DataSource;
let fx: VerificationFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createVerificationFixture(testDb);
});

const signUp = (overrides: Parameters<typeof registerBody>[0] = {}) =>
  registerPatient(db, fx, overrides);
const logText = (): string => logs.join('\n');

/** Mọi bí mật hiện có: mật khẩu, email, băm mật khẩu, HMAC của mọi hàng OTP, dữ liệu đăng ký còn trong hàng; mã OTP trong mọi thư. */
async function secretsNow(): Promise<Secrets> {
  const accounts = await allAccounts(db);
  const rows = await allOtpRows(db);
  const literals = [
    REGISTER_PASSWORD,
    ...accounts.flatMap((a) => [a.email, a.matKhauBam ?? '']),
    ...rows.flatMap((r) => [r.maBam, r.matKhauBamDangKy ?? '']),
  ].filter((value) => value.length > 5);
  return {
    literals,
    codes: fx.mail.attempts.map((message) => readOtpFromMail(message)),
  };
}

/** Chạy `work`, rồi kiểm kết quả/lỗi và TOÀN BỘ log tích luỹ tới giờ không chứa bí mật nào (đọc bí mật trước và sau thao tác). */
async function scan(where: string, work: () => Promise<unknown>) {
  const before = await secretsNow();
  const exposed = await exposedBy(work);
  const after = await secretsNow();
  const secrets: Secrets = {
    literals: [...new Set([...before.literals, ...after.literals])],
    codes: [...new Set([...before.codes, ...after.codes])],
  };
  expectNoSecrets(`${where}: kết quả/lỗi`, exposed, secrets);
  expectNoSecrets(`${where}: log`, logText(), secrets);
  return exposed;
}

describe('verify-otp: bí mật không lọt ra ngoài', () => {
  it('LG-V01 thành công: kết quả và log sạch; log vẫn ghi mã tài khoản được xác minh (truy vết) nhưng không có email', async () => {
    const r = await signUp();

    await scan('xác minh thành công', () =>
      fx.verification.verifyOtp(verifyBody(r)),
    );

    expect(logText()).toContain(`Tài khoản ${r.taiKhoanId} đã xác minh email`);
    expect(logText()).not.toContain(EMAIL);
  });

  it('LG-V02 nhập sai 5 lần (OTP_SAI ×4, OTP_HET_LUOT), rồi mã đúng bị từ chối: lỗi và log sạch, vẫn còn dòng "nhập sai lần n/5" của mã', async () => {
    const r = await signUp();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await scan(`sai lần ${String(attempt)}`, () =>
        fx.verification.verifyOtp(verifyBody(r, { otp: wrongCodeFor(r.code) })),
      );
    }
    await scan('mã đúng sau khi hết lượt', () =>
      fx.verification.verifyOtp(verifyBody(r)),
    );

    expect(logText()).toContain(`Mã OTP ${r.id} nhập sai lần 1/5`);
    expect(logText()).toContain(`Mã OTP ${r.id} bị thu hồi sau 5 lần nhập sai`);
  });

  it('LG-V03 các nhánh bị từ chối nghiệp vụ: email lạ, sai cặp email–id, hết hạn, bị thay thế, quá 24 giờ, ngưng hoạt động, dữ liệu đăng ký đã xoá — lỗi và log sạch', async () => {
    const a = await signUp({ email: 'a.nguoi@example.com' });
    const b = await signUp({ email: 'b.nguoi@example.com' });
    await scan('email lạ', () =>
      fx.verification.verifyOtp(verifyBody(a, { email: 'la@example.com' })),
    );
    await scan('sai cặp email–id', () =>
      fx.verification.verifyOtp(verifyBody(b, { email: a.email })),
    );

    vi.setSystemTime(at(601));
    await scan('hết hạn', () => fx.verification.verifyOtp(verifyBody(a)));

    vi.setSystemTime(at(0));
    const c = await signUp({ email: 'c.nguoi@example.com' });
    vi.setSystemTime(at(61));
    await signUp({ email: 'c.nguoi@example.com' }); // c bị thay thế
    await scan('bị thay thế', () => fx.verification.verifyOtp(verifyBody(c)));

    const d = await signUp({ email: 'd.nguoi@example.com' });
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: d.taiKhoanId }, { trangThai: 'NgungHoatDong' });
    await scan('ngưng hoạt động', () =>
      fx.verification.verifyOtp(verifyBody(d)),
    );

    const e = await signUp({ email: 'e.nguoi@example.com' });
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: e.taiKhoanId }, { thoiDiemTao: at(-DAY) });
    await scan('quá 24 giờ', () => fx.verification.verifyOtp(verifyBody(e)));

    const f = await signUp({ email: 'f.nguoi@example.com' });
    await fx.otp.transaction(async (manager) => {
      await fx.otp.clearRegistrationData(f.taiKhoanId, { manager });
    });
    await scan('dữ liệu đăng ký đã xoá', () =>
      fx.verification.verifyOtp(verifyBody(f)),
    );
  });

  it('LG-V04 dữ liệu hỏng: tài khoản đã xác minh còn mã sống, hàng không có dữ liệu đăng ký — cảnh báo log chỉ có mã tài khoản, không email/băm/OTP', async () => {
    const g = await signUp({ email: 'g.nguoi@example.com' });
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: g.taiKhoanId }, { daXacMinhEmail: true });
    await scan('đã xác minh mà còn mã sống', () =>
      fx.verification.verifyOtp(verifyBody(g)),
    );
    expect(logText()).toContain(
      `Tài khoản ${g.taiKhoanId} còn mã đăng ký sống`,
    );

    const h = await signUp({ email: 'h.nguoi@example.com' });
    vi.spyOn(fx.otp, 'verify').mockImplementation((async (
      _input: unknown,
      _options: unknown,
      onVerified: (context: VerifiedContext) => Promise<unknown>,
    ) =>
      fx.otp.transaction(async (manager) => {
        const otp = {
          maXacThucId: h.id,
          taiKhoanId: h.taiKhoanId,
          loai: 'DangKy' as const,
          hetHanLuc: at(600),
          registration: null,
        };
        return {
          ok: true,
          otp,
          value: await onVerified({ manager, otp, now: at(0) }),
        };
      })) as never);
    await scan('hàng mã thiếu dữ liệu đăng ký', () =>
      fx.verification.verifyOtp(verifyBody(h)),
    );
    expect(logText()).toContain(`Tài khoản ${h.taiKhoanId}: mã OTP đúng nhưng`);
  });

  it('LG-V05 lỗi hệ thống giữa chừng (hồ sơ bệnh nhân đã tồn tại → 1062; lỗi tạo ví): lỗi và log sạch, không nối lỗi gốc mang tham số câu lệnh; log ERROR có mã tài khoản', async () => {
    const i = await signUp({ email: 'i.nguoi@example.com' });
    await insertBenhNhan(db, i.taiKhoanId);
    const duplicate = await scan('hồ sơ đã tồn tại', () =>
      fx.verification.verifyOtp(verifyBody(i)),
    );
    expect(duplicate).not.toContain('Duplicate entry');
    expect(logText()).toContain(
      `Tài khoản ${i.taiKhoanId} chưa xác minh nhưng đã có hồ sơ bệnh nhân`,
    );

    const j = await signUp({ email: 'j.nguoi@example.com' });
    vi.spyOn(fx.wallets, 'insertEmpty').mockRejectedValueOnce(
      new Error('giả lập lỗi tạo ví'),
    );
    await scan('lỗi tạo ví', () => fx.verification.verifyOtp(verifyBody(j)));
  });
});

describe('resend-otp: bí mật không lọt ra ngoài', () => {
  it('LG-V10 thành công: kết quả (chỉ id + hai mốc) và log sạch; thư gửi lại tới đúng email', async () => {
    const r = await signUp();
    vi.setSystemTime(at(61));

    const exposed = await scan('gửi lại thành công', () =>
      fx.verification.resendOtp(resendBody(r)),
    );

    expect(Object.keys(JSON.parse(exposed) as object).sort()).toEqual([
      'coTheGuiLaiLuc',
      'hetHanLuc',
      'maXacThucId',
    ]);
    expect(fx.mail.sent.at(-1)?.to).toBe(EMAIL);
    expect(logText()).not.toContain(EMAIL);
  });

  it('LG-V11 từ chối: gửi lại quá sớm, hết lượt giờ, email lạ, sai cặp, bị thay thế, ngưng hoạt động, quá 24 giờ, dữ liệu hỏng — lỗi và log sạch', async () => {
    const a = await signUp({ email: 'a.nguoi@example.com' });
    const b = await signUp({ email: 'b.nguoi@example.com' });
    vi.setSystemTime(at(10));
    await scan('quá sớm', () => fx.verification.resendOtp(resendBody(a)));
    await scan('email lạ', () =>
      fx.verification.resendOtp(resendBody(a, { email: 'la@example.com' })),
    );
    await scan('sai cặp', () =>
      fx.verification.resendOtp(resendBody(b, { email: a.email })),
    );

    vi.setSystemTime(at(61));
    const aNew = await fx.verification.resendOtp(resendBody(a));
    await scan('bị thay thế', () => fx.verification.resendOtp(resendBody(a)));

    const c = await signUp({ email: 'c.nguoi@example.com' });
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: c.taiKhoanId }, { trangThai: 'NgungHoatDong' });
    vi.setSystemTime(at(130));
    await scan('ngưng hoạt động', () =>
      fx.verification.resendOtp(resendBody(c)),
    );

    const d = await signUp({ email: 'd.nguoi@example.com' });
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: d.taiKhoanId }, { thoiDiemTao: at(-DAY) });
    vi.setSystemTime(at(200));
    await scan('quá 24 giờ', () => fx.verification.resendOtp(resendBody(d)));

    const e = await signUp({ email: 'e.nguoi@example.com' });
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: e.taiKhoanId }, { daXacMinhEmail: true });
    vi.setSystemTime(at(300));
    await scan('đã xác minh mà còn mã sống', () =>
      fx.verification.resendOtp(resendBody(e)),
    );
    expect(logText()).toContain(
      `Tài khoản ${e.taiKhoanId} còn mã đăng ký sống`,
    );
    expect(aNew.maXacThucId).not.toBe(a.id);
  });

  it('LG-V12 gửi thư lỗi (503 GUI_MAIL_LOI): thân, nguyên nhân, stack và log không có mật khẩu, băm, OTP, email, loại lỗi SMTP; log vẫn ghi mã hàng bị thu hồi', async () => {
    const r = await signUp();
    vi.setSystemTime(at(61));
    fx.mail.failNextWith('AUTH');

    const exposed = await scan('gửi lại lỗi', () =>
      fx.verification.resendOtp(resendBody(r)),
    );

    expect(exposed).toContain('GUI_MAIL_LOI');
    expect(logText()).toMatch(/Mã OTP \d+ gửi lỗi/);
    expect(logText()).toMatch(/Gửi OTP đăng ký lỗi \(AUTH\)/);
    expect(logText()).not.toContain(EMAIL);
  });
});
