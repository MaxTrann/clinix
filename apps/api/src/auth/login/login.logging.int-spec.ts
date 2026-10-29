import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { LOGIN_MAX_FAILURES } from '../auth.constants.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  createLoginFixture,
  loginBody,
  newLoginAccount,
  sessionRowsOf,
  setFailureState,
  type LoginFixture,
} from '../testing/login-int-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import {
  REGISTER_PASSWORD,
  allAccounts,
} from '../testing/register-int-helpers.js';
import {
  exposedBy,
  expectNoSecrets,
  type Secrets,
} from '../testing/secret-scan.js';
import { registerPatient } from '../testing/verification-int-helpers.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { captureLogsByLevel, allLines } from '../testing/log-levels.js';

// Task A8 — mật khẩu, băm, token, email và OTP KHÔNG lọt vào log, kết quả, lỗi ở MỌI nhánh đăng nhập (SE-04, DN-23), kiểm bằng giá trị THẬT sinh ra
// trong luồng: mật khẩu của test, băm Argon2id và băm refresh đọc từ DB, access/refresh token vừa cấp, email, mã OTP đọc từ thư giả. Thông tin chẩn
// đoán (mã tài khoản, số lần sai, mã phiên) vẫn phải còn: che quá tay làm mất khả năng truy vết cũng là lỗi. Mã LL-nn là [đề xuất].
let db: DataSource;
let fx: LoginFixture<FakeMailService>;
let levels: ReturnType<typeof captureLogsByLevel>;
const issuedSecrets: string[] = [];

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createLoginFixture(testDb);
  levels = captureLogsByLevel(); // thay bộ gom gộp của hook bằng bộ chia theo mức
  issuedSecrets.length = 0;
});

const logText = (): string => allLines(levels).join('\n');

/** Mọi bí mật hiện có: mật khẩu, email, băm mật khẩu, băm refresh của mọi phiên, token đã cấp; mã OTP trong mọi thư. */
async function secretsNow(): Promise<Secrets> {
  const accounts = await allAccounts(db);
  const sessions = (
    await Promise.all(accounts.map((a) => sessionRowsOf(db, a.taiKhoanId)))
  ).flat();
  return {
    literals: [
      LOGIN_PASSWORD,
      WRONG_PASSWORD,
      REGISTER_PASSWORD,
      'khong.co@example.com',
      ...accounts.flatMap((a) => [a.email, a.matKhauBam ?? '']),
      ...sessions.map((s) => s.refreshTokenBam),
      ...issuedSecrets,
    ].filter((value) => value.length > 5),
    codes: fx.mail.attempts.map((message) => readOtpFromMail(message)),
  };
}

/** Chạy `work`, rồi kiểm kết quả/lỗi (nếu `checkResult`) và TOÀN BỘ log tích luỹ tới giờ không chứa bí mật nào. */
async function scan(
  where: string,
  work: () => Promise<unknown>,
  checkResult = true,
): Promise<string> {
  const before = await secretsNow();
  const exposed = await exposedBy(work);
  const after = await secretsNow();
  const secrets: Secrets = {
    literals: [...new Set([...before.literals, ...after.literals])],
    codes: [...new Set([...before.codes, ...after.codes])],
  };
  if (checkResult) expectNoSecrets(`${where}: kết quả/lỗi`, exposed, secrets);
  expectNoSecrets(`${where}: log`, logText(), secrets);
  return exposed;
}

