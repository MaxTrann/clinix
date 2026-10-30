import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  createForgotFixture,
  newResetAccount,
  type ForgotFixture,
} from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { at, wrongCodeFor } from '../testing/otp-int-helpers.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import {
  exposedBy,
  expectNoSecrets,
  type Secrets,
} from '../testing/secret-scan.js';
import { TEST_AUTH_ENV } from '../testing/auth-test-env.js';

// Task A11 — email, mật khẩu, băm, OTP, resetToken và khoá KHÔNG lọt vào log, kết quả, lỗi (inspect đầy đủ nguyên nhân và stack) ở MỌI nhánh của
// forgot-password, resend-otp và verify-otp (SE-04), kiểm bằng giá trị THẬT sinh ra trong luồng: email và băm đọc từ DB, HMAC của mọi hàng OTP, mã OTP
// đọc từ thư giả, resetToken (cả ba phần) và khoá ký. Quét lời gọi `Logger` THÔ (trước bộ che P5); stdout/stderr và thân phản hồi HTTP: e2e.
// Ngoại lệ DUY NHẤT được phép: resetToken nằm trong KẾT QUẢ của verify-otp thành công (đó là thứ nó trả về), nhưng vẫn không được vào log. Mã FL-nn là [đề xuất].
// Thông tin chẩn đoán (mã tài khoản, mã hàng OTP, số lần sai, loại lỗi gửi thư) vẫn phải còn: che quá tay cũng là lỗi.
let db: DataSource;
let fx: ForgotFixture<FakeMailService>;
let logs: string[];
let tokens: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  tokens = [];
  fx = createForgotFixture(testDb);
});

const logText = (): string => logs.join('\n');

async function secretsNow(): Promise<Secrets> {
  const accounts = await db.getRepository(TaiKhoan).find();
  const rows = await db.getRepository(MaXacThuc).find();
  const literals = [
    TEST_AUTH_ENV.JWT_RESET_SECRET,
    TEST_AUTH_ENV.JWT_ACCESS_SECRET,
    TEST_AUTH_ENV.OTP_HMAC_SECRET,
    ...accounts.flatMap((a) => [a.email, a.matKhauBam ?? '']),
    ...rows.map((r) => r.maBam),
  ].filter((value) => value.length > 5);
  return {
    literals,
    codes: fx.mail.attempts.map((message) => readOtpFromMail(message)),
  };
}

/** Chạy `work` rồi kiểm kết quả/lỗi và TOÀN BỘ log tích luỹ tới giờ không chứa bí mật nào. `tokenInResult`: resetToken được phép nằm trong kết quả (chỉ ở đó). */
async function scan(
  where: string,
  work: () => Promise<unknown>,
  { tokenInResult = false } = {},
): Promise<string> {
  const before = await secretsNow();
  const exposed = await exposedBy(work);
  const after = await secretsNow();
  const secrets: Secrets = {
    literals: [...new Set([...before.literals, ...after.literals])],
    codes: [...new Set([...before.codes, ...after.codes])],
  };
  const tokenParts = tokens.flatMap((token) => [token, ...token.split('.')]);
  expectNoSecrets(
    `${where}: kết quả/lỗi`,
    exposed,
    tokenInResult
      ? secrets
      : { ...secrets, literals: [...secrets.literals, ...tokenParts] },
  );
  expectNoSecrets(`${where}: log`, logText(), {
    ...secrets,
    literals: [...secrets.literals, ...tokenParts],
  });
  return exposed;
}

