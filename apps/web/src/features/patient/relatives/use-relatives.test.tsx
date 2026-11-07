import { act, renderHook } from '@testing-library/react';
import { json } from '../testing/fake-profile-api';
import { useRelatives } from './use-relatives';
import type { Relative } from './relatives-types';

// patient F6 (TRACKING F6-C, F6-G, F6-H): trạng thái của hook khi `refresh` và `upsert` gọi lúc chưa sẵn sàng hoặc sau khi gỡ.
// Phần còn lại của hook được các test trang phủ. Mã ca RW-nn là [đề xuất].
const relative = (id: string, extra: Partial<Relative> = {}): Relative => ({
  hoSoNguoiThanId: id,
  hoTen: `Người ${id}`,
  moiQuanHe: 'Con',
  gioiTinh: 'Nam',
  ngaySinh: '2015-07-20',
  soDienThoai: null,
  trangThaiHieuLuc: true,
  ...extra,
});

// fetch giả mà test tự trả từng lời gọi, theo thứ tự gọi
function controlledFetch() {
  const pending: ((outcome: Response | Error) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve, reject) => {
          pending.push((outcome) =>
            outcome instanceof Error ? reject(outcome) : resolve(outcome),
          );
        }),
    ),
  );
  return {
    answer: (index: number, items: Relative[]) =>
      act(async () => pending[index](json(200, { items }))),
    fail: (index: number) =>
      act(async () => pending[index](new TypeError('Failed to fetch'))),
    calls: () => pending.length,
  };
}
const ids = (state: ReturnType<typeof useRelatives>['state']) =>
  state.status === 'ready'
    ? state.items.map((item) => item.hoSoNguoiThanId)
    : null;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useRelatives', () => {
  it('RW-121 NT-21 upsert và refresh gọi khi danh sách CHƯA tải xong không đổi gì: kết quả `refresh` về trước bị bỏ, danh sách chỉ có dữ liệu của lần tải đầu', async () => {
    const api = controlledFetch();
    const { result } = renderHook(() => useRelatives());
    act(() => {
      result.current.upsert(relative('9'));
      result.current.refresh();
    });
    expect(result.current.state.status).toBe('loading');
    expect(api.calls()).toBe(2);

    await api.answer(1, [relative('5')]);
    expect(result.current.state.status).toBe('loading');
    await api.answer(0, [relative('1')]);
    expect(ids(result.current.state)).toEqual(['1']);
  });

  it('RW-122 NT-21 refresh thất bại lúc chưa tải xong, hoặc khi đang ở trạng thái lỗi tải đầu, không tạo ra trạng thái mới; chỉ `retry` mới thoát khỏi lỗi', async () => {
    const api = controlledFetch();
    const { result } = renderHook(() => useRelatives());
    act(() => result.current.refresh());
    await api.fail(1);
    expect(result.current.state.status).toBe('loading');

    await api.fail(0);
    expect(result.current.state.status).toBe('error');
    act(() => result.current.refresh());
    await api.answer(2, [relative('2')]);
    expect(result.current.state.status).toBe('error');
    act(() => result.current.refresh());
    await api.fail(3);
    expect(result.current.state.status).toBe('error');

    act(() => result.current.retry());
    await api.answer(4, [relative('7')]);
    expect(ids(result.current.state)).toEqual(['7']);
  });

  it('RW-123 NT-22 refresh xong sau khi đã gỡ (thành công hoặc thất bại) ⇒ bỏ qua, không lỗi, không console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const api = controlledFetch();
    const { result, unmount } = renderHook(() => useRelatives());
    await api.answer(0, [relative('1')]);
    expect(ids(result.current.state)).toEqual(['1']);

    act(() => {
      result.current.refresh();
      result.current.refresh();
    });
    unmount();
    await api.answer(1, [relative('2')]);
    await api.fail(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('RW-124 NT-22 refresh thất bại giữ danh sách cũ và đặt refreshError; refresh lại thành công xoá refreshError; upsert thay theo id, chèn hồ sơ mới và sắp lại', async () => {
    const api = controlledFetch();
    const { result } = renderHook(() => useRelatives());
    await api.answer(0, [relative('1'), relative('2')]);

    act(() => result.current.refresh());
    await api.fail(1);
    expect(ids(result.current.state)).toEqual(['1', '2']);
    expect(
      result.current.state.status === 'ready' &&
        result.current.state.refreshError !== null,
    ).toBe(true);

    act(() => result.current.refresh());
    expect(
      result.current.state.status === 'ready' &&
        result.current.state.refreshError,
    ).toBeNull();
    await api.answer(2, [relative('1'), relative('2'), relative('3')]);
    expect(ids(result.current.state)).toEqual(['1', '2', '3']);

    act(() => {
      result.current.upsert(relative('2', { trangThaiHieuLuc: false }));
      result.current.upsert(relative('10'));
    });
    expect(ids(result.current.state)).toEqual(['1', '3', '10', '2']);
  });
});
