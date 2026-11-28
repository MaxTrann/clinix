import { screen, within } from '@testing-library/react';
import { errorMessageFor } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { makeDetail } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { addTag, clickSave, field, fill } from '../testing/form-helpers';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-05: MỖI mã lỗi của PLAN 5.8 (cả dạng maLoi lẫn dạng loi[].ma) ⇒ chữ riêng gắn đúng ô; 403, 404, mạng, hết giờ, 500 ⇒ dải báo cạnh nút Lưu; bản nháp giữ nguyên.
const fieldError = (truong: string, ma: string) =>
  new ApiError(400, {
    maLoi: 'DU_LIEU_KHONG_HOP_LE',
    thongBao: 'câu của API',
    loi: [{ truong, ma }],
  });
const businessError = (status: number, maLoi: string, chiTiet?: unknown) =>
  new ApiError(status, { maLoi, thongBao: 'câu của API', chiTiet });

// [mã, dạng lỗi, ô nhận (nhãn), chữ]
const FIELD_CASES: [string, ApiError, string, string][] = [
  [
    'TIEU_DE_KHONG_HOP_LE',
    fieldError('tieuDe', 'TIEU_DE_KHONG_HOP_LE'),
    'Tiêu đề',
    'Tiêu đề không được để trống và tối đa 255 ký tự.',
  ],
  [
    'MO_TA_QUA_DAI',
    fieldError('moTaNgan', 'MO_TA_QUA_DAI'),
    'Mô tả ngắn',
    'Mô tả ngắn tối đa 500 ký tự.',
  ],
  [
    'MO_TA_KHONG_HOP_LE (mã B1 thêm; chữ mới theo mẫu NOI_DUNG_KHONG_HOP_LE)',
    fieldError('moTaNgan', 'MO_TA_KHONG_HOP_LE'),
    'Mô tả ngắn',
    'Mô tả ngắn có ký tự không hợp lệ.',
  ],
  [
    'NOI_DUNG_QUA_DAI',
    fieldError('noiDung', 'NOI_DUNG_QUA_DAI'),
    'Nội dung',
    'Nội dung quá dài (tối đa 20.000 ký tự).',
  ],
  [
    'NOI_DUNG_KHONG_HOP_LE',
    fieldError('noiDung', 'NOI_DUNG_KHONG_HOP_LE'),
    'Nội dung',
    'Nội dung có ký tự không hợp lệ.',
  ],
  [
    'THE_KHONG_HOP_LE',
    fieldError('hashtag', 'THE_KHONG_HOP_LE'),
    'Thẻ',
    'Thẻ chỉ gồm chữ, số và dấu gạch ngang (tối đa 50 ký tự).',
  ],
  [
    'QUA_NHIEU_THE',
    fieldError('hashtag', 'QUA_NHIEU_THE'),
    'Thẻ',
    'Tối đa 10 thẻ mỗi bài.',
  ],
  // cùng các mã đó ở dạng maLoi (nghiệp vụ) thay vì loi[].ma: web đọc cả hai
  [
    'MO_TA_QUA_DAI (maLoi)',
    businessError(400, 'MO_TA_QUA_DAI'),
    'Mô tả ngắn',
    'Mô tả ngắn tối đa 500 ký tự.',
  ],
  [
    'QUA_NHIEU_THE (maLoi)',
    businessError(400, 'QUA_NHIEU_THE'),
    'Thẻ',
    'Tối đa 10 thẻ mỗi bài.',
  ],
  [
    'NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN',
    businessError(400, 'NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN'),
    'Nội dung',
    'Cần có nội dung trước khi xuất bản.',
  ],
  [
    'TRANG_THAI_KHONG_HOP_LE',
    businessError(400, 'TRANG_THAI_KHONG_HOP_LE'),
    'Trạng thái',
    'Không tạo bài mới ở trạng thái lưu trữ.',
  ],
  [
    'THE_TRUNG_KHONG_DAU',
    businessError(409, 'THE_TRUNG_KHONG_DAU', { theDaCo: 'mặt' }),
    'Thẻ',
    'Đã có thẻ “mặt” (khác dấu). Hãy dùng thẻ này.',
  ],
  [
    'THE_DA_TAT',
    businessError(409, 'THE_DA_TAT', { theDaCo: 'tim-mạch' }),
    'Thẻ',
    'Thẻ “tim-mạch” đã bị tắt, chưa dùng lại được.',
  ],
];

