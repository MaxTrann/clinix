import { fireEvent } from '@testing-library/react';
import { RECEPTION_PATHS } from '../patient-paths';
import {
  BIG_ID,
  PATIENT_BIG,
  PATIENT_HUNG,
  json,
} from '../testing/fake-lookup-api';
import {
  advance,
  renderLookupPage,
  resultRow,
  searchBox,
  searchFor,
  startFakeClock,
} from '../testing/lookup-harness';

// patient F8 (TRACKING F8-H, F8-I): riêng tư của trang tra cứu (H4, H5). Từ khoá `q`, họ tên, SĐT, email, địa chỉ, ngày sinh và mã tài khoản của
// người KHÁC là dữ liệu cá nhân: không được nằm ở `console`, kho trình duyệt, URL, tiêu đề tab, thuộc tính DOM hay thông báo lỗi.
// Mã ca LK-nn là [đề xuất]. Dùng bệnh nhân giả đuôi `.invalid`.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const KEYWORD = 'hung';
// Mọi chuỗi cá nhân xuất hiện trong luồng thử
const SENSITIVE = [
  KEYWORD,
  PATIENT_HUNG.detail.hoTen,
  PATIENT_HUNG.detail.soDienThoai,
  PATIENT_HUNG.detail.email,
  PATIENT_HUNG.detail.diaChi ?? '',
  PATIENT_HUNG.detail.ngaySinh ?? '',
  PATIENT_HUNG.detail.nguoiThan[0].hoTen,
  PATIENT_BIG.taiKhoanId,
  PATIENT_HUNG.taiKhoanId === '3' ? 'Đặng' : '',
];

function spyConsole() {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  return () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

// Luồng đầy đủ: tìm, chọn, lỗi 404 rồi chọn lại, tìm không ra, xoá
async function runFlow() {
  const api = await renderLookupPage();
  startFakeClock();
  await searchFor(KEYWORD);
  fireEvent.click(resultRow(/Đặng Văn Hùng/));
  await advance(0);
  api.lookup.failNext('detail', () =>
    json(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
  );
  fireEvent.click(resultRow(/Đặng Văn Hùng/));
  await searchFor('zzzz');
  api.lookup.failNext('search', () =>
    json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x', requestId: 'r-1' }),
  );
  await searchFor(KEYWORD);
  return api;
}

describe('không rò dữ liệu cá nhân (H4, H5)', () => {
  it('LK-82 H5 console: KHÔNG có từ khoá, họ tên, SĐT, email, địa chỉ, ngày sinh hay mã tài khoản trong log nào', async () => {
    const output = spyConsole();
    await runFlow();

    const logged = output();
    for (const secret of SENSITIVE.filter(Boolean)) {
      expect(logged).not.toContain(secret);
    }
  });

  it('LK-83 H5 kho trình duyệt: localStorage, sessionStorage KHÔNG chứa dữ liệu nào; IndexedDB không được mở', async () => {
    const opened =
      typeof indexedDB === 'undefined' ? null : vi.spyOn(indexedDB, 'open');
    await runFlow();

    expect(JSON.stringify({ ...localStorage })).not.toMatch(
      new RegExp(SENSITIVE.filter(Boolean).join('|'), 'i'),
    );
    expect(JSON.stringify({ ...sessionStorage })).not.toMatch(
      new RegExp(SENSITIVE.filter(Boolean).join('|'), 'i'),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    if (opened) expect(opened).not.toHaveBeenCalled();
  });

  it('LK-84 H5 URL: đường dẫn của trang không đổi, không query, không hash, không `location.state`; tiêu đề tab không đổi', async () => {
    const titleBefore = document.title;
    const { router } = await runFlow();

    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.lookup);
    expect(router.state.location.search).toBe('');
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.state).toBeNull();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(document.title).toBe(titleBefore);
    for (const secret of SENSITIVE.filter(Boolean)) {
      expect(document.title).not.toContain(secret);
      expect(window.location.href).not.toContain(secret);
    }
  });

  it('LK-85 H4 thuộc tính DOM (data-*, id, aria-*, title, href...) KHÔNG mang dữ liệu cá nhân hay mã tài khoản (trừ chính giá trị ô tìm)', async () => {
    await renderLookupPage();
    startFakeClock();
    await searchFor('example');
    fireEvent.click(resultRow(/Nguyễn Văn A/));
    await advance(0);

    const box = searchBox();
    const leaks: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      if (element === box) continue;
      for (const attribute of Array.from(element.attributes)) {
        for (const secret of [
          BIG_ID,
          'Nguyễn Văn A',
          'nguyenvana',
          '0987654321',
        ]) {
          if (attribute.value.includes(secret)) {
            leaks.push(`${element.tagName}[${attribute.name}]`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('LK-86 H4 câu lỗi cố định: không kèm từ khoá, họ tên hay mã (500 ở tìm kiếm, 404 ở chi tiết)', async () => {
    await runFlow();

    const text = document.body.textContent ?? '';
    for (const secret of ['r-1', 'chi tiết nội bộ']) {
      expect(text).not.toContain(secret);
    }
    const alerts = Array.from(
      document.querySelectorAll('[role="alert"]'),
      (alert) => alert.textContent ?? '',
    );
    for (const alert of alerts) {
      expect(alert).not.toContain(KEYWORD);
      expect(alert).not.toContain('Đặng');
    }
  });

  it('LK-87 H4 chỉ gọi API tra cứu: mọi `fetch` đều tới /api/reception/patients (hoặc :id), query CHỈ q, page, pageSize', async () => {
    const { lookup } = await runFlow();
    // Lời gọi của phiên (`/api/auth/...`) không thuộc trang tra cứu
    const calls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => !url.startsWith('/api/auth/'));
    expect(calls.length).toBeGreaterThan(0);

    for (const url of calls) {
      expect(url).toMatch(/^\/api\/reception\/patients(\/[0-9]+)?(\?|$)/);
    }
    for (const call of lookup.searches) {
      expect(
        Array.from(call.query.keys()).every((key) =>
          ['q', 'page', 'pageSize'].includes(key),
        ),
      ).toBe(true);
    }
    for (const call of lookup.details)
      expect(Array.from(call.query.keys())).toEqual([]);
  });
});
