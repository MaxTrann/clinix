import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  makeDetail,
  type DetailFakeRequest,
} from '../../../testing/fake-appointment-detail-api';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import { CANCEL_TEXT, DETAIL_TEXT } from './detail-messages';

// booking F2: hộp huỷ nội tuyến (Figma `421:2`) với API giả, không gọi backend thật. Mã HHL là [đề xuất] (PLAN booking mục 7.33 sau khi duyệt); LH-03, LH-05
// (và phần W của HL-08) là tổng của các mã này. Lỗi ở `cancel-box-errors.test.tsx`. Dữ liệu giả.
afterEach(cleanUpDetailPage);

const box = () =>
  within(screen.getByRole('region', { name: CANCEL_TEXT.title }));
const doneBox = () =>
  within(screen.getByRole('region', { name: CANCEL_TEXT.cancelled }));
const summaryChip = () =>
  within(screen.getByRole('region', { name: DETAIL_TEXT.summary }));
type CallLog = { callsTo: (m: string, p: string) => DetailFakeRequest[] };
const gets = (api: CallLog, path: string) => api.callsTo('GET', path);
const posts = (api: CallLog) => api.callsTo('POST', CANCEL_API_PATH);
const PAID = { daThu: '100000.00', conPhaiThu: '200000.00' };

describe('mở hộp', () => {
  it('LCT-01 / HHL-01 bấm `Hủy lịch hẹn` ⇒ đúng MỘT GET xem trước (gắn token), hộp thay nút, chữ Figma, "Không hoàn", tiêu điểm vào `Giữ lịch`, 0 POST', async () => {
    const { api } = renderDetailPage();
    await detailLoaded();
    expect(gets(api, PREVIEW_API_PATH)).toHaveLength(0);

    fireEvent.click(cancelButton() as HTMLElement);
    await screen.findByRole('region', { name: CANCEL_TEXT.title });
    await screen.findByText(CANCEL_TEXT.expectedRefund);

    expect(gets(api, PREVIEW_API_PATH)).toHaveLength(1);
    expect(api.callsTo('GET', PREVIEW_API_PATH)[0]).toMatchObject({
      hasToken: true,
      body: null,
    });
    expect(api.writes()).toEqual([]);
    // Hộp thay cho nút (không còn nút `Hủy lịch hẹn`)
    expect(cancelButton()).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: CANCEL_TEXT.title }),
    ).toBeInTheDocument();
    expect(box().getByText(CANCEL_TEXT.warning)).toBeInTheDocument();
    expect(box().getByText(CANCEL_TEXT.estimateNote)).toBeInTheDocument();
    // Chưa có thanhToan ⇒ "Chưa có cọc"; hoanCoc null ⇒ "Không hoàn"
    expect(box().getByText(CANCEL_TEXT.noDeposit)).toBeInTheDocument();
    expect(box().getByText(CANCEL_TEXT.noRefund)).toBeInTheDocument();
    expect(keepButton()).toBeEnabled();
    expect(confirmButton()).toBeEnabled();
    expect(keepButton()).toHaveFocus();
  });

  it('HHL-01 trong lúc đang tải xem trước: có chữ đang tải, `aria-busy`, `Xác nhận hủy` vô hiệu; tải xong thì bật', async () => {
    const preview = holdResponse(() =>
      jsonResponse({ choPhepHuy: true, hoanCoc: null }),
    );
    const { api } = renderDetailPage({
      before: (fake) => fake.failNext('preview', preview.override),
    });
    await detailLoaded();
    fireEvent.click(cancelButton() as HTMLElement);

    const region = await screen.findByRole('region', {
      name: CANCEL_TEXT.title,
    });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(
      within(region).getByText(CANCEL_TEXT.loadingPreview),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    expect(keepButton()).toBeEnabled();
    expect(keepButton()).toHaveFocus();
    expect(within(region).queryByText(CANCEL_TEXT.expectedRefund)).toBeNull();

    await waitFor(() => expect(gets(api, PREVIEW_API_PATH)).toHaveLength(1));
    await act(async () => preview.release());
    await screen.findByText(CANCEL_TEXT.expectedRefund);
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(confirmButton()).toBeEnabled();
    expect(keepButton()).toHaveFocus();
  });
});