// Tạo bài với dữ liệu đã nhập đủ rồi để máy chủ từ chối bằng `error`
async function submitAndFail(error: unknown) {
  const api = createFakeArticleApi();
  api.failNext('create', error);
  renderArticlePages({ api, path: '/admin/bai-viet/moi' });
  fill('Tiêu đề', 'Bài thử');
  fill('Mô tả ngắn', 'Mô tả thử');
  fill('Nội dung', 'Nội dung thử');
  addTag('mắt');
  clickSave();
  await screen.findByRole('button', { name: 'Lưu' });
  return api;
}

describe('biểu mẫu: lỗi theo mã gắn đúng ô (ABW-05)', () => {
  it.each(FIELD_CASES)(
    'ABW-05 %s ⇒ chữ riêng dưới ô "%s"; bản nháp giữ nguyên',
    async (_code, error, label, text) => {
      await submitAndFail(error);

      const message = await screen.findByText(text);
      expect(message).toBeVisible();
      expect(field(label)).toHaveAttribute('aria-invalid', 'true');
      // ô Nội dung còn câu gợi ý cú pháp trong mô tả, nên chỉ cần mô tả CÓ chứa câu lỗi
      expect(field(label)).toHaveAccessibleDescription(
        expect.stringContaining(text),
      );
      // chỉ ô đó bị đánh dấu lỗi, không dải báo chung
      expect(screen.queryByRole('alert')).toBeNull();
      // mọi chữ đã nhập còn nguyên (4b: giữ nguyên nội dung đã nhập)
      expect(field('Tiêu đề')).toHaveValue('Bài thử');
      expect(field('Mô tả ngắn')).toHaveValue('Mô tả thử');
      expect(field('Nội dung')).toHaveValue('Nội dung thử');
      expect(screen.getByRole('button', { name: 'Bỏ thẻ mắt' })).toBeVisible();
    },
  );

  it('ABW-05 lỗi theo ô sau khi lưu ⇒ focus vào ô lỗi', async () => {
    await submitAndFail(fieldError('moTaNgan', 'MO_TA_QUA_DAI'));
    await screen.findByText('Mô tả ngắn tối đa 500 ký tự.');

    expect(field('Mô tả ngắn')).toHaveFocus();
  });

  it('ABW-05 sửa ô lỗi thì lỗi của ô đó biến mất, ô khác không bị ảnh hưởng', async () => {
    await submitAndFail(
      new ApiError(400, {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'x',
        loi: [
          { truong: 'moTaNgan', ma: 'MO_TA_QUA_DAI' },
          { truong: 'noiDung', ma: 'NOI_DUNG_KHONG_HOP_LE' },
        ],
      }),
    );
    await screen.findByText('Mô tả ngắn tối đa 500 ký tự.');
    expect(screen.getByText('Nội dung có ký tự không hợp lệ.')).toBeVisible();

    fill('Mô tả ngắn', 'ngắn hơn');

    expect(screen.queryByText('Mô tả ngắn tối đa 500 ký tự.')).toBeNull();
    expect(screen.getByText('Nội dung có ký tự không hợp lệ.')).toBeVisible();
  });

  it.each([
    ['THE_TRUNG_KHONG_DAU', 'Đã có thẻ cùng tên khác dấu. Hãy dùng thẻ đã có.'],
    ['THE_DA_TAT', 'Thẻ này đã bị tắt, chưa dùng lại được.'],
  ])(
    'ABW-05 %s thiếu chiTiet.theDaCo ⇒ dùng câu không kèm tên thẻ, không in "{theDaCo}"',
    async (code, text) => {
      await submitAndFail(businessError(409, code));

      expect(await screen.findByText(text)).toBeVisible();
      expect(field('Thẻ')).toHaveAttribute('aria-invalid', 'true');
      expect(document.body.textContent).not.toContain('{theDaCo}');
    },
  );

  it('ABW-05 chữ chọn theo MÃ, không theo thongBao của máy chủ', async () => {
    await submitAndFail(
      new ApiError(400, {
        maLoi: 'QUA_NHIEU_THE',
        thongBao: 'Câu lạ của máy chủ',
      }),
    );

    expect(await screen.findByText('Tối đa 10 thẻ mỗi bài.')).toBeVisible();
    expect(screen.queryByText('Câu lạ của máy chủ')).toBeNull();
  });
});

