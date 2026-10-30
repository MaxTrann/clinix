import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  forgotRows,
  lastCode,
  newResetAccount,
} from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  LOGIN_PASSWORD,
  loginBody,
  newLoginAccount,
  sessionRowsOf,
} from '../testing/login-int-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import { registerBody } from '../testing/register-int-helpers.js';
import {
  NEW_PASSWORD,
  createResetFixture,
  resetInput,
  together,
  tokenFor,
  type ResetFixture,
} from '../testing/reset-password-int-helpers.js';
import {
  deferred,
  expectRefused,
  registerPatient,
  sleep,
  verifyBody,
} from '../testing/verification-int-helpers.js';

// Task A12 — đặt mật khẩu ĐỒNG THỜI với thao tác khác của CÙNG MỘT tài khoản, trên MySQL thật (nhiều tài khoản khác nhau: reset-password.multi-account.int-spec.ts).
// Khoá hàng `tai_khoan` xếp hàng mọi bên ghi của một tài khoản. Mỗi cặp được khoá CẢ HAI CHIỀU bằng đua THẬT (bài học AI-BUG-017): một giao dịch khác GIỮ
// khoá hàng tai_khoan để ép thứ tự "A12 trước" / "bên kia trước", cộng một ca thả tự do qua rào chắn nhiều vòng. Test case: QM-21 (H8), QM-13, QM-16,
// QM-17, QM-18. Mã MKK-nn là [đề xuất]. Số vòng: RESET_CONCURRENCY_ROUNDS (mặc định 8).
const ROUNDS = Number(process.env['RESET_CONCURRENCY_ROUNDS'] ?? 8);
const TEST_TIMEOUT = Math.max(30_000, ROUNDS * 6_000); // hạn mỗi test tăng theo số vòng
const EXPIRED = 'RESET_TOKEN_HET_HIEU_LUC';

let db: DataSource;
let fx: ResetFixture<FakeMailService>;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createResetFixture(testDb);
});

const reset = (token: string, password: string = NEW_PASSWORD) =>
  fx.reset.reset(resetInput(token, password));
const passwordIs = async (taiKhoanId: string, plain: string) =>
  fx.hasher.verify(
    (await db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId }))
      .matKhauBam ?? '',
    plain,
  );
const count = (codes: string[], code: string) =>
  codes.filter((one) => one === code).length;

/**
 * Giữ khoá hàng tai_khoan trong một giao dịch khác, chạy `first` khi đang giữ (nó phải chờ khoá), thả khoá rồi để `second` chạy SAU khi `first` đã lấy được
 * khoá; trả kết quả của cả hai. Dùng để ép đúng thứ tự "first rồi second" bằng chờ khoá thật, không phải spy.
 */
async function inOrder(
  taiKhoanId: string,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
): Promise<[string, string]> {
  const acquired = deferred();
  const release = deferred();
  const holder = db.transaction('READ COMMITTED', async (em) => {
    await em.query(
      'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
      [taiKhoanId],
    );
    acquired.resolve();
    await release.promise;
  });
  await acquired.promise;
  const firstDone = together([first]);
  await sleep(150); // `first` đã tới chỗ chờ khoá
  release.resolve();
  await holder;
  await sleep(50); // `first` đã nhận khoá (giữ tới khi commit) trước khi `second` xếp hàng
  const [secondCode] = await together([second]);
  const [firstCode] = await firstDone;
  return [firstCode ?? 'thiếu', secondCode ?? 'thiếu'];
}