describe('số hoàn dự kiến', () => {
  it.each([
    [
      { tyLe: 100, soTien: '100000.00', mocApDung: 24 },
      '100.000đ (100%)',
      'Áp dụng khi hủy trước giờ khám từ 24 giờ',
    ],
    [
      { tyLe: 50, soTien: '50000.00', mocApDung: 2 },
      '50.000đ (50%)',
      'Áp dụng khi hủy trước giờ khám từ 2 giờ',
    ],
    [
      { tyLe: 100, soTien: '100000.00', mocApDung: null },
      '100.000đ (100%)',
      null,
    ],
    // Máy chủ trả số khác phép tính của client (33% của 100.000đ là 33.000đ): phải hiện đúng số của máy chủ
    [
      { tyLe: 33, soTien: '12345.00', mocApDung: 2 },
      '12.345đ (33%)',
      'Áp dụng khi hủy trước giờ khám từ 2 giờ',
    ],
    [{ tyLe: 0, soTien: '0.00', mocApDung: null }, 'Không hoàn', null],
    [{ tyLe: 0, soTien: '0.00', mocApDung: 2 }, 'Không hoàn', null],
    [null, 'Không hoàn', null],
  ])(
    'HHL-02 hoanCoc %j ⇒ "Hoàn dự kiến" = %s, dòng mốc = %s (client không tính lại tiền)',
    async (hoanCoc, expected, cutoff) => {
      renderDetailPage({
        before: (api) => {
          api.detail = makeDetail({ thanhToan: PAID });
          api.preview = { choPhepHuy: true, hoanCoc };
        },
      });
      await openCancelBox();

      const row = screen.getByText(CANCEL_TEXT.expectedRefund)
        .parentElement as HTMLElement;
      expect(within(row).getByText(expected)).toBeInTheDocument();
      if (cutoff === null)
        expect(box().queryByText(/Áp dụng khi hủy/)).toBeNull();
      else expect(within(row).getByText(cutoff)).toBeInTheDocument();
      expect(
        box().getByText('100.000đ', { selector: 'dd' }),
      ).toBeInTheDocument();
    },
  );

  it('HHL-02 "Cọc đã thanh toán": thanhToan.daThu khác 0 ⇒ số tiền; thanhToan null hay daThu = 0 ⇒ "Chưa có cọc"', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({
          thanhToan: { daThu: '0.00', conPhaiThu: '300000.00' },
        });
      },
    });
    await openCancelBox();
    expect(box().getByText(CANCEL_TEXT.noDeposit)).toBeInTheDocument();
  });

  it('HHL-02 cọc đã thu lớn hơn 2^53 ⇒ giữ đủ chữ số trong hộp', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({
          thanhToan: { daThu: '9007199254740993.00', conPhaiThu: '0.00' },
        });
        api.preview = {
          choPhepHuy: true,
          hoanCoc: { tyLe: 100, soTien: '9007199254740993.00', mocApDung: 24 },
        };
      },
    });
    await openCancelBox();
    expect(
      box().getAllByText('9.007.199.254.740.993đ', { exact: false }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      box().getByText('9.007.199.254.740.993đ (100%)'),
    ).toBeInTheDocument();
  });
});

