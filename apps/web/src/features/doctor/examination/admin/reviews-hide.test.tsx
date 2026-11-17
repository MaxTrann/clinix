import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../testing/fetch-routing';
import type { AdminReviewItem } from '../api/admin-review-types';
import {
  BRANCH_ADMIN,
  detailBody,
  item,
  ITEMS,
  pageBody,
  setupReviewsHarness,
} from './testing/render-reviews-page';

// doctor-exam F8: luồng "Ẩn đánh giá" ở mức TRANG qua app thật (`createAppRoutes`), `fetch` giả theo hợp đồng B7 và B8 (máy chủ giả CÓ TRẠNG THÁI: ẩn xong thì danh sách và số đếm đổi theo). WKD-04 (phần `Ẩn`), WKD-05 (hộp), WKD-06 (ẩn thành công ⇒ hàng và chip đổi),
// WKD-07 (409, 404, 503, mạng, hết giờ, 200 sai hình dạng), WKD-08 (bấm đúp), WKD-25 (luồng hai hộp), WKD-26 (không kho, URL, log). Dữ liệu giả, không phải của ai.
const { handlers, renderPage, listCalls, detailCalls, hideCalls, writeCalls } =
  setupReviewsHarness();

const HIDE_1 = 'Ẩn đánh giá của Vũ Thị F về Nguyễn Minh Anh';
const HIDE_2 = 'Ẩn đánh giá của Đỗ Văn G về Nguyễn Minh Anh';
const HIDE_3 = 'Ẩn đánh giá của Lê Văn C về Lê Thảo Vy';
const VIEW_1 = 'Xem đánh giá của Vũ Thị F về Nguyễn Minh Anh';
const REASON = 'Lăng mạ bác sĩ trong phần nhận xét';

const hideDialog = () => screen.findByRole('dialog', { name: 'Ẩn đánh giá' });
const detailDialog = () =>
  screen.findByRole('dialog', { name: 'Chi tiết đánh giá' });
const reasonBox = (box: HTMLElement) =>
  within(box).getByLabelText(/^Lý do ẩn/) as HTMLTextAreaElement;
const confirm = (box: HTMLElement) =>
  within(box).getByRole('button', { name: /^(Xác nhận ẩn|Đang ẩn\.\.\.)$/ });
const type = (box: HTMLElement, value: string) =>
  fireEvent.change(reasonBox(box), { target: { value } });
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const table = () => screen.findByRole('table', { name: 'Đánh giá bác sĩ' });
const bodyRows = () => screen.getAllByRole('row').slice(1);
const chips = () =>
  within(screen.getByRole('list', { name: 'Số đánh giá theo trạng thái' }))
    .getAllByRole('listitem')
    .map((chip) => chip.textContent);
const pick = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
const apiError = (status: number, maLoi: string, extra: object = {}) =>
  jsonResponse({ maLoi, thongBao: 'THÔNG BÁO KỸ THUẬT', ...extra }, status);

// Máy chủ giả có trạng thái: lọc `trangThai` và phân trang theo `page`; ẩn xong thì `biAn` và số đếm đổi
function fakeServer(rows: AdminReviewItem[] = ITEMS) {
  const hidden = new Set(
    rows.filter((row) => row.biAn).map((row) => row.danhGiaId),
  );
  const current = () =>
    rows.map((row) => ({ ...row, biAn: hidden.has(row.danhGiaId) }));
  handlers.list = (url) => {
    const status = url.searchParams.get('trangThai');
    const all = current();
    const shown =
      status === 'HienThi'
        ? all.filter((row) => !row.biAn)
        : status === 'DaAn'
          ? all.filter((row) => row.biAn)
          : all;
    return jsonResponse(
      pageBody(shown, {
        counts: {
          HienThi: all.filter((row) => !row.biAn).length,
          DaAn: all.filter((row) => row.biAn).length,
        },
      }),
    );
  };
  handlers.detail = (id) => {
    const row = current().find((candidate) => candidate.danhGiaId === id);
    return row === undefined
      ? apiError(404, 'KHONG_TIM_THAY')
      : jsonResponse(
          detailBody({
            ...row,
            lyDoAn: row.biAn ? 'Lý do đã lưu ở máy chủ' : null,
          }),
        );
  };
  handlers.hide = (id) => {
    if (hidden.has(id)) return apiError(409, 'DANH_GIA_DA_AN');
    hidden.add(id);
    return jsonResponse({ danhGiaId: id, biAn: true });
  };
  return { hidden };
}

