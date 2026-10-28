import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { resetTables } from '../../database/testing/test-database.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { OTP_PHASE2_MAX_ATTEMPTS } from '../auth.constants.js';
import { insertTaiKhoan } from '../entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  at,
  createOtpFixture,
  forgotInput,
  issueDeliverRead,
  issueOk,
  newUnverifiedAccount,
  recipientOf,
  registerInput,
  rowOf,
  rowsOf,
  type OtpFixture,
} from '../testing/otp-int-helpers.js';
import { OtpDeliveryError } from './otp-errors.js';

// Task A5 (sửa lỗi deadlock chéo tài khoản của A2) — MySQL 8.4 THẬT. Kiểm: OtpService.transaction là giao dịch READ COMMITTED thật; đọc không khoá CHỈ
// cho giao dịch do OtpService mở, giao dịch lạ vẫn đọc khoá (đúng ở mọi mức cô lập); khoá điểm hàng theo khoá chính trong verify; cảnh báo một lần;
// tính đúng đắn (không lọt giới hạn gửi lại, không dùng nhầm dữ liệu cũ) trong cách dùng mới; thử lại pha 2 khi 1213. Mã OTP-RC-nn là [đề xuất].
let db: DataSource;
let fx: OtpFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createOtpFixture(testDb);
});

const goTo = (seconds: number) => vi.setSystemTime(at(seconds));
const deadlock = () =>
  new QueryFailedError(
    'UPDATE',
    [],
    Object.assign(new Error('Deadlock found'), {
      errno: 1213,
      code: 'ER_LOCK_DEADLOCK',
    }),
  );
const count = async (em: EntityManager, table: string): Promise<number> => {
  const rows: { n: string }[] = await em.query(
    `SELECT COUNT(*) AS n FROM ${table}`,
  );
  return Number(rows[0]?.n);
};

describe('OtpService.transaction là giao dịch READ COMMITTED thật', () => {
  const observeExternalCommit = (
    open: <T>(work: (em: EntityManager) => Promise<T>) => Promise<T>,
  ) =>
    open(async (em) => {
      const before = await count(em, 'tai_khoan');
      await insertTaiKhoan(db, { email: 'ben.khac@example.com' }); // kết nối khác, tự commit
      const after = await count(em, 'tai_khoan');
      return [before, after];
    });

  it('OTP-RC-01 đọc thường thấy dữ liệu bên khác vừa commit (0 → 1); giao dịch thô REPEATABLE READ thì không (0 → 0)', async () => {
    expect(
      await observeExternalCommit((work) => fx.otp.transaction(work)),
    ).toEqual([0, 1]);
    await resetTables(db);
    expect(await observeExternalCommit((work) => db.transaction(work))).toEqual(
      [0, 0],
    );
  });

  it('OTP-RC-02 KHÔNG đọc được mức cô lập của giao dịch hiện tại bằng SQL: @@transaction_isolation luôn báo mức của PHIÊN (REPEATABLE-READ) dù giao dịch chạy READ COMMITTED — nên OtpService nhận biết bằng nguồn gốc giao dịch, không bằng SQL', async () => {
    const inside = await fx.otp.transaction(async (em) => {
      const rows: { v: string }[] = await em.query(
        'SELECT @@transaction_isolation AS v',
      );
      return rows[0]?.v;
    });
    expect(inside).toBe('REPEATABLE-READ'); // nếu MySQL đổi hành vi này thì test đỏ: lúc đó có thể thay bằng kiểm tra trực tiếp
  });

  it('OTP-RC-03 transaction không tự thử lại: lỗi (kể cả deadlock) của work ném ra nguyên vẹn, work chỉ chạy một lần', async () => {
    const work = vi.fn().mockRejectedValue(deadlock());
    await expect(fx.otp.transaction(work)).rejects.toBeInstanceOf(
      QueryFailedError,
    );
    expect(work).toHaveBeenCalledOnce();
  });
});

