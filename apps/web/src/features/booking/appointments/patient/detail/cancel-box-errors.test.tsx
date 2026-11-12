import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import {
  CANCEL_API_PATH,
  DETAIL_API_PATH,
  PREVIEW_API_PATH,
  cancelBox,
  cancelButton,
  cleanUpDetailPage,
  confirmButton,
  detailLoaded,
  holdResponse,
  keepButton,
  openCancelBox,
  renderDetailPage,
} from '../../../testing/appointment-detail-harness';
import {
  conflictResponse,
  makeDetail,
  notFoundResponse,
  type DetailFakeRequest,
} from '../../../testing/fake-appointment-detail-api';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import { LIST_TEXT } from '../list-messages';
import { CANCEL_TEXT, DETAIL_TEXT } from './detail-messages';

// booking F2: lỗi của hộp huỷ, chọn câu theo `maLoi` (không theo mã HTTP; PLAN 5.14). Mã HHL là [đề xuất] (PLAN booking mục 7.33 sau khi duyệt). Dữ liệu giả.
// Nguyên tắc kiểm ở mọi ca: hộp KHÔNG BAO GIỜ hiện "Đã hủy" khi máy chủ chưa nói vậy (chip vẫn là "Đã xác nhận").
afterEach(cleanUpDetailPage);

const apiError = (status: number, maLoi: string) =>
  jsonResponse({ maLoi, thongBao: 'Lỗi giả của test' }, status);
type CallLog = { callsTo: (m: string, p: string) => DetailFakeRequest[] };
const gets = (api: CallLog, path: string) => api.callsTo('GET', path);
const posts = (api: CallLog) => api.callsTo('POST', CANCEL_API_PATH);
const chip = () =>
  within(screen.getByRole('region', { name: DETAIL_TEXT.summary }));
const retry = () => screen.queryByRole('button', { name: CANCEL_TEXT.retry });
const closeButton = () =>
  screen.queryByRole('button', { name: CANCEL_TEXT.close });
const BUSY =
  'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.';
const UNSURE =
  'Mất kết nối khi đang hủy, chưa rõ lịch hẹn đã được hủy hay chưa.';

