import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { errorMessageFor } from '../../../shared/api/error-message';
import { ApiError, NetworkError } from '../../../shared/api/errors';
import { makeDetail } from '../testing/article-fixtures';
import { makeSeed } from '../testing/article-seed';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-06 (đổi trạng thái ở từng dòng; A2 ẩn bài phải xác nhận) và ABW-07 (bấm đúp một lời gọi) cho DANH SÁCH. Bản giả `createFakeArticleApi`; dữ liệu giả.
// makeSeed: id 1 "Sốt xuất huyết" (đã xuất bản), id 2 "Tiểu đường" (nháp), id 3 "Tim mạch" (lưu trữ).
const FIRST = 'Sốt xuất huyết';
const SECOND = 'Tiểu đường';
const THIRD = 'Tim mạch';
const ARCHIVE = 'Lưu trữ (ẩn bài)';

const rowButton = (label: string, title: string) =>
  screen.getByRole('button', { name: `${label} bài viết ${title}` });
const dialog = () => screen.queryByRole('dialog');
const setup = async (seed = makeSeed()) => {
  const api = createFakeArticleApi(seed);
  renderArticlePages({ api });
  await screen.findByRole('table', { name: 'Danh sách bài viết' });
  return api;
};

describe('đổi trạng thái ở dòng: hộp xác nhận ẩn bài (ABW-06)', () => {
  it('ABW-06 "Lưu trữ (ẩn bài)" bài đang xuất bản ⇒ hộp cảnh báo đúng chữ, CHƯA gọi API', async () => {
    const api = await setup();

    fireEvent.click(rowButton(ARCHIVE, FIRST));

    const box = screen.getByRole('dialog', { name: 'Lưu trữ bài viết?' });
    expect(box).toHaveTextContent(
      'Bài viết sẽ không còn hiển thị công khai, kể cả trong tra cứu. Lượt Thích và Không thích vẫn được giữ.',
    );
    expect(within(box).getByRole('button', { name: 'Huỷ' })).toBeVisible();
    expect(within(box).getByRole('button', { name: 'Lưu trữ' })).toBeVisible();
    expect(api.callsTo('update')).toHaveLength(0);
  });

  it('ABW-06 "Huỷ" và Esc đóng hộp, không gọi API, trả focus về nút đã mở', async () => {
    const api = await setup();
    const opener = rowButton(ARCHIVE, FIRST);

    opener.focus();
    fireEvent.click(opener);
    expect(dialog()).not.toBeNull();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Huỷ' }),
    );
    expect(dialog()).toBeNull();
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    expect(dialog()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).toBeNull();
    expect(opener).toHaveFocus();
    expect(api.callsTo('update')).toHaveLength(0);
  });

  it('ABW-06 xác nhận ⇒ đúng một PATCH {trangThai:"LuuTruAn"}, thông báo, danh sách tải lại và dòng đổi sang Lưu trữ', async () => {
    const api = await setup();

    fireEvent.click(rowButton(ARCHIVE, FIRST));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Lưu trữ',
      }),
    );

    expect(await screen.findByText('Đã lưu trữ bài viết.')).toBeVisible();
    expect(api.callsTo('update').map((call) => call.args)).toEqual([
      ['1', { trangThai: 'LuuTruAn' }],
    ]);
    expect(dialog()).toBeNull();
    await waitFor(() => expect(api.callsTo('list')).toHaveLength(2));
    expect(
      await screen.findByRole('button', {
        name: `Khôi phục về Bản nháp bài viết ${FIRST}`,
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Lưu trữ (2)' })).toBeVisible();
  });

  it('ABW-06 "Xuất bản" bài nháp KHÔNG hỏi: gọi ngay một PATCH {trangThai:"DaXuatBan"}; dòng chuyển sang "Lưu trữ (ẩn bài)"', async () => {
    const api = await setup();

    fireEvent.click(rowButton('Xuất bản', SECOND));

    expect(dialog()).toBeNull();
    expect(await screen.findByText('Đã xuất bản bài viết.')).toBeVisible();
    expect(api.callsTo('update').map((call) => call.args)).toEqual([
      ['2', { trangThai: 'DaXuatBan' }],
    ]);
    expect(
      await screen.findByRole('button', {
        name: `Lưu trữ (ẩn bài) bài viết ${SECOND}`,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Đã xuất bản (2)' }),
    ).toBeVisible();
  });

  it('ABW-06 "Khôi phục về Bản nháp" bài lưu trữ KHÔNG hỏi: gọi ngay một PATCH {trangThai:"BanNhap"}', async () => {
    const api = await setup();

    fireEvent.click(rowButton('Khôi phục về Bản nháp', THIRD));

    expect(dialog()).toBeNull();
    expect(
      await screen.findByText('Đã khôi phục bài viết về Bản nháp.'),
    ).toBeVisible();
    expect(api.callsTo('update').map((call) => call.args)).toEqual([
      ['3', { trangThai: 'BanNhap' }],
    ]);
    expect(
      await screen.findByRole('button', { name: 'Bản nháp (2)' }),
    ).toBeVisible();
  });

  it('ABW-06 mỗi trạng thái có đúng MỘT nút đổi trạng thái cùng nút Sửa', async () => {
    await setup();
    const labels = (title: string) =>
      within(
        screen
          .getAllByRole('row')
          .find((row) => row.textContent?.includes(title))!,
      )
        .getAllByRole('button')
        .map((button) => button.textContent);

    expect(labels(FIRST)).toEqual([ARCHIVE]);
    expect(labels(SECOND)).toEqual(['Xuất bản']);
    expect(labels(THIRD)).toEqual(['Khôi phục về Bản nháp']);
  });
});

describe('đổi trạng thái ở dòng: lỗi (ABW-05, ABW-06)', () => {
  const publishSecond = () => fireEvent.click(rowButton('Xuất bản', SECOND));

  it('ABW-06 xuất bản bài chưa có nội dung ⇒ "Cần có nội dung trước khi xuất bản."; dòng giữ nguyên', async () => {
    const api = await setup([
      makeDetail({ baiVietId: '9', tieuDe: 'Bài trống', noiDung: '' }),
    ]);

    fireEvent.click(rowButton('Xuất bản', 'Bài trống'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cần có nội dung trước khi xuất bản.',
    );
    expect(rowButton('Xuất bản', 'Bài trống')).toBeEnabled();
    expect(api.articles()[0].trangThai).toBe('BanNhap');
  });

  it.each([
    [
      '403',
      new ApiError(403, { maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' }),
      'Bạn không có quyền thay đổi bài viết.',
    ],
    ['mạng', new NetworkError(), errorMessageFor(new NetworkError())],
    [
      '500',
      new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      'Không đổi được trạng thái bài viết. Vui lòng thử lại.',
    ],
  ])(
    'ABW-05 lỗi %s ⇒ thông báo lỗi riêng; không tải lại danh sách',
    async (_label, error, text) => {
      const api = await setup();
      api.failNext('update', error);

      publishSecond();

      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(api.callsTo('list')).toHaveLength(1);
    },
  );

  it('ABW-05 404 (bài đã không còn) ⇒ "Bài viết không còn tồn tại." và danh sách được tải lại', async () => {
    const api = await setup();
    api.failNext(
      'update',
      new ApiError(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
    );

    publishSecond();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bài viết không còn tồn tại.',
    );
    await waitFor(() => expect(api.callsTo('list')).toHaveLength(2));
  });

  it('ABW-05 thao tác sau thành công xoá thông báo lỗi cũ', async () => {
    const api = await setup();
    api.failNext('update', new NetworkError());
    publishSecond();
    await screen.findByRole('alert');

    publishSecond();

    expect(await screen.findByText('Đã xuất bản bài viết.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('đổi trạng thái ở dòng: bấm đúp (ABW-07)', () => {
  it('ABW-07 bấm đúp "Xuất bản" trong MỘT khung hình ⇒ đúng một lời gọi (chốt đồng bộ, không chỉ nút bị khoá)', async () => {
    const api = await setup();
    const button = rowButton('Xuất bản', SECOND);

    act(() => {
      button.click();
      button.click();
    });

    await screen.findByText('Đã xuất bản bài viết.');
    expect(api.callsTo('update')).toHaveLength(1);
  });

  it('ABW-07 bấm đúp "Lưu trữ" ở hộp xác nhận ⇒ đúng một lời gọi, hộp đóng', async () => {
    const api = await setup();
    fireEvent.click(rowButton(ARCHIVE, FIRST));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Lưu trữ',
    });

    act(() => {
      confirm.click();
      confirm.click();
    });

    await screen.findByText('Đã lưu trữ bài viết.');
    expect(api.callsTo('update')).toHaveLength(1);
    expect(dialog()).toBeNull();
  });

  it('ABW-07 đang đổi một bài thì mọi nút đổi trạng thái khác bị khoá, xong thì mở lại', async () => {
    const api = await setup();
    const gate = api.hold('update');

    fireEvent.click(rowButton('Xuất bản', SECOND));

    await waitFor(() => expect(rowButton(ARCHIVE, FIRST)).toBeDisabled());
    expect(rowButton('Khôi phục về Bản nháp', THIRD)).toBeDisabled();
    await act(async () => gate.release());
    await screen.findByText('Đã xuất bản bài viết.');
    expect(rowButton(ARCHIVE, FIRST)).toBeEnabled();
  });
});