describe('Giữ lịch, Esc: đóng mà không gọi API', () => {
  it('LH-05 / HHL-03 `Giữ lịch` ⇒ hộp đóng, nút `Hủy lịch hẹn` về và nhận tiêu điểm, KHÔNG thêm lời gọi nào sau lần xem trước; mở lại ⇒ GET xem trước mới', async () => {
    const { api } = renderDetailPage();
    await openCancelBox();
    const before = api.requests.length;
    expect(before).toBe(2); // chi tiết + xem trước

    fireEvent.click(keepButton());
    expect(cancelBox()).toBeNull();
    expect(cancelButton()).toBeInTheDocument();
    expect(cancelButton()).toHaveFocus();
    await act(async () => undefined);
    expect(api.requests).toHaveLength(before);
    expect(api.writes()).toEqual([]);

    fireEvent.click(cancelButton() as HTMLElement);
    await screen.findByText(CANCEL_TEXT.expectedRefund);
    expect(gets(api, PREVIEW_API_PATH)).toHaveLength(2);
    expect(posts(api)).toHaveLength(0);
  });

  it('HHL-03 Esc ⇒ như `Giữ lịch` (đóng, trả tiêu điểm, 0 lời gọi thêm); phím khác không đóng', async () => {
    const { api } = renderDetailPage();
    await openCancelBox();
    const before = api.requests.length;

    fireEvent.keyDown(keepButton(), { key: 'Enter' });
    fireEvent.keyDown(keepButton(), { key: 'a' });
    expect(cancelBox()).toBeInTheDocument();

    fireEvent.keyDown(keepButton(), { key: 'Escape' });
    expect(cancelBox()).toBeNull();
    expect(cancelButton()).toHaveFocus();
    await act(async () => undefined);
    expect(api.requests).toHaveLength(before);
  });

  it('HHL-03 đóng khi xem trước còn đang tải ⇒ hộp đóng, kết quả về muộn không mở lại hộp, 0 POST', async () => {
    const preview = holdResponse(() =>
      jsonResponse({ choPhepHuy: true, hoanCoc: null }),
    );
    const { api } = renderDetailPage({
      before: (fake) => fake.failNext('preview', preview.override),
    });
    await detailLoaded();
    fireEvent.click(cancelButton() as HTMLElement);
    await screen.findByRole('region', { name: CANCEL_TEXT.title });
    await waitFor(() => expect(gets(api, PREVIEW_API_PATH)).toHaveLength(1));

    fireEvent.click(keepButton());
    expect(cancelBox()).toBeNull();
    await act(async () => preview.release());
    await act(async () => undefined);

    expect(cancelBox()).toBeNull();
    expect(cancelButton()).toBeInTheDocument();
    expect(posts(api)).toHaveLength(0);
  });
});