describe('cấp mã (forgot-password, resend-otp): bí mật không lọt ra ngoài', () => {
  it('FL-01 thành công: kết quả (chỉ hai mốc) và log sạch; log vẫn ghi mã hàng OTP đã gửi (truy vết) nhưng không có email', async () => {
    const account = await newResetAccount(db, 'verified');

    const exposed = await scan('cấp mã', () =>
      fx.forgot.requestCode(account.email),
    );

    expect(Object.keys(JSON.parse(exposed) as object).sort()).toEqual([
      'coTheGuiLaiLuc',
      'hetHanLuc',
    ]);
    expect(logText()).toMatch(/Mã OTP \d+ đã gửi/);
    expect(logText()).not.toContain(account.email);
    expect(fx.mail.sent.at(-1)?.to).toBe(account.email);
  });

  it('FL-02 các nhánh bị từ chối: email lạ, chưa kích hoạt, mật khẩu NULL, chưa xác minh quá 24 giờ, gửi lại quá sớm, hết lượt giờ — lỗi và log sạch; log ghi mã tài khoản bị từ chối', async () => {
    const pending = await newResetAccount(db, 'pending-staff');
    const noPassword = await newResetAccount(db, 'suspended-no-password');
    const expired = await newResetAccount(db, 'expired-unverified');
    const busy = await newResetAccount(db, 'verified');

    await scan('email lạ', () => fx.forgot.requestCode('la@example.com'));
    await scan('chưa kích hoạt', () => fx.forgot.requestCode(pending.email));
    await scan('mật khẩu NULL', () => fx.forgot.requestCode(noPassword.email));
    await scan('quá 24 giờ', () => fx.forgot.requestCode(expired.email));
    await fx.forgot.requestCode(busy.email);
    vi.setSystemTime(at(10));
    await scan('quá sớm', () => fx.forgot.requestCode(busy.email));
    for (const seconds of [70, 130, 190, 250]) {
      vi.setSystemTime(at(seconds));
      await fx.forgot.requestCode(busy.email);
    }
    vi.setSystemTime(at(300));
    await scan('hết lượt giờ', () => fx.forgot.requestCode(busy.email));

    for (const account of [pending, noPassword, expired]) {
      expect(logText()).toContain(
        `Tài khoản ${account.taiKhoanId} không được cấp OTP quên mật khẩu`,
      );
    }
  });

  it('FL-03 gửi thư lỗi (503 GUI_MAIL_LOI): thân, nguyên nhân, stack và log không có email, OTP, loại lỗi SMTP trong thân; log vẫn ghi loại lỗi và mã hàng bị thu hồi', async () => {
    const account = await newResetAccount(db, 'verified');
    fx.mail.failNextWith('AUTH');

    const exposed = await scan('gửi lỗi', () =>
      fx.forgot.requestCode(account.email),
    );

    expect(exposed).toContain('GUI_MAIL_LOI');
    expect(logText()).toMatch(/Mã OTP \d+ gửi lỗi/);
    expect(logText()).toMatch(/Gửi OTP quên mật khẩu lỗi \(AUTH\)/);
  });
});

describe('verify-otp: bí mật không lọt ra ngoài', () => {
  it('FL-04 nhập sai đủ 5 lần rồi mã đúng bị từ chối, email lạ, chưa từng có mã, hết hạn: lỗi và log sạch; log vẫn ghi "nhập sai lần n/5" và mã hàng', async () => {
    const account = await newResetAccount(db, 'verified');
    await fx.forgot.requestCode(account.email);
    const code = readOtpFromMail(fx.mail.attempts[0] ?? ({} as never));
    const idle = await newResetAccount(db, 'staff');

    await scan('email lạ', () => fx.forgot.verifyCode('la@example.com', code));
    await scan('chưa từng có mã', () => fx.forgot.verifyCode(idle.email, code));
    for (let attempt = 1; attempt <= 5; attempt++) {
      await scan(`sai lần ${String(attempt)}`, () =>
        fx.forgot.verifyCode(account.email, wrongCodeFor(code)),
      );
    }
    await scan('mã đúng sau khi hết lượt', () =>
      fx.forgot.verifyCode(account.email, code),
    );
    vi.setSystemTime(at(61));
    await fx.forgot.requestCode(account.email);
    vi.setSystemTime(at(61 + 601));
    await scan('hết hạn', () => fx.forgot.verifyCode(account.email, code));

    expect(logText()).toMatch(/Mã OTP \d+ nhập sai lần 1\/5/);
    expect(logText()).toMatch(/Mã OTP \d+ bị thu hồi sau 5 lần nhập sai/);
  });

  it('FL-05 thành công: kết quả CHỈ có resetToken và hạn, token KHÔNG nằm trong log (cả ba phần của JWT); log ghi mã tài khoản và mã xác thực nhưng không có email, OTP, khoá', async () => {
    const account = await newResetAccount(db, 'verified');
    await fx.forgot.requestCode(account.email);
    const code = readOtpFromMail(fx.mail.attempts[0] ?? ({} as never));

    const exposed = await scan(
      'xác minh đúng',
      async () => {
        const result = await fx.forgot.verifyCode(account.email, code);
        tokens.push(result.resetToken);
        return result;
      },
      { tokenInResult: true },
    );

    const body = JSON.parse(exposed) as { resetToken: string };
    expect(Object.keys(body).sort()).toEqual(['hetHanLuc', 'resetToken']);
    expect(body.resetToken).toBe(tokens[0]);
    expect(logText()).toContain(
      `Tài khoản ${account.taiKhoanId} xác minh OTP quên mật khẩu đúng`,
    );
    expectNoSecrets('log sau khi có token', logText(), {
      literals: [tokens[0] ?? '', ...(tokens[0] ?? '').split('.')],
      codes: [code],
    });
    expect(logText()).not.toContain(account.email);
  });
});
