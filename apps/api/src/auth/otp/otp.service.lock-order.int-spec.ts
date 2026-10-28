import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  at,
  createOtpFixture,
  issueDeliverRead,
  issueOk,
  newUnverifiedAccount,
  recipientOf,
  registerInput,
  rowOf,
  type OtpFixture,
} from '../testing/otp-int-helpers.js';

// Task A5 (sửa A2) — thứ tự khoá tài khoản → hàng OTP khi người gọi `verify` còn việc phải làm trong CÙNG giao dịch (`onVerified`).
// Sau khi đọc đếm/quyết định không khoá (A5-C), OTP-G06/G07 của A2 không còn tạo được chu trình khoá giữa các việc của chính OtpService,
// nên đột biến "verify không khoá tài khoản" (M6c) và "pha 2 khoá hàng OTP trước tài khoản" (M6e) sống sót ở đợt đột biến A5.
// Hai test dưới đây dựng lại chu trình bằng việc A6 sẽ làm trong `onVerified` (ghi tài khoản, thu hồi mã còn lại của tài khoản)
// với thứ tự cố định bằng chờ thật, không dựa vào việc MySQL chọn nạn nhân nào:
//   - đúng thứ tự: không deadlock, không lần thử lại nào ở pha 2 (không có dòng log "deadlock (1213)");
//   - sai thứ tự: MySQL báo 1213 cho `verify` (bị từ chối) HOẶC cho pha 2 (bị thử lại và để lại dòng log) — cả hai đều làm test đỏ.
// Mã test case OTP-LO-nn là [đề xuất].
const BLOCK_MS = 500; // đủ để pha 2 chạm tới ổ khoá bị giữ; chờ ngắn quá chỉ làm test KHÔNG đỏ khi sai, không bao giờ đỏ oan khi đúng

let db: DataSource;
let fx: OtpFixture<FakeMailService>;
let logLines: string[];

useIntegrationHooks((testDb, logs) => {
  db = testDb;
  logLines = logs;
  fx = createOtpFixture(testDb);
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Một mã cũ R đã gửi, một mã mới B vừa cấp (chưa gửi). `verify(R, consume)` giữ khoá rồi dừng trong `onVerified` cho tới khi pha 2 của B
// đã bắt đầu và chờ đủ lâu; sau đó mới làm `work`. Trả kết quả của hai việc chạy chồng nhau.
async function verifyWhilePhase2(
  work: (manager: EntityManager, accountId: string) => Promise<void>,
): Promise<{
  firstId: string;
  secondId: string;
  settled: [PromiseSettledResult<unknown>, PromiseSettledResult<unknown>];
  verifyOk: boolean;
}> {
  const account = await newUnverifiedAccount(db);
  const first = await issueDeliverRead(fx, account);
  vi.setSystemTime(at(61));
  const second = await issueOk(fx.otp, registerInput(account.taiKhoanId));

  const entered = deferred();
  const phase2Started = deferred();
  const verifyPromise = fx.otp.verify(
    { maXacThucId: first.id, loai: 'DangKy', otp: first.code },
    { consume: true },
    async ({ manager }) => {
      entered.resolve();
      await phase2Started.promise;
      await sleep(BLOCK_MS);
      await work(manager, account.taiKhoanId);
    },
  );
  await Promise.race([entered.promise, verifyPromise]);
  const deliverPromise = fx.otp.deliver(second, recipientOf(account));
  phase2Started.resolve();

  const settled = await Promise.allSettled([verifyPromise, deliverPromise]);
  const verified = settled[0];
  return {
    firstId: first.id,
    secondId: second.maXacThucId,
    settled: [settled[0], settled[1]],
    verifyOk: verified.status === 'fulfilled' && verified.value.ok,
  };
}

// Cả hai việc xong, verify thành công, và pha 2 không phải thử lại vì deadlock (thử lại để lại dòng log "deadlock (1213)")
function expectNoDeadlock(
  result: Awaited<ReturnType<typeof verifyWhilePhase2>>,
): void {
  const outcomes = result.settled.map((s) =>
    s.status === 'fulfilled' ? 'ok' : String(s.reason),
  );
  expect(outcomes).toEqual(['ok', 'ok']);
  expect(result.verifyOk).toBe(true);
  expect(logLines.filter((l) => l.includes('deadlock (1213)'))).toEqual([]);
}

describe('verify giữ đúng thứ tự khoá khi người gọi làm thêm việc trong giao dịch (H8)', () => {
  it('OTP-LO-01 verify khoá TÀI KHOẢN trước hàng OTP: onVerified khoá tài khoản trong lúc pha 2 của mã mới đang chờ — không deadlock, không thử lại', async () => {
    const result = await verifyWhilePhase2(async (manager, accountId) => {
      await manager.query(
        'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
        [accountId],
      );
    });

    expectNoDeadlock(result);
    expect((await rowOf(db, result.firstId)).daDungLuc).not.toBeNull(); // mã cũ đã dùng
    expect((await rowOf(db, result.secondId)).daGuiLuc).not.toBeNull(); // pha 2 chờ rồi chạy xong sau khi verify commit
  });

  it('OTP-LO-02 pha 2 khoá TÀI KHOẢN trước hàng OTP của mã mới: onVerified thu hồi mã còn lại của tài khoản trong lúc pha 2 đang chờ — không deadlock, không thử lại', async () => {
    const result = await verifyWhilePhase2(async (manager, accountId) => {
      await fx.otp.revokePending(accountId, 'DangKy', { manager });
    });

    expectNoDeadlock(result);
    const second = await rowOf(db, result.secondId);
    expect(second.thuHoiLuc).not.toBeNull(); // mã mới bị thu hồi bởi người gọi verify
    expect(second.daGuiLuc).toBeNull(); // nên pha 2 không đặt da_gui_luc
    expect(logLines.some((l) => l.includes('không còn hiệu lực'))).toBe(true);
  });
});