describe('Xác nhận hủy', () => {
  it('LH-03 / HHL-04 ⇒ đúng MỘT POST (thân {}, không lyDo, gắn token), hiện số THỰC TẾ, chi tiết thành Đã hủy tại chỗ (không GET lại), hết nút huỷ', async () => {
    const { api } = renderDetailPage({
      before: (fake) => {
        fake.detail = makeDetail({ thanhToan: PAID });
        fake.preview = {
          choPhepHuy: true,
          hoanCoc: { tyLe: 50, soTien: '50000.00', mocApDung: 2 },
        };
        fake.cancelResult = {
          maLichHen: 'CP20261020001',
          trangThai: 'DaHuy',
          hoanCoc: { tyLe: 50, soTien: '50000.00' },
        };
      },
    });
    await openCancelBox();
    expect(summaryChip().getByText('Đã xác nhận')).toBeInTheDocument();

    fireEvent.click(confirmButton());
    await screen.findByRole('region', { name: CANCEL_TEXT.cancelled });

    expect(posts(api)).toHaveLength(1);
    expect(posts(api)[0]).toMatchObject({
      method: 'POST',
      hasToken: true,
      body: '{}',
    });
    expect(gets(api, DETAIL_API_PATH)).toHaveLength(1);
    expect(
      doneBox().getByText('Số tiền hoàn: 50.000đ (50%)'),
    ).toBeInTheDocument();
    expect(doneBox().queryByText(CANCEL_TEXT.differs)).toBeNull();
    // Chi tiết đổi tại chỗ: chip, mốc trạng thái, "Thu tại quầy: Không thu", hết nút
    expect(summaryChip().getByText('Đã hủy')).toBeInTheDocument();
    expect(summaryChip().queryByText('Đã xác nhận')).toBeNull();
    expect(
      screen
        .getAllByRole('listitem')
        .filter((item) => item.textContent?.includes('Đã hủy')),
    ).toHaveLength(1);
    expect(screen.getByText('Không thu')).toBeInTheDocument();
    expect(cancelButton()).toBeNull();
    expect(
      screen.queryByRole('button', { name: CANCEL_TEXT.confirm }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: CANCEL_TEXT.keep })).toBeNull();
  });

  it('HHL-04 không có khoản hoàn (cọc 0đ): hoanCoc null ⇒ "Không có khoản hoàn."', async () => {
    const { api } = renderDetailPage();
    await openCancelBox();
    fireEvent.click(confirmButton());
    await screen.findByRole('region', { name: CANCEL_TEXT.cancelled });

    expect(doneBox().getByText(CANCEL_TEXT.noRefundPaid)).toBeInTheDocument();
    expect(doneBox().queryByText(CANCEL_TEXT.differs)).toBeNull();
    expect(posts(api)).toHaveLength(1);
  });

  it.each([
    [
      '100% rồi 50% (qua mốc giữa lúc xem và lúc xác nhận)',
      { tyLe: 100, soTien: '100000.00', mocApDung: 24 },
      { tyLe: 50, soTien: '50000.00' },
      'Số tiền hoàn: 50.000đ (50%)',
      true,
    ],
    [
      '50% rồi không hoàn',
      { tyLe: 50, soTien: '50000.00', mocApDung: 2 },
      null,
      CANCEL_TEXT.noRefundPaid,
      true,
    ],
    [
      'không hoàn rồi có hoàn',
      null,
      { tyLe: 100, soTien: '100000.00' },
      'Số tiền hoàn: 100.000đ (100%)',
      true,
    ],
    [
      'cùng 50%, cùng số tiền',
      { tyLe: 50, soTien: '50000.00', mocApDung: 2 },
      { tyLe: 50, soTien: '50000.00' },
      'Số tiền hoàn: 50.000đ (50%)',
      false,
    ],
    [
      'cùng tyLe, tiền khác một xu',
      { tyLe: 50, soTien: '50000.00', mocApDung: 2 },
      { tyLe: 50, soTien: '50000.01' },
      'Số tiền hoàn: 50.000đ (50%)',
      true,
    ],
    [
      'cùng "không hoàn" (null và 0%)',
      null,
      { tyLe: 0, soTien: '0.00' },
      CANCEL_TEXT.noRefundPaid,
      false,
    ],
  ])(
    'HHL-05 xem trước %s ⇒ kết quả hiện số THỰC TẾ; câu "khác số dự kiến" chỉ khi hai số khác nhau',
    async (_name, expected, actual, line, differs) => {
      renderDetailPage({
        before: (api) => {
          api.preview = { choPhepHuy: true, hoanCoc: expected };
          api.cancelResult = {
            maLichHen: 'CP20261020001',
            trangThai: 'DaHuy',
            hoanCoc: actual,
          };
        },
      });
      await openCancelBox();
      fireEvent.click(confirmButton());
      await screen.findByRole('region', { name: CANCEL_TEXT.cancelled });

      expect(doneBox().getByText(line)).toBeInTheDocument();
      if (differs)
        expect(doneBox().getByText(CANCEL_TEXT.differs)).toBeInTheDocument();
      else expect(doneBox().queryByText(CANCEL_TEXT.differs)).toBeNull();
    },
  );
});