describe('đọc không khoá chỉ cho giao dịch do OtpService mở (lock = false); giao dịch lạ vẫn đọc khoá (lock = true)', () => {
  it('OTP-RC-04 issue: giao dịch riêng và otp.transaction → không khoá; giao dịch thô → khoá (đúng ở mọi mức cô lập)', async () => {
    const spy = vi.spyOn(fx.repo, 'listCreatedSinceForUpdate');
    const own = await newUnverifiedAccount(db, { email: 'a1@example.com' });
    const std = await newUnverifiedAccount(db, { email: 'a2@example.com' });
    const raw = await newUnverifiedAccount(db, { email: 'a3@example.com' });

    await fx.otp.issue(registerInput(own.taiKhoanId));
    await fx.otp.transaction((em) =>
      fx.otp.issue(registerInput(std.taiKhoanId), { manager: em }),
    );
    await db.transaction((em) =>
      fx.otp.issue(registerInput(raw.taiKhoanId), { manager: em }),
    );

    expect(spy.mock.calls.map((call) => call[4])).toEqual([false, false, true]);
  });

  it('OTP-RC-05 reissue: existsNewerSentForUpdate — otp.transaction → không khoá; giao dịch thô → khoá', async () => {
    const account = await newUnverifiedAccount(db);
    const { id } = await issueDeliverRead(fx, account);
    goTo(61);
    const spy = vi.spyOn(fx.repo, 'existsNewerSentForUpdate');

    await fx.otp.transaction((em) =>
      fx.otp.reissue({ maXacThucId: id }, { manager: em }),
    );
    goTo(122);
    await db.transaction((em) =>
      fx.otp.reissue({ maXacThucId: id }, { manager: em }),
    );

    expect(spy.mock.calls.map((call) => call[2])).toEqual([false, true]);
  });

  it('OTP-RC-06 verify (quên mật khẩu, tìm hàng theo tài khoản): tìm bằng đọc KHÔNG khoá rồi KHOÁ ĐIỂM đúng hàng đó theo khoá chính TRƯỚC khi đếm sai hoặc đánh dấu đã dùng', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account, 'QuenMatKhau');
    const order: string[] = [];
    const realLatest = fx.repo.findLatestSentForUpdate.bind(fx.repo);
    const realById = fx.repo.findByIdForUpdate.bind(fx.repo);
    const realUsed = fx.repo.markUsed.bind(fx.repo);
    vi.spyOn(fx.repo, 'findLatestSentForUpdate').mockImplementation(
      (em, tk, loai, lock) => {
        order.push(`tìm theo tài khoản (lock=${String(lock)})`);
        return realLatest(em, tk, loai, lock);
      },
    );
    vi.spyOn(fx.repo, 'findByIdForUpdate').mockImplementation((em, rowId) => {
      order.push(`khoá điểm hàng ${rowId}`);
      return realById(em, rowId);
    });
    vi.spyOn(fx.repo, 'markUsed').mockImplementation((em, rowId, when) => {
      order.push(`đánh dấu dùng hàng ${rowId}`);
      return realUsed(em, rowId, when);
    });

    const result = await fx.otp.verify(
      { taiKhoanId: account.taiKhoanId, loai: 'QuenMatKhau', otp: code },
      { consume: true },
    );

    expect(result.ok).toBe(true);
    expect(order).toEqual([
      'tìm theo tài khoản (lock=false)',
      `khoá điểm hàng ${id}`,
      `đánh dấu dùng hàng ${id}`,
    ]);
  });

  it('OTP-RC-07 cảnh báo MỘT lần khi giao dịch lạ gọi issue/reissue; không cảnh báo với otp.transaction hay giao dịch riêng', async () => {
    const a = await newUnverifiedAccount(db, { email: 'w1@example.com' });
    const b = await newUnverifiedAccount(db, { email: 'w2@example.com' });
    const warnings = () =>
      logs.filter((line) => line.includes('otp.transaction'));

    await fx.otp.issue(registerInput(a.taiKhoanId));
    await fx.otp.transaction((em) =>
      fx.otp.issue(registerInput(b.taiKhoanId), { manager: em }),
    );
    expect(warnings()).toHaveLength(0);

    goTo(61);
    await db.transaction((em) =>
      fx.otp.issue(registerInput(a.taiKhoanId), { manager: em }),
    );
    expect(warnings()).toHaveLength(1);
    goTo(122);
    await db.transaction((em) =>
      fx.otp.issue(registerInput(b.taiKhoanId), { manager: em }),
    );
    expect(warnings()).toHaveLength(1); // không lặp lại
  });
});

