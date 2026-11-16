import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonOk } from './testing/fake-patient-exam-api';
import { renderSections } from './testing/render-sections';

// doctor-exam F6, BDK-02, BDK-09 (phần đánh giá) [đề xuất]: nhận xét và số sao là dữ liệu của người dùng gửi tới một bác sĩ: không vào kho trình duyệt, URL, tiêu đề tài liệu, `location.state`, log. Nhận xét chỉ ở state của form (bộ nhớ) rồi đi trong thân POST.
// Kiểm cả `localStorage.length` và `sessionStorage.length` (không chỉ spy `setItem`: spy dựng lại sau `mockRestore` có thể không thấy lần gọi, TRACKING 21.8). Bộ quét tĩnh `patient-exam-hygiene.test.ts` (WXH-16) tự quét file mã mới của `patient/`; ở đây thêm bộ quét lớp focus.
const SECRET_TEXT = 'Nhận xét riêng tư số 4711 về bệnh đau tim';
const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.title = 'Tiêu đề gốc';
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => {}));
  }
});
afterEach(() => {
  for (const spy of consoleSpies.splice(0)) spy.mockRestore();
  vi.unstubAllGlobals();
});

// Cảnh báo `act(...)` của React có thể in khi một cập nhật đến giữa hai lần chờ: không phải log của ứng dụng
function appLogs(): unknown[][] {
  return consoleSpies.flatMap((spy) =>
    (spy.mock.calls as unknown[][]).filter(
      (args) => !String(args[0]).includes('not wrapped in act'),
    ),
  );
}

const right = () => within(screen.getByTestId('right-column'));

async function rateWith(stars: number, text: string) {
  await right().findByRole('button', { name: 'Đánh giá ngay' });
  fireEvent.click(right().getByRole('button', { name: 'Đánh giá ngay' }));
  fireEvent.click(screen.getByRole('radio', { name: `${stars} sao` }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  });
}

function expectNothingLeaked() {
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(document.title).toBe('Tiêu đề gốc');
  expect(document.cookie).toBe('');
  expect(window.location.search).toBe('');
  expect(window.location.hash).toBe('');
  expect(JSON.stringify(window.history.state)).not.toContain('4711');
  expect(screen.getByTestId('url')).toHaveTextContent(/^\/chi-tiet$/);
  expect(screen.getByTestId('state')).toHaveTextContent('null');
  expect(appLogs()).toEqual([]);
}

describe('doctor-exam F6 — dữ liệu của đánh giá không rò ra ngoài bộ nhớ (BDK-02, BDK-09)', () => {
  it('BDK-09 gõ nhận xét rồi gửi THÀNH CÔNG: không `localStorage`, `sessionStorage`, cookie, tiêu đề, URL, `location.state`, log; nhận xét chỉ đi trong thân POST', async () => {
    const { api } = renderSections();
    await rateWith(5, SECRET_TEXT);
    await right().findByRole('img', { name: '5 sao' });
    expect(api.ratingCalls()).toHaveLength(1);
    expect(JSON.parse(api.ratingCalls()[0].body!).nhanXet).toBe(SECRET_TEXT);
    // không nằm ở đường dẫn hay query của MỌI lời gọi
    for (const call of api.calls) {
      expect(call.path).not.toContain('4711');
      expect(JSON.stringify(call.params)).not.toContain('4711');
    }
    expectNothingLeaked();
  });

  it('BDK-09 gửi THẤT BẠI (500, mất mạng, 409): nội dung vẫn không rò ra kho, tiêu đề, URL, log', async () => {
    const { api } = renderSections({
      respond: (_url, call) =>
        call.method === 'POST'
          ? Promise.resolve(
              jsonOk({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500),
            )
          : undefined,
    });
    await rateWith(2, SECRET_TEXT);
    await right().findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue(SECRET_TEXT);
    expect(api.ratingCalls()).toHaveLength(1);
    expectNothingLeaked();
  });

  it('BDK-09 huỷ form khi đã gõ ⇒ nội dung không còn ở đâu (không bản nháp trong kho, DOM không còn ô nhận xét)', async () => {
    renderSections();
    await right().findByRole('button', { name: 'Đánh giá ngay' });
    fireEvent.click(right().getByRole('button', { name: 'Đánh giá ngay' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: SECRET_TEXT },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.body.textContent).not.toContain('4711');
    expectNothingLeaked();
  });

  it('BDK-02 liên kết sổ khám chỉ mang mã lịch hẹn: không số sao, không nhận xét, không người khám trong `href`', async () => {
    renderSections();
    await right().findByRole('button', { name: 'Đánh giá ngay' });
    const link = screen.getByRole('link', { name: 'Xem trong sổ khám bệnh →' });
    expect(link.getAttribute('href')).toBe(
      '/benh-nhan/ho-so-kham-benh?ca=CLX-S1',
    );
  });
});

describe('doctor-exam F6 — KHÔNG override focus riêng ở mã nguồn (quy tắc FE của Đại 16/11/2026, ADR 0004)', () => {
  const SOURCES = import.meta.glob(
    [
      './rating-form.tsx',
      './star-input.tsx',
      './rating-section.tsx',
      './rating-summary.tsx',
      './exam-record-section.tsx',
    ],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>;

  // Bỏ chú thích (câu giải thích có thể nhắc "viền focus") rồi tìm lớp tiện ích focus/outline/ring trong chuỗi lớp
  const strip = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const OWN_FOCUS =
    /(?:^|[\s'"`:])(?:focus|focus-visible|focus-within):|(?:^|[\s'"`:])outline(?:-[\w[\]./]+)?(?=[\s'"`])|(?:^|[\s'"`:])ring(?:-[\w[\]./]+)?(?=[\s'"`])/;

  it('không file mã nào của hai thẻ đánh giá và hồ sơ có lớp `focus:`, `focus-visible:`, `outline`, `ring` (ô nhập và nút dùng lớp base `styles/index.css`)', () => {
    expect(Object.keys(SOURCES)).toHaveLength(5);
    const found = Object.entries(SOURCES)
      .filter(([, source]) => OWN_FOCUS.test(strip(source)))
      .map(([file]) => file);
    expect(found).toEqual([]);
  });

  it('đối chứng: bộ quét BẮT lớp focus riêng và KHÔNG báo nhầm chữ thường', () => {
    for (const bad of [
      'className="focus:ring-2"',
      'className="a focus-visible:outline-2"',
      'className={`x outline-none`}',
      'className="ring-1 ring-cyan-600"',
      'className="outline"',
    ]) {
      expect(OWN_FOCUS.test(strip(bad))).toBe(true);
    }
    for (const fine of [
      'className="border-gray-300 aria-[invalid=true]:border-danger"',
      'className="rounded-[13.375px] px-6"',
      '// viền focus theo lớp base, outline do base lo\nconst a = 1;',
      'const spring = 1;',
    ]) {
      expect(OWN_FOCUS.test(strip(fine))).toBe(false);
    }
  });
});
