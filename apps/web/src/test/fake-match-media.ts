// `window.matchMedia` giả cho test màn hẹp/rộng (patient F11). Không dùng `happyDOM.setViewport`: happy-dom 21 không bắn `change`
// ở lần thu hẹp đầu tiên (TRACKING patient F11-B). Chỉ hiểu `(min-width: Npx)`. Dọn bằng `vi.unstubAllGlobals()` trong `afterEach`.
type ChangeListener = (event: MediaQueryListEvent) => void;

interface Subscription {
  query: string;
  listener: ChangeListener;
}

export function fakeMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const subscriptions = new Set<Subscription>();

  function evaluate(query: string): boolean {
    const found = /^\(min-width:\s*(\d+)px\)$/.exec(query);
    if (!found) throw new Error(`fakeMatchMedia không hiểu truy vấn ${query}`);
    return width >= Number(found[1]);
  }

  function matchMedia(query: string) {
    const own = new Map<ChangeListener, Subscription>();
    return {
      media: query,
      get matches() {
        return evaluate(query);
      },
      addEventListener(type: string, listener: ChangeListener) {
        if (type !== 'change' || own.has(listener)) return;
        const subscription = { query, listener };
        own.set(listener, subscription);
        subscriptions.add(subscription);
      },
      removeEventListener(type: string, listener: ChangeListener) {
        const subscription = own.get(listener);
        if (type !== 'change' || !subscription) return;
        own.delete(listener);
        subscriptions.delete(subscription);
      },
    } as unknown as MediaQueryList;
  }

  vi.stubGlobal('matchMedia', matchMedia);

  return {
    // Đổi bề ngang rồi bắn `change` cho truy vấn nào đổi kết quả, như trình duyệt (gọi trong `act`)
    resize(nextWidth: number) {
      const before = new Map(
        [...subscriptions].map((s) => [s, evaluate(s.query)]),
      );
      width = nextWidth;
      for (const [subscription, was] of before) {
        const now = evaluate(subscription.query);
        if (now !== was) {
          subscription.listener({
            matches: now,
            media: subscription.query,
          } as MediaQueryListEvent);
        }
      }
    },
    // Số bộ nghe còn gắn: kiểm hook gỡ đăng ký khi gỡ component
    listenerCount: () => subscriptions.size,
  };
}
