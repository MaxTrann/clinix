import { createMailMock, freezeTime, runConcurrently } from './test-helpers.js';

// P4 #48 không có mã test case riêng; kiểm các công cụ dùng chung cho test admin.
afterEach(() => vi.useRealTimers());

describe('P4 — công cụ kiểm thử', () => {
  it('cố định Date qua nửa đêm VN, timer I/O vẫn chạy và khôi phục được', async () => {
    const clock = freezeTime(new Date('2026-10-27T23:59:59+07:00'));
    expect(new Date().toISOString()).toBe('2026-10-27T16:59:59.000Z');
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
    clock.set(new Date('2026-10-28T00:00:00+07:00'));
    expect(Date.now()).toBe(Date.parse('2026-10-27T17:00:00Z'));
    clock.restore();
    expect(vi.isFakeTimers()).toBe(false);
  });

  it('mail ghi nhận tham số, mô phỏng lỗi một lần và tách biệt giữa các test', async () => {
    const send = createMailMock<[recipient: string]>();
    await send('test@example.com');
    expect(send).toHaveBeenCalledExactlyOnceWith('test@example.com');
    send.mockRejectedValueOnce(new Error('SMTP mẫu thất bại'));
    await expect(send('test@example.com')).rejects.toThrow('SMTP mẫu thất bại');
    await expect(send('test@example.com')).resolves.toBeUndefined();
    expect(createMailMock()).not.toHaveBeenCalled();
  });

  it('khởi chạy song song và chờ tác vụ còn lại dù có lỗi đồng bộ hoặc bất đồng bộ', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const error = new Error('Lỗi mẫu');
    const results = await runConcurrently([
      async () => {
        await gate;
        return 'đã đợi';
      },
      () => {
        release();
        throw error;
      },
      () => Promise.reject(error),
    ]);
    expect(results).toEqual([
      { status: 'fulfilled', value: 'đã đợi' },
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    await expect(runConcurrently([])).resolves.toEqual([]);
  });
});
