import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { currentSecond } from '../otp/otp-time.js';
import { TEST_AUTH_ENV } from '../testing/auth-test-env.js';
import { newResetAccount } from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  LOGIN_PASSWORD,
  newLoginAccount,
} from '../testing/login-int-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import {
  NEW_PASSWORD,
  createResetFixture,
  resetInput,
  tokenFor,
  type ResetFixture,
} from '../testing/reset-password-int-helpers.js';
import {
  exposedBy,
  expectNoSecrets,
  type Secrets,
} from '../testing/secret-scan.js';

// Task A12 — mật khẩu mới, mật khẩu cũ, băm (cũ và mới), resetToken (cả ba phần), OTP, email và khoá KHÔNG lọt vào log, kết quả hay lỗi (inspect đủ nguyên
// nhân và stack) ở MỌI nhánh của reset-password (SE-04), kiểm bằng giá trị THẬT: băm và email đọc từ DB trước VÀ sau, mã OTP đọc từ thư giả. Quét lời gọi
// `Logger` THÔ (trước bộ che P5); stdout/stderr và thân phản hồi HTTP: test/auth-reset-password.e2e-spec.ts. Thông tin chẩn đoán (mã tài khoản, mã xác
// thực, số phiên/mã bị thu hồi) vẫn phải còn: che quá tay cũng là lỗi. Mã MK-Lnn là [đề xuất].
let db: DataSource;
let fx: ResetFixture<FakeMailService>;
let logs: string[];
const tokens: string[] = [];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  tokens.length = 0;
  fx = createResetFixture(testDb);
});

async function secretsNow(): Promise<Secrets> {
  const accounts = await db.getRepository(TaiKhoan).find();
  const rows = await db.getRepository(MaXacThuc).find();
  return {
    literals: [
      NEW_PASSWORD,
      LOGIN_PASSWORD,
      TEST_AUTH_ENV.JWT_RESET_SECRET,
      TEST_AUTH_ENV.JWT_ACCESS_SECRET,
      TEST_AUTH_ENV.OTP_HMAC_SECRET,
      ...accounts.flatMap((a) => [a.email, a.matKhauBam ?? '']),
      ...rows.map((r) => r.maBam),
      ...tokens.flatMap((token) => [token, ...token.split('.')]),
    ].filter((value) => value.length > 5),
    codes: fx.mail.attempts.map((message) => readOtpFromMail(message)),
  };
}

/** Chạy `work`, rồi kiểm kết quả/lỗi và TOÀN BỘ log tích luỹ tới giờ không chứa bí mật nào (bí mật lấy cả trước lẫn sau, để có băm cũ và băm mới). */
async function scan(
  where: string,
  work: () => Promise<unknown>,
): Promise<string> {
  const before = await secretsNow();
  const exposed = await exposedBy(work);
  const after = await secretsNow();
  const secrets: Secrets = {
    literals: [...new Set([...before.literals, ...after.literals])],
    codes: [...new Set([...before.codes, ...after.codes])],
  };
  expectNoSecrets(`${where}: kết quả/lỗi`, exposed, secrets);
  expectNoSecrets(`${where}: log`, logs.join('\n'), secrets);
  return exposed;
}

const tokenOf = async (email: string): Promise<string> => {
  const token = await tokenFor(fx, email);
  tokens.push(token);
  return token;
};

it('MK-L01 thành công: kết quả CHỈ có hai cờ (không mã tài khoản, không băm); log ghi mã tài khoản, mã xác thực, số phiên và mã đăng ký bị thu hồi', async () => {
  const account = await newLoginAccount(db);
  await fx.sessionService.create(account.taiKhoanId);
  const token = await tokenOf(account.email);

  const exposed = await scan('thành công', () =>
    fx.reset.reset(resetInput(token)),
  );

  const body = JSON.parse(exposed) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(['canDangKyLai', 'taiKhoanNgung']);
  expect(
    exposed,
    'thân không có số nào: không mã tài khoản, mã xác thực hay mốc',
  ).not.toMatch(/\d/);
  expect(logs.join('\n')).toMatch(
    new RegExp(
      `Tài khoản ${account.taiKhoanId} đặt lại mật khẩu \\(mã xác thực \\d+\\): thu hồi 1 phiên, 0 mã đăng ký`,
    ),
  );
});

it('MK-L02 mọi nhánh bị từ chối: token rác, token dùng lại, token bị "Gửi lại mã" thay, token sai chủ, quá 24 giờ, chưa kích hoạt, tài khoản bị xoá — lỗi và log sạch; log có mã tài khoản ở các nhánh có tài khoản', async () => {
  const used = await newResetAccount(db, 'verified');
  const usedToken = await tokenOf(used.email);
  await fx.reset.reset(resetInput(usedToken));
  const replaced = await newResetAccount(db, 'verified');
  const replacedToken = await tokenOf(replaced.email);
  const expiring = await newResetAccount(db, 'unverified', {
    thoiDiemTao: at(-86_400 + 10),
  });
  const expiringToken = await tokenOf(expiring.email);
  const staff = await newResetAccount(db, 'staff');
  const staffToken = await tokenOf(staff.email);
  await db
    .getRepository(TaiKhoan)
    .update(
      { taiKhoanId: staff.taiKhoanId },
      { trangThai: 'ChoKichHoat', matKhauBam: null },
    );
  const gone = await newResetAccount(db, 'verified');
  const goneToken = await tokenOf(gone.email);
  const victim = await newResetAccount(db, 'verified');
  await tokenOf(victim.email);
  const [victimRow] = await db
    .getRepository(MaXacThuc)
    .findBy({ taiKhoanId: victim.taiKhoanId });
  const forged = (
    await fx.resetTokens.sign({
      taiKhoanId: used.taiKhoanId,
      maXacThucId: victimRow?.maXacThucId ?? '',
      issuedAt: currentSecond(),
    })
  ).token;
  tokens.push(forged);
  vi.setSystemTime(at(61));
  await fx.forgot.requestCode(replaced.email);
  await db.getRepository(MaXacThuc).delete({ taiKhoanId: gone.taiKhoanId });
  await db.getRepository(TaiKhoan).delete({ taiKhoanId: gone.taiKhoanId });

  for (const [where, token] of [
    ['token rác', 'khong.phai.jwt'],
    ['dùng lại', usedToken],
    ['bị thay', replacedToken],
    ['sai chủ', forged],
    ['quá 24 giờ', expiringToken],
    ['chưa kích hoạt', staffToken],
    ['đã bị xoá', goneToken],
  ] as const) {
    const exposed = await scan(where, () => fx.reset.reset(resetInput(token)));
    expect(exposed, where).toMatch(
      /RESET_TOKEN_HET_HIEU_LUC|EMAIL_CHUA_DANG_KY|TAI_KHOAN_CHUA_KICH_HOAT/,
    );
  }

  for (const account of [used, replaced, expiring, staff, gone]) {
    expect(logs.join('\n')).toContain(`Tài khoản ${account.taiKhoanId}`);
  }
});
