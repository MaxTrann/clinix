import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  NetworkError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { errorMessageFor } from '../../../../shared/api/error-message';
import { jsonResponse } from '../../testing/fetch-routing';
import {
  BRANCH_ADMIN,
  detailBody,
  Q3,
  setupReviewsHarness,
} from './testing/render-reviews-page';

// doctor-exam F7: WKD-04 (phần `Xem`: hộp "Chi tiết đánh giá"; phần `Ẩn` là của F8), WKD-09 (404, lỗi, mạng), WKD-10 (nhận xét chữ thuần ở hộp), WKD-17 (tiêu điểm, Esc, nền inert, đổi hàng, bấm đúp). Mức trang qua app thật. Dữ liệu giả.
const { handlers, renderPage, listCalls, detailCalls, writeCalls } =
  setupReviewsHarness();

const ROW_1 = 'Xem đánh giá của Vũ Thị F về Nguyễn Minh Anh';
const ROW_2 = 'Xem đánh giá của Đỗ Văn G về Nguyễn Minh Anh';
const ROW_3 = 'Xem đánh giá của Lê Văn C về Lê Thảo Vy';

const open = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const dialog = () => screen.findByRole('dialog', { name: 'Chi tiết đánh giá' });
const field = (box: HTMLElement, label: string) =>
  within(box).getByText(label, { selector: 'dt' }).parentElement!;
const anyInert = () =>
  [...document.body.children].some((element) => element.hasAttribute('inert'));
async function openRow1() {
  await renderPage();
  await screen.findByRole('table');
  open(ROW_1);
  return dialog();
}

