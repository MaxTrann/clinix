import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  dbErrorCode,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import {
  forgotRows,
  lastCode,
  newResetAccount,
  requestAndRead,
  createForgotFixture,
  type ForgotFixture,
  type ResetAccountKind,
} from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  failureState,
  loginBody,
  newLoginAccount,
  setFailureState,
} from '../testing/login-int-helpers.js';
import {
  ControlledMailService,
  at,
  rowOf,
  wrongCodeFor,
} from '../testing/otp-int-helpers.js';
import { standalone } from '../testing/secret-scan.js';
import {
  expectRefused,
  resendBody,
  registerPatient,
  snapshotOf,
  verifyBody,
} from '../testing/verification-int-helpers.js';

// Task A11 — quên mật khẩu (1) trên MySQL 8.4 THẬT, MailService giả, đồng hồ giả (`at(giây)` kể từ T0). Mã test case: QM-01 (phần A11), QM-02 đến QM-07,
// QM-09, QM-10, QM-11 (phần cấp token), QM-13 (điều kiện cho A12), QM-19 (nửa cấp mã), DN-21; Q6, S4, N1. Mã FP-nn là [đề xuất].
// Từ chối theo từng route (forgot-password, resend-otp) chạy ở test/auth-forgot-password.e2e-spec.ts; ở đây là chính dịch vụ dùng chung cho cả hai route.
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;

let db: DataSource;
let fx: ForgotFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createForgotFixture(testDb);
});

const ask = (email: string) => fx.forgot.requestCode(email);
const answer = (email: string, otp: string) => fx.forgot.verifyCode(email, otp);
const rowsOf = (taiKhoanId: string) => forgotRows(db, taiKhoanId);
const accountRow = (taiKhoanId: string) =>
  db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId });

