import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../../shared/api/error-message';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../testing/fake-appointment-list-api';
import { makeReceptionAppointments } from '../../testing/fake-reception-api';
import {
  chip,
  cleanUpReceptionPage,
  currentUrl,
  listQueries,
  loaded,
  renderReceptionPage,
  rowCodes,
  select,
  typeSearch,
} from '../../testing/reception-harness';
import { LIST_TEXT } from './list-messages';

// booking F8: trạng thái lỗi và dữ liệu cá nhân của danh sách Lễ tân. Mã LTL là [đề xuất] (PLAN booking mục 7.34). Câu chọn theo `maLoi`, KHÔNG theo mã HTTP (PLAN 5.13,
// CODING_CONVENTION): mỗi nhánh có ca đối chứng cùng mã HTTP khác `maLoi`.
afterEach(cleanUpReceptionPage);

const retryButton = () => screen.queryByRole('button', { name: 'Thử lại' });

describe('lỗi theo maLoi (lần tải đầu)', () => {
  it('LTL-10 `CHUA_DANG_NHAP` ⇒ câu phiên hết hạn, KHÔNG có `Thử lại`; h1 và các ô lọc vẫn còn', async () => {
    renderReceptionPage({
      before: (api) =>
        api.failNext('list', () => apiErrorResponse(401, 'CHUA_DANG_NHAP')),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      LIST_TEXT.sessionExpired,
    );
    expect(retryButton()).toBeNull();
    expect(
      screen.getByRole('heading', { name: LIST_TEXT.title }),
    ).toBeInTheDocument();
    expect(chip('Hôm nay')).toBeInTheDocument();
  });

  it('LTL-10 `KHONG_DU_QUYEN` ⇒ câu không đủ quyền, KHÔNG có `Thử lại`; cùng `maLoi` mà HTTP 500 vẫn ra câu này (theo `maLoi`)', async () => {
    for (const status of [403, 500]) {
      const { unmount } = renderReceptionPage({
        before: (api) =>
          api.failNext('list', () =>
            apiErrorResponse(status, 'KHONG_DU_QUYEN'),
          ),
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        LIST_TEXT.forbidden,
      );
      expect(retryButton()).toBeNull();
      unmount();
      cleanUpReceptionPage();
    }
  });

  // Đối chứng: cùng mã HTTP nhưng `maLoi` lạ ⇒ câu chung kèm `Thử lại`, KHÔNG phải câu "không đủ quyền" hay "phiên hết hạn"
  it.each([401, 403, 404, 409, 400, 500])(
    'LTL-10 HTTP %i với `maLoi` lạ ⇒ câu chung kèm `Thử lại` (không theo mã HTTP)',
    async (status) => {
      renderReceptionPage({
        before: (api) =>
          api.failNext('list', () => apiErrorResponse(status, 'MA_LOI_LA')),
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(retryButton()).toBeInTheDocument();
      expect(screen.queryByText(LIST_TEXT.forbidden)).toBeNull();
      expect(screen.queryByText(LIST_TEXT.sessionExpired)).toBeNull();
    },
  );

  it('LTL-10 mạng đứt ⇒ câu mạng kèm `Thử lại`; có mạng lại thì `Thử lại` gọi lại ĐÚNG truy vấn và hiện bảng', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
        fake.failNext('list', () => {
          throw new TypeError('Failed to fetch');
        });
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      NETWORK_ERROR_MESSAGE,
    );
    const failed = listQueries(api)[0];

    fireEvent.click(retryButton()!);
    await loaded();
    expect(rowCodes()).toHaveLength(3);
    expect(listQueries(api)).toHaveLength(2);
    expect(listQueries(api)[1]).toEqual(failed);
    expect(retryButton()).toBeNull();
  });

  it('LTL-11 phản hồi 200 sai hình dạng (HTML, thiếu khoá của dòng, thiếu `total`) ⇒ câu chung kèm `Thử lại`, trang không trắng', async () => {
    const bads = [
      () => new Response('<html>bad gateway</html>', { status: 200 }),
      () =>
        jsonResponse({
          items: [{ maLichHen: 'CP20261018001' }],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      () => jsonResponse({ items: [], page: 1, pageSize: 20 }),
      () => new Response('<html>bad gateway</html>', { status: 502 }),
    ];
    for (const bad of bads) {
      const { unmount } = renderReceptionPage({
        before: (api) => api.failNext('list', bad),
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(retryButton()).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: LIST_TEXT.title }),
      ).toBeInTheDocument();
      unmount();
      cleanUpReceptionPage();
    }
  });

  it('LTL-10 lỗi khi đổi bộ lọc (sau khi đã có bảng) ⇒ thay bảng bằng lỗi theo `maLoi`; `Thử lại` về lại bảng', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
      },
    });
    await loaded();
    api.failNext('list', () => apiErrorResponse(500, 'MA_LOI_LA'));
    fireEvent.click(chip('Ngày mai'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    fireEvent.click(retryButton()!);
    await loaded();
    expect(rowCodes()).toHaveLength(3);
  });
});

// LTL-12: SĐT người đặt, tên bệnh nhân và `q` (có thể là SĐT) là dữ liệu cá nhân: không log, không URL, không kho trình duyệt. Đo bằng `.length`: `vi.spyOn(Storage.prototype,
// 'setItem')` chỉ thấy lần gọi đầu (F2 đã phát hiện) nên không dùng.
describe('dữ liệu cá nhân', () => {
  it('LTL-12 suốt luồng tải, gõ SĐT vào ô tìm, đổi chip và ô chọn: không localStorage, sessionStorage, cookie, không console; URL không đổi và không chứa q, SĐT, mã', async () => {
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    localStorage.clear();
    sessionStorage.clear();

    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
        fake.doctors = {
          items: [{ bacSiId: '5', hoTen: 'Nguyễn Minh Anh' }],
          total: 1,
          page: 1,
          pageSize: 100,
        };
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Nguyễn Minh Anh' });

    typeSearch('0901234567');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() =>
      expect(listQueries(api).at(-1)).toMatchObject({ q: '0901234567' }),
    );
    fireEvent.click(chip('Tuần này'));
    fireEvent.change(select('Bác sĩ'), { target: { value: '5' } });
    await waitFor(() => expect(listQueries(api).at(-1)?.bacSiId).toBe('5'));

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(currentUrl()).toBe('/le-tan/quan-ly-lich-hen');
    expect(currentUrl()).not.toMatch(/0901234567|CP2026|\?|#/);
    consoleSpies.forEach((spy) => spy.mockRestore());
  });
});