describe('chống bấm đúp, không đóng khi đang gửi', () => {
  it('HL-06 / HHL-06 ba lần bấm `Xác nhận hủy` trong MỘT act ⇒ đúng một POST; đang gửi: nút vô hiệu và đổi chữ, `Giữ lịch` vô hiệu, Esc không đóng, `aria-busy`', async () => {
    const cancel = holdResponse(() =>
      jsonResponse({
        maLichHen: 'CP20261020001',
        trangThai: 'DaHuy',
        hoanCoc: null,
      }),
    );
    const { api } = renderDetailPage({
      before: (fake) => fake.failNext('cancel', cancel.override),
    });
    await openCancelBox();
    const confirm = confirmButton();

    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });

    expect(posts(api)).toHaveLength(1);
    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveTextContent(CANCEL_TEXT.confirming);
    expect(keepButton()).toBeDisabled();
    expect(
      screen.getByRole('region', { name: CANCEL_TEXT.title }),
    ).toHaveAttribute('aria-busy', 'true');

    // Không đóng được khi đang gửi: Esc bấm trên chính nút đang vô hiệu và trên vùng hộp
    fireEvent.keyDown(confirmButton(), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('region', { name: CANCEL_TEXT.title }), {
      key: 'Escape',
    });
    expect(cancelBox()).toBeInTheDocument();
    expect(posts(api)).toHaveLength(1);

    await act(async () => cancel.release());
    await screen.findByRole('region', { name: CANCEL_TEXT.cancelled });
    expect(posts(api)).toHaveLength(1);
  });

  it('HL-06 / HHL-06 sau khi đã huỷ xong, bấm lại không có nút nào để gửi lần hai: tổng cộng vẫn một POST', async () => {
    const { api } = renderDetailPage();
    await openCancelBox();
    fireEvent.click(confirmButton());
    await screen.findByRole('region', { name: CANCEL_TEXT.cancelled });

    expect(
      screen.queryByRole('button', { name: CANCEL_TEXT.confirm }),
    ).toBeNull();
    expect(cancelButton()).toBeNull();
    expect(posts(api)).toHaveLength(1);
  });
});

describe('xem trước nói không huỷ được', () => {
  it('HHL-07 choPhepHuy = false ⇒ chữ theo lyDoKhongHuy, KHÔNG có `Xác nhận hủy`, có `Đóng`, chi tiết được tải lại; `Đóng` trả tiêu điểm về tiêu đề trang khi nút huỷ không còn', async () => {
    const { api } = renderDetailPage({
      before: (fake) => {
        fake.preview = {
          choPhepHuy: false,
          lyDoKhongHuy: 'LICH_HEN_KHONG_CHO_HUY',
          hoanCoc: null,
        };
      },
    });
    await detailLoaded();
    // Lịch đã đổi sang `DaTiepDon` ở nơi khác trước khi mở hộp: lần tải lại sẽ thấy trạng thái mới
    api.detail = makeDetail({ trangThai: 'DaTiepDon', choPhepHuy: false });
    fireEvent.click(cancelButton() as HTMLElement);

    expect(
      await screen.findByText('Lịch hẹn này hiện không thể hủy.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: CANCEL_TEXT.confirm }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: CANCEL_TEXT.keep })).toBeNull();
    expect(screen.getByRole('alert')).toHaveFocus();
    // Chi tiết được tải lại và hiện trạng thái mới
    await waitFor(() => expect(gets(api, DETAIL_API_PATH)).toHaveLength(2));
    await waitFor(() =>
      expect(summaryChip().getByText('Đã tiếp đón')).toBeInTheDocument(),
    );
    expect(posts(api)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: CANCEL_TEXT.close }));
    expect(cancelBox()).toBeNull();
    expect(cancelButton()).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: DETAIL_TEXT.title }),
    ).toHaveFocus();
    expect(posts(api)).toHaveLength(0);
  });

  it('HHL-07 lyDoKhongHuy vắng hay lạ ⇒ vẫn chặn, cùng một câu chung', async () => {
    renderDetailPage({
      before: (api) => {
        api.preview = { choPhepHuy: false, lyDoKhongHuy: 'MA_LA' };
      },
    });
    await detailLoaded();
    fireEvent.click(cancelButton() as HTMLElement);

    expect(
      await screen.findByText('Lịch hẹn này hiện không thể hủy.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: CANCEL_TEXT.confirm }),
    ).toBeNull();
    expect(document.body.textContent).not.toContain('MA_LA');
  });
});