describe('cấp mã: ai được cấp, ai bị từ chối (QM-02, QM-03, QM-04, Q6, S4)', () => {
  it('FP-01 QM-02 email lạ: 404 EMAIL_CHUA_DANG_KY, không ghi gì, không thư', async () => {
    await newResetAccount(db, 'verified');
    const before = await snapshotOf(db);

    await expectRefused(ask('la@example.com'), 404, 'EMAIL_CHUA_DANG_KY');

    expect(await snapshotOf(db)).toEqual(before);
    expect(fx.mail.attempts).toHaveLength(0);
    expect(logs.join('\n')).not.toContain('la@example.com');
  });

  it.each(['pending-staff', 'suspended-no-password'] as const)(
    'FP-02 QM-03/QM-04 tài khoản %s (chưa từng có mật khẩu): 403 TAI_KHOAN_CHUA_KICH_HOAT, không OTP, không thư, DB nguyên vẹn',
    async (kind) => {
      const account = await newResetAccount(db, kind);
      const before = await snapshotOf(db);

      await expectRefused(ask(account.email), 403, 'TAI_KHOAN_CHUA_KICH_HOAT');

      expect(await snapshotOf(db)).toEqual(before);
      expect(fx.mail.attempts).toHaveLength(0);
      expect(logs.join('\n')).toContain(
        `Tài khoản ${account.taiKhoanId} không được cấp OTP quên mật khẩu`,
      );
    },
  );

  it('FP-03 QM-04 biến thể DangHoatDong mà mật khẩu NULL không tồn tại: CHECK chk_tai_khoan_mat_khau của DB cấm', async () => {
    expect(
      await dbErrorCode(
        insertTaiKhoan(db, { trangThai: 'DangHoatDong', matKhauBam: null }),
      ),
    ).toBe('ER_CHECK_CONSTRAINT_VIOLATED');
  });

  it('FP-04 Q6 Bệnh nhân chưa xác minh còn hạn: được cấp; tài khoản KHÔNG đổi (không đặt cờ xác minh, không hồ sơ); chỉ có hàng QuenMatKhau', async () => {
    const account = await newResetAccount(db, 'unverified');
    const before = await accountRow(account.taiKhoanId);

    await ask(account.email);

    expect(await accountRow(account.taiKhoanId)).toEqual(before);
    expect(before.daXacMinhEmail).toBe(false);
    expect(await rowsOf(account.taiKhoanId)).toHaveLength(1);
    expect(fx.mail.attempts).toHaveLength(1);
  });

  it.each([
    ['23:59:59 (còn 1 giây)', -DAY + 1, true],
    ['đúng 24:00:00 (nửa mở: đã hết)', -DAY, false],
    ['24:00:01', -DAY - 1, false],
  ])(
    'FP-05 Bệnh nhân chưa xác minh tuổi %s: %s',
    async (_label, createdAt, allowed) => {
      const account = await newResetAccount(db, 'unverified', {
        thoiDiemTao: at(createdAt),
      });
      const before = await snapshotOf(db);

      if (allowed) {
        await ask(account.email);
        expect(fx.mail.attempts).toHaveLength(1);
      } else {
        // Coi như chưa đăng ký: email thực ra đã "trống" (đăng ký lại sẽ xoá lười tài khoản này, A5), không OTP, không thư
        await expectRefused(ask(account.email), 404, 'EMAIL_CHUA_DANG_KY');
        expect(await snapshotOf(db)).toEqual(before);
        expect(fx.mail.attempts).toHaveLength(0);
      }
    },
  );

  it.each(['verified', 'staff', 'suspended', 'locked'] as ResetAccountKind[])(
    'FP-06 tài khoản %s (S4, QM-19, DN-21): được cấp OTP; trạng thái, mật khẩu, bộ đếm và khoá đăng nhập KHÔNG đổi',
    async (kind) => {
      const account = await newResetAccount(db, kind);
      const before = await accountRow(account.taiKhoanId);

      await ask(account.email);

      expect(await accountRow(account.taiKhoanId)).toEqual(before);
      expect(await rowsOf(account.taiKhoanId)).toHaveLength(1);
      expect(fx.mail.attempts).toHaveLength(1);
    },
  );

  it('FP-07 DN-21 đang bị khoá đăng nhập tạm: Quên mật khẩu vẫn gửi OTP bình thường, bộ đếm/khoá không đổi, và đăng nhập vẫn bị khoá (mở khoá là việc của A12, QM-15)', async () => {
    const account = await newLoginAccount(db);
    const locked = { soLanDangNhapSai: 5, khoaDangNhapDen: at(900) };
    await setFailureState(db, account.taiKhoanId, locked);

    const { code } = await requestAndRead(fx, account.email);
    const verified = await answer(account.email, code);

    expect(verified.resetToken).not.toBe('');
    expect(await failureState(db, account.taiKhoanId)).toEqual(locked);
    await expectRefused(
      fx.login.login(loginBody(account)),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );
  });

  it('FP-08 email so không phân biệt hoa/thường (cột collation ci); thư gửi tới email ĐÃ LƯU, không tới chuỗi gõ', async () => {
    const account = await newResetAccount(db, 'verified', {
      email: 'Nguoi.Dung.Hoa@example.com',
    });

    await ask('nguoi.dung.hoa@example.com');

    expect(fx.mail.attempts).toHaveLength(1);
    expect(fx.mail.attempts[0]?.to).toBe('Nguoi.Dung.Hoa@example.com');
    expect(await rowsOf(account.taiKhoanId)).toHaveLength(1);
  });
});