describe('hộp Chi tiết đánh giá — nội dung (WKD-04)', () => {
  it('WKD-04 `Xem` mở hộp và gọi ĐÚNG MỘT `GET /admin/doctor-ratings/:id`; đủ trường theo Figma `570:2`, mã lịch thật và giờ khám giờ Việt Nam', async () => {
    const box = await openRow1();
    expect(
      await within(box).findByText('CLX-20260611-00006 · 09:30 11/06/2026'),
    ).toBeVisible();
    expect(detailCalls()).toHaveLength(1);
    expect(detailCalls()[0].pathname).toBe('/api/admin/doctor-ratings/1');
    expect(box).toHaveAttribute('aria-modal', 'true');
    expect(
      within(field(box, 'Bác sĩ')).getByText('Nguyễn Minh Anh'),
    ).toBeVisible();
    expect(within(field(box, 'Chi nhánh')).getByText(Q3.ten)).toBeVisible();
    expect(within(field(box, 'Bệnh nhân')).getByText('Vũ Thị F')).toBeVisible();
    expect(
      within(field(box, 'Ngày gửi')).getByText('28/05/2026'),
    ).toBeVisible();
    expect(
      within(field(box, 'Trạng thái')).getByText('Hiển thị'),
    ).toBeVisible();
    const stars = field(box, 'Số sao');
    expect(within(stars).getByRole('img', { name: '4 sao' })).toBeVisible();
    expect(within(stars).getByText('(4/5)')).toBeVisible();
    expect(
      within(field(box, 'Nội dung')).getByText(
        'Tốt, sẽ giới thiệu cho bạn bè. Bác sĩ có chuyên môn cao.',
      ),
    ).toBeVisible();
    // Chưa ẩn: không có "Lý do ẩn"
    expect(within(box).queryByText('Lý do ẩn')).toBeNull();
  });

  it('WKD-04 hộp chi tiết đánh giá Hiển thị: có `Ẩn đánh giá` giữa × và `Đóng`; mở rồi đóng không lời gọi ghi', async () => {
    const box = await openRow1();
    await within(box).findByText('CLX-20260611-00006 · 09:30 11/06/2026');
    const names = within(box)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual(['Đóng hộp thoại', 'Ẩn đánh giá', 'Đóng']);
    fireEvent.click(within(box).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('WKD-04 hộp chi tiết đánh giá Đã ẩn: CHỈ có × và `Đóng`, không `Ẩn đánh giá` (Q8: ẩn là một chiều); hàng Đã ẩn không nút `Ẩn`', async () => {
    handlers.detail = (id) =>
      jsonResponse(detailBody({ danhGiaId: id, biAn: true }));
    await renderPage();
    await screen.findByRole('table');
    open(ROW_3);
    const box = await dialog();
    await within(box).findByText('CLX-20260611-00006 · 09:30 11/06/2026');
    const names = within(box)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual(['Đóng hộp thoại', 'Đóng']);
    fireEvent.click(within(box).getByRole('button', { name: 'Đóng' }));
    expect(
      screen.queryByRole('button', {
        name: 'Ẩn đánh giá của Lê Văn C về Lê Thảo Vy',
      }),
    ).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('WKD-04 hộp đang tải hay lỗi chưa biết trạng thái: CHƯA có `Ẩn đánh giá` (chỉ hiện khi chi tiết đã tải xong và còn Hiển thị)', async () => {
    handlers.detail = () => new Promise<Response>(() => undefined);
    await renderPage();
    await screen.findByRole('table');
    open(ROW_1);
    const box = await dialog();
    expect(await within(box).findByText('Đang tải chi tiết…')).toBeVisible();
    expect(
      within(box).queryByRole('button', { name: 'Ẩn đánh giá' }),
    ).toBeNull();
  });

  it('WKD-04 đánh giá đã ẩn: nhãn "Đã ẩn" và "Lý do ẩn" nguyên văn (nhiều dòng giữ nguyên)', async () => {
    handlers.detail = (id) =>
      jsonResponse(
        detailBody({
          danhGiaId: id,
          biAn: true,
          lyDoAn: 'Lăng mạ bác sĩ\n<b>vi phạm</b>',
        }),
      );
    await renderPage();
    await screen.findByRole('table');
    open(ROW_3);
    const box = await dialog();
    const reason = await within(box).findByText('Lý do ẩn', { selector: 'dt' });
    expect(within(field(box, 'Trạng thái')).getByText('Đã ẩn')).toBeVisible();
    const text = reason.parentElement!.querySelector('p');
    expect(text?.textContent).toBe('Lăng mạ bác sĩ\n<b>vi phạm</b>');
    expect(box.querySelector('b')).toBeNull();
  });

  it('WKD-04 đã ẩn mà máy chủ không có lý do (khoá `lyDoAn` vắng) ⇒ không dòng "Lý do ẩn"', async () => {
    handlers.detail = (id) =>
      jsonResponse(detailBody({ danhGiaId: id, biAn: true }));
    await renderPage();
    await screen.findByRole('table');
    open(ROW_3);
    const box = await dialog();
    await within(box).findByText('CLX-20260611-00006 · 09:30 11/06/2026');
    expect(within(field(box, 'Trạng thái')).getByText('Đã ẩn')).toBeVisible();
    expect(within(box).queryByText('Lý do ẩn')).toBeNull();
  });

  it('WKD-04 Admin Chi nhánh: hộp KHÔNG có dòng "Chi nhánh" (đã ở tiêu đề trang)', async () => {
    await renderPage({ scope: BRANCH_ADMIN });
    await screen.findByRole('table');
    open(ROW_1);
    const box = await dialog();
    await within(box).findByText('CLX-20260611-00006 · 09:30 11/06/2026');
    expect(within(box).queryByText('Chi nhánh', { selector: 'dt' })).toBeNull();
    expect(within(box).queryByText(Q3.ten)).toBeNull();
    expect(
      within(field(box, 'Bác sĩ')).getByText('Nguyễn Minh Anh'),
    ).toBeVisible();
  });
});

describe('hộp Chi tiết đánh giá — tiêu điểm và đổi hàng (WKD-17)', () => {
  it('WKD-17 tiêu điểm vào `Đóng`, nền `inert` khi mở; `Esc` đóng, gỡ `inert` và trả tiêu điểm về nút `Xem` đã mở', async () => {
    await renderPage();
    await screen.findByRole('table');
    const opener = screen.getByRole('button', { name: ROW_1 });
    opener.focus();
    open(ROW_1);
    const box = await dialog();
    expect(document.activeElement).toBe(
      within(box).getByRole('button', { name: 'Đóng' }),
    );
    expect(anyInert()).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(anyInert()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('WKD-17 nút × (tên "Đóng hộp thoại") và nút `Đóng` đều đóng và trả tiêu điểm', async () => {
    await renderPage();
    await screen.findByRole('table');
    const opener = screen.getByRole('button', { name: ROW_2 });
    open(ROW_2);
    let box = await dialog();
    fireEvent.click(
      within(box).getByRole('button', { name: 'Đóng hộp thoại' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    open(ROW_2);
    box = await dialog();
    fireEvent.click(within(box).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('WKD-17 đổi hàng: chi tiết của hàng trước KHÔNG hiện cho hàng sau (đang tải, rồi đúng dữ liệu hàng sau)', async () => {
    let release: (response: Response) => void = () => undefined;
    handlers.detail = (id) =>
      id === '2'
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : jsonResponse(
            detailBody({ danhGiaId: id, nhanXet: 'Chi tiết của hàng MỘT' }),
          );
    await renderPage();
    await screen.findByRole('table');
    open(ROW_1);
    let box = await dialog();
    expect(await within(box).findByText('Chi tiết của hàng MỘT')).toBeVisible();
    fireEvent.click(within(box).getByRole('button', { name: 'Đóng' }));

    open(ROW_2);
    box = await dialog();
    expect(await within(box).findByText('Đang tải chi tiết…')).toBeVisible();
    expect(within(box).queryByText('Chi tiết của hàng MỘT')).toBeNull();
    await act(async () => {
      release(
        jsonResponse(
          detailBody({ danhGiaId: '2', nhanXet: 'Chi tiết của hàng HAI' }),
        ),
      );
    });
    expect(await within(box).findByText('Chi tiết của hàng HAI')).toBeVisible();
    expect(detailCalls().map((url) => url.pathname)).toEqual([
      '/api/admin/doctor-ratings/1',
      '/api/admin/doctor-ratings/2',
    ]);
  });

  it('WKD-17 bấm `Xem` hai lần liền: MỘT hộp và MỘT `GET` chi tiết', async () => {
    await renderPage();
    await screen.findByRole('table');
    const button = screen.getByRole('button', { name: ROW_1 });
    fireEvent.click(button);
    fireEvent.click(button);
    await dialog();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await waitFor(() => expect(detailCalls()).toHaveLength(1));
  });

  it('WKD-17 mở và đóng hộp không đụng kho trình duyệt và URL', async () => {
    const router = await renderPage();
    await screen.findByRole('table');
    open(ROW_1);
    const box = await dialog();
    await within(box).findByText('CLX-20260611-00006 · 09:30 11/06/2026');
    fireEvent.click(within(box).getByRole('button', { name: 'Đóng' }));
    expect(router.state.location.search).toBe('');
    expect(router.state.location.state).toBeNull();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });
});

describe('hộp Chi tiết đánh giá — lỗi (WKD-09)', () => {
  it('WKD-09 404 `KHONG_TIM_THAY`: câu riêng, KHÔNG `Thử lại`, danh sách được tải lại ĐÚNG MỘT lần', async () => {
    handlers.detail = () =>
      jsonResponse({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404);
    await renderPage();
    await screen.findByRole('table');
    expect(listCalls()).toHaveLength(1);
    open(ROW_1);
    const box = await dialog();
    expect(
      await within(box).findByText('Không tìm thấy đánh giá này.'),
    ).toBeVisible();
    expect(within(box).queryByRole('button', { name: 'Thử lại' })).toBeNull();
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(listCalls()).toHaveLength(2);
    expect(detailCalls()).toHaveLength(1);
    fireEvent.click(within(box).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('WKD-09 lỗi 500: hộp lỗi kèm `Thử lại` (hộp ở lại), `Thử lại` gọi lại và hiện chi tiết; danh sách KHÔNG tải lại', async () => {
    handlers.detail = () =>
      jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500);
    await renderPage();
    await screen.findByRole('table');
    open(ROW_1);
    const box = await dialog();
    const alert = await within(box).findByRole('alert');
    handlers.detail = (id) => jsonResponse(detailBody({ danhGiaId: id }));
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(
      await within(box).findByText('CLX-20260611-00006 · 09:30 11/06/2026'),
    ).toBeVisible();
    expect(detailCalls()).toHaveLength(2);
    expect(listCalls()).toHaveLength(1);
  });

  it('WKD-09 mất mạng và 200 sai hình dạng ⇒ hộp lỗi (không dữ liệu dở dang)', async () => {
    handlers.detail = () => Promise.reject(new TypeError('Failed to fetch'));
    await renderPage();
    await screen.findByRole('table');
    open(ROW_1);
    let box = await dialog();
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      errorMessageFor(new NetworkError()),
    );
    fireEvent.click(within(box).getByRole('button', { name: 'Đóng' }));

    handlers.detail = () => jsonResponse({ ...detailBody(), soSao: 9 });
    open(ROW_2);
    box = await dialog();
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      errorMessageFor(new UnexpectedResponseError(200)),
    );
    expect(within(box).queryByText('Số sao')).toBeNull();
  });
});

describe('hộp Chi tiết đánh giá — chữ thuần (WKD-10)', () => {
  it('WKD-10 nhận xét ĐẦY ĐỦ (dài hơn 200) chứa `<script>`, liên kết spam, HTML: nguyên văn là chữ, không phần tử script, img, a', async () => {
    const spam = `<script>alert(1)</script> Click vào đây nhận ngay iPhone http://spam.example <img src=x onerror=alert(1)> ${'z'.repeat(1000)}`;
    handlers.detail = (id) =>
      jsonResponse(detailBody({ danhGiaId: id, nhanXet: spam }));
    await renderPage();
    await screen.findByRole('table');
    open(ROW_1);
    const box = await dialog();
    expect(await within(box).findByText(spam)).toBeVisible();
    for (const tag of ['script', 'img', 'a']) {
      expect(box.querySelector(tag)).toBeNull();
    }
    expect(within(box).queryByRole('link')).toBeNull();
  });

  it('WKD-10 nhận xét `null` hoặc rỗng ⇒ "—", không bịa nội dung', async () => {
    handlers.detail = (id) =>
      jsonResponse(detailBody({ danhGiaId: id, nhanXet: null }));
    await renderPage();
    await screen.findByRole('table');
    open(ROW_1);
    const box = await dialog();
    await within(box).findByText('CLX-20260611-00006 · 09:30 11/06/2026');
    expect(within(field(box, 'Nội dung')).getByText('—')).toBeVisible();
  });
});