describe('trợ năng (Figma nội tuyến: tiêu điểm quản lý bằng tay)', () => {
  it('HHL-11 vùng có tên, thứ tự Tab `Giữ lịch` rồi `Xác nhận hủy`, vùng đọc `aria-live` có mặt, không có hộp thoại modal', async () => {
    renderDetailPage();
    await openCancelBox();

    const region = screen.getByRole('region', { name: CANCEL_TEXT.title });
    expect(
      within(region)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([CANCEL_TEXT.keep, CANCEL_TEXT.confirm]);
    expect(region.querySelector('[aria-live="polite"]')).not.toBeNull();
    // Nội tuyến, không phải modal: không `dialog`, không `aria-modal`, nền không bị `inert`
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('[aria-modal]')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(region).toHaveAttribute('aria-busy', 'false');
  });

  it('HHL-11 mở ⇒ tiêu điểm vào `Giữ lịch`; đóng bằng `Giữ lịch` hay Esc ⇒ về nút mở (hai lần liền nhau, mỗi lần mở lại tiêu điểm lại vào `Giữ lịch`)', async () => {
    renderDetailPage();
    await openCancelBox();
    expect(keepButton()).toHaveFocus();

    fireEvent.click(keepButton());
    expect(cancelButton()).toHaveFocus();

    fireEvent.click(cancelButton() as HTMLElement);
    await screen.findByText(CANCEL_TEXT.expectedRefund);
    expect(keepButton()).toHaveFocus();

    fireEvent.keyDown(keepButton(), { key: 'Escape' });
    expect(cancelButton()).toHaveFocus();
  });

  it('HHL-11 huỷ xong ⇒ tiêu điểm vào vùng kết quả (nút vừa bấm đã biến mất), kết quả nằm trong vùng `aria-live`', async () => {
    renderDetailPage({
      before: (api) => {
        api.cancelResult = {
          maLichHen: 'CP20261020001',
          trangThai: 'DaHuy',
          hoanCoc: { tyLe: 100, soTien: '100000.00' },
        };
      },
    });
    await openCancelBox();
    fireEvent.click(confirmButton());
    const region = await screen.findByRole('region', {
      name: CANCEL_TEXT.cancelled,
    });

    const live = region.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toContainElement(
      screen.getByText('Số tiền hoàn: 100.000đ (100%)'),
    );
    expect(document.activeElement).toBe(live.firstElementChild);
    expect(live.firstElementChild).toHaveTextContent(
      'Số tiền hoàn: 100.000đ (100%)',
    );
    expect(region).toHaveAttribute('aria-busy', 'false');
  });
});

describe('Bệnh nhân không nhập lý do, bộ nhớ', () => {
  it('Q27 / HHL-12 không có ô nhập nào trong hộp; thân POST chỉ là {}; không ghi localStorage, sessionStorage, cookie, console suốt luồng mở rồi xác nhận', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    // Kiểm theo TRẠNG THÁI THẬT của kho, không chỉ theo `spy`: ở môi trường test này `vi.spyOn(Storage.prototype, 'setItem')` chỉ thấy lần gọi ĐẦU TIÊN
    // (sau `mockRestore()` một spy mới bị mù dù `localStorage.length` đã tăng; đo 12/11/2026 khi đột biến M10 sống sót), nên `length` mới là chốt chặn đáng tin.
    localStorage.clear();
    sessionStorage.clear();
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) => vi.spyOn(console, method));
    const cookies = document.cookie;
    const { api } = renderDetailPage();
    await openCancelBox();

    expect(box().queryAllByRole('textbox')).toEqual([]);
    expect(
      screen
        .getByRole('region', { name: CANCEL_TEXT.title })
        .querySelector('input, textarea, select'),
    ).toBeNull();
    expect(box().queryByLabelText(/lý do/i)).toBeNull();

    fireEvent.click(confirmButton());
    await screen.findByRole('region', { name: CANCEL_TEXT.cancelled });

    expect(posts(api)[0]).toMatchObject({ body: '{}' });
    expect(posts(api)[0]?.body).not.toContain('lyDo');
    expect(storageWrite).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookies);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    storageWrite.mockRestore();
    for (const spy of consoleSpies) spy.mockRestore();
  });
});
