import { FakeClock, drive } from './fake-clock.js';

// chatbot P1 — đồ giả tự kiểm (nếp mail/testing/*.spec.ts): nếu đồng hồ ảo sai thì mọi ca HDA-08, HDA-09 sai theo và đột biến không còn nghĩa.
describe('FakeClock', () => {
  it('thời gian chỉ trôi khi gọi advance', () => {
    const clock = new FakeClock(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(250);
    expect(clock.now()).toBe(1250);
  });

  it('hẹn giờ đến hạn chạy đúng thứ tự, và `now()` trong callback bằng đúng thời điểm của hẹn giờ', () => {
    const clock = new FakeClock();
    const seen: [string, number][] = [];
    clock.setTimer(() => seen.push(['b', clock.now()]), 200);
    clock.setTimer(() => seen.push(['a', clock.now()]), 100);
    clock.setTimer(() => seen.push(['c', clock.now()]), 500);

    clock.advance(300);

    expect(seen).toEqual([
      ['a', 100],
      ['b', 200],
    ]);
    expect(clock.now()).toBe(300);
    expect(clock.pendingCount).toBe(1);
  });

  it('hẹn giờ cùng thời điểm chạy theo thứ tự đặt', () => {
    const clock = new FakeClock();
    const seen: string[] = [];
    clock.setTimer(() => seen.push('một'), 100);
    clock.setTimer(() => seen.push('hai'), 100);
    clock.advance(100);
    expect(seen).toEqual(['một', 'hai']);
  });

  it('hẹn giờ đặt TRONG callback mà vẫn nằm trong khoảng advance thì cũng chạy', () => {
    const clock = new FakeClock();
    const seen: number[] = [];
    clock.setTimer(() => {
      seen.push(clock.now());
      clock.setTimer(() => seen.push(clock.now()), 50);
    }, 100);

    clock.advance(200);

    expect(seen).toEqual([100, 150]);
  });

  it('huỷ hẹn giờ thì không chạy và không còn chờ; ghi lại mọi thời gian chờ đã đặt', () => {
    const clock = new FakeClock();
    let ran = false;
    const cancel = clock.setTimer(() => (ran = true), 100);
    clock.setTimer(() => undefined, 300);
    cancel();

    expect(clock.pendingCount).toBe(1);
    expect(clock.nextTimerAt()).toBe(300);
    clock.advance(1000);
    expect(ran).toBe(false);
    expect(clock.startedDelays).toEqual([100, 300]);
    expect(clock.nextTimerAt()).toBeUndefined();
  });
});

describe('drive', () => {
  it('nhảy tới từng hẹn giờ cho tới khi promise xong, không chờ thật', async () => {
    const clock = new FakeClock();
    const wait = (ms: number) =>
      new Promise<void>((resolve) => clock.setTimer(resolve, ms));
    const job = (async () => {
      await wait(6000);
      await wait(8000);
      return clock.now();
    })();

    await expect(drive(clock, job)).resolves.toBe(14_000);
  });

  it('promise bị từ chối thì drive từ chối cùng lỗi', async () => {
    const clock = new FakeClock();
    const job = new Promise<never>((_resolve, reject) =>
      clock.setTimer(() => reject(new Error('hỏng')), 10),
    );
    await expect(drive(clock, job)).rejects.toThrow('hỏng');
  });

  it('promise treo mà không còn hẹn giờ nào thì ném lỗi rõ ràng (không treo test)', async () => {
    const clock = new FakeClock();
    await expect(
      drive(clock, new Promise<void>(() => undefined)),
    ).rejects.toThrow('không còn hẹn giờ');
  });
});