async function openRowHide(name = HIDE_1) {
  await renderPage();
  await table();
  click(name);
  return hideDialog();
}

describe('doctor-exam F8 — nút `Ẩn` ở hàng (WKD-04)', () => {
  it('WKD-04 `Ẩn` CHỈ ở hàng Hiển thị (hàng Đã ẩn chỉ có `Xem`); tên truy cập có tên người đặt và bác sĩ; không lời gọi ghi khi chưa bấm', async () => {
    await renderPage();
    await table();
    expect(screen.getByRole('button', { name: HIDE_1 })).toBeVisible();
    expect(screen.getByRole('button', { name: HIDE_2 })).toBeVisible();
    expect(screen.queryByRole('button', { name: HIDE_3 })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: /^Ẩn đánh giá/ }),
    ).toHaveLength(2);
    // Hàng Đã ẩn vẫn có `Xem`
    expect(
      screen.getByRole('button', {
        name: 'Xem đánh giá của Lê Văn C về Lê Thảo Vy',
      }),
    ).toBeVisible();
    expect(writeCalls()).toHaveLength(0);
  });

  it('WKD-04 Admin Chi nhánh: nút `Ẩn` hiện như Toàn hệ thống (máy chủ ép phạm vi)', async () => {
    await renderPage({ scope: BRANCH_ADMIN });
    await table();
    expect(screen.getByRole('button', { name: HIDE_1 })).toBeVisible();
    expect(screen.queryByRole('button', { name: HIDE_3 })).toBeNull();
  });

  it('WKD-04 tên người đặt rỗng ⇒ tên truy cập bỏ cụm "của …": "Ẩn đánh giá về <bác sĩ>"', async () => {
    handlers.list = () =>
      jsonResponse(
        pageBody([item({ danhGiaId: '7', nguoiDanhGia: { hoTen: '' } })]),
      );
    await renderPage();
    await table();
    expect(
      screen.getByRole('button', { name: 'Ẩn đánh giá về Nguyễn Minh Anh' }),
    ).toBeVisible();
  });
});

