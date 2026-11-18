import type { DataSource } from 'typeorm';
import { barrier } from '../../../auth/testing/otp-multi-account.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import {
  ControlledMailService,
  at,
} from '../../../auth/testing/otp-int-helpers.js';
import type { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { deriveActivationLinkState } from '../activation-link-rules.js';
import {
  createActivationFixture,
  deferred,
  issueOk,
  linkRowOf,
  linkRowsOf,
  newPendingStaff,
  occupiedSlotsOf,
  recipientOf,
  sleep,
  type ActivationFixture,
} from '../testing/activation-link-fixtures.js';
import { vi } from 'vitest';

// Task B14 (admin) — chạy đua trên MySQL 8.4 THẬT (khoá hàng tai_khoan, UNIQUE kich_hoat_dang_hieu_luc, thứ tự khoá): TK-45, TK-46.
// Mã NSB14-nn là [đề xuất]. Chạy lặp nhiều vòng vì lỗi đua chỉ lộ ra một phần số lần; lỗi nào cũng làm test ĐỎ (kể cả 500 hay 1062).
// KHÔNG dùng bộ đếm deadlock toàn máy chủ (cần SET GLOBAL, và bị nhiễu bởi các cửa sổ khác dùng chung MySQL): deadlock lọt ra thì thành lỗi ném ra
// ở pha 1, hoặc để lại dòng log "deadlock (1213)" ở pha 2 (thử lại).
const ROUNDS = 15;

let db: DataSource;
let fx: ActivationFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createActivationFixture(testDb);
});

const deadlockLines = (): string[] =>
  logs.filter((line) => line.includes('deadlock (1213)'));

describe('hai yêu cầu cấp liên kết cùng lúc (TK-45)', () => {
  it(`NSB14-50 (TK-45) hai "Gửi lại" đồng thời cho cùng tài khoản: đúng MỘT hàng mới, một GUI_LAI_QUA_SOM, không lỗi khác, dù chạy ${String(ROUNDS)} vòng`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newPendingStaff(db);
      const run = () =>
        fx.service.transaction((em) =>
          fx.service.issue(
            { taiKhoanId: account.taiKhoanId, kind: 'GuiLai' },
            { manager: em },
          ),
        );
      const results = await Promise.all([run(), run()]);

      expect(
        results.filter((r) => r.ok),
        `vòng ${String(round)}`,
      ).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({
        ok: false,
        failure: { code: 'GUI_LAI_QUA_SOM', reason: 'TOO_SOON' },
      });
      expect(await linkRowsOf(db, account.taiKhoanId)).toHaveLength(1);

      const winner = results.find((r) => r.ok);
      if (!winner?.ok) throw new Error('không có bên thắng');
      await expect(
        fx.service.deliver(winner.issued, recipientOf(account)),
      ).resolves.toMatchObject({ ok: true });
      expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
    }
    // Mỗi vòng đúng một thư
    expect(fx.mail.attempts).toHaveLength(ROUNDS);
  });
});

