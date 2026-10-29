import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  WRONG_PASSWORD,
  createLoginFixture,
  loginBody,
  newLoginAccount,
  type LoginFixture,
} from '../testing/login-int-helpers.js';

// Task A8 — kiểm thô tải của Argon2id khi nhiều đăng nhập đồng thời (điểm (e), quyết định A8-I). Argon2id tốn ~20 ms CPU và 19 MiB mỗi lần:
// nhiều đăng nhập cùng lúc KHÔNG được làm nghẽn event loop (băm chạy trên threadpool của libuv), không giữ kết nối DB trong lúc băm (pool không cạn),
// không hết RAM. Test in SỐ ĐO (cho TRACKING) và chỉ khẳng định ngưỡng RỘNG để không chập chờn. Mã LT-nn là [đề xuất]. Không phải bằng chứng
// cho server thật (TECH_DEBT dòng 10: chưa đo trên staging; chưa có giới hạn IP, dòng 27 và 38).
const PARALLEL = Number(process.env['LOGIN_LOAD_PARALLEL'] ?? 40);

let db: DataSource;
let fx: LoginFixture<FakeMailService>;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createLoginFixture(testDb);
});

const MiB = 1024 * 1024;

describe('tải đăng nhập đồng thời', () => {
  it(`LT-01 ${String(PARALLEL)} đăng nhập sai song song (mỗi yêu cầu một tài khoản): tất cả hoàn tất, event loop không nghẽn, RAM không phình`, async () => {
    const accounts = [];
    for (let i = 0; i < PARALLEL; i++) accounts.push(await newLoginAccount(db));
    await fx.login
      .login(
        loginBody(accounts[0] ?? (await newLoginAccount(db)), WRONG_PASSWORD),
      )
      .catch(() => undefined); // làm nóng (băm giả, kết nối)
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    const rssBefore = process.memoryUsage().rss;
    let rssPeak = rssBefore;
    const sampler = setInterval(() => {
      rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
    }, 10);
    const started = performance.now();

    const results = await Promise.allSettled(
      accounts.map((account) =>
        fx.login.login(loginBody(account, WRONG_PASSWORD)),
      ),
    );

    const elapsed = performance.now() - started;
    clearInterval(sampler);
    histogram.disable();
    const maxDelayMs = histogram.max / 1e6;
    const rssGrowthMiB = (rssPeak - rssBefore) / MiB;
    console.info(
      `[LT-01] ${String(PARALLEL)} đăng nhập song song: ${elapsed.toFixed(0)} ms tổng (${((PARALLEL / elapsed) * 1000).toFixed(0)} lần/giây); trễ tối đa của event loop ${maxDelayMs.toFixed(0)} ms (p99 ${(histogram.percentile(99) / 1e6).toFixed(0)} ms); RSS tăng tối đa ${rssGrowthMiB.toFixed(0)} MiB`,
    );

    expect(results).toHaveLength(PARALLEL);
    expect(
      results.every(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof AppException &&
          result.reason.maLoi === 'DANG_NHAP_SAI',
      ),
    ).toBe(true);
    expect(maxDelayMs).toBeLessThan(1000); // ngưỡng rộng: nếu băm chạy trên luồng chính thì trễ sẽ bằng cả đợt (vài trăm ms trở lên mỗi lần)
    expect(rssGrowthMiB).toBeLessThan(400); // chặn bởi số luồng của threadpool × 19 MiB, không phải số yêu cầu
  }, 120_000);

  it('LT-02 độ dài mật khẩu KHÔNG làm đổi chi phí băm đáng kể: mật khẩu 64 ký tự và 100 000 ký tự (trần thân 100 KB) tốn cùng cỡ', async () => {
    const time = async (password: string): Promise<number> => {
      const started = performance.now();
      await fx.hasher.verifyDummy(password);
      return performance.now() - started;
    };
    await time('a'); // làm nóng
    const short: number[] = [];
    const long: number[] = [];
    for (let i = 0; i < 7; i++) {
      short.push(await time('a'.repeat(64)));
      long.push(await time('a'.repeat(100_000)));
    }
    const median = (values: number[]) =>
      [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)] ?? 0;
    console.info(
      `[LT-02] trung vị băm: 64 ký tự ${median(short).toFixed(1)} ms, 100 000 ký tự ${median(long).toFixed(1)} ms`,
    );

    expect(median(long)).toBeLessThan(median(short) * 3);
  }, 60_000);
});