describe('cùng một tài khoản, đồng thời', { timeout: TEST_TIMEOUT }, () => {
  it(`MKK-01 QM-21 H8 hai reset-password CÙNG token cùng lúc (${String(ROUNDS)} vòng): đúng MỘT 200, một 403 RESET_TOKEN_HET_HIEU_LUC; mật khẩu là của bên thắng`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newResetAccount(db, 'verified');
      const token = await tokenFor(fx, account.email);
      const passwords = [
        `Thang-Cuoc-A-${String(round)}!`,
        `Thang-Cuoc-B-${String(round)}!`,
      ];

      const codes = await together(passwords.map((p) => () => reset(token, p)));

      expect([...codes].sort(), `vòng ${String(round)}`).toEqual([
        EXPIRED,
        'ok',
      ]);
      const winner = passwords[codes.indexOf('ok')] ?? '';
      expect(await passwordIs(account.taiKhoanId, winner)).toBe(true);
      expect(
        (await forgotRows(db, account.taiKhoanId))[0]?.daDungLuc,
      ).not.toBeNull();
    }
  });

  it('MKK-02 QM-21 ép thứ tự bằng khoá: yêu cầu xếp trước thắng, yêu cầu sau 403; chiều ngược lại cũng vậy (mỗi bên thắng một lần)', async () => {
    for (const firstWins of ['A', 'B']) {
      const account = await newResetAccount(db, 'verified');
      const token = await tokenFor(fx, account.email);
      const [first, second] =
        firstWins === 'A'
          ? ['Ben-A-dat-1!', 'Ben-B-dat-2!']
          : ['Ben-B-dat-2!', 'Ben-A-dat-1!'];

      expect(
        await inOrder(
          account.taiKhoanId,
          () => reset(token, first),
          () => reset(token, second),
        ),
      ).toEqual(['ok', EXPIRED]);
      expect(await passwordIs(account.taiKhoanId, first)).toBe(true);
    }
  });

  it('MKK-03 với "Gửi lại mã" (resend-otp): reset TRƯỚC ⇒ đặt được, mã mới vẫn gửi và vẫn dùng được (hàng đã dùng không bị thu hồi); resend xong TRƯỚC ⇒ token cũ 403; thả tự do: kết quả luôn nhất quán với một trong hai thứ tự', async () => {
    const early = await newResetAccount(db, 'verified');
    const earlyToken = await tokenFor(fx, early.email);
    vi.setSystemTime(at(61));
    expect(
      await inOrder(
        early.taiKhoanId,
        () => reset(earlyToken),
        () => fx.forgot.requestCode(early.email),
      ),
    ).toEqual(['ok', 'ok']);
    const [used, fresh] = await forgotRows(db, early.taiKhoanId);
    expect(used).toMatchObject({ daDungLuc: at(61), thuHoiLuc: null });
    expect(fresh).toMatchObject({ daGuiLuc: at(61), thuHoiLuc: null });
    await fx.forgot.verifyCode(early.email, lastCode(fx.mail));

    vi.setSystemTime(at(0));
    const late = await newResetAccount(db, 'verified');
    const lateToken = await tokenFor(fx, late.email);
    vi.setSystemTime(at(61));
    // "Gửi lại mã" có hai pha (cấp mã, rồi sau khi gửi thư mới thu hồi mã cũ): chiều này chỉ có nghĩa khi CẢ HAI pha đã xong trước
    await fx.forgot.requestCode(late.email);
    await expectRefused(reset(lateToken), 403, EXPIRED);
    expect(await passwordIs(late.taiKhoanId, NEW_PASSWORD)).toBe(false);

    for (let round = 0; round < ROUNDS; round++) {
      vi.setSystemTime(at(0));
      const racer = await newResetAccount(db, 'verified');
      const racerToken = await tokenFor(fx, racer.email);
      vi.setSystemTime(at(61));

      const [resetCode, resendCode] = await together([
        () => reset(racerToken),
        () => fx.forgot.requestCode(racer.email),
      ]);

      const [oldRow, newRow] = await forgotRows(db, racer.taiKhoanId);
      expect(resendCode, `vòng ${String(round)}`).toBe('ok');
      expect(newRow).toMatchObject({ daGuiLuc: at(61), thuHoiLuc: null });
      if (resetCode === 'ok') {
        // reset lấy khoá trước khi mã mới gửi xong: hàng cũ đã dùng, không bị thu hồi (CHECK cấm vừa dùng vừa thu hồi)
        expect(oldRow).toMatchObject({ daDungLuc: at(61), thuHoiLuc: null });
        expect(await passwordIs(racer.taiKhoanId, NEW_PASSWORD)).toBe(true);
      } else {
        expect(resetCode, `vòng ${String(round)}`).toBe(EXPIRED);
        expect(oldRow).toMatchObject({ daDungLuc: null, thuHoiLuc: at(61) });
        expect(await passwordIs(racer.taiKhoanId, NEW_PASSWORD)).toBe(false);
      }
    }
  });

  it('MKK-04 với verify-otp cùng hàng: reset TRƯỚC ⇒ verify 400 OTP_SAI (hàng đã dùng, không đếm sai); verify TRƯỚC ⇒ cả hai qua, token thứ hai CHẾT sau khi reset xong', async () => {
    const account = await newResetAccount(db, 'verified');
    const token = await tokenFor(fx, account.email);
    const code = lastCode(fx.mail);
    let second = '';
    expect(
      await inOrder(
        account.taiKhoanId,
        async () => {
          second = (await fx.forgot.verifyCode(account.email, code)).resetToken;
        },
        () => reset(token),
      ),
    ).toEqual(['ok', 'ok']);
    await expectRefused(reset(second, 'Token-Thu-Hai-1!'), 403, EXPIRED);

    const other = await newResetAccount(db, 'verified');
    const otherToken = await tokenFor(fx, other.email);
    const otherCode = lastCode(fx.mail);
    expect(
      await inOrder(
        other.taiKhoanId,
        () => reset(otherToken),
        () => fx.forgot.verifyCode(other.email, otherCode),
      ),
    ).toEqual(['ok', 'OTP_SAI']);
    expect((await forgotRows(db, other.taiKhoanId))[0]?.soLanNhapSai).toBe(0);
  });

  it('MKK-05 với đăng nhập ĐÚNG mật khẩu cũ: login TRƯỚC ⇒ phiên vừa tạo cũng bị thu hồi; reset TRƯỚC ⇒ login 401 DANG_NHAP_SAI (mật khẩu đã đổi), không phiên. Cả hai chiều: KHÔNG phiên nào sống sót', async () => {
    for (const loginFirst of [true, false]) {
      const account = await newLoginAccount(db);
      const token = await tokenFor(fx, account.email);
      const doLogin = () => fx.login.login(loginBody(account, LOGIN_PASSWORD));

      const codes = loginFirst
        ? await inOrder(account.taiKhoanId, doLogin, () => reset(token))
        : await inOrder(account.taiKhoanId, () => reset(token), doLogin);

      expect(codes).toEqual(
        loginFirst ? ['ok', 'ok'] : ['ok', 'DANG_NHAP_SAI'],
      );
      const sessions = await sessionRowsOf(db, account.taiKhoanId);
      expect(sessions).toHaveLength(loginFirst ? 1 : 0);
      expect(sessions.every((row) => row.thuHoiLuc !== null)).toBe(true);
    }
  });

  it(`MKK-06 với đăng nhập thả tự do (${String(ROUNDS)} vòng): login ok HOẶC DANG_NHAP_SAI, nhưng sau cả hai không có phiên nào còn sống`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newLoginAccount(db);
      const token = await tokenFor(fx, account.email);

      const [resetCode, loginCode] = await together([
        () => reset(token),
        () => fx.login.login(loginBody(account, LOGIN_PASSWORD)),
      ]);

      expect(resetCode, `vòng ${String(round)}`).toBe('ok');
      expect(['ok', 'DANG_NHAP_SAI']).toContain(loginCode);
      const live = (await sessionRowsOf(db, account.taiKhoanId)).filter(
        (row) => row.thuHoiLuc === null,
      );
      expect(live, `vòng ${String(round)}`).toHaveLength(0);
    }
  });

  it('MKK-07 với làm mới (refresh) đang GIỮ khoá hàng phiên: reset chờ rồi thu hồi phiên, token vừa xoay vô dụng; refresh SAU reset bị từ chối. Thả tự do: phiên luôn kết thúc ở trạng thái thu hồi', async () => {
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const token = await tokenFor(fx, account.email);
    // Giữ khoá hàng PHIÊN (như refresh đang chạy), reset phải chờ ở bước thu hồi phiên
    const acquired = deferred();
    const release = deferred();
    const holder = db.transaction('READ COMMITTED', async (em) => {
      await em.query(
        'SELECT 1 FROM phien_dang_nhap WHERE phien_dang_nhap_id = ? FOR UPDATE',
        [session.sessionId],
      );
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;
    let settled = false;
    const pending = reset(token).finally(() => {
      settled = true;
    });
    await sleep(300);
    expect(settled, 'reset phải chờ khoá hàng phiên').toBe(false);
    release.resolve();
    await holder;
    await pending;
    expect(await fx.sessionService.refresh(session.refreshToken)).toMatchObject(
      { ok: false, reason: 'SESSION_REVOKED' },
    );

    for (let round = 0; round < ROUNDS; round++) {
      const user = await newLoginAccount(db);
      const live = await fx.sessionService.create(user.taiKhoanId);
      const t = await tokenFor(fx, user.email);
      let rotated = '';
      const [resetCode] = await together([
        () => reset(t),
        async () => {
          const result = await fx.sessionService.refresh(live.refreshToken);
          if (result.ok) rotated = result.tokens.refreshToken;
        },
      ]);
      expect(resetCode).toBe('ok');
      const row = await db
        .getRepository(PhienDangNhap)
        .findOneByOrFail({ phienDangNhapId: live.sessionId });
      expect(row.thuHoiLuc, `vòng ${String(round)}`).not.toBeNull();
      if (rotated) {
        expect((await fx.sessionService.refresh(rotated)).ok).toBe(false);
      }
    }
  });

  it('MKK-08 với đăng xuất thả tự do: phiên thu hồi đúng một lần, mốc không bị ghi đè (cùng đồng hồ giả), không lỗi', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newLoginAccount(db);
      const session = await fx.sessionService.create(account.taiKhoanId);
      const token = await tokenFor(fx, account.email);
      vi.setSystemTime(at(round + 1));

      const codes = await together([
        () => reset(token),
        () => fx.sessionService.revokeByRefreshToken(session.refreshToken),
      ]);

      expect(codes).toEqual(['ok', 'ok']);
      const [row] = await sessionRowsOf(db, account.taiKhoanId);
      expect(row?.thuHoiLuc).toEqual(at(round + 1));
      vi.setSystemTime(at(0));
    }
  });

  it('MKK-09 với xác minh đăng ký (A6) của tài khoản chưa xác minh: xác minh TRƯỚC ⇒ đã xác minh, reset đè mật khẩu, KHÔNG thu hồi gì thêm, canDangKyLai=false; reset TRƯỚC ⇒ xác minh 409 CAN_DANG_KY_LAI, không benh_nhan', async () => {
    const verifiedFirst = await registerPatient(db, fx, {
      email: 'xac.minh.truoc@example.com',
    });
    const tokenA = await tokenFor(fx, verifiedFirst.email);
    let flags: unknown;
    expect(
      await inOrder(
        verifiedFirst.taiKhoanId,
        () => fx.verification.verifyOtp(verifyBody(verifiedFirst)),
        async () => {
          flags = await reset(tokenA);
        },
      ),
    ).toEqual(['ok', 'ok']);
    expect(flags).toEqual({ taiKhoanNgung: false, canDangKyLai: false });
    expect(await passwordIs(verifiedFirst.taiKhoanId, NEW_PASSWORD)).toBe(true);

    const resetFirst = await registerPatient(db, fx, {
      email: 'dat.lai.truoc@example.com',
    });
    const tokenB = await tokenFor(fx, resetFirst.email);
    expect(
      await inOrder(
        resetFirst.taiKhoanId,
        () => reset(tokenB),
        () => fx.verification.verifyOtp(verifyBody(resetFirst)),
      ),
    ).toEqual(['ok', 'CAN_DANG_KY_LAI']);
    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: resetFirst.taiKhoanId })
      ).daXacMinhEmail,
    ).toBe(false);
  });

  it('MKK-10 với đăng ký lại cùng email (A5): đăng ký TRƯỚC ⇒ hàng DangKy mới cũng bị thu hồi và xoá dữ liệu (nếu reset chen giữa hai pha thì thư đã đi mang mã chết, TECH_DEBT 45); reset TRƯỚC ⇒ hàng mới sau reset còn nguyên (QM-18)', async () => {
    const first = await registerPatient(db, fx, {
      email: 'dang.ky.lai.truoc@example.com',
    });
    const tokenA = await tokenFor(fx, first.email);
    vi.setSystemTime(at(61));
    expect(
      await inOrder(
        first.taiKhoanId,
        () => fx.service.register(registerBody({ email: first.email })),
        () => reset(tokenA),
      ),
    ).toEqual(['ok', 'ok']);
    const rowsA = await forgotRows(db, first.taiKhoanId, 'DangKy');
    expect(rowsA).toHaveLength(2);
    expect(
      rowsA.every(
        (row) => row.thuHoiLuc !== null && row.matKhauBamDangKy === null,
      ),
    ).toBe(true);

    vi.setSystemTime(at(0));
    const second = await registerPatient(db, fx, {
      email: 'dat.lai.roi.dang.ky@example.com',
    });
    const tokenB = await tokenFor(fx, second.email);
    vi.setSystemTime(at(61));
    expect(
      await inOrder(
        second.taiKhoanId,
        () => reset(tokenB),
        () => fx.service.register(registerBody({ email: second.email })),
      ),
    ).toEqual(['ok', 'ok']);
    const [, fresh] = await forgotRows(db, second.taiKhoanId, 'DangKy');
    expect(fresh).toMatchObject({ thuHoiLuc: null, daGuiLuc: at(61) });
    expect(fresh?.matKhauBamDangKy).not.toBeNull();
  });

  // Hai ca dưới khoá được việc KIỂM LẠI DƯỚI KHOÁ bằng đua thật: một giao dịch khác giữ khoá hàng tai_khoan và đổi/xoá nó; reset phải CHỜ khoá rồi thấy dữ
  // liệu MỚI. Nếu reset đọc tư cách mà không khoá (hoặc dùng bản đọc trước giao dịch) thì nó đặt mật khẩu nhầm cho tài khoản vừa về ChoKichHoat.
  it('MKK-11 tài khoản vừa về ChoKichHoat bởi giao dịch đang giữ khoá: reset CHỜ rồi 403 TAI_KHOAN_CHUA_KICH_HOAT; OTP chưa dùng, mật khẩu vẫn NULL', async () => {
    const account = await newResetAccount(db, 'staff');
    const token = await tokenFor(fx, account.email);
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
    const pending = reset(token).finally(() => {
      settled = true;
    });
    pending.catch(() => undefined);
    await sleep(300);
    expect(settled, 'phải chờ khoá của bên đang giữ').toBe(false);
    release.resolve();
    await holder;

    await expectRefused(pending, 403, 'TAI_KHOAN_CHUA_KICH_HOAT');
    expect((await forgotRows(db, account.taiKhoanId))[0]?.daDungLuc).toBeNull();
    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: account.taiKhoanId })
      ).matKhauBam,
    ).toBeNull();
  });

  // Thứ tự khoá (A5-C): mọi bên khoá `tai_khoan` TRƯỚC rồi mới tới hàng `ma_xac_thuc`. Ca này dựng đúng tình huống một bên khác (như verify-otp, gửi lại mã)
  // đang giữ khoá tài khoản và SẮP khoá hàng OTP: reset phải xếp hàng ở khoá tài khoản mà KHÔNG giữ khoá hàng OTP nào, nên bên kia lấy hàng OTP ngay. Nếu reset
  // khoá hàng OTP trước (đột biến M26) thì hai bên chờ nhau vòng tròn và MySQL giết một bên bằng 1213.
  it('MKK-14 thứ tự khoá: giao dịch khác giữ khoá tai_khoan rồi khoá hàng OTP của token TRONG LÚC reset đang chờ ⇒ không deadlock, bên kia lấy được hàng ngay, reset xong sau', async () => {
    for (let round = 0; round < Math.min(ROUNDS, 5); round++) {
      const account = await newResetAccount(db, 'verified');
      const token = await tokenFor(fx, account.email);
      const [row] = await forgotRows(db, account.taiKhoanId);
      const acquired = deferred();
      const release = deferred();
      let rowWaitMs = -1;
      const holder = db.transaction('READ COMMITTED', async (em) => {
        await em.query(
          'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
          [account.taiKhoanId],
        );
        acquired.resolve();
        await release.promise;
        const begin = Date.now();
        await em.query(
          'SELECT ma_xac_thuc_id FROM ma_xac_thuc WHERE ma_xac_thuc_id = ? FOR UPDATE',
          [row?.maXacThucId],
        );
        rowWaitMs = Date.now() - begin;
      });
      await acquired.promise;
      const pending = together([() => reset(token)]);
      await sleep(300); // reset đã băm xong và đang chờ khoá tài khoản
      release.resolve();

      await expect(holder, `vòng ${String(round)}`).resolves.toBeUndefined();
      expect(await pending, `vòng ${String(round)}`).toEqual(['ok']);
      expect(
        rowWaitMs,
        'bên giữ khoá tài khoản lấy hàng OTP mà không phải chờ reset',
      ).toBeLessThan(1000);
    }
  });

  it('MKK-12 tài khoản vừa bị xoá bởi giao dịch đang giữ khoá: reset CHỜ rồi 403 RESET_TOKEN_HET_HIEU_LUC (không phải lỗi hệ thống)', async () => {
    const account = await newResetAccount(db, 'verified');
    const token = await tokenFor(fx, account.email);
    const acquired = deferred();
    const release = deferred();
    const holder = db.transaction('READ COMMITTED', async (em) => {
      await em.delete(MaXacThuc, { taiKhoanId: account.taiKhoanId });
      await em.delete(TaiKhoan, { taiKhoanId: account.taiKhoanId });
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;
    const pending = reset(token);
    pending.catch(() => undefined);
    await sleep(300);
    release.resolve();
    await holder;

    await expectRefused(pending, 403, EXPIRED);
  });

  it(`MKK-13 hai reset CÙNG token + verify-otp + đăng nhập sai cùng lúc (${String(ROUNDS)} vòng): đúng một reset thắng, không lỗi lạ`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newLoginAccount(db);
      const token = await tokenFor(fx, account.email);
      const code = lastCode(fx.mail);

      const codes = await together([
        () => reset(token),
        () => reset(token, 'Ben-Thua-Cuoc-9!'),
        () => fx.forgot.verifyCode(account.email, code),
        () => fx.login.login(loginBody(account, 'Sai-Mat-Khau-0!')),
      ]);

      expect(
        count(codes.slice(0, 2), 'ok'),
        `vòng ${String(round)}: ${codes.join(',')}`,
      ).toBe(1);
      expect(codes.filter((c) => c.startsWith('LOI_LA'))).toEqual([]);
      expect(['ok', 'OTP_SAI']).toContain(codes[2]);
      expect(codes[3]).toBe('DANG_NHAP_SAI');
    }
  });
});
