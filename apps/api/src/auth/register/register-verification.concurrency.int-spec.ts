import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { resetTables } from '../../database/testing/test-database.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  T0,
  at,
  issueOk,
  recipientOf,
  registerInput,
  rowOf,
  wrongCodeFor,
} from '../testing/otp-int-helpers.js';
import { accountByEmail, allOtpRows } from '../testing/register-int-helpers.js';
import {
  createVerificationFixture,
  deferred,
  patientRows,
  registerPatient,
  resendBody,
  sleep,
  verifyBody,
  walletRows,
  type VerificationFixture,
} from '../testing/verification-int-helpers.js';

// Task A6 — chạy đua CÙNG MỘT tài khoản trên MySQL thật. Mã XM-Cnn / GL-Cnn là [đề xuất]. Nhiều tài khoản khác nhau chạy cùng lúc nằm ở
// register-verification.multi-account.int-spec.ts (test này không thấy được deadlock chéo tài khoản vì khoá tài khoản đã xếp hàng sẵn).
const ROUNDS = 5;
const BLOCK_MS = 500; // đủ để pha 2 chạm tới ổ khoá bị giữ; chờ ngắn quá chỉ làm test KHÔNG đỏ khi sai, không bao giờ đỏ oan khi đúng

let db: DataSource;
let fx: VerificationFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createVerificationFixture(testDb);
});

const signUp = () => registerPatient(db, fx);

/** Lỗi bị từ chối phải là AppException nghiệp vụ (không 500, không lỗi DB); trả về mã lỗi để so. */
function refusalCodes(results: PromiseSettledResult<unknown>[]): string[] {
  return results.flatMap((result) => {
    if (result.status === 'fulfilled') return [];
    if (!(result.reason instanceof AppException)) {
      throw result.reason instanceof Error
        ? result.reason
        : new Error('lỗi không phải Error');
    }
    return [result.reason.maLoi];
  });
}

describe('xác minh đồng thời cùng một tài khoản (H8)', () => {
  it(`XM-C1 (DK-29) 5 yêu cầu xác minh CÙNG mã đúng, ${String(ROUNDS)} vòng: đúng 1 thành công, 4 còn lại OTP_SAI; đúng 1 benh_nhan và 1 vi_noi_bo; không lỗi DB`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetTables(db);
      vi.setSystemTime(T0);
      fx.mail.reset();
      const r = await signUp();

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          fx.verification.verifyOtp(verifyBody(r)),
        ),
      );

      const where = `vòng ${String(round)}`;
      expect(
        results.filter((x) => x.status === 'fulfilled'),
        where,
      ).toHaveLength(1);
      expect(refusalCodes(results), where).toEqual([
        'OTP_SAI',
        'OTP_SAI',
        'OTP_SAI',
        'OTP_SAI',
      ]);
      expect(await patientRows(db), where).toHaveLength(1);
      expect(await walletRows(db), where).toHaveLength(1);
      expect((await rowOf(db, r.id)).soLanNhapSai, where).toBe(0); // yêu cầu thua không bị tính là nhập sai
      expect(
        logs.filter((line) => line.includes('deadlock (1213)')),
        where,
      ).toEqual([]);
    }
  }, 120_000);

  it('XM-C2 5 yêu cầu nhập SAI cùng lúc: đếm nguyên tử — đúng 5 lần ghi nhận, lần thứ 5 là OTP_HET_LUOT, mã đúng sau đó bị từ chối', async () => {
    const r = await signUp();
    const wrong = verifyBody(r, { otp: wrongCodeFor(r.code) });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => fx.verification.verifyOtp(wrong)),
    );

    expect(refusalCodes(results).sort()).toEqual([
      'OTP_HET_LUOT',
      'OTP_SAI',
      'OTP_SAI',
      'OTP_SAI',
      'OTP_SAI',
    ]);
    expect((await rowOf(db, r.id)).soLanNhapSai).toBe(5);
    await expect(
      fx.verification.verifyOtp(verifyBody(r)),
    ).rejects.toMatchObject({ maLoi: 'OTP_HET_LUOT' });
    expect(await patientRows(db)).toEqual([]);
  });
});

describe('gửi lại đồng thời cùng một tài khoản (H8)', () => {
  it(`GL-C1 (DK-28) 5 yêu cầu gửi lại cùng lúc, ${String(ROUNDS)} vòng: đúng 1 thành công, các yêu cầu còn lại bị từ chối nghiệp vụ (GUI_LAI_QUA_SOM, hoặc OTP_BI_THAY_THE khi mã mới đã gửi xong); đúng 1 hàng mới và 1 thư mới`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetTables(db);
      vi.setSystemTime(T0);
      fx.mail.reset();
      const r = await signUp();
      vi.setSystemTime(at(61));

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          fx.verification.resendOtp(resendBody(r)),
        ),
      );

      const where = `vòng ${String(round)}`;
      expect(
        results.filter((x) => x.status === 'fulfilled'),
        where,
      ).toHaveLength(1);
      for (const code of refusalCodes(results)) {
        expect(['GUI_LAI_QUA_SOM', 'OTP_BI_THAY_THE'], where).toContain(code);
      }
      expect(await allOtpRows(db), where).toHaveLength(2);
      expect(fx.mail.sent, where).toHaveLength(2); // thư đăng ký + đúng 1 thư gửi lại
    }
  }, 120_000);
});