describe('doctor-exam F8 — mở hộp từ hàng và đóng (WKD-05, WKD-25)', () => {
  it('WKD-25 `Ẩn` ở hàng mở THẲNG hộp "Ẩn đánh giá" với tóm tắt đúng của hàng, KHÔNG `GET` chi tiết, tiêu điểm vào ô lý do', async () => {
    const box = await openRowHide(HIDE_2);
    expect(within(box).getByText('Nguyễn Minh Anh')).toBeVisible();
    expect(within(box).getByText('· Đỗ Văn G · 27/05/2026')).toBeVisible();
    expect(within(box).getByText('Rất tận tâm.')).toBeVisible();
    expect(within(box).getByRole('img', { name: '5 sao' })).toBeVisible();
    expect(document.activeElement).toBe(reasonBox(box));
    expect(detailCalls()).toHaveLength(0);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(writeCalls()).toHaveLength(0);
  });

  it('WKD-25 `Hủy`, × và `Esc` đóng hộp, KHÔNG gửi gì, tiêu điểm về đúng nút `Ẩn` đã bấm (kể cả khi đã gõ lý do)', async () => {
    let box = await openRowHide(HIDE_1);
    const opener = screen.getByRole('button', { name: HIDE_1 });
    type(box, REASON);
    fireEvent.click(within(box).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    click(HIDE_1);
    box = await hideDialog();
    fireEvent.click(
      within(box).getByRole('button', { name: 'Đóng hộp thoại' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    click(HIDE_1);
    await hideDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(writeCalls()).toHaveLength(0);
    // Mở lại: lý do KHÔNG được giữ (không bản nháp)
    click(HIDE_1);
    box = await hideDialog();
    expect(reasonBox(box)).toHaveValue('');
  });
});

describe('doctor-exam F8 — ẩn thành công: hàng và chip đổi theo số máy chủ (WKD-06)', () => {
  it('WKD-06 ẩn từ hàng: ĐÚNG MỘT POST (đường dẫn, thân), đóng hộp, `GET` danh sách MỚI, chip "1 hiển thị", "2 đã ẩn", hàng đổi "Đã ẩn" mất nút `Ẩn`, thông báo "Đã ẩn đánh giá." nhận tiêu điểm', async () => {
    fakeServer();
    const box = await openRowHide(HIDE_1);
    expect(chips()).toEqual(['2 hiển thị', '1 đã ẩn']);
    expect(listCalls()).toHaveLength(1);
    type(box, `  ${REASON}  `);
    fireEvent.click(confirm(box));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hideCalls()).toEqual([
      {
        pathname: '/api/admin/doctor-ratings/1/hide',
        method: 'POST',
        body: { lyDo: REASON },
      },
    ]);
    await table();
    await waitFor(() => expect(chips()).toEqual(['1 hiển thị', '2 đã ẩn']));
    expect(listCalls()).toHaveLength(2);
    const firstRow = bodyRows()[0];
    expect(within(firstRow).getByText('Đã ẩn')).toBeVisible();
    expect(
      within(firstRow).queryByRole('button', { name: /^Ẩn đánh giá/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: HIDE_1 })).toBeNull();
    expect(screen.getByRole('button', { name: HIDE_2 })).toBeVisible();
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Đã ẩn đánh giá.');
    expect(document.activeElement).toBe(notice);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WKD-06 xem lại đánh giá vừa ẩn bằng `Xem`: "Đã ẩn" và "Lý do ẩn" của máy chủ; thông báo cũ bị bỏ khi mở hộp', async () => {
    fakeServer();
    const box = await openRowHide(HIDE_1);
    type(box, REASON);
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await table();
    expect(screen.getByRole('status')).toHaveTextContent('Đã ẩn đánh giá.');
    click(VIEW_1);
    const detail = await detailDialog();
    expect(await within(detail).findByText('Lý do ẩn')).toBeVisible();
    expect(within(detail).getByText('Lý do đã lưu ở máy chủ')).toBeVisible();
    expect(
      within(detail).queryByRole('button', { name: 'Ẩn đánh giá' }),
    ).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('WKD-06 lọc Trạng thái = Hiển thị: hàng vừa ẩn BIẾN khỏi danh sách; chip theo máy chủ; `Ẩn` ở hàng còn lại vẫn đúng', async () => {
    fakeServer();
    await renderPage();
    await table();
    pick('Trạng thái', 'HienThi');
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    click(HIDE_1);
    const box = await hideDialog();
    type(box, REASON);
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(chips()).toEqual(['1 hiển thị', '2 đã ẩn']);
    expect(listCalls().at(-1)!.searchParams.get('trangThai')).toBe('HienThi');
    expect(screen.queryByText('Vũ Thị F')).toBeNull();
    expect(screen.getByRole('button', { name: HIDE_2 })).toBeVisible();
    // Nút đã bấm không còn: tiêu điểm vào thông báo
    expect(document.activeElement).toBe(screen.getByRole('status'));
  });

  it('WKD-06 ẩn hàng DUY NHẤT của trang cuối (đang lọc Hiển thị): máy chủ trả trang rỗng mà `total` còn ⇒ về trang trước, hiện lại bảng', async () => {
    const rows = Array.from({ length: 21 }, (_, index) =>
      item({
        danhGiaId: String(index + 1),
        nguoiDanhGia: { hoTen: `Người ${index + 1}` },
      }),
    );
    const hidden = new Set<string>();
    handlers.list = (url) => {
      const page = Number(url.searchParams.get('page') ?? '1');
      const visible = rows.filter((row) => !hidden.has(row.danhGiaId));
      const slice = visible.slice((page - 1) * 20, page * 20);
      return jsonResponse(
        pageBody(slice, {
          total: visible.length,
          page,
          counts: { HienThi: visible.length, DaAn: hidden.size },
        }),
      );
    };
    handlers.hide = (id) => {
      hidden.add(id);
      return jsonResponse({ danhGiaId: id, biAn: true });
    };
    await renderPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    click('Ẩn đánh giá của Người 21 về Nguyễn Minh Anh');
    const box = await hideDialog();
    type(box, REASON);
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(bodyRows()).toHaveLength(20));
    expect(listCalls().map((url) => url.searchParams.get('page'))).toEqual([
      '1',
      '2',
      '2',
      '1',
    ]);
    expect(chips()).toEqual(['20 hiển thị', '1 đã ẩn']);
  });

  it('WKD-06 Admin Chi nhánh ẩn thành công theo cùng luồng (cùng đường dẫn, chip đổi)', async () => {
    fakeServer();
    await renderPage({ scope: BRANCH_ADMIN });
    await table();
    click(HIDE_1);
    const box = await hideDialog();
    type(box, REASON);
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(chips()).toEqual(['1 hiển thị', '2 đã ẩn']));
    expect(hideCalls()).toHaveLength(1);
    expect(hideCalls()[0].pathname).toBe('/api/admin/doctor-ratings/1/hide');
  });

  it('WKD-06 hai lần ẩn liên tiếp: thông báo hiện lại và nhận tiêu điểm lần nữa; chip đổi hai lần', async () => {
    fakeServer();
    await renderPage();
    await table();
    for (const [name, counts] of [
      [HIDE_1, ['1 hiển thị', '2 đã ẩn']],
      [HIDE_2, ['0 hiển thị', '3 đã ẩn']],
    ] as const) {
      click(name);
      const box = await hideDialog();
      type(box, REASON);
      fireEvent.click(confirm(box));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(chips()).toEqual(counts));
      await table();
      expect(document.activeElement).toBe(screen.getByRole('status'));
    }
    expect(hideCalls()).toHaveLength(2);
  });
});

describe('doctor-exam F8 — lỗi (WKD-05, WKD-07)', () => {
  it('WKD-05 lý do thiếu, 9, 256 ⇒ lỗi theo ô, nội dung giữ, KHÔNG POST', async () => {
    const box = await openRowHide();
    fireEvent.click(confirm(box));
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Vui lòng nhập lý do ẩn.',
    );
    type(box, 'x'.repeat(9));
    fireEvent.click(confirm(box));
    expect(within(box).getByRole('alert')).toHaveTextContent(
      'Lý do ẩn cần ít nhất 10 ký tự.',
    );
    type(box, 'x'.repeat(256));
    fireEvent.click(confirm(box));
    expect(within(box).getByRole('alert')).toHaveTextContent(
      'Tối đa 255 ký tự.',
    );
    expect(reasonBox(box)).toHaveValue('x'.repeat(256));
    expect(writeCalls()).toHaveLength(0);
  });

  it('WKD-05 400 `NOI_DUNG_KHONG_HOP_LE` ở `lyDo` ⇒ hiện THEO Ô, lý do giữ nguyên, hộp ở lại, danh sách KHÔNG tải lại', async () => {
    handlers.hide = () =>
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'lyDo', ma: 'NOI_DUNG_KHONG_HOP_LE' }],
      });
    const box = await openRowHide();
    type(box, 'Khai otp: 3 lần mỗi ngày');
    fireEvent.click(confirm(box));
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Nội dung có đoạn giống mật khẩu hoặc mã bí mật; hãy viết lại.',
    );
    expect(reasonBox(box)).toHaveValue('Khai otp: 3 lần mỗi ngày');
    expect(reasonBox(box)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(listCalls()).toHaveLength(1);
    expect(hideCalls()).toHaveLength(1);
  });

  it('WKD-07 409 `DANH_GIA_DA_AN` ⇒ đóng hộp, tải lại danh sách (hàng đổi "Đã ẩn"), thông báo "Đánh giá này đã được ẩn." KHÔNG đỏ (không `role="alert"`)', async () => {
    const { hidden } = fakeServer();
    const box = await openRowHide(HIDE_1);
    // Quản trị viên khác đã ẩn trước
    hidden.add('1');
    type(box, REASON);
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await table();
    await waitFor(() => expect(chips()).toEqual(['1 hiển thị', '2 đã ẩn']));
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Đánh giá này đã được ẩn.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(notice).not.toHaveClass('text-danger-strong');
    expect(document.activeElement).toBe(notice);
    expect(listCalls()).toHaveLength(2);
    expect(hideCalls()).toHaveLength(1);
  });

  it('WKD-07 404 (không còn hay ngoài phạm vi) ⇒ đóng hộp, tải lại danh sách ĐÚNG MỘT lần, thông báo "Không tìm thấy đánh giá này."', async () => {
    handlers.hide = () => apiError(404, 'KHONG_TIM_THAY');
    const box = await openRowHide();
    type(box, REASON);
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await table();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Không tìm thấy đánh giá này.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    await settle();
    expect(listCalls()).toHaveLength(2);
    expect(hideCalls()).toHaveLength(1);
  });

  it('WKD-07 503 ⇒ "Hệ thống đang bận, thử lại sau ít phút." giữ hộp và lý do; bấm lại (do người dùng) thành công thì đóng và tải lại', async () => {
    fakeServer();
    const real = handlers.hide;
    handlers.hide = () => apiError(503, 'HE_THONG_DANG_BAN');
    const box = await openRowHide();
    type(box, REASON);
    fireEvent.click(confirm(box));
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Hệ thống đang bận, thử lại sau ít phút.',
    );
    expect(reasonBox(box)).toHaveValue(REASON);
    expect(confirm(box)).toBeEnabled();
    await settle();
    expect(hideCalls()).toHaveLength(1);
    expect(listCalls()).toHaveLength(1);

    handlers.hide = real;
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hideCalls()).toHaveLength(2);
    await waitFor(() => expect(chips()).toEqual(['1 hiển thị', '2 đã ẩn']));
  });

  it('WKD-07 403 ⇒ câu riêng, `Xác nhận ẩn` khoá, lý do còn, chỉ còn `Hủy`', async () => {
    handlers.hide = () => apiError(403, 'KHONG_DU_QUYEN');
    const box = await openRowHide();
    type(box, REASON);
    fireEvent.click(confirm(box));
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(confirm(box)).toBeDisabled();
    expect(reasonBox(box)).toHaveValue(REASON);
    fireEvent.click(within(box).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hideCalls()).toHaveLength(1);
  });

  it('WKD-07 mất mạng ⇒ "Chưa rõ …", lý do còn, đúng MỘT POST dù chờ thêm (KHÔNG tự gửi lại); `Tải lại danh sách` đóng hộp, tải lại, thông báo "Đã tải lại danh sách."', async () => {
    const { hidden } = fakeServer();
    const real = handlers.hide;
    handlers.hide = () => Promise.reject(new TypeError('Failed to fetch'));
    const box = await openRowHide();
    type(box, REASON);
    fireEvent.click(confirm(box));
    const alert = await within(box).findByRole('alert');
    expect(alert).toHaveTextContent('Chưa rõ đánh giá đã được ẩn chưa');
    expect(reasonBox(box)).toHaveValue(REASON);
    await settle();
    await settle();
    expect(hideCalls()).toHaveLength(1);
    expect(listCalls()).toHaveLength(1);

    // Thực ra máy chủ đã ẩn xong: tải lại danh sách cho thấy "Đã ẩn"
    hidden.add('1');
    handlers.hide = real;
    fireEvent.click(
      within(alert).getByRole('button', { name: 'Tải lại danh sách' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await table();
    await waitFor(() => expect(chips()).toEqual(['1 hiển thị', '2 đã ẩn']));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đã tải lại danh sách.',
    );
    expect(hideCalls()).toHaveLength(1);
    expect(listCalls()).toHaveLength(2);
  });

  it('WKD-07 hết giờ 15 giây ⇒ "Chưa rõ …", MỘT POST, không tự gửi lại', async () => {
    const box = await openRowHide();
    type(box, REASON);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    handlers.hide = () => new Promise<Response>(() => undefined);
    fireEvent.click(confirm(box));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(within(box).queryByRole('alert')).toBeNull();
    expect(confirm(box)).toHaveTextContent('Đang ẩn...');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(within(box).getByRole('alert')).toHaveTextContent(
      'Chưa rõ đánh giá đã được ẩn chưa',
    );
    expect(reasonBox(box)).toHaveValue(REASON);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(hideCalls()).toHaveLength(1);
  });

  it('WKD-07 200 sai hình dạng (`biAn` false) ⇒ "Chưa rõ …" (không coi là đã ẩn), lý do còn, hộp ở lại', async () => {
    handlers.hide = (id) => jsonResponse({ danhGiaId: id, biAn: false });
    const box = await openRowHide();
    type(box, REASON);
    fireEvent.click(confirm(box));
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Chưa rõ đánh giá đã được ẩn chưa',
    );
    expect(reasonBox(box)).toHaveValue(REASON);
    expect(screen.queryByRole('status')).toBeNull();
    expect(listCalls()).toHaveLength(1);
  });
});

