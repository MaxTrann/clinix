import {
  createGate,
  runConcurrently,
  summarize,
} from './concurrency-harness.js';

// Doctor P5 — kiểm công cụ chạy đua (không có mã test case riêng trong plan; phục vụ DH-*).
describe('concurrency-harness', () => {
  it('createGate: không ai chạy tiếp cho tới khi đủ số bên đã tới', async () => {
    const gate = createGate(3);
    const order: string[] = [];
    const run = (name: string) => async () => {
      order.push(`${name}:trước`);
      await gate.arrive();
      order.push(`${name}:sau`);
    };
    await runConcurrently([run('a'), run('b'), run('c')]);
    // cả ba "trước" đều xảy ra trước bất kỳ "sau" nào
    expect(order.slice(0, 3).every((item) => item.endsWith(':trước'))).toBe(
      true,
    );
    expect(order.slice(3).every((item) => item.endsWith(':sau'))).toBe(true);
  });

  it('createGate: thiếu một bên thì các bên còn lại vẫn đứng chờ (không mở sớm)', async () => {
    const gate = createGate(2);
    let passed = false;
    void gate.arrive().then(() => {
      passed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(passed).toBe(false);
    await gate.arrive();
    await Promise.resolve();
    expect(passed).toBe(true);
  });

  it('summarize: tách giá trị thành công và lỗi, kể cả callback ném lỗi đồng bộ', async () => {
    const results = await runConcurrently([
      async () => 1,
      async () => {
        throw new Error('hỏng');
      },
      () => {
        throw new Error('ném đồng bộ');
      },
    ]);
    const { values, reasons } = summarize(results);
    expect(values).toEqual([1]);
    expect(reasons.map((reason) => (reason as Error).message)).toEqual([
      'hỏng',
      'ném đồng bộ',
    ]);
  });
});
