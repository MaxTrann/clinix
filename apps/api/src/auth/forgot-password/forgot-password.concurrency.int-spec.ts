import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import {
  createForgotFixture,
  forgotRows,
  lastCode,
  newResetAccount,
  requestAndRead,
  type ForgotFixture,
} from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  WRONG_PASSWORD,
  failureState,
  loginBody,
  newLoginAccount,
} from '../testing/login-int-helpers.js';
import { at, wrongCodeFor } from '../testing/otp-int-helpers.js';
import { barrier } from '../testing/otp-multi-account.js';
import { registerBody } from '../testing/register-int-helpers.js';
import {
  deferred,
  expectRefused,
  registerPatient,
  sleep,
} from '../testing/verification-int-helpers.js';

// Task A11 — các thao tác CÙNG MỘT tài khoản chạy đồng thời trên MySQL thật (nhiều tài khoản khác nhau: forgot-password.multi-account.int-spec.ts).
// Khoá `tai_khoan` xếp hàng mọi bên ghi của một tài khoản, nên mỗi ca khẳng định KẾT QUẢ CUỐI nhất quán, không phải "không lỗi". Test case: QM-06 (đếm sai,
// H8), QM-10 (60 giây khi hai yêu cầu cùng lúc), DN-21, N1. Mã FK-nn là [đề xuất]. Số vòng: FORGOT_CONCURRENCY_ROUNDS (mặc định 8).
const ROUNDS = Number(process.env['FORGOT_CONCURRENCY_ROUNDS'] ?? 8);
const TEST_TIMEOUT = Math.max(30_000, ROUNDS * 5_000); // hạn mỗi test tăng theo số vòng (xem forgot-password.multi-account.int-spec.ts)

let db: DataSource;
let fx: ForgotFixture<FakeMailService>;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createForgotFixture(testDb);
});

/** Chạy mọi việc ĐỒNG THỜI qua một rào chắn; trả mã kết quả của từng việc: 'ok', mã lỗi nghiệp vụ, hoặc LOI_LA (lỗi ngoài dự kiến, nên làm test đỏ). */
async function race(works: (() => Promise<unknown>)[]): Promise<string[]> {
  const gate = barrier(works.length);
  const settled = await Promise.allSettled(
    works.map(async (work) => {
      await gate();
      return work();
    }),
  );
  return settled.map((result) =>
    result.status === 'fulfilled'
      ? 'ok'
      : result.reason instanceof AppException
        ? result.reason.maLoi
        : `LOI_LA: ${String(result.reason)}`,
  );
}
const count = (codes: string[], code: string) =>
  codes.filter((one) => one === code).length;