describe('đúng đắn trong cách dùng mới: không lọt giới hạn gửi lại, không dùng nhầm dữ liệu cũ (thay thế OTP-G02, G08, G09 cho otp.transaction)', () => {
  function barrier(parties: number) {
    let arrived = 0;
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (open = resolve));
    return () => {
      arrived += 1;
      if (arrived >= parties) open();
      return gate;
    };
  }

  it('OTP-RC-08 hai người gọi CÙNG tài khoản, mỗi người đã đọc thường trước rồi mới cấp mã, trong otp.transaction: đúng MỘT mã được cấp (giới hạn 60 giây không bị lọt), 15 vòng', async () => {
    for (let round = 0; round < 15; round++) {
      const account = await newUnverifiedAccount(db, {
        email: `g${String(round)}@example.com`,
      });
      const wait = barrier(2);
      const run = () =>
        fx.otp.transaction(async (em) => {
          await count(em, 'ma_xac_thuc'); // đọc thường TRƯỚC khi tranh khoá (ở REPEATABLE READ việc này ghim ảnh chụp cũ)
          await wait();
          return fx.otp.issue(registerInput(account.taiKhoanId), {
            manager: em,
          });
        });
      const results = await Promise.all([run(), run()]);
      expect(
        results.filter((r) => r.ok),
        `vòng ${String(round)}`,
      ).toHaveLength(1);
      expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(1);
    }
  });

  it('OTP-RC-09 giới hạn 5 mã/giờ vẫn đúng khi bên khác vừa commit mã thứ 5 SAU lần đọc đầu của người gọi (otp.transaction): mã thứ 6 bị từ chối', async () => {
    const account = await newUnverifiedAccount(db);
    for (const seconds of [0, 61, 122, 183]) {
      goTo(seconds);
      await issueOk(fx.otp, registerInput(account.taiKhoanId));
    }
    goTo(305);
    const result = await fx.otp.transaction(async (em) => {
      await count(em, 'ma_xac_thuc'); // người gọi đã đọc: thấy 4 hàng
      await issueOk(fx.otp, registerInput(account.taiKhoanId)); // bên khác (kết nối khác) commit hàng thứ 5
      return fx.otp.issue(registerInput(account.taiKhoanId), { manager: em });
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'GUI_LAI_QUA_SOM' },
    });
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(5);
  });

  it.each([
    ['thu_hoi_luc', 'REVOKED'],
    ['da_dung_luc', 'USED'],
  ] as const)(
    'OTP-RC-10 consume trong otp.transaction: bên khác vừa đặt %s sau lần đọc của người gọi → %s',
    async (column, reason) => {
      const account = await newUnverifiedAccount(db);
      const { id } = await issueDeliverRead(fx, account, 'QuenMatKhau');
      const result = await fx.otp.transaction(async (em) => {
        await count(em, 'ma_xac_thuc');
        await db.query(
          `UPDATE ma_xac_thuc SET ${column} = ? WHERE ma_xac_thuc_id = ?`,
          [at(5), id],
        );
        return fx.otp.consume(
          {
            maXacThucId: id,
            taiKhoanId: account.taiKhoanId,
            loai: 'QuenMatKhau',
          },
          { manager: em },
        );
      });
      expect(result).toEqual({ ok: false, reason });
    },
  );

  it('OTP-RC-11 reissue trong otp.transaction: bên khác vừa đánh dấu hàng đã dùng sau lần đọc của người gọi → bị từ chối, không cấp mã mới', async () => {
    const account = await newUnverifiedAccount(db);
    const { id } = await issueDeliverRead(fx, account);
    goTo(61);
    const result = await fx.otp.transaction(async (em) => {
      await count(em, 'ma_xac_thuc');
      await db.query(
        'UPDATE ma_xac_thuc SET da_dung_luc = ? WHERE ma_xac_thuc_id = ?',
        [at(5), id],
      );
      return fx.otp.reissue({ maXacThucId: id }, { manager: em });
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'USED' },
    });
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(1);
  });
});