describe('kết quả cấp mã và nội dung thư (QM-01 phần A11)', () => {
  it('FP-09 kết quả CHỈ có hai mốc (hết hạn sau 10 phút, gửi lại sau 60 giây); hàng OTP đúng loại, đã gửi, chưa dùng, không dữ liệu đăng ký, mã băm HMAC', async () => {
    const account = await newResetAccount(db, 'verified');

    const { result } = await requestAndRead(fx, account.email);

    expect(Object.keys(result).sort()).toEqual(['coTheGuiLaiLuc', 'hetHanLuc']);
    expect(result).toEqual({ hetHanLuc: at(600), coTheGuiLaiLuc: at(60) });
    const [row] = await rowsOf(account.taiKhoanId);
    expect(row).toMatchObject({
      loai: 'QuenMatKhau',
      taoLuc: at(0),
      hetHanLuc: at(600),
      daGuiLuc: at(0),
      thuHoiLuc: null,
      daDungLuc: null,
      soLanNhapSai: 0,
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    });
    expect(row?.maBam).toMatch(/^[0-9a-f]{64}$/);
  });

  it('FP-10 đúng một thư: tiêu đề mẫu quên mật khẩu, nêu email tài khoản, "10 phút", lời chào theo họ tên; mã 6 chữ số chỉ nằm trong thư', async () => {
    const account = await newResetAccount(db, 'verified');

    const { code } = await requestAndRead(fx, account.email);

    expect(fx.mail.attempts).toHaveLength(1);
    const mail = fx.mail.attempts[0];
    expect(mail?.to).toBe(account.email);
    expect(mail?.subject).toBe('[CLINIX] Mã OTP đặt lại mật khẩu');
    expect(mail?.text).toContain(`tài khoản ${account.email}`);
    expect(mail?.text).toContain('Mã có hiệu lực trong 10 phút.');
    expect(mail?.text).toContain(`Xin chào ${account.hoTen},`);
    expect(code).toMatch(/^\d{6}$/);
    expect(mail?.text).toMatch(standalone(code));
  });

  it('FP-11 QM-01 (đến khi có resetToken): cấp mã, nhập mã đúng ⇒ token mang đúng tài khoản và mã xác thực, hạn 10 phút kể từ lúc xác minh', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await requestAndRead(fx, account.email);
    const [row] = await rowsOf(account.taiKhoanId);
    vi.setSystemTime(at(30));

    const result = await answer(account.email, code);

    expect(Object.keys(result).sort()).toEqual(['hetHanLuc', 'resetToken']);
    expect(result.hetHanLuc).toEqual(at(30 + 600));
    expect(await fx.resetTokens.verify(result.resetToken)).toEqual({
      taiKhoanId: account.taiKhoanId,
      maXacThucId: row?.maXacThucId,
    });
  });

  it('FP-12 M17 xác minh KHÔNG tiêu thụ mã: hàng vẫn chưa dùng, chưa thu hồi, không đếm sai; verify-otp lặp lại vẫn được và cấp token mới hợp lệ (A12 mới tiêu thụ)', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await requestAndRead(fx, account.email);

    const first = await answer(account.email, code);
    vi.setSystemTime(at(5));
    const second = await answer(account.email, code);

    expect(first.resetToken).not.toBe(second.resetToken);
    expect(await fx.resetTokens.verify(first.resetToken)).not.toBeNull();
    expect(await fx.resetTokens.verify(second.resetToken)).not.toBeNull();
    const [row] = await rowsOf(account.taiKhoanId);
    expect(row).toMatchObject({
      daDungLuc: null,
      thuHoiLuc: null,
      soLanNhapSai: 0,
    });
  });

  it('FP-13 token của hai tài khoản mang đúng tài khoản và hàng OTP của chính mình (không lẫn)', async () => {
    const a = await newResetAccount(db, 'verified');
    const b = await newResetAccount(db, 'staff');
    const codeA = (await requestAndRead(fx, a.email)).code;
    const codeB = (await requestAndRead(fx, b.email)).code;

    const tokenA = await answer(a.email, codeA);
    const tokenB = await answer(b.email, codeB);

    const [rowA] = await rowsOf(a.taiKhoanId);
    const [rowB] = await rowsOf(b.taiKhoanId);
    expect(await fx.resetTokens.verify(tokenA.resetToken)).toEqual({
      taiKhoanId: a.taiKhoanId,
      maXacThucId: rowA?.maXacThucId,
    });
    expect(await fx.resetTokens.verify(tokenB.resetToken)).toEqual({
      taiKhoanId: b.taiKhoanId,
      maXacThucId: rowB?.maXacThucId,
    });
    // mã của A không mở được tài khoản B
    await expectRefused(answer(b.email, codeA), 400, 'OTP_SAI');
  });
});