describe('xác minh và gửi lại chạy chồng nhau trên cùng một tài khoản', () => {
  it(`XM-C3 ${String(ROUNDS * 2)} vòng: dù ai thắng, kết quả nhất quán — hoặc đã xác minh với đúng 1 hồ sơ và 1 ví, không còn mã sống nào, không còn dữ liệu đăng ký; hoặc chưa xác minh và verify bị từ chối`, async () => {
    for (let round = 0; round < ROUNDS * 2; round++) {
      await resetTables(db);
      vi.setSystemTime(T0);
      fx.mail.reset();
      const r = await signUp();
      vi.setSystemTime(at(61));

      const [verified, resent] = await Promise.allSettled([
        fx.verification.verifyOtp(verifyBody(r)),
        fx.verification.resendOtp(resendBody(r)),
      ]);

      const where = `vòng ${String(round)}`;
      const account = await accountByEmail(db, r.email);
      const rows = await allOtpRows(db);
      const patients = await patientRows(db);
      const wallets = await walletRows(db);
      // mọi từ chối đều là lỗi nghiệp vụ có mã, không lỗi DB/500
      for (const code of refusalCodes([verified, resent])) {
        expect(
          ['OTP_SAI', 'OTP_BI_THAY_THE', 'CAN_DANG_KY_LAI'],
          where,
        ).toContain(code);
      }
      expect(patients.length, where).toBe(wallets.length);
      expect(patients.length, where).toBeLessThanOrEqual(1);
      if (verified.status === 'fulfilled') {
        expect(account?.daXacMinhEmail, where).toBe(true);
        expect(patients, where).toHaveLength(1);
        for (const row of rows) {
          expect(row.hoTenDangKy, where).toBeNull();
          expect(row.soDienThoaiDangKy, where).toBeNull();
          expect(row.matKhauBamDangKy, where).toBeNull();
          // hoặc đã dùng, hoặc đã thu hồi: không còn mã sống nào để xác minh lần nữa
          expect(row.daDungLuc !== null || row.thuHoiLuc !== null, where).toBe(
            true,
          );
        }
      } else {
        expect(account?.daXacMinhEmail, where).toBe(false);
        expect(patients, where).toHaveLength(0);
        expect(resent.status, where).toBe('fulfilled');
      }
      expect(
        logs.filter((line) => line.includes('deadlock (1213)')),
        where,
      ).toEqual([]);
    }
  }, 120_000);

  // Hai điểm dừng của verify (thứ tự giữ khoá cố định bằng chờ thật 500 ms, không dựa vào việc MySQL chọn nạn nhân nào):
  //  - 'trước khi A6 đọc lại tài khoản': ngay sau khi OtpService khoá hàng OTP, TRƯỚC bước đầu của A6. Nếu `verify` quên khoá `tai_khoan` trước hàng
  //    OTP (đột biến M40, M6c của A5-H), pha 2 của mã mới lấy khoá tài khoản rồi chờ hàng OTP đang bị giữ, còn verify chờ khoá tài khoản ⇒ chu trình.
  //    Điểm dừng này PHẢI có: một mình điểm dừng thứ hai không bắt được M40 (đã đo: sống sót), vì lúc đó verify đã tự khoá tài khoản trong bước đầu của A6.
  //  - 'khi A6 đang tạo ví': sau mọi khoá của A6; kiểm các câu thu hồi/xoá cuối giao dịch không tạo chu trình với pha 2 đang chờ.
  it.each(['trước khi A6 đọc lại tài khoản', 'khi A6 đang tạo ví'] as const)(
    'XM-C4 thứ tự khoá với việc THẬT của A6: verify giữ khoá (dừng %s) trong lúc pha 2 của mã mới đang chờ — không deadlock, không thử lại; mã mới bị thu hồi nên pha 2 không đặt da_gui_luc (bài học A5-H)',
    async (point) => {
      const r = await signUp();
      vi.setSystemTime(at(61));
      const second = await issueOk(fx.otp, registerInput(r.taiKhoanId)); // pha 1 của mã mới, chưa gửi
      const account = await accountByEmail(db, r.email);
      if (!account) throw new Error('thiếu tài khoản');

      const entered = deferred();
      const phase2Started = deferred();
      const hold = async (): Promise<void> => {
        entered.resolve();
        await phase2Started.promise;
        await sleep(BLOCK_MS);
      };
      if (point === 'trước khi A6 đọc lại tài khoản') {
        const real = fx.accounts.findByIdForUpdate.bind(fx.accounts);
        let held = false;
        vi.spyOn(fx.accounts, 'findByIdForUpdate').mockImplementation(
          async (em, id) => {
            if (!held) {
              held = true;
              await hold();
            }
            return real(em, id);
          },
        );
      } else {
        const real = fx.wallets.insertEmpty.bind(fx.wallets);
        vi.spyOn(fx.wallets, 'insertEmpty').mockImplementation(
          async (em, id) => {
            await hold();
            return real(em, id);
          },
        );
      }
      const verifyPromise = fx.verification.verifyOtp(verifyBody(r));
      await Promise.race([entered.promise, verifyPromise]); // verify đã giữ khoá hàng OTP (và tài khoản, nếu đúng thứ tự)
      const deliverPromise = fx.otp.deliver(second, recipientOf(account));
      phase2Started.resolve();

      const settled = await Promise.allSettled([verifyPromise, deliverPromise]);

      expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(logs.filter((line) => line.includes('deadlock (1213)'))).toEqual(
        [],
      );
      expect(await patientRows(db)).toHaveLength(1);
      expect(await walletRows(db)).toHaveLength(1);
      const late: MaXacThuc = await rowOf(db, second.maXacThucId);
      expect(late.thuHoiLuc).not.toBeNull(); // bị verify thu hồi
      expect(late.daGuiLuc).toBeNull(); // pha 2 chờ khoá rồi thấy hàng đã chết
      expect(logs.some((line) => line.includes('không còn hiệu lực'))).toBe(
        true,
      );
    },
  );
});