describe('pha 2 thử lại khi deadlock (1213), tối đa 3 lần', () => {
  it('OTP-RC-12 gửi thành công: deadlock ở lần đầu → lần sau ghi được; thư chỉ gửi MỘT lần, mã cũ bị thu hồi', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    goTo(61);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    const realMarkSent = fx.repo.markSent.bind(fx.repo);
    const markSent = vi
      .spyOn(fx.repo, 'markSent')
      .mockRejectedValueOnce(deadlock())
      .mockImplementation(realMarkSent);

    await fx.otp.deliver(issued, recipientOf(account));

    expect(markSent).toHaveBeenCalledTimes(2);
    expect(fx.mail.sent).toHaveLength(2); // thư mã đầu + thư mã này, không gửi lại vì thử lại
    expect((await rowOf(db, issued.maXacThucId)).daGuiLuc).toEqual(at(61));
    expect((await rowOf(db, first.id)).thuHoiLuc).toEqual(at(61));
    expect(logs.some((line) => line.includes('deadlock (1213) lần 1/3'))).toBe(
      true,
    );
  });

  it('OTP-RC-13 gửi thành công mà deadlock cả 3 lần: ném đúng lỗi 1213 sau ĐÚNG 3 lần, giao dịch hoàn tác trọn (không để nửa chừng), thư không bị gửi lại', async () => {
    const account = await newUnverifiedAccount(db);
    const first = await issueDeliverRead(fx, account);
    goTo(61);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    const markSent = vi
      .spyOn(fx.repo, 'markSent')
      .mockRejectedValue(deadlock());

    await expect(
      fx.otp.deliver(issued, recipientOf(account)),
    ).rejects.toBeInstanceOf(QueryFailedError);

    expect(markSent).toHaveBeenCalledTimes(OTP_PHASE2_MAX_ATTEMPTS);
    expect(fx.mail.sent).toHaveLength(2);
    expect((await rowOf(db, issued.maXacThucId)).daGuiLuc).toBeNull(); // hoàn tác trọn
    expect((await rowOf(db, first.id)).thuHoiLuc).toBeNull();
  });

  it('OTP-RC-14 lỗi KHÔNG phải deadlock thì không thử lại: ném ngay sau một lần', async () => {
    const account = await newUnverifiedAccount(db);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    const markSent = vi
      .spyOn(fx.repo, 'markSent')
      .mockRejectedValue(new Error('lỗi khác'));

    await expect(fx.otp.deliver(issued, recipientOf(account))).rejects.toThrow(
      'lỗi khác',
    );
    expect(markSent).toHaveBeenCalledOnce();
  });

  it('OTP-RC-15 gửi lỗi: deadlock khi thu hồi hàng mới → thử lại được; người gọi vẫn nhận OtpDeliveryError gốc', async () => {
    const account = await newUnverifiedAccount(db);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    fx.mail.failNextWith('CONNECTION');
    const realRevoke = fx.repo.revokeUnsent.bind(fx.repo);
    const revokeUnsent = vi
      .spyOn(fx.repo, 'revokeUnsent')
      .mockRejectedValueOnce(deadlock())
      .mockImplementation(realRevoke);

    await expect(
      fx.otp.deliver(issued, recipientOf(account)),
    ).rejects.toBeInstanceOf(OtpDeliveryError);

    expect(revokeUnsent).toHaveBeenCalledTimes(2);
    expect((await rowOf(db, issued.maXacThucId)).thuHoiLuc).not.toBeNull();
  });

  it('OTP-RC-16 gửi lỗi mà deadlock cả 3 lần khi ghi: vẫn ném OtpDeliveryError gốc (không để lỗi ghi che mất), ghi log ERROR', async () => {
    const account = await newUnverifiedAccount(db);
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    fx.mail.failNextWith('CONNECTION');
    const revokeUnsent = vi
      .spyOn(fx.repo, 'revokeUnsent')
      .mockRejectedValue(deadlock());

    await expect(
      fx.otp.deliver(issued, recipientOf(account)),
    ).rejects.toBeInstanceOf(OtpDeliveryError);

    expect(revokeUnsent).toHaveBeenCalledTimes(OTP_PHASE2_MAX_ATTEMPTS);
    expect(
      logs.some((line) => line.includes('Không ghi được kết quả gửi lỗi')),
    ).toBe(true);
  });
});

describe('forgotInput vẫn chạy trong giao dịch riêng (A11 dùng issueAndDeliver)', () => {
  it('OTP-RC-17 issueAndDeliver không cần người gọi mở giao dịch: dùng đường không khoá', async () => {
    const account = await newUnverifiedAccount(db);
    const spy = vi.spyOn(fx.repo, 'listCreatedSinceForUpdate');
    const result = await fx.otp.issueAndDeliver(
      forgotInput(account.taiKhoanId),
      recipientOf(account),
    );
    expect(result.ok).toBe(true);
    expect(spy.mock.calls.map((call) => call[4])).toEqual([false]);
  });
});
