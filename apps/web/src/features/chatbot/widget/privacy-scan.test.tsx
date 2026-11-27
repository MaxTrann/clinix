import { act, screen, fireEvent } from '@testing-library/react';
import { ApiError } from '../../../shared/api/errors';
import { setAuthState } from '../../auth/auth-store';
import { createFakeChatbotApi } from '../testing/fake-chatbot-api';
import {
  duPhong,
  khanCap,
  reply,
  chu,
  traLoi,
} from '../testing/reply-fixtures';
import {
  askQuestion,
  openAndAsk,
  openWidget,
  renderWidget,
  resetWidgetTest,
} from '../testing/render-widget';

// Chatbot F1, WTL-10 (PLAN 5.9, Q3): câu hỏi và câu trả lời CHỈ ở bộ nhớ: không localStorage, sessionStorage, IndexedDB, cookie, URL,
// `document.title`, `console.*`. Test chạy trọn một phiên với một CHUỖI DẤU RIÊNG rồi quét mọi chỗ trên sau từng bước; mỗi lần quét kèm
// một kiểm tra "chuỗi dấu đang có thật trong màn hình" để chứng minh phép quét không rỗng. Phần quét mã tĩnh ở `architecture.test.ts`.
const MARKER = 'DAU-RIENG-7F3A91';

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
  resetWidgetTest();
  document.title = '';
});

function expectNothingKept(router: { state: { location: unknown } }) {
  expect(dump(window.localStorage)).not.toContain(MARKER);
  expect(dump(window.sessionStorage)).not.toContain(MARKER);
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

describe('quét kho trình duyệt, URL, tiêu đề, console (WTL-10)', () => {
  it('WTL-10 cả phiên hỏi đáp (trả lời, khẩn cấp, dự phòng, lỗi 429): không chỗ nào giữ câu hỏi hay câu trả lời', async () => {
    const { router } = renderWidget({
      fake: createFakeChatbotApi({
        answers: [
          traLoi(`Đáp ${MARKER}-1`),
          khanCap({ doan: [chu(`Khẩn cấp ${MARKER}-2`)] }),
          duPhong(),
          new ApiError(429, {
            maLoi: 'TRO_LY_HOI_QUA_NHANH',
            thongBao: MARKER,
          }),
          reply({ doan: [chu(`Đáp ${MARKER}-5`)], lienKet: ['ViCuaToi'] }),
        ],
      }),
    });

    openAndAsk(`Hỏi ${MARKER}-1`);
    await screen.findByText(`Đáp ${MARKER}-1`);
    expect(document.body.textContent).toContain(MARKER);
    expectNothingKept(router);

    askQuestion(`Đau ngực ${MARKER}-2`);
    await screen.findByText(`Khẩn cấp ${MARKER}-2`);
    expectNothingKept(router);

    askQuestion(`Hỏi dự phòng ${MARKER}-3`);
    await screen.findByRole('button', { name: 'Gửi lại' });
    expectNothingKept(router);

    askQuestion(`Hỏi nhanh ${MARKER}-4`);
    await screen.findByText('Bạn hỏi hơi nhanh. Đợi một chút rồi gửi lại.');
    expect(document.body.textContent).toContain(`${MARKER}-4`);
    expectNothingKept(router);

    askQuestion(`Hỏi cuối ${MARKER}-5`);
    await screen.findByText(`Đáp ${MARKER}-5`);
    expectNothingKept(router);
  });

  it('WTL-10 sau "Xoá hội thoại" và sau đăng xuất: chuỗi dấu không còn trên màn hình lẫn các chỗ lưu', async () => {
    const { router } = renderWidget({
      role: 'BenhNhan',
      fake: createFakeChatbotApi({
        answers: [traLoi(`Đáp ${MARKER}-1`), traLoi(`Đáp ${MARKER}-2`)],
      }),
    });
    openAndAsk(`Hỏi ${MARKER}-1`);
    await screen.findByText(`Đáp ${MARKER}-1`);

    fireEvent.click(screen.getByRole('button', { name: 'Xoá hội thoại' }));
    expect(document.body.textContent).not.toContain(MARKER);
    expectNothingKept(router);

    askQuestion(`Hỏi ${MARKER}-2`);
    await screen.findByText(`Đáp ${MARKER}-2`);
    expect(document.body.textContent).toContain(MARKER);

    act(() => setAuthState({ status: 'unauthenticated', user: null }));
    openWidget();
    expect(document.body.textContent).not.toContain(MARKER);
    expectNothingKept(router);
  });

  it('WTL-10 bản nháp đang gõ cũng không được lưu đâu cả', () => {
    const { router } = renderWidget();
    openWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Tôi hiểu' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: `Nháp ${MARKER}` },
    });
    expect(screen.getByRole('textbox')).toHaveValue(`Nháp ${MARKER}`);
    expectNothingKept(router);
  });

  it('WTL-10 phép quét có tác dụng: bắt được khi mã cố ý ghi vào từng chỗ (đối chứng ÂM)', () => {
    const { router } = renderWidget();
    window.localStorage.setItem('x', MARKER);
    expect(() => expectNothingKept(router)).toThrow();
    window.localStorage.clear();

    window.sessionStorage.setItem('x', MARKER);
    expect(() => expectNothingKept(router)).toThrow();
    window.sessionStorage.clear();

    console.log(MARKER);
    expect(() => expectNothingKept(router)).toThrow();
    consoleCalls.length = 0;

    document.title = `CLINIX ${MARKER}`;
    expect(() => expectNothingKept(router)).toThrow();
    document.title = 'CLINIX';

    window.history.pushState({}, '', `/?q=${MARKER}`);
    expect(() => expectNothingKept(router)).toThrow();
    historyCalls.length = 0;

    void (
      window as unknown as { indexedDB: { open: () => void } }
    ).indexedDB.open();
    expect(() => expectNothingKept(router)).toThrow();
    idbOpen.mockReset();

    expect(() => expectNothingKept(router)).not.toThrow();
  });
});