describe('nhập mã: đếm sai, hết lượt, hết hạn (QM-05, QM-06, QM-07)', () => {
  it('FP-14 QM-05 sai 1…4 lần rồi đúng: bộ đếm của mã ghi bền sau mỗi lần sai (commit riêng), lần đúng vẫn qua', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await requestAndRead(fx, account.email);

    for (let attempt = 1; attempt <= 4; attempt++) {
      await expectRefused(
        answer(account.email, wrongCodeFor(code)),
        400,
        'OTP_SAI',
      );
      expect((await rowsOf(account.taiKhoanId))[0]).toMatchObject({
        soLanNhapSai: attempt,
        thuHoiLuc: null,
      });
    }
    const result = await answer(account.email, code);

    expect(result.resetToken).not.toBe('');
  });

  it('FP-15 QM-06 sai đủ 5 lần: lần thứ 5 báo OTP_HET_LUOT và mã bị thu hồi; mã ĐÚNG sau đó cũng bị từ chối; gửi lại sau 60 giây cho mã mới dùng được, mã cũ thì không', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await requestAndRead(fx, account.email);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expectRefused(
        answer(account.email, wrongCodeFor(code)),
        400,
        'OTP_SAI',
      );
    }

    vi.setSystemTime(at(10));
    await expectRefused(
      answer(account.email, wrongCodeFor(code)),
      400,
      'OTP_HET_LUOT',
    );
    expect((await rowsOf(account.taiKhoanId))[0]).toMatchObject({
      soLanNhapSai: 5,
      thuHoiLuc: at(10),
    });
    await expectRefused(answer(account.email, code), 400, 'OTP_HET_LUOT');
    expect((await rowsOf(account.taiKhoanId))[0]?.soLanNhapSai).toBe(5); // hàng đã thu hồi không đếm thêm

    vi.setSystemTime(at(61));
    const second = await requestAndRead(fx, account.email);
    expect((await answer(account.email, second.code)).resetToken).not.toBe('');
    if (second.code !== code) {
      await expectRefused(answer(account.email, code), 400, 'OTP_SAI');
    }
  });

  it.each([
    [599, true],
    [600, false],
    [601, false],
  ])(
    'FP-16 QM-07 nhập đúng mã sau %i giây (mã sống 10 phút, nửa mở): %s',
    async (seconds, accepted) => {
      const account = await newResetAccount(db, 'verified');
      const { code } = await requestAndRead(fx, account.email);
      vi.setSystemTime(at(seconds));

      if (accepted) {
        expect((await answer(account.email, code)).resetToken).not.toBe('');
      } else {
        await expectRefused(answer(account.email, code), 400, 'OTP_HET_HAN');
      }
    },
  );

  it('FP-17 QM-07 kiểm hạn TRƯỚC khi so mã: mã sai + quá hạn ⇒ OTP_HET_HAN và KHÔNG tăng bộ đếm; mã sai còn hạn ⇒ OTP_SAI và tăng', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await requestAndRead(fx, account.email);

    vi.setSystemTime(at(599));
    await expectRefused(
      answer(account.email, wrongCodeFor(code)),
      400,
      'OTP_SAI',
    );
    vi.setSystemTime(at(601));
    await expectRefused(
      answer(account.email, wrongCodeFor(code)),
      400,
      'OTP_HET_HAN',
    );

    expect((await rowsOf(account.taiKhoanId))[0]?.soLanNhapSai).toBe(1);
  });

  it('FP-18 QM-11 (phần cấp token) hạn của token tính từ LÚC XÁC MINH, không từ lúc cấp OTP: OTP cấp lúc 0, xác minh lúc 500 ⇒ token sống tới 1100 (qua cả hạn 600 của OTP, N6)', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await requestAndRead(fx, account.email);
    vi.setSystemTime(at(500));

    const result = await answer(account.email, code);

    expect(result.hetHanLuc).toEqual(at(1100));
    expect(
      await fx.resetTokens.verify(result.resetToken, at(1099)),
    ).not.toBeNull();
    expect(await fx.resetTokens.verify(result.resetToken, at(1100))).toBeNull();
  });
});

