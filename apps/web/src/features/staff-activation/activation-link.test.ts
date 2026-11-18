import { clearActivationFragment, readActivationLink } from './activation-link';
import { fragmentOf, makeLink } from './testing/link-factory';

// Admin F10. Mã ca NSF10-nn là [đề xuất] (TRACKING admin 9A.7); ca nào phủ test case của PLAN thì ghi kèm mã đó.

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('readActivationLink (đọc fragment)', () => {
  it('NSF10-01 NS-30: fragment đủ id và token ⇒ { id, token }, giữ nguyên chuỗi (không ép số)', () => {
    const link = makeLink('4217');
    expect(readActivationLink(fragmentOf(link))).toEqual(link);

    // Id có số 0 đứng đầu vẫn là chuỗi: dạng của id do API quyết (NS-35), FE không đổi nó
    expect(readActivationLink('#id=0012&token=abc')).toEqual({
      id: '0012',
      token: 'abc',
    });
    expect(typeof readActivationLink(fragmentOf(link))?.id).toBe('string');
  });

  it.each([
    ['rỗng', ''],
    ['chỉ có dấu #', '#'],
    ['thiếu token', '#id=1'],
    ['thiếu id', '#token=abc'],
    ['id rỗng', '#id=&token=abc'],
    ['token rỗng', '#id=1&token='],
    ['trùng khoá id', '#id=1&id=2&token=abc'],
    ['trùng khoá token', '#id=1&token=a&token=b'],
    ['không dạng khoá=giá trị', '#abc'],
    ['là một đường dẫn', '#/kich-hoat'],
    ['thiếu dấu # đầu', 'id=1&token=abc'],
    ['là query chứ không phải fragment', '?id=1&token=abc'],
  ])('NSF10-02 NS-35, A5: %s ⇒ null (màn "không hợp lệ")', (_name, hash) => {
    expect(readActivationLink(hash)).toBeNull();
  });

  it('NSF10-02 khoá thừa bị bỏ qua và không lọt vào kết quả (chỉ id và token được gửi đi)', () => {
    const result = readActivationLink('#utm=x&id=1&token=abc&foo=bar');
    expect(result).toEqual({ id: '1', token: 'abc' });
    expect(Object.keys(result ?? {}).sort()).toEqual(['id', 'token']);
  });

  it('NSF10-03 Q25: mã hoá phần trăm được giải mã; không nhận khoá nằm ở query', () => {
    expect(readActivationLink('#id=1&token=%41bc')).toEqual({
      id: '1',
      token: 'Abc',
    });
    // Liên kết chỉ có fragment (Q25): `?id=…&token=…` không phải liên kết của hệ thống
    expect(readActivationLink('?id=1&token=abc')).toBeNull();
  });
});

describe('clearActivationFragment (xoá fragment khỏi thanh địa chỉ)', () => {
  it('NSF10-04 NS-43: xoá fragment, giữ đường dẫn, query và history.state, không thêm mục lịch sử', () => {
    const state = { usr: null, key: 'k1', idx: 3 };
    window.history.replaceState(state, '', '/kich-hoat?a=1#id=1&token=abc');
    const lengthBefore = window.history.length;

    clearActivationFragment();

    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/kich-hoat');
    expect(window.location.search).toBe('?a=1');
    expect(window.location.href).not.toContain('token');
    expect(window.history.length).toBe(lengthBefore);
    expect(window.history.state).toEqual(state);
  });

  it('NSF10-04 không có fragment ⇒ không gọi replaceState; gọi hai lần (StrictMode) không lỗi', () => {
    window.history.replaceState(null, '', '/kich-hoat#id=1&token=abc');
    const spy = vi.spyOn(window.history, 'replaceState');

    clearActivationFragment();
    clearActivationFragment();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');
  });
});