describe('409 LICH_HEN_KHONG_CHO_HUY khi gửi huỷ', () => {
  it.each([
    [
      'DaHuy (lần bấm thứ hai, hay huỷ ở nơi khác)',
      { trangThai: 'DaHuy' },
      'Lịch hẹn này đã được hủy.',
      'Đã hủy',
    ],
    [
      'DaTiepDon',
      { trangThai: 'DaTiepDon' },
      'Lịch hẹn đang ở trạng thái Đã tiếp đón nên không thể hủy.',
      'Đã tiếp đón',
    ],
    [
      'HoanThanh',
      { trangThai: 'HoanThanh' },
      'Lịch hẹn đang ở trạng thái Hoàn thành nên không thể hủy.',
      'Hoàn thành',
    ],
    [
      'VangMat',
      { trangThai: 'VangMat' },
      'Lịch hẹn đang ở trạng thái Vắng mặt nên không thể hủy.',
      'Vắng mặt',
    ],
  ])(
    'LH-03 / HHL-08 chiTiet.trangThai = %s ⇒ đúng câu, hộp dừng (chỉ còn `Đóng`), chi tiết được tải lại và hiện trạng thái mới',
    async (_name, chiTiet, message, label) => {
      const { api } = renderDetailPage({
        before: (fake) =>
          fake.failNext('cancel', () => conflictResponse(chiTiet)),
      });
      await openCancelBox();
      // Máy chủ đã đổi trạng thái: lần tải lại thấy trạng thái mới, không còn huỷ được
      api.detail = makeDetail({
        trangThai: chiTiet.trangThai,
        choPhepHuy: false,
      });
      fireEvent.click(confirmButton());

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveFocus();
      expect(closeButton()).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: CANCEL_TEXT.confirm }),
      ).toBeNull();
      expect(posts(api)).toHaveLength(1);

      await waitFor(() => expect(gets(api, DETAIL_API_PATH)).toHaveLength(2));
      await waitFor(() => expect(chip().getByText(label)).toBeInTheDocument());
      // Câu lỗi vẫn còn trong hộp sau khi tải lại (giữ dữ liệu cũ, hộp không bị gỡ)
      expect(screen.getByText(message)).toBeInTheDocument();

      fireEvent.click(closeButton() as HTMLElement);
      expect(cancelBox()).toBeNull();
      expect(cancelButton()).toBeNull();
      expect(posts(api)).toHaveLength(1);
    },
  );

  it.each([
    ['chiTiet vắng', undefined],
    ['trangThai lạ (DaDoiLich)', { trangThai: 'DaDoiLich' }],
    ['trangThai sai kiểu', { trangThai: 5 }],
    ['chiTiet không phải đối tượng', 'DaHuy'],
    ['chiTiet null', null],
  ])('HHL-08 %s ⇒ câu chung, không lộ mã thô', async (_name, chiTiet) => {
    renderDetailPage({
      before: (fake) =>
        fake.failNext('cancel', () => conflictResponse(chiTiet)),
    });
    await openCancelBox();
    fireEvent.click(confirmButton());

    expect(
      await screen.findByText('Lịch hẹn này hiện không thể hủy.'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('DaDoiLich');
    expect(chip().getByText('Đã xác nhận')).toBeInTheDocument();
  });

  it('HHL-08 trong lúc tải lại chi tiết sau 409, trang giữ bản cũ (`aria-busy`) và câu lỗi không biến mất; xong thì chip đổi', async () => {
    const reload = holdResponse(() =>
      jsonResponse(makeDetail({ trangThai: 'DaHuy', choPhepHuy: false })),
    );
    const { api } = renderDetailPage({
      before: (fake) =>
        fake.failNext('cancel', () => conflictResponse({ trangThai: 'DaHuy' })),
    });
    await openCancelBox();
    api.failNext('detail', reload.override);
    fireEvent.click(confirmButton());

    expect(
      await screen.findByText('Lịch hẹn này đã được hủy.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(gets(api, DETAIL_API_PATH)).toHaveLength(2));
    // Đang tải lại: vẫn thấy bản cũ (không về "Đang tải"), hộp còn nguyên
    expect(screen.queryByText(DETAIL_TEXT.loading)).toBeNull();
    expect(chip().getByText('Đã xác nhận')).toBeInTheDocument();
    expect(screen.getByText('Lịch hẹn này đã được hủy.')).toBeInTheDocument();

    await act(async () => reload.release());
    await waitFor(() => expect(chip().getByText('Đã hủy')).toBeInTheDocument());
    expect(screen.getByText('Lịch hẹn này đã được hủy.')).toBeInTheDocument();
  });
});

describe('lỗi khi xem trước (chỉ đọc)', () => {
  it.each([
    [
      'mạng',
      () => Promise.reject(new TypeError('Failed to fetch')),
      NETWORK_ERROR_MESSAGE,
    ],
    [
      'HTML 502 (nginx)',
      () => new Response('<html>502</html>', { status: 502 }),
      GENERIC_ERROR_MESSAGE,
    ],
    ['503 HE_THONG_DANG_BAN', () => apiError(503, 'HE_THONG_DANG_BAN'), BUSY],
    [
      'maLoi lạ cùng HTTP 500',
      () => apiError(500, 'MA_LA'),
      GENERIC_ERROR_MESSAGE,
    ],
    [
      'maLoi lạ cùng HTTP 404 (không phải "không tìm thấy")',
      () => apiError(404, 'MA_LA'),
      GENERIC_ERROR_MESSAGE,
    ],
  ] as const)(
    'HHL-09 %s ⇒ đúng câu kèm `Thử lại`, `Xác nhận hủy` vô hiệu, `Giữ lịch` còn; `Thử lại` gọi lại xem trước đúng một lần rồi bật nút',
    async (_name, response, message) => {
      const { api } = renderDetailPage({
        before: (fake) => fake.failNext('preview', response),
      });
      await detailLoaded();
      fireEvent.click(cancelButton() as HTMLElement);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveFocus();
      expect(retry()).toBeInTheDocument();
      expect(confirmButton()).toBeDisabled();
      expect(keepButton()).toBeEnabled();
      expect(gets(api, PREVIEW_API_PATH)).toHaveLength(1);
      expect(posts(api)).toHaveLength(0);

      fireEvent.click(retry() as HTMLElement);
      await screen.findByText(CANCEL_TEXT.expectedRefund);
      expect(gets(api, PREVIEW_API_PATH)).toHaveLength(2);
      expect(confirmButton()).toBeEnabled();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each([
    [
      '401 CHUA_DANG_NHAP',
      () => apiError(401, 'CHUA_DANG_NHAP'),
      LIST_TEXT.sessionExpired,
    ],
    [
      '403 KHONG_DU_QUYEN',
      () => apiError(403, 'KHONG_DU_QUYEN'),
      'Bạn không có quyền hủy lịch hẹn này.',
    ],
    ['404 KHONG_TIM_THAY', () => notFoundResponse(), DETAIL_TEXT.notFound],
  ] as const)(
    'HHL-09 %s ⇒ dừng: chỉ `Đóng`, không `Thử lại`, không `Xác nhận hủy`, không tải lại chi tiết',
    async (_name, response, message) => {
      const { api } = renderDetailPage({
        before: (fake) => fake.failNext('preview', response),
      });
      await detailLoaded();
      fireEvent.click(cancelButton() as HTMLElement);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(retry()).toBeNull();
      expect(
        screen.queryByRole('button', { name: CANCEL_TEXT.confirm }),
      ).toBeNull();
      expect(closeButton()).toBeInTheDocument();
      expect(gets(api, DETAIL_API_PATH)).toHaveLength(1);

      fireEvent.click(closeButton() as HTMLElement);
      expect(cancelBox()).toBeNull();
      expect(cancelButton()).toHaveFocus();
    },
  );
});

describe('lỗi khi gửi huỷ', () => {
  it('HHL-10 404 ⇒ "Không tìm thấy lịch hẹn này.", hộp dừng, KHÔNG hiện Đã hủy, không tải lại chi tiết', async () => {
    const { api } = renderDetailPage({
      before: (fake) => fake.failNext('cancel', () => notFoundResponse()),
    });
    await openCancelBox();
    fireEvent.click(confirmButton());

    expect(await screen.findByText(DETAIL_TEXT.notFound)).toBeInTheDocument();
    expect(closeButton()).toBeInTheDocument();
    expect(chip().getByText('Đã xác nhận')).toBeInTheDocument();
    expect(gets(api, DETAIL_API_PATH)).toHaveLength(1);
  });

  it('HHL-10 503 HE_THONG_DANG_BAN ⇒ câu bận, hộp giữ nguyên, bấm `Xác nhận hủy` lại được và lần hai thành công (hoàn tác trọn nên an toàn)', async () => {
    const { api } = renderDetailPage({
      before: (fake) =>
        fake.failNext('cancel', () => apiError(503, 'HE_THONG_DANG_BAN')),
    });
    await openCancelBox();
    fireEvent.click(confirmButton());

    expect(await screen.findByText(BUSY)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(confirmButton()).toBeEnabled();
    expect(chip().getByText('Đã xác nhận')).toBeInTheDocument();
    // Vẫn thấy số dự kiến của hộp
    expect(screen.getByText(CANCEL_TEXT.expectedRefund)).toBeInTheDocument();

    fireEvent.click(confirmButton());
    await screen.findByRole('region', { name: CANCEL_TEXT.cancelled });
    expect(posts(api)).toHaveLength(2);
    expect(screen.queryByText(BUSY)).toBeNull();
    expect(chip().getByText('Đã hủy')).toBeInTheDocument();
  });

  it.each([
    ['mạng', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      'HTML 502 (nginx)',
      () => new Response('<html>502</html>', { status: 502 }),
    ],
    ['thân rỗng 200 (phản hồi lạ)', () => new Response('', { status: 200 })],
    [
      '200 nhưng trangThai không phải DaHuy',
      () =>
        jsonResponse({
          maLichHen: 'CP20261020001',
          trangThai: 'DaXacNhan',
          hoanCoc: null,
        }),
    ],
  ] as const)(
    'HHL-10 %s ⇒ "chưa rõ lịch hẹn đã được hủy hay chưa" kèm `Tải lại chi tiết`; KHÔNG hiện Đã hủy; bấm `Tải lại chi tiết` gọi lại GET và giữ hộp',
    async (_name, response) => {
      const { api } = renderDetailPage({
        before: (fake) => fake.failNext('cancel', response),
      });
      await openCancelBox();
      fireEvent.click(confirmButton());

      expect(await screen.findByText(UNSURE)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveFocus();
      expect(chip().getByText('Đã xác nhận')).toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: CANCEL_TEXT.cancelled }),
      ).toBeNull();
      expect(confirmButton()).toBeEnabled();
      expect(posts(api)).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: CANCEL_TEXT.reload }));
      await waitFor(() => expect(gets(api, DETAIL_API_PATH)).toHaveLength(2));
      await waitFor(() =>
        expect(screen.queryByText(DETAIL_TEXT.loading)).toBeNull(),
      );
      // Hộp và câu lỗi còn nguyên sau khi tải lại
      expect(screen.getByText(UNSURE)).toBeInTheDocument();
      expect(cancelBox()).toBeInTheDocument();
    },
  );

  it('HHL-10 "chưa rõ" rồi bấm lại: nếu lần trước thật ra đã huỷ thì lần hai ra 409 DaHuy và trang đúng trạng thái (không hiện số hoàn thực tế)', async () => {
    const { api } = renderDetailPage({
      before: (fake) => {
        fake.failNext('cancel', () =>
          Promise.reject(new TypeError('Failed to fetch')),
        );
        fake.failNext('cancel', () => conflictResponse({ trangThai: 'DaHuy' }));
      },
    });
    await openCancelBox();
    fireEvent.click(confirmButton());
    await screen.findByText(UNSURE);

    api.detail = makeDetail({ trangThai: 'DaHuy', choPhepHuy: false });
    fireEvent.click(confirmButton());

    expect(
      await screen.findByText('Lịch hẹn này đã được hủy.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(chip().getByText('Đã hủy')).toBeInTheDocument());
    expect(posts(api)).toHaveLength(2);
    expect(screen.queryByText(/Số tiền hoàn:/)).toBeNull();
  });

  it.each([
    ['maLoi lạ cùng HTTP 500', () => apiError(500, 'MA_LA')],
    ['LOI_HE_THONG 500', () => apiError(500, 'LOI_HE_THONG')],
    [
      'maLoi lạ cùng HTTP 409 (không phải LICH_HEN_KHONG_CHO_HUY)',
      () => apiError(409, 'MA_LA'),
    ],
  ] as const)(
    'HHL-10 %s ⇒ câu chung, hộp giữ nguyên và bấm lại được, không tải lại chi tiết',
    async (_name, response) => {
      const { api } = renderDetailPage({
        before: (fake) => fake.failNext('cancel', response),
      });
      await openCancelBox();
      fireEvent.click(confirmButton());

      expect(
        await screen.findByText(GENERIC_ERROR_MESSAGE),
      ).toBeInTheDocument();
      expect(confirmButton()).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: CANCEL_TEXT.reload }),
      ).toBeNull();
      expect(chip().getByText('Đã xác nhận')).toBeInTheDocument();
      expect(gets(api, DETAIL_API_PATH)).toHaveLength(1);
    },
  );

  it('HHL-10 401 và 403 khi gửi ⇒ dừng với câu riêng, không `Xác nhận hủy`, không Đã hủy', async () => {
    renderDetailPage({
      before: (fake) =>
        fake.failNext('cancel', () => apiError(403, 'KHONG_DU_QUYEN')),
    });
    await openCancelBox();
    fireEvent.click(confirmButton());

    expect(
      await screen.findByText('Bạn không có quyền hủy lịch hẹn này.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: CANCEL_TEXT.confirm }),
    ).toBeNull();
    expect(chip().getByText('Đã xác nhận')).toBeInTheDocument();
  });
});