describe('biểu mẫu: lỗi không thuộc ô nào (ABW-05)', () => {
  const banner = () => screen.findByRole('alert');

  it.each([
    [
      '403',
      businessError(403, 'KHONG_DU_QUYEN'),
      'Bạn không có quyền sửa bài viết.',
    ],
    [
      '404',
      businessError(404, 'KHONG_TIM_THAY'),
      'Bài viết không còn tồn tại.',
    ],
    [
      '500',
      businessError(500, 'LOI_HE_THONG'),
      errorMessageFor(businessError(500, 'LOI_HE_THONG')),
    ],
    [
      '413',
      businessError(413, 'DU_LIEU_QUA_LON'),
      errorMessageFor(businessError(413, 'DU_LIEU_QUA_LON')),
    ],
    [
      'mã lạ',
      businessError(400, 'MA_LA'),
      errorMessageFor(businessError(400, 'MA_LA')),
    ],
    [
      '400 chung không rõ ô',
      fieldError('khac', 'MA_LA'),
      errorMessageFor(fieldError('khac', 'MA_LA')),
    ],
    // bốn mã B1 thêm mà web hầu như không gặp (web chuẩn hoá trước khi gọi): nhánh "mã lạ", ở cả hai dạng maLoi và loi[].ma
    ...[
      ['MA_BAI_VIET_KHONG_HOP_LE', 'id'],
      ['TU_KHOA_KHONG_HOP_LE', 'q'],
      ['TRANG_KHONG_HOP_LE', 'page'],
      ['TRUONG_KHONG_DUOC_PHEP', 'imageUploadId'],
    ].flatMap(([code, truong]) => [
      [
        `${code} (maLoi)`,
        businessError(400, code),
        errorMessageFor(businessError(400, code)),
      ],
      [
        `${code} (loi[].ma)`,
        fieldError(truong, code),
        errorMessageFor(fieldError(truong, code)),
      ],
    ]),
  ] as [string, ApiError, string][])(
    'ABW-05 %s ⇒ dải báo riêng cạnh nút Lưu; không ô nào bị đánh dấu; bản nháp giữ nguyên',
    async (_label, error, text) => {
      await submitAndFail(error);

      const alert = await banner();
      expect(alert).toHaveTextContent(text);
      expect(alert.closest('form')).not.toBeNull();
      expect(
        within(alert.parentElement!.parentElement!).getByRole('button', {
          name: 'Lưu',
        }),
      ).toBeVisible();
      for (const label of ['Tiêu đề', 'Mô tả ngắn', 'Nội dung']) {
        expect(field(label)).not.toHaveAttribute('aria-invalid');
      }
      expect(field('Tiêu đề')).toHaveValue('Bài thử');
    },
  );

  it.each([
    ['mất mạng', new NetworkError()],
    ['hết giờ', new TimeoutError()],
  ])(
    'ABW-05 TẠO bài gặp %s ⇒ báo "chưa rõ đã lưu hay chưa" (không bảo thử lại ngay vì có thể đã tạo)',
    async (_label, error) => {
      await submitAndFail(error);

      expect(await banner()).toHaveTextContent(
        'Chưa rõ bài viết đã được lưu hay chưa. Hãy kiểm tra danh sách bài viết trước khi lưu lại.',
      );
    },
  );

  it.each([
    ['mất mạng', new NetworkError()],
    ['hết giờ', new TimeoutError()],
  ])(
    'ABW-05 SỬA bài gặp %s ⇒ câu chung của hệ thống (PATCH thử lại được)',
    async (_label, error) => {
      const api = createFakeArticleApi([makeDetail({ baiVietId: '1' })]);
      api.failNext('update', error);
      renderArticlePages({ api, path: '/admin/bai-viet/1' });
      await screen.findByRole('heading', { name: 'Sửa bài viết' });
      fill('Tiêu đề', 'Tên mới');

      clickSave();

      expect(await banner()).toHaveTextContent(errorMessageFor(error));
      expect(field('Tiêu đề')).toHaveValue('Tên mới');
    },
  );

  it('ABW-05 lưu lỗi rồi sửa ô và lưu lại thành công ⇒ dải báo biến mất', async () => {
    const api = createFakeArticleApi([makeDetail({ baiVietId: '1' })]);
    api.failNext('update', businessError(403, 'KHONG_DU_QUYEN'));
    renderArticlePages({ api, path: '/admin/bai-viet/1' });
    await screen.findByRole('heading', { name: 'Sửa bài viết' });
    fill('Tiêu đề', 'Tên mới');
    clickSave();
    await banner();

    clickSave();

    expect(await screen.findByText('Đã lưu bài viết.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