describe('hai lần gửi lại hoàn tất cùng lúc (TK-45, TK-46)', () => {
  it(`NSB14-51 (TK-45, TK-46) hai deliver đồng thời với thứ tự hoàn tất ngẫu nhiên: đúng MỘT liên kết hợp lệ là hàng id lớn nhất; không 1062, không lỗi lọt ra (${String(ROUNDS)} vòng)`, async () => {
    const mail = new ControlledMailService();
    const held = createActivationFixture(db, mail);
    for (let round = 0; round < ROUNDS; round++) {
      vi.setSystemTime(at(0));
      const account = await newPendingStaff(db);
      const issuedOld = await issueOk(held.service, account.taiKhoanId);
      vi.setSystemTime(at(61));
      const issuedNew = await issueOk(held.service, account.taiKhoanId);

      mail.holding = true;
      const oldPromise = held.service.deliver(issuedOld, recipientOf(account));
      const newPromise = held.service.deliver(issuedNew, recipientOf(account));
      await mail.waitForPending(2);
      // Thả CÙNG LÚC (không chờ nhau) theo thứ tự ngẫu nhiên để hai giao dịch hậu gửi chồng lên nhau
      if (Math.random() < 0.5) {
        mail.release(1);
        mail.release(0);
      } else {
        mail.release(0);
        mail.release(0);
      }
      const settled = await Promise.allSettled([oldPromise, newPromise]);

      const where = `vòng ${String(round)}`;
      expect(
        settled
          .filter((s) => s.status === 'rejected')
          .map((s) => String(s.reason)),
        where,
      ).toEqual([]);
      expect(await occupiedSlotsOf(db, account.taiKhoanId), where).toBe(1);
      const rows = await linkRowsOf(db, account.taiKhoanId);
      const states = rows.map((row) =>
        deriveActivationLinkState(row, new Date()),
      );
      expect(states, where).toEqual(['BI_THU_HOI', 'HOP_LE']);
      expect(rows[1]?.maXacThucId, where).toBe(issuedNew.maXacThucId);
    }
    expect(deadlockLines()).toEqual([]);
  });

  it(`NSB14-52 sáu tài khoản KHÁC nhau cùng cấp và gửi song song (${String(ROUNDS)} vòng): mọi việc thành công, không deadlock lọt ra, không dòng log "deadlock (1213)"`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const accounts = await Promise.all(
        Array.from({ length: 6 }, () => newPendingStaff(db)),
      );
      const gate = barrier(accounts.length);
      const settled = await Promise.allSettled(
        accounts.map(async (account) => {
          await gate();
          const result = await fx.service.transaction((em) =>
            fx.service.issue(
              { taiKhoanId: account.taiKhoanId, kind: 'TaoMoi' },
              { manager: em },
            ),
          );
          if (!result.ok) throw new Error(`bị từ chối: ${result.failure.code}`);
          return fx.service.deliver(result.issued, recipientOf(account));
        }),
      );

      const where = `vòng ${String(round)}`;
      expect(
        settled
          .filter((s) => s.status === 'rejected')
          .map((s) => String(s.reason)),
        where,
      ).toEqual([]);
      for (const account of accounts) {
        expect(await occupiedSlotsOf(db, account.taiKhoanId), where).toBe(1);
      }
    }
    expect(deadlockLines()).toEqual([]);
  });
});

describe('thứ tự khoá: tài khoản trước, hàng liên kết sau (H8)', () => {
  it('NSB14-53 deliver chờ khoá hàng tai_khoan do người gọi (giả B20) đang giữ, chạy tiếp SAU khi người gọi làm xong: không deadlock, không thử lại', async () => {
    const account = await newPendingStaff(db);
    const issuedOld = await issueOk(fx.service, account.taiKhoanId, 'TaoMoi');
    vi.setSystemTime(at(61));

    const events: string[] = [];
    const entered = deferred();
    const deliverStarted = deferred();
    // Giả B20: giữ khoá hàng tai_khoan rồi mới cấp liên kết mới, trong cùng một giao dịch
    const caller = fx.service.transaction(async (em) => {
      await em.query(
        'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
        [account.taiKhoanId],
      );
      entered.resolve();
      await deliverStarted.promise;
      await sleep(500); // đủ để pha 2 của deliver chạm tới ổ khoá bị giữ
      const result = await fx.service.issue(
        { taiKhoanId: account.taiKhoanId, kind: 'GuiLai' },
        { manager: em },
      );
      events.push('nguoi-goi-xong-viec');
      return result;
    });
    await entered.promise;
    const delivering = fx.service
      .deliver(issuedOld, recipientOf(account))
      .then((result) => {
        events.push('deliver-xong');
        return result;
      });
    deliverStarted.resolve();

    const [callerResult, deliverResult] = await Promise.all([
      caller,
      delivering,
    ]);
    expect(callerResult.ok).toBe(true);
    expect(deliverResult).toMatchObject({ ok: true });
    // deliver phải đợi người gọi nhả khoá tài khoản: chỉ xong SAU khi người gọi làm xong việc
    expect(events).toEqual(['nguoi-goi-xong-viec', 'deliver-xong']);
    expect(deadlockLines()).toEqual([]);
    // Hàng cũ được gửi xong (hợp lệ cho tới khi liên kết mới được gửi); hàng mới vẫn "mới tạo"
    expect(
      deriveActivationLinkState(
        await linkRowOf(db, issuedOld.maXacThucId),
        new Date(),
      ),
    ).toBe('HOP_LE');
    expect(await occupiedSlotsOf(db, account.taiKhoanId)).toBe(1);
  });
});
