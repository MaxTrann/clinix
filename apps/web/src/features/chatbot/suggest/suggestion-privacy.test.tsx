import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { doctor, suggestion } from '../testing/suggestion-fixtures';
import { resetWidgetTest } from '../testing/render-widget';
import {
  chooseSpecialty,
  dayButtons,
  shiftButton,
  showCard,
} from '../testing/suggest-harness';

// Chatbot F2, F2-12 (WTL-10 mở rộng cho thẻ gợi ý, PLAN 5.9) và F2-13 (không HTML). Kết quả gợi ý CHỈ ở bộ nhớ: không localStorage, sessionStorage,
// IndexedDB, cookie, `history`, URL, `document.title`, `console.*`. Chạy trọn một phiên gợi ý với một CHUỖI DẤU RIÊNG rồi quét sau từng bước; mỗi lần quét
// kèm kiểm tra "chuỗi dấu đang có thật trên màn hình" để chứng minh phép quét không rỗng. Phần quét mã tĩnh ở `architecture.test.ts` (tự bao `suggest/`).
const MARKER = 'DAU-RIENG-GOIY-5C2E';

const consoleCalls: string[] = [];
const idbOpen = vi.fn();
const historyCalls: string[] = [];

function stringify(values: unknown[]): string {
  return values
    .map((value) => {
      try {
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(' ');
}

function dump(storage: Storage): string {
  const entries: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)!;
    entries.push(`${key}=${storage.getItem(key)}`);
  }
  return entries.join('|');
}

beforeEach(() => {
  consoleCalls.length = 0;
  historyCalls.length = 0;
  idbOpen.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T03:00:00.000Z'));
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(stringify(args));
    });
  }
  vi.stubGlobal('indexedDB', { open: idbOpen });
  for (const method of ['pushState', 'replaceState'] as const) {
    vi.spyOn(window.history, method).mockImplementation(
      (...args: unknown[]) => {
        historyCalls.push(stringify(args));
      },
    );
  }
  document.title = 'CLINIX';
});

afterEach(() => {
  vi.useRealTimers();
  resetWidgetTest();
  document.title = '';
});

function expectNothingKept(router: { state: { location: unknown } }) {
  expect(dump(window.localStorage)).toBe('');
  expect(dump(window.sessionStorage)).toBe('');
  expect(document.cookie).not.toContain(MARKER);
  expect(idbOpen).not.toHaveBeenCalled();
  expect(historyCalls.join('\n')).not.toContain(MARKER);
  expect(window.location.href).not.toContain(MARKER);
  expect(JSON.stringify(router.state.location)).not.toContain(MARKER);
  expect(document.title).toBe('CLINIX');
  expect(consoleCalls.join('\n')).not.toContain(MARKER);
}

describe('quét kho trình duyệt, URL, tiêu đề, console (F2-12)', () => {
  it('F2-12 cả phiên gợi ý (chọn chuyên khoa, ngày, ca, bấm ô giờ): không chỗ nào giữ tên chuyên khoa, tên bác sĩ hay kết quả', async () => {
    const { router, card } = await showCard({
      suggestions: [{ chuyenKhoaId: '3', ten: `Khoa ${MARKER}` }],
      suggestAnswers: [
        suggestion({
          bacSi: [doctor({ hoTen: `Bác sĩ ${MARKER}` })],
        }),
      ],
    });
    expect(document.body.textContent).toContain(MARKER);
    expectNothingKept(router);

    chooseSpecialty();
    // Tên bác sĩ nằm ở liên kết hồ sơ và ở phần chữ đọc màn hình của từng ô giờ: có nhiều hơn một liên kết
    await screen.findAllByRole('link', {
      name: new RegExp(`Bác sĩ ${MARKER}`),
    });
    expect(document.body.textContent).toContain(`Bác sĩ ${MARKER}`);
    expectNothingKept(router);

    fireEvent.click(dayButtons()[1]!);
    await screen.findByText(
      /có 1 bác sĩ còn giờ trống|có 2 bác sĩ còn giờ trống/,
    );
    expectNothingKept(router);
    fireEvent.click(shiftButton('Sáng'));
    await waitFor(() =>
      expect(shiftButton('Sáng')).toHaveAttribute('aria-pressed', 'true'),
    );
    expectNothingKept(router);

    fireEvent.click(within(card).getAllByRole('link', { name: /^09:30/ })[0]!);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dat-lich/thong-tin'),
    );
    expect(router.state.location.search).toBe('?khungGioId=101');
    expectNothingKept(router);
  });

  it('F2-12 phép quét có tác dụng: bắt được khi mã cố ý ghi vào từng chỗ (đối chứng ÂM)', async () => {
    const { router } = await showCard();
    window.localStorage.setItem('x', MARKER);
    expect(() => expectNothingKept(router)).toThrow();
    window.localStorage.clear();

    window.sessionStorage.setItem('x', MARKER);
    expect(() => expectNothingKept(router)).toThrow();
    window.sessionStorage.clear();

    console.log(MARKER);
    expect(() => expectNothingKept(router)).toThrow();
    consoleCalls.length = 0;

    document.title = MARKER;
    expect(() => expectNothingKept(router)).toThrow();
    document.title = 'CLINIX';

    window.history.pushState({}, '', `/${MARKER}`);
    expect(() => expectNothingKept(router)).toThrow();
    historyCalls.length = 0;

    expect(() => expectNothingKept(router)).not.toThrow();
  });
});

describe('không HTML thô (F2-13)', () => {
  it('F2-13 tên chuyên khoa, bác sĩ, chi nhánh chứa thẻ HTML hay script hiện nguyên văn, không thành phần tử', async () => {
    const { card } = await showCard({
      suggestions: [{ chuyenKhoaId: '3', ten: '<img src=x onerror=alert(1)>' }],
      suggestAnswers: [
        suggestion({
          bacSi: [
            doctor({
              hoTen: '<b>Đậm</b><script>alert(1)</script>',
              chiNhanh: {
                chiNhanhId: '2',
                ten: '<i>Chi nhánh</i>',
                diaChi: '<u>x</u>',
              },
            }),
          ],
        }),
      ],
    });
    chooseSpecialty();
    await screen.findByText(/Có 1 bác sĩ/);

    expect(
      within(card).getByText('<img src=x onerror=alert(1)>'),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('link', {
        name: 'TS.BS. <b>Đậm</b><script>alert(1)</script>',
      }),
    ).toBeInTheDocument();
    expect(within(card).getByText('<i>Chi nhánh</i>')).toBeInTheDocument();
    expect(card.querySelector('b, i, u, img, script')).toBeNull();
  });
});