describe('mã cũ và mã mới (N1, QM-09, QM-10)', () => {
  it('FP-19 mã cũ sau khi có mã mới: bị thu hồi, nhập mã cũ là OTP_SAI và tính vào mã MỚI; token cấp từ mã cũ chết ở A12 (consume báo REVOKED, QM-13)', async () => {
    const account = await newResetAccount(db, 'verified');
    const first = await requestAndRead(fx, account.email);
    vi.setSystemTime(at(30));
    const oldToken = await answer(account.email, first.code);
    vi.setSystemTime(at(61));
    const second = await requestAndRead(fx, account.email);

    const [oldRow, newRow] = await rowsOf(account.taiKhoanId);
    expect(oldRow?.thuHoiLuc).toEqual(at(61));
    if (first.code !== second.code) {
      await expectRefused(answer(account.email, first.code), 400, 'OTP_SAI');
      expect((await rowsOf(account.taiKhoanId))[1]?.soLanNhapSai).toBe(1);
    }
    const claims = await fx.resetTokens.verify(oldToken.resetToken);
    expect(claims?.maXacThucId).toBe(oldRow?.maXacThucId);
    expect(
      await fx.otp.transaction((manager) =>
        fx.otp.consume(
          {
            maXacThucId: oldRow?.maXacThucId ?? '',
            taiKhoanId: account.taiKhoanId,
            loai: 'QuenMatKhau',
          },
          { manager },
        ),
      ),
    ).toEqual({ ok: false, reason: 'REVOKED' });
    expect(newRow?.thuHoiLuc).toBeNull();
  });

  it('FP-20 N1 commit trước khi gửi, thu hồi mã cũ chỉ SAU khi gửi thành công: trong lúc thư đang gửi hàng mới đã commit (chưa gửi), mã cũ còn dùng được; gửi xong mới thu hồi mã cũ', async () => {
    const mail = new ControlledMailService();
    const held = createForgotFixture(db, mail);
    const account = await newResetAccount(db, 'verified');
    const first = await held.forgot.requestCode(account.email);
    const oldCode = lastCode(mail);
    expect(first.hetHanLuc).toEqual(at(600));

    vi.setSystemTime(at(61));
    mail.holding = true;
    const pending = held.forgot.requestCode(account.email);
    await mail.waitForPending(1);

    const during = await forgotRows(db, account.taiKhoanId);
    expect(during).toHaveLength(2);
    expect(during[1]).toMatchObject({ daGuiLuc: null, thuHoiLuc: null }); // đã commit nhưng chưa gửi
    expect(during[0]?.thuHoiLuc).toBeNull(); // N1: mã cũ chưa bị đụng
    expect(
      (await held.forgot.verifyCode(account.email, oldCode)).resetToken,
    ).not.toBe('');

    mail.release();
    await pending;
    const after = await forgotRows(db, account.taiKhoanId);
    expect(after[0]?.thuHoiLuc).toEqual(at(61));
    expect(after[1]).toMatchObject({ daGuiLuc: at(61), thuHoiLuc: null });
  });

  it('FP-21 QM-09 gửi thư lỗi: 503 GUI_MAIL_LOI chỉ kèm coTheGuiLaiLuc; hàng mới bị thu hồi, mã cũ vẫn dùng được; lần lỗi vẫn tính vào giới hạn; gửi lại sau đó thành công', async () => {
    const account = await newResetAccount(db, 'verified');
    const first = await requestAndRead(fx, account.email);
    vi.setSystemTime(at(61));
    fx.mail.failNextWith('CONNECTION');

    const error = await expectRefused(ask(account.email), 503, 'GUI_MAIL_LOI');

    expect((error.getResponse() as { chiTiet: unknown }).chiTiet).toEqual({
      coTheGuiLaiLuc: at(121).toISOString(),
    });
    const rows = await rowsOf(account.taiKhoanId);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.thuHoiLuc).toBeNull();
    expect(rows[1]).toMatchObject({ daGuiLuc: null, thuHoiLuc: at(61) });
    expect((await answer(account.email, first.code)).resetToken).not.toBe('');

    vi.setSystemTime(at(62));
    const tooSoon = await expectRefused(
      ask(account.email),
      429,
      'GUI_LAI_QUA_SOM',
    );
    expect((tooSoon.getResponse() as { chiTiet: unknown }).chiTiet).toEqual({
      soGiayCho: 59,
    });
    expect(await rowsOf(account.taiKhoanId)).toHaveLength(2);

    vi.setSystemTime(at(121));
    await ask(account.email);
    expect((await rowsOf(account.taiKhoanId))[2]).toMatchObject({
      daGuiLuc: at(121),
    });
    expect(logs.join('\n')).toContain('Gửi OTP quên mật khẩu lỗi (CONNECTION)');
    expect(logs.join('\n')).not.toContain(account.email);
  });

  it('FP-22 QM-10 giới hạn 60 giây: 59 giây bị từ chối kèm số giây còn phải chờ, đúng 60 giây được; lần bị từ chối không ghi hàng nào', async () => {
    const account = await newResetAccount(db, 'verified');
    await ask(account.email);

    vi.setSystemTime(at(59));
    const refused = await expectRefused(
      ask(account.email),
      429,
      'GUI_LAI_QUA_SOM',
    );
    expect((refused.getResponse() as { chiTiet: unknown }).chiTiet).toEqual({
      soGiayCho: 1,
    });
    expect(await rowsOf(account.taiKhoanId)).toHaveLength(1);
    expect(fx.mail.attempts).toHaveLength(1);

    vi.setSystemTime(at(60));
    await ask(account.email);
    expect(await rowsOf(account.taiKhoanId)).toHaveLength(2);
  });

  it('FP-23 QM-10 giới hạn 5 mã/giờ: mã thứ 5 được, thứ 6 bị từ chối tới khi mã đầu rời cửa sổ (nửa mở: đúng 3600 giây thì được)', async () => {
    const account = await newResetAccount(db, 'verified');
    for (const seconds of [0, 60, 120, 180, 240]) {
      vi.setSystemTime(at(seconds));
      await ask(account.email);
    }

    vi.setSystemTime(at(300));
    const sixth = await expectRefused(
      ask(account.email),
      429,
      'GUI_LAI_QUA_SOM',
    );
    expect((sixth.getResponse() as { chiTiet: unknown }).chiTiet).toEqual({
      soGiayCho: 3300,
    });
    vi.setSystemTime(at(3599));
    await expectRefused(ask(account.email), 429, 'GUI_LAI_QUA_SOM');
    expect(await rowsOf(account.taiKhoanId)).toHaveLength(5);

    vi.setSystemTime(at(3600));
    await ask(account.email);
    expect(await rowsOf(account.taiKhoanId)).toHaveLength(6);
  });
});