describe('doctor-exam F8 — bấm đúp (WKD-08)', () => {
  it('WKD-08 hai lần bấm `Xác nhận ẩn` CÙNG LƯỢT ⇒ MỘT POST; hộp khoá khi đang gửi', async () => {
    let finish!: (response: Response) => void;
    handlers.hide = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const box = await openRowHide();
    type(box, REASON);
    const button = confirm(box);
    act(() => {
      button.click();
      button.click();
    });
    expect(hideCalls()).toHaveLength(1);
    expect(confirm(box)).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Ẩn đánh giá' })).toBeVisible();
    await act(async () => {
      finish(jsonResponse({ danhGiaId: '1', biAn: true }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hideCalls()).toHaveLength(1);
  });
});

describe('doctor-exam F8 — luồng hai hộp: Chi tiết ⇒ Ẩn đánh giá (WKD-04, WKD-25)', () => {
  async function openFromDetail() {
    await renderPage();
    await table();
    click(VIEW_1);
    const detail = await detailDialog();
    await within(detail).findByText('CLX-20260611-00006 · 09:30 11/06/2026');
    fireEvent.click(
      within(detail).getByRole('button', { name: 'Ẩn đánh giá' }),
    );
    return hideDialog();
  }

  it('WKD-25 hộp chi tiết ĐÓNG, hộp ẩn mở thay (ĐÚNG MỘT `dialog`), KHÔNG `GET` chi tiết lại; tóm tắt lấy từ chi tiết đã tải; tiêu điểm vào ô lý do', async () => {
    handlers.detail = (id) =>
      jsonResponse(
        detailBody({
          danhGiaId: id,
          nhanXet: 'Nhận xét ĐẦY ĐỦ lấy từ chi tiết',
        }),
      );
    const box = await openFromDetail();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      screen.queryByRole('dialog', { name: 'Chi tiết đánh giá' }),
    ).toBeNull();
    expect(
      within(box).getByText('Nhận xét ĐẦY ĐỦ lấy từ chi tiết'),
    ).toBeVisible();
    expect(within(box).getByText('· Vũ Thị F · 28/05/2026')).toBeVisible();
    expect(detailCalls()).toHaveLength(1);
    expect(document.activeElement).toBe(reasonBox(box));
    expect(writeCalls()).toHaveLength(0);
  });

  it('WKD-25 `Hủy` ở hộp ẩn ⇒ về danh sách (không quay lại hộp chi tiết), tiêu điểm về nút `Xem` đã mở; `Esc` cũng vậy; KHÔNG gửi gì', async () => {
    const box = await openFromDetail();
    const opener = screen.getByRole('button', { name: VIEW_1 });
    fireEvent.click(within(box).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    click(VIEW_1);
    const detail = await detailDialog();
    await within(detail).findByText('CLX-20260611-00006 · 09:30 11/06/2026');
    fireEvent.click(
      within(detail).getByRole('button', { name: 'Ẩn đánh giá' }),
    );
    await hideDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(writeCalls()).toHaveLength(0);
  });

  it('WKD-06 ẩn từ hộp chi tiết: MỘT POST, cả hai hộp đã đóng, danh sách tải lại, chip đổi, thông báo thành công', async () => {
    fakeServer();
    const box = await openFromDetail();
    type(box, REASON);
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hideCalls()).toHaveLength(1);
    expect(hideCalls()[0].pathname).toBe('/api/admin/doctor-ratings/1/hide');
    await table();
    await waitFor(() => expect(chips()).toEqual(['1 hiển thị', '2 đã ẩn']));
    expect(screen.getByRole('status')).toHaveTextContent('Đã ẩn đánh giá.');
    expect(detailCalls()).toHaveLength(1);
  });

  it('WKD-25 nền `inert` đúng: sau khi chuyển hộp vẫn có `inert` ở nền, và gỡ hết khi đóng', async () => {
    const box = await openFromDetail();
    const inert = () =>
      [...document.body.children].some((element) =>
        element.hasAttribute('inert'),
      );
    expect(inert()).toBe(true);
    fireEvent.click(within(box).getByRole('button', { name: 'Hủy' }));
    expect(inert()).toBe(false);
  });
});

describe('doctor-exam F8 — lý do không vào kho, URL, log (WKD-26)', () => {
  it('WKD-26 qua đủ luồng (lỗi ô, 503, thành công) lý do KHÔNG vào `localStorage`, `sessionStorage`, URL, `location.state`, tiêu đề tài liệu hay `console.*`', async () => {
    const spies = (['log', 'info', 'warn', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    fakeServer();
    const real = handlers.hide;
    handlers.hide = () => apiError(503, 'HE_THONG_DANG_BAN');
    const router = await renderPage();
    await table();
    const title = document.title;
    click(HIDE_1);
    const box = await hideDialog();
    fireEvent.click(confirm(box));
    type(box, REASON);
    fireEvent.click(confirm(box));
    await within(box).findByRole('alert');
    handlers.hide = real;
    fireEvent.click(confirm(box));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await table();
    expect(router.state.location.search).toBe('');
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.state).toBeNull();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(document.title).toBe(title);
    expect(document.cookie).toBe('');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    // Lý do chỉ nằm trong THÂN của các POST, không trong đường dẫn hay query
    for (const [input] of writeCalls()) {
      expect(String(input)).not.toContain('Lăng');
      expect(String(input)).not.toContain(encodeURIComponent('Lăng'));
    }
  });
});