describe('đăng nhập: bí mật không lọt ra ngoài', () => {
  it('LL-01 sai 5 lần rồi bị khoá, rồi thử khi đang khoá: lỗi và log sạch; log vẫn ghi mã tài khoản, số lần sai và việc khoá', async () => {
    const account = await newLoginAccount(db);
    for (let attempt = 1; attempt <= LOGIN_MAX_FAILURES; attempt++) {
      await scan(`sai lần ${String(attempt)}`, () =>
        fx.login.login(loginBody(account, WRONG_PASSWORD)),
      );
    }
    await scan('đang khoá, mật khẩu đúng', () =>
      fx.login.login(loginBody(account)),
    );

    const id = account.taiKhoanId;
    expect(logText()).toContain(`Tài khoản ${id} đăng nhập sai lần 1/5`);
    expect(logText()).toContain(`Tài khoản ${id} đăng nhập sai lần 5/5`);
    expect(logText()).toContain(
      `Tài khoản ${id} bị khoá đăng nhập tạm thời sau 5 lần sai liên tiếp`,
    );
    expect(logText()).toContain(
      `Tài khoản ${id} bị từ chối đăng nhập: tài khoản đang bị khoá đăng nhập tạm thời`,
    );
    expect(logText()).not.toContain(account.email);
  });

  it('LL-02 ngưng hoạt động và chưa kích hoạt: lỗi và log sạch; log ghi mã tài khoản và lý do cố định', async () => {
    const suspended = await newLoginAccount(db, { trangThai: 'NgungHoatDong' });
    const pending = await newLoginAccount(db, {
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
      daXacMinhEmail: false,
    });

    await scan('ngưng hoạt động', () => fx.login.login(loginBody(suspended)));
    await scan('chưa kích hoạt', () => fx.login.login(loginBody(pending)));

    expect(logText()).toContain(
      `Tài khoản ${suspended.taiKhoanId} bị từ chối đăng nhập: tài khoản đã bị ngưng hoạt động`,
    );
    expect(logText()).toContain(
      `Tài khoản ${pending.taiKhoanId} bị từ chối đăng nhập: tài khoản nhân sự chưa kích hoạt`,
    );
  });

  it('LL-03 email không tồn tại: lỗi sạch, và KHÔNG ghi gì vào log (không có định danh để ghi; không bao giờ ghi email)', async () => {
    await newLoginAccount(db);

    await scan('email lạ', () =>
      fx.login.login({
        email: 'khong.co@example.com',
        matKhau: WRONG_PASSWORD,
      }),
    );

    expect(allLines(levels)).toEqual([]);
  });

  it('LL-04 thành công: log sạch (không token, băm, mật khẩu, email); log ghi mã tài khoản và mã phiên', async () => {
    const account = await newLoginAccount(db);

    const { session } = await fx.login.login(loginBody(account));
    issuedSecrets.push(session.accessToken, session.refreshToken);
    await scan('thành công', () => Promise.resolve('đã đăng nhập'));

    expect(logText()).toContain(
      `Tài khoản ${account.taiKhoanId} đăng nhập, phiên ${session.sessionId}`,
    );
  });

  it('LL-05 đúng mật khẩu nhưng chưa xác minh: lỗi và log sạch (kể cả mã OTP đã gửi lúc đăng ký); log ghi mã tài khoản', async () => {
    const registered = await registerPatient(db, fx);

    await scan('chưa xác minh', () =>
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
    );

    expect(logText()).toContain(
      `Tài khoản ${registered.taiKhoanId} đăng nhập đúng mật khẩu nhưng chưa xác minh email: không tạo phiên`,
    );
  });

  it('LL-06 nhân sự chưa xác minh (dữ liệu không nhất quán): dòng ERROR chỉ có mã tài khoản, không email', async () => {
    const staff = await newLoginAccount(db, {
      loaiTaiKhoan: 'BacSi',
      daXacMinhEmail: false,
    });

    await scan('nhân sự chưa xác minh', () => fx.login.login(loginBody(staff)));

    expect(levels.error).toHaveLength(1);
    expect(levels.error[0]).toContain(`Tài khoản ${staff.taiKhoanId}`);
  });

  it('LL-07 băm lưu trong DB bị hỏng: coi như sai mật khẩu, log chỉ có câu cố định (không có chuỗi băm), lỗi sạch', async () => {
    const account = await newLoginAccount(db, {
      matKhauBam: '$argon2id$v=19$m=19456,p=1,t=2$hong$hong-khong-doc-duoc',
    });
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });

    await scan('băm hỏng', () => fx.login.login(loginBody(account)));

    expect(logText()).toContain('Không đọc được chuỗi băm mật khẩu đã lưu');
    expect(logText()).not.toContain('hong-khong-doc-duoc');
  });

  it('LL-08 (DN-23) mọi nhánh khác: một chuỗi đăng nhập hỗn hợp, đồng hồ giả chạy qua hết khoá; log toàn phiên sạch', async () => {
    const account = await newLoginAccount(db);
    for (let i = 0; i < 5; i++) {
      await scan('sai', () =>
        fx.login.login(loginBody(account, WRONG_PASSWORD)),
      );
    }
    vi.setSystemTime(at(15 * 60 + 1));
    const { session } = await fx.login.login(loginBody(account));
    issuedSecrets.push(session.accessToken, session.refreshToken);
    await scan('sau khi hết khoá', () => Promise.resolve('xong'));

    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: account.taiKhoanId })
      ).soLanDangNhapSai,
    ).toBe(0);
  });
});