describe('cùng một tài khoản, đồng thời', { timeout: TEST_TIMEOUT }, () => {
  it(`FK-01 QM-10 hai yêu cầu cấp mã cùng lúc (${String(ROUNDS)} vòng): đúng MỘT qua, một bị GUI_LAI_QUA_SOM; một hàng OTP, một thư`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newResetAccount(db, 'verified');

      const codes = await race([
        () => fx.forgot.requestCode(account.email),
        () => fx.forgot.requestCode(account.email),
      ]);

      expect(codes.sort(), `vòng ${String(round)}`).toEqual([
        'GUI_LAI_QUA_SOM',
        'ok',
      ]);
      expect(await forgotRows(db, account.taiKhoanId)).toHaveLength(1);
      expect(
        fx.mail.attempts.filter((m) => m.to === account.email),
      ).toHaveLength(1);
    }
  });

  it('FK-02 QM-06 mười lần nhập SAI cùng lúc vào một mã: không mất lần đếm (đúng 4 OTP_SAI rồi OTP_HET_LUOT), bộ đếm = 5, mã bị thu hồi đúng một lần', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newResetAccount(db, 'verified');
      const { code } = await requestAndRead(fx, account.email);

      const codes = await race(
        Array.from(
          { length: 10 },
          () => () => fx.forgot.verifyCode(account.email, wrongCodeFor(code)),
        ),
      );

      expect(count(codes, 'OTP_SAI'), `vòng ${String(round)}`).toBe(4);
      expect(count(codes, 'OTP_HET_LUOT'), `vòng ${String(round)}`).toBe(6);
      const [row] = await forgotRows(db, account.taiKhoanId);
      expect(row?.soLanNhapSai).toBe(5);
      expect(row?.thuHoiLuc).not.toBeNull();
    }
  });

  it('FK-03 hai lần xác minh ĐÚNG cùng lúc: cả hai qua (không tiêu thụ mã), mã vẫn chưa dùng, không bộ đếm sai', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newResetAccount(db, 'verified');
      const { code } = await requestAndRead(fx, account.email);

      const codes = await race([
        () => fx.forgot.verifyCode(account.email, code),
        () => fx.forgot.verifyCode(account.email, code),
      ]);

      expect(codes, `vòng ${String(round)}`).toEqual(['ok', 'ok']);
      expect((await forgotRows(db, account.taiKhoanId))[0]).toMatchObject({
        daDungLuc: null,
        thuHoiLuc: null,
        soLanNhapSai: 0,
      });
    }
  });

  it('FK-04 DN-21 cấp mã đồng thời với đăng nhập SAI của cùng tài khoản: cả hai chạy tới nơi, bộ đếm đăng nhập đúng 1, đúng một hàng OTP; hai bên không giẫm lên nhau', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newLoginAccount(db);

      const codes = await race([
        () => fx.forgot.requestCode(account.email),
        () => fx.login.login(loginBody(account, WRONG_PASSWORD)),
      ]);

      expect(codes.sort(), `vòng ${String(round)}`).toEqual([
        'DANG_NHAP_SAI',
        'ok',
      ]);
      expect(
        (await failureState(db, account.taiKhoanId)).soLanDangNhapSai,
      ).toBe(1);
      expect(await forgotRows(db, account.taiKhoanId)).toHaveLength(1);
    }
  });

  it('FK-05 cấp mã QuenMatKhau đồng thời với đăng ký lại (DangKy) của cùng email chưa xác minh: cả hai qua; mã DangKy cũ chỉ bị mã DangKy mới thay, mã QuenMatKhau không bị đụng', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const email = `dua.dang.ky.${String(round)}@example.com`;
      vi.setSystemTime(at(0));
      const registered = await registerPatient(db, fx, { email });
      vi.setSystemTime(at(61));

      const codes = await race([
        () => fx.forgot.requestCode(email),
        () => fx.service.register(registerBody({ email })),
      ]);

      expect(codes, `vòng ${String(round)}`).toEqual(['ok', 'ok']);
      const registration = await forgotRows(
        db,
        registered.taiKhoanId,
        'DangKy',
      );
      expect(registration).toHaveLength(2);
      expect(registration[0]?.thuHoiLuc).toEqual(at(61));
      expect(registration[1]).toMatchObject({
        daGuiLuc: at(61),
        thuHoiLuc: null,
      });
      expect((await forgotRows(db, registered.taiKhoanId))[0]).toMatchObject({
        daGuiLuc: at(61),
        thuHoiLuc: null,
      });
    }
  });

  it('FK-06 xác minh mã cũ đồng thời với cấp mã mới: kết quả là ok HOẶC OTP_SAI (không lỗi lạ); xong cả hai thì hàng cũ bị thu hồi, hàng mới đã gửi, và mã mới dùng được', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newResetAccount(db, 'verified');
      vi.setSystemTime(at(0));
      const first = await requestAndRead(fx, account.email);
      vi.setSystemTime(at(61));

      const [verified, resent] = await race([
        () => fx.forgot.verifyCode(account.email, first.code),
        () => fx.forgot.requestCode(account.email),
      ]);

      expect(['ok', 'OTP_SAI'], `vòng ${String(round)}`).toContain(verified);
      expect(resent).toBe('ok');
      const [oldRow, newRow] = await forgotRows(db, account.taiKhoanId);
      expect(oldRow?.thuHoiLuc).toEqual(at(61));
      expect(newRow).toMatchObject({ daGuiLuc: at(61), thuHoiLuc: null });
      expect(
        (await fx.forgot.verifyCode(account.email, lastCode(fx.mail)))
          .resetToken,
      ).not.toBe('');
    }
  });

  // Hai ca dưới khoá được việc KIỂM LẠI DƯỚI KHOÁ (cả chiều "bên kia đổi trạng thái" lẫn "bên kia xoá"): một giao dịch khác giữ khoá hàng tai_khoan và
  // thay đổi nó, yêu cầu cấp mã phải CHỜ khoá rồi thấy dữ liệu MỚI. Nếu đọc lại không khoá, yêu cầu thấy bản cũ, chỉ chờ ở `otp.issue` và cấp mã nhầm (FK-07)
  // hoặc nổ lỗi hệ thống (FK-08).
  it('FK-07 tài khoản vừa bị đưa về ChoKichHoat bởi giao dịch khác đang giữ khoá: yêu cầu cấp mã CHỜ khoá rồi thấy trạng thái mới, từ chối 403, không OTP, không thư', async () => {
    const account = await newResetAccount(db, 'staff');
    const acquired = deferred();
    const release = deferred();
    const holder = db.transaction('READ COMMITTED', async (em) => {
      await em.update(
        TaiKhoan,
        { taiKhoanId: account.taiKhoanId },
        { trangThai: 'ChoKichHoat', matKhauBam: null },
      );
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;
    let settled = false;
    const request = fx.forgot.requestCode(account.email).finally(() => {
      settled = true;
    });
    request.catch(() => undefined); // đã được kiểm ở expectRefused bên dưới
    await sleep(300);
    expect(settled, 'phải chờ khoá của bên đang giữ').toBe(false);

    release.resolve();
    await holder;
    await expectRefused(request, 403, 'TAI_KHOAN_CHUA_KICH_HOAT');
    expect(await forgotRows(db, account.taiKhoanId)).toHaveLength(0);
    expect(fx.mail.attempts).toHaveLength(0);
  });

  it('FK-08 tài khoản vừa bị xoá bởi giao dịch khác đang giữ khoá: yêu cầu cấp mã CHỜ khoá rồi trả 404 EMAIL_CHUA_DANG_KY (không phải lỗi hệ thống), không OTP, không thư', async () => {
    const account = await newResetAccount(db, 'verified');
    const acquired = deferred();
    const release = deferred();
    const holder = db.transaction('READ COMMITTED', async (em) => {
      await em.delete(TaiKhoan, { taiKhoanId: account.taiKhoanId });
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;
    const request = fx.forgot.requestCode(account.email);
    request.catch(() => undefined);
    await sleep(300);

    release.resolve();
    await holder;
    await expectRefused(request, 404, 'EMAIL_CHUA_DANG_KY');
    expect(await db.getRepository(MaXacThuc).count()).toBe(0);
    expect(fx.mail.attempts).toHaveLength(0);
  });
});