describe('mã DangKy và QuenMatKhau độc lập (QM-10, TRACKING A11-D)', () => {
  it('FP-24 cấp, gửi lại và xác minh QuenMatKhau KHÔNG đụng hàng DangKy đang sống (cột, bộ đếm, ba cột dữ liệu đăng ký); xác minh đăng ký (A6) sau đó vẫn chạy và không thu hồi mã QuenMatKhau', async () => {
    const registered = await registerPatient(db, fx, {
      email: 'dang.ky.song@example.com',
    });
    const registrationBefore = await rowOf(db, registered.id);
    expect(registrationBefore.matKhauBamDangKy).not.toBeNull();

    vi.setSystemTime(at(10));
    await ask(registered.email);
    vi.setSystemTime(at(70));
    const second = await requestAndRead(fx, registered.email);
    await expectRefused(
      answer(registered.email, wrongCodeFor(second.code)),
      400,
      'OTP_SAI',
    );
    await answer(registered.email, second.code);

    expect(await rowOf(db, registered.id)).toEqual(registrationBefore);

    await fx.verification.verifyOtp(verifyBody(registered));
    const account = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: registered.taiKhoanId });
    expect(account.daXacMinhEmail).toBe(true);
    const qmk = await rowsOf(registered.taiKhoanId);
    expect(qmk[qmk.length - 1]).toMatchObject({
      daDungLuc: null,
      thuHoiLuc: null,
    });
    expect(qmk).toHaveLength(2);
    expect(qmk[0]?.thuHoiLuc).toEqual(at(70)); // chỉ bị thay bởi mã QuenMatKhau mới hơn
  });

  it('FP-25 QM-10 mã DangKy không tính vào giới hạn của QuenMatKhau: đã có 5 mã DangKy trong giờ mà vẫn cấp được QuenMatKhau (cách 1 giây, không phải 60 giây)', async () => {
    const registered = await registerPatient(db, fx, {
      email: 'nam.ma.dang.ky@example.com',
    });
    let latestId = registered.id;
    for (const seconds of [61, 122, 183, 244]) {
      vi.setSystemTime(at(seconds));
      latestId = (
        await fx.verification.resendOtp(
          resendBody({ email: registered.email, id: latestId }),
        )
      ).maXacThucId;
    }
    expect(await forgotRows(db, registered.taiKhoanId, 'DangKy')).toHaveLength(
      5,
    );

    vi.setSystemTime(at(245));
    await ask(registered.email);

    expect(await rowsOf(registered.taiKhoanId)).toHaveLength(1);
  });

  it('FP-26 QM-10 chiều ngược lại: 5 mã QuenMatKhau trong giờ không chặn "Gửi lại mã" của DangKy (giới hạn riêng theo loại)', async () => {
    const registered = await registerPatient(db, fx, {
      email: 'nam.ma.quen.mk@example.com',
    });
    for (const seconds of [1, 61, 121, 181, 241]) {
      vi.setSystemTime(at(seconds));
      await ask(registered.email);
    }

    vi.setSystemTime(at(300));
    const resent = await fx.verification.resendOtp(resendBody(registered));

    expect(resent.maXacThucId).not.toBe(registered.id);
    expect(await rowsOf(registered.taiKhoanId)).toHaveLength(5);
  });
});

