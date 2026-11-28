import { measure, percentile, summarize } from './perf-stats.js';

// dashboard X1 — hàm thống kê của phép đo thật (PLAN dashboard 5.14: "làm nóng 5 lần, đo 30 lần, lấy p95"). Kiểm để số p95 ghi vào TRACKING tính đúng.

describe('dashboard X1 — phân vị hạng gần nhất', () => {
  it('30 mẫu 1..30 ⇒ p95 là mẫu thứ 29, p50 là mẫu thứ 15; không phụ thuộc thứ tự đưa vào', () => {
    const samples = Array.from({ length: 30 }, (_, i) => 30 - i);
    expect(percentile(samples, 0.95)).toBe(29);
    expect(percentile(samples, 0.5)).toBe(15);
    expect(summarize(samples)).toEqual({ n: 30, p50: 15, p95: 29, max: 30 });
  });

  it('biên: một mẫu ⇒ chính nó; 150 mẫu (M4) ⇒ mẫu thứ 143; dãy rỗng ⇒ lỗi', () => {
    expect(percentile([7], 0.95)).toBe(7);
    const many = Array.from({ length: 150 }, (_, i) => i + 1);
    expect(percentile(many, 0.95)).toBe(143);
    expect(() => percentile([], 0.95)).toThrow();
  });

  it('measure: chạy đúng 5 lần làm nóng và 30 lần đo, chỉ 30 lần được tính', async () => {
    let calls = 0;
    const summary = await measure(async () => {
      calls += 1;
    });
    expect(calls).toBe(35);
    expect(summary.n).toBe(30);
    expect(summary.p95).toBeGreaterThanOrEqual(0);
  });
});