describe('xác minh: một thân phản hồi cho mọi trường hợp "không có mã dùng được", và các cuộc đua giữa các bước', () => {
  it('FP-27 email lạ, tài khoản chưa kích hoạt, tài khoản chưa từng cấp mã: OTP_SAI, thân phản hồi GIỐNG HỆT mã sai, không ghi gì (verify-otp không thêm cách dò email)', async () => {
    const pending = await newResetAccount(db, 'pending-staff');
    const idle = await newResetAccount(db, 'verified');
    const before = await snapshotOf(db);

    const unknown = await expectRefused(
      answer('la@example.com', '123456'),
      400,
      'OTP_SAI',
    );
    const noRight = await expectRefused(
      answer(pending.email, '123456'),
      400,
      'OTP_SAI',
    );
    const noCode = await expectRefused(
      answer(idle.email, '123456'),
      400,
      'OTP_SAI',
    );
    expect(await snapshotOf(db)).toEqual(before);

    const asked = await requestAndRead(fx, idle.email);
    const wrong = await expectRefused(
      answer(idle.email, wrongCodeFor(asked.code)),
      400,
      'OTP_SAI',
    );
    for (const other of [noRight, noCode, wrong]) {
      expect(other.getResponse()).toEqual(unknown.getResponse());
    }
  });

  it('FP-28 tài khoản biến mất giữa lúc đọc và lúc khoá (job dọn, đăng ký lại xoá lười): cấp mã trả 404 EMAIL_CHUA_DANG_KY, xác minh trả OTP_SAI — không lỗi hệ thống, không thư', async () => {
    const gone = await newResetAccount(db, 'verified');
    const stale = await fx.accounts.findForPasswordReset(
      db.manager,
      gone.email,
    );
    const staleForVerify = await fx.accounts.findByEmail(
      db.manager,
      gone.email,
    );
    await db.getRepository(TaiKhoan).delete({ taiKhoanId: gone.taiKhoanId });
    vi.spyOn(fx.accounts, 'findForPasswordReset').mockResolvedValueOnce(stale);
    vi.spyOn(fx.accounts, 'findByEmail').mockResolvedValueOnce(staleForVerify);

    await expectRefused(ask(gone.email), 404, 'EMAIL_CHUA_DANG_KY');
    await expectRefused(answer(gone.email, '123456'), 400, 'OTP_SAI');

    expect(fx.mail.attempts).toHaveLength(0);
    expect(await db.getRepository(MaXacThuc).count()).toBe(0);
  });

  it('FP-29 tài khoản bị xoá giữa hai bước (đã có mã): xác minh trả OTP_SAI, không token', async () => {
    const account = await newResetAccount(db, 'unverified');
    const { code } = await requestAndRead(fx, account.email);
    await db
      .getRepository(MaXacThuc)
      .delete({ taiKhoanId: account.taiKhoanId });
    await db.getRepository(TaiKhoan).delete({ taiKhoanId: account.taiKhoanId });

    await expectRefused(answer(account.email, code), 400, 'OTP_SAI');
  });
});
