import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdResponse } from '../../../testing/appointment-detail-harness';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../../testing/fake-appointment-list-api';
import { makeReceptionDetail } from '../../../testing/fake-reception-api';
import {
  cleanUpReceptionPage,
  currentUrl,
  listQueries,
  openReceptionDetail,
  RECEPTION_CODE,
} from '../../../testing/reception-harness';
import type { ReceptionAppointmentDetail } from '../api/reception-appointment-types';
import { ACTION_TEXT, DETAIL_TEXT } from './detail-messages';
import { ReceptionActions } from './reception-actions';

// booking F9: ba thao tác ghi của Lễ tân trong ngăn chi tiết (hộp `Hủy lịch hẹn`, hộp `Đánh dấu vắng mặt`, lời gọi `Tiếp đón`). Mã LTA là [đề xuất] (PLAN booking mục 7.36). LTN-02 = LTA-04, 05,
// 06; LTN-03 = LTA-07; LTN-04 = LTA-08 (kèm LTE-01, LTE-02 ở `status-failure.test.ts`). API giả; chữ hộp lấy từ Figma `490:2`, `489:2` đã tự đọc ngày 13/11/2026.
afterEach(cleanUpReceptionPage);

const DETAIL_PATH = `/reception/appointments/${RECEPTION_CODE}`;
const ALL_TARGETS: Partial<ReceptionAppointmentDetail> = {
  chuyenDuoc: ['DaHuy', 'DaTiepDon', 'VangMat'],
  conPhaiThu: '0.00',
};

type Fake = Parameters<
  NonNullable<Parameters<typeof openReceptionDetail>[1]>
>[0];

const inDrawer = (drawer: HTMLElement, name: string) =>
  within(drawer).getByRole('button', { name });
const reasonField = (box: HTMLElement) =>
  within(box).getByRole('textbox', { name: ACTION_TEXT.cancel.reasonLabel });
const confirmCancel = (box: HTMLElement) =>
  within(box).getByRole('button', { name: ACTION_TEXT.cancel.confirm });
const gone = (name: string) =>
  waitFor(() => expect(screen.queryByRole('dialog', { name })).toBeNull());
const statusRegion = (text: string) =>
  screen.getByText(text).closest('[role="status"]') as HTMLElement;

// Mở hộp huỷ từ nút `Hủy lịch` của ngăn
async function openCancel(
  detail: Partial<ReceptionAppointmentDetail> = {},
  before?: (api: Fake) => void,
) {
  const view = await openReceptionDetail({ ...ALL_TARGETS, ...detail }, before);
  fireEvent.click(inDrawer(view.drawer, 'Hủy lịch'));
  const box = await screen.findByRole('dialog', {
    name: ACTION_TEXT.cancel.title,
  });
  return { ...view, box };
}

// Mở hộp vắng mặt từ nút `Vắng mặt` của ngăn
async function openNoShow(
  detail: Partial<ReceptionAppointmentDetail> = {},
  before?: (api: Fake) => void,
) {
  const view = await openReceptionDetail({ ...ALL_TARGETS, ...detail }, before);
  fireEvent.click(inDrawer(view.drawer, 'Vắng mặt'));
  const box = await screen.findByRole('dialog', {
    name: ACTION_TEXT.noShow.title,
  });
  return { ...view, box };
}

describe('hộp "Hủy lịch hẹn" (Figma 490:2)', () => {
  it('LTA-04 bám Figma: tiêu đề, `Lý do hủy` bắt buộc, ô nhiều dòng trống, `Đóng`, `Xác nhận hủy`; KHÔNG có bộ đếm, hoàn dự kiến hay câu cảnh báo; tiêu điểm vào ô lý do', async () => {
    const { box } = await openCancel();
    expect(
      within(box).getByRole('heading', { name: ACTION_TEXT.cancel.title }),
    ).toBeInTheDocument();
    const field = reasonField(box);
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveValue('');
    expect(field).toBeRequired();
    expect(field).not.toHaveAttribute('maxlength');
    // Dấu `*` chỉ để nhìn, không nằm trong tên truy cập của ô
    expect(within(box).getByText('*')).toHaveAttribute('aria-hidden', 'true');
    expect(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    ).toBeEnabled();
    expect(confirmCancel(box)).toBeEnabled();
    expect(box.textContent).not.toMatch(/dự kiến|\/\s*255|\d+\s*\/\s*\d+/i);
    expect(field).toHaveFocus();
  });

  it.each([
    ['rỗng', ''],
    ['chỉ khoảng trắng', '    '],
    ['chỉ xuống dòng và tab', '\n\t\n'],
    ['chỉ khoảng không ngắt', '  '],
  ])(
    'LTA-05 (LTN-02) lý do %s ⇒ CHẶN: 0 POST, lời báo dưới ô, ô được báo lỗi và nhận tiêu điểm',
    async (_name, value) => {
      const { box, api } = await openCancel();
      const field = reasonField(box);
      fireEvent.change(field, { target: { value } });
      fireEvent.click(confirmCancel(box));

      expect(api.writes()).toEqual([]);
      expect(
        await within(box).findByText(ACTION_TEXT.cancel.reasonRequired),
      ).toBeInTheDocument();
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveFocus();
      // Hộp vẫn mở, nút vẫn bật (không vô hiệu mà không giải thích)
      expect(confirmCancel(box)).toBeEnabled();
    },
  );

  it.each([
    ['256 ký tự', 'a'.repeat(256)],
    ['128 biểu tượng (256 đơn vị UTF-16)', '😀'.repeat(128)],
  ])(
    'LTA-05 (LTN-02) lý do %s ⇒ CHẶN với câu "tối đa 255 ký tự", 0 POST',
    async (_name, value) => {
      const { box, api } = await openCancel();
      fireEvent.change(reasonField(box), { target: { value } });
      fireEvent.click(confirmCancel(box));
      expect(api.writes()).toEqual([]);
      expect(
        await within(box).findByText(ACTION_TEXT.cancel.reasonTooLong),
      ).toBeInTheDocument();
    },
  );

  it('LTA-05 sửa ô thì lời báo biến mất; sau khi sửa hợp lệ thì gửi được', async () => {
    const { box, api } = await openCancel();
    fireEvent.click(confirmCancel(box));
    await within(box).findByText(ACTION_TEXT.cancel.reasonRequired);
    fireEvent.change(reasonField(box), { target: { value: 'Bận' } });
    expect(
      within(box).queryByText(ACTION_TEXT.cancel.reasonRequired),
    ).toBeNull();
    fireEvent.click(confirmCancel(box));
    await gone(ACTION_TEXT.cancel.title);
    expect(api.statusBodies()).toEqual([{ trangThai: 'DaHuy', lyDo: 'Bận' }]);
  });

  it.each([
    ['  a  ', 'a'],
    ['a'.repeat(255), 'a'.repeat(255)],
    ['😀'.repeat(127) + 'a', '😀'.repeat(127) + 'a'],
    ['\n  Bệnh nhân báo bận \t', 'Bệnh nhân báo bận'],
  ])(
    'LTA-05 (LTN-02) lý do hợp lệ ⇒ gửi đúng thân `{ trangThai: "DaHuy", lyDo }` với lý do ĐÃ CẮT khoảng trắng (%#)',
    async (value, sent) => {
      const { box, api } = await openCancel();
      fireEvent.change(reasonField(box), { target: { value } });
      fireEvent.click(confirmCancel(box));
      await gone(ACTION_TEXT.cancel.title);
      expect(api.statusBodies()).toEqual([{ trangThai: 'DaHuy', lyDo: sent }]);
      expect(api.writes()[0]).toMatchObject({
        method: 'POST',
        path: `${DETAIL_PATH}/status`,
        hasToken: true,
      });
    },
  );

  it('LTA-06 huỷ thành công: hộp đóng, ngăn báo "Đã hủy lịch hẹn." kèm số hoàn THỰC TẾ, tiêu điểm vào vùng báo, chi tiết và danh sách được tải lại, không có chữ "dự kiến"', async () => {
    const { box, api, drawer } = await openCancel();
    fireEvent.change(reasonField(box), {
      target: { value: 'Bệnh nhân báo bận' },
    });
    fireEvent.click(confirmCancel(box));

    await screen.findByText(ACTION_TEXT.cancel.done);
    await gone(ACTION_TEXT.cancel.title);
    const region = statusRegion(ACTION_TEXT.cancel.done);
    expect(
      within(region).getByText('Số tiền hoàn: 100.000đ (100%)'),
    ).toBeInTheDocument();
    await waitFor(() => expect(region).toHaveFocus());
    expect(document.body.textContent).not.toMatch(/dự kiến/i);

    // Tải lại: GET chi tiết lần hai và GET danh sách lần hai
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    await waitFor(() => expect(listQueries(api)).toHaveLength(2));
    // Chi tiết mới (đã huỷ) không còn nút nào
    await within(drawer).findByText('Đã hủy');
    expect(
      within(drawer).queryByRole('group', { name: DETAIL_TEXT.actionsGroup }),
    ).toBeNull();
    // Vẫn chỉ MỘT POST
    expect(api.writes()).toHaveLength(1);
  });

  it('LTA-06 `hoanCoc` là `null` ⇒ "Không có khoản hoàn."; số lớn hơn 2^53 hiện đủ chữ số từ CHUỖI (LTA-17), không qua Number', async () => {
    const none = await openCancel({}, (api) => {
      api.cancelRefund = null;
    });
    fireEvent.change(reasonField(none.box), { target: { value: 'Bận' } });
    fireEvent.click(confirmCancel(none.box));
    expect(await screen.findByText('Không có khoản hoàn.')).toBeInTheDocument();
    none.unmount();
    cleanUpReceptionPage();

    const big = await openCancel({}, (api) => {
      api.cancelRefund = { tyLe: 100, soTien: '9007199254740993.00' };
    });
    fireEvent.change(reasonField(big.box), { target: { value: 'Bận' } });
    fireEvent.click(confirmCancel(big.box));
    expect(
      await screen.findByText('Số tiền hoàn: 9.007.199.254.740.993đ (100%)'),
    ).toBeInTheDocument();
  });

  it('LTA-04 `Đóng` đóng hộp KHÔNG gọi API và trả tiêu điểm về ĐÚNG nút `Hủy lịch` đã mở; lý do đã gõ không được giữ lại khi mở lại', async () => {
    const { box, drawer, api } = await openCancel();
    fireEvent.change(reasonField(box), { target: { value: 'Chưa gửi' } });
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    );
    await gone(ACTION_TEXT.cancel.title);
    expect(api.writes()).toEqual([]);
    await waitFor(() => expect(inDrawer(drawer, 'Hủy lịch')).toHaveFocus());

    fireEvent.click(inDrawer(drawer, 'Hủy lịch'));
    const again = await screen.findByRole('dialog', {
      name: ACTION_TEXT.cancel.title,
    });
    expect(reasonField(again)).toHaveValue('');
  });
});

describe('hộp "Đánh dấu vắng mặt" (Figma 489:2)', () => {
  it('LTA-07 (LTN-03) chữ đúng Figma: tên người khám in đậm, "sẽ được ghi nhận vắng mặt. Thao tác này không thể hoàn tác.", `Hủy` và `Xác nhận`; KHÔNG có ô lý do; tiêu điểm vào `Hủy`', async () => {
    const { box } = await openNoShow();
    const line = within(box).getByText(/sẽ được ghi nhận vắng mặt/);
    expect(line.textContent).toBe(
      'Bệnh nhân Nguyễn Văn A sẽ được ghi nhận vắng mặt. Thao tác này không thể hoàn tác.',
    );
    expect(within(line).getByText('Nguyễn Văn A')).toHaveClass('font-semibold');
    expect(within(box).queryByRole('textbox')).toBeNull();
    expect(
      within(box).getByRole('button', { name: ACTION_TEXT.noShow.keep }),
    ).toHaveFocus();
    expect(
      within(box).getByRole('button', { name: ACTION_TEXT.noShow.confirm }),
    ).toBeEnabled();
  });

  it('LTA-07 (LTN-03) `Xác nhận` ⇒ gọi đúng `{ trangThai: "VangMat" }` KHÔNG `lyDo`; hộp đóng, báo "Đã ghi nhận vắng mặt.", tải lại chi tiết và danh sách', async () => {
    const { box, api } = await openNoShow();
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.noShow.confirm }),
    );
    await screen.findByText(ACTION_TEXT.noShow.done);
    await gone(ACTION_TEXT.noShow.title);

    const [body] = api.statusBodies();
    expect(body).toEqual({ trangThai: 'VangMat' });
    expect(Object.keys(body as object)).toEqual(['trangThai']);
    expect(api.writes()).toHaveLength(1);
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    await waitFor(() => expect(listQueries(api)).toHaveLength(2));
    const region = statusRegion(ACTION_TEXT.noShow.done);
    await waitFor(() => expect(region).toHaveFocus());
  });

  it('LTA-07 (LTN-03) `Hủy` đóng hộp KHÔNG gọi API và trả tiêu điểm về nút `Vắng mặt`; không hiện số no-show hay cờ khoá ở đâu cả', async () => {
    const { box, drawer, api } = await openNoShow();
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.noShow.keep }),
    );
    await gone(ACTION_TEXT.noShow.title);
    expect(api.writes()).toEqual([]);
    await waitFor(() => expect(inDrawer(drawer, 'Vắng mặt')).toHaveFocus());
    expect(document.body.textContent).not.toMatch(
      /no-show|khoá đặt lịch|số lần/i,
    );
  });

  it('LTA-07 `CHUA_QUA_GIO_HEN` ⇒ câu của PLAN 5.14 trong hộp, chỉ còn `Đóng`; chi tiết được tải lại', async () => {
    const { box, api } = await openNoShow({}, (fake) =>
      fake.failNext('status', () => apiErrorResponse(409, 'CHUA_QUA_GIO_HEN')),
    );
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.noShow.confirm }),
    );
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      ACTION_TEXT.windowNotOver,
    );
    expect(
      within(box).queryByRole('button', { name: ACTION_TEXT.noShow.confirm }),
    ).toBeNull();
    expect(
      within(box).getByRole('button', { name: ACTION_TEXT.close }),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
  });
});

describe('lời gọi "Tiếp đón bệnh nhân" (LTN-04)', () => {
  const checkInButton = (drawer: HTMLElement) =>
    inDrawer(drawer, 'Tiếp đón bệnh nhân');

  it('LTA-08 bấm gọi THẲNG `{ trangThai: "DaTiepDon" }` (không hộp xác nhận, không `lyDo`); báo "Đã tiếp đón bệnh nhân.", tải lại chi tiết và danh sách, tiêu điểm vào vùng báo', async () => {
    const { drawer, api } = await openReceptionDetail(ALL_TARGETS);
    fireEvent.click(checkInButton(drawer));
    // Không có hộp nào mở: chỉ còn hộp thoại của ngăn
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    await screen.findByText(ACTION_TEXT.checkIn.done);
    expect(api.statusBodies()).toEqual([{ trangThai: 'DaTiepDon' }]);
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    await waitFor(() => expect(listQueries(api)).toHaveLength(2));
    await waitFor(() =>
      expect(statusRegion(ACTION_TEXT.checkIn.done)).toHaveFocus(),
    );
    // Đã tiếp đón: Lễ tân không còn thao tác nào (Q21)
    await within(drawer).findByText('Đã tiếp đón');
    expect(
      within(drawer).queryByRole('group', { name: DETAIL_TEXT.actionsGroup }),
    ).toBeNull();
  });

  it('LTA-08 (LTN-04) `CON_PHAN_CHUA_THANH_TOAN` ⇒ câu có SỐ TIỀN từ chuỗi (không `Number`) và KHÔNG hứa thu tiền; nút theo `chuyenDuoc[]` mới sau khi tải lại', async () => {
    const { drawer, api } = await openReceptionDetail(ALL_TARGETS, (fake) =>
      fake.failNext('status', () =>
        apiErrorResponse(409, 'CON_PHAN_CHUA_THANH_TOAN', undefined, {
          conPhaiThu: '9007199254740993.00',
        }),
      ),
    );
    // Lần tải lại sau lỗi: lịch còn nợ nên mảng không còn `DaTiepDon`
    api.failNext('detail', () =>
      jsonResponse(
        makeReceptionDetail({
          chuyenDuoc: ['DaHuy'],
          conPhaiThu: '9007199254740993.00',
        }),
      ),
    );
    fireEvent.click(checkInButton(drawer));

    const alert = await within(drawer).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Lịch hẹn còn 9.007.199.254.740.993đ chưa thanh toán nên chưa thể tiếp đón.',
    );
    expect(alert.textContent).not.toMatch(/thu tiền|quầy/i);
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    await waitFor(() =>
      expect(
        within(drawer).queryByRole('button', { name: 'Tiếp đón bệnh nhân' }),
      ).toBeNull(),
    );
    // `Thu tiền & tiếp đón` thuộc `payment`: vẫn vô hiệu (LTN-05)
    expect(
      within(drawer).getByRole('button', { name: /Thu tiền & tiếp đón/ }),
    ).toBeDisabled();
  });

  it('LTA-08 (LTN-04) `NGOAI_KHUNG_GIO_TIEP_DON` ⇒ hai mốc ISO UTC hiện theo GIỜ VIỆT NAM, hai biên đóng', async () => {
    const { drawer } = await openReceptionDetail(ALL_TARGETS, (fake) =>
      fake.failNext('status', () =>
        apiErrorResponse(409, 'NGOAI_KHUNG_GIO_TIEP_DON', undefined, {
          tu: '2026-10-18T00:30:00.000Z',
          den: '2026-10-18T01:30:00.000Z',
        }),
      ),
    );
    fireEvent.click(checkInButton(drawer));
    expect(await within(drawer).findByRole('alert')).toHaveTextContent(
      'Chỉ tiếp đón từ 07:30 đến 08:30 ngày 18/10/2026.',
    );
  });

  it('LTA-08 `HE_THONG_CHUA_CAU_HINH` và lỗi lạ ⇒ câu đúng `maLoi`; `maLoi` lạ cùng HTTP 409 ⇒ câu chung, nút vẫn bấm lại được', async () => {
    const { drawer } = await openReceptionDetail(ALL_TARGETS, (fake) => {
      fake.failNext('status', () =>
        apiErrorResponse(409, 'HE_THONG_CHUA_CAU_HINH'),
      );
      fake.failNext('status', () => apiErrorResponse(409, 'MA_LA_CHUA_BIET'));
    });
    fireEvent.click(checkInButton(drawer));
    expect(await within(drawer).findByRole('alert')).toHaveTextContent(
      ACTION_TEXT.notConfigured,
    );
    await waitFor(() => expect(checkInButton(drawer)).toBeEnabled());
    fireEvent.click(checkInButton(drawer));
    await waitFor(() =>
      expect(within(drawer).getByRole('alert')).toHaveTextContent(
        'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      ),
    );
  });
});

describe('chống bấm đúp, không đóng khi đang gửi', () => {
  const holdStatus = () =>
    holdResponse(() =>
      jsonResponse({ maLichHen: RECEPTION_CODE, trangThai: 'DaTiepDon' }),
    );

  it('LTA-09 ba lần bấm trong MỘT act ⇒ đúng MỘT POST, cho cả `Xác nhận hủy`, `Xác nhận` (vắng mặt) và `Tiếp đón bệnh nhân`', async () => {
    // Hủy lịch
    const cancel = holdResponse(() =>
      jsonResponse({
        maLichHen: RECEPTION_CODE,
        trangThai: 'DaHuy',
        hoanCoc: null,
      }),
    );
    const c = await openCancel({}, (api) =>
      api.failNext('status', cancel.override),
    );
    fireEvent.change(reasonField(c.box), { target: { value: 'Bận' } });
    const confirm = confirmCancel(c.box);
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(c.api.writes()).toHaveLength(1);
    await act(async () => cancel.release());
    await screen.findByText(ACTION_TEXT.cancel.done);
    expect(c.api.writes()).toHaveLength(1);
    c.unmount();
    cleanUpReceptionPage();

    // Vắng mặt
    const noShow = holdResponse(() =>
      jsonResponse({ maLichHen: RECEPTION_CODE, trangThai: 'VangMat' }),
    );
    const n = await openNoShow({}, (api) =>
      api.failNext('status', noShow.override),
    );
    const accept = within(n.box).getByRole('button', {
      name: ACTION_TEXT.noShow.confirm,
    });
    act(() => {
      fireEvent.click(accept);
      fireEvent.click(accept);
      fireEvent.click(accept);
    });
    expect(n.api.writes()).toHaveLength(1);
    await act(async () => noShow.release());
    await screen.findByText(ACTION_TEXT.noShow.done);
    expect(n.api.writes()).toHaveLength(1);
    n.unmount();
    cleanUpReceptionPage();

    // Tiếp đón
    const checkIn = holdStatus();
    const t = await openReceptionDetail(ALL_TARGETS, (api) =>
      api.failNext('status', checkIn.override),
    );
    const button = inDrawer(t.drawer, 'Tiếp đón bệnh nhân');
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(t.api.writes()).toHaveLength(1);
    await act(async () => checkIn.release());
    await screen.findByText(ACTION_TEXT.checkIn.done);
    expect(t.api.writes()).toHaveLength(1);
  });

  it('LTA-10 đang gửi từ HỘP: nút vô hiệu và đổi chữ, `Đóng`, Esc, lớp phủ không đóng, nút `Danh sách` và X của ngăn vô hiệu, `aria-busy`; xong thì đóng được', async () => {
    const held = holdResponse(() =>
      jsonResponse({
        maLichHen: RECEPTION_CODE,
        trangThai: 'DaHuy',
        hoanCoc: null,
      }),
    );
    const { box, drawer, api } = await openCancel({}, (fake) =>
      fake.failNext('status', held.override),
    );
    fireEvent.change(reasonField(box), { target: { value: 'Bận' } });
    fireEvent.click(confirmCancel(box));

    expect(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.confirming }),
    ).toBeDisabled();
    expect(
      within(box).getByRole('button', { name: ACTION_TEXT.cancel.close }),
    ).toBeDisabled();
    expect(reasonField(box)).toHaveAttribute('readonly');
    expect(box).toHaveAttribute('aria-busy', 'true');
    expect(
      within(drawer).getByRole('button', { name: DETAIL_TEXT.back }),
    ).toBeDisabled();
    expect(
      within(drawer).getByRole('button', { name: DETAIL_TEXT.close }),
    ).toBeDisabled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(box.parentElement as HTMLElement);
    fireEvent.click(drawer.parentElement as HTMLElement);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(api.writes()).toHaveLength(1);

    await act(async () => held.release());
    await screen.findByText(ACTION_TEXT.cancel.done);
    await gone(ACTION_TEXT.cancel.title);
    // Hết gửi: ngăn đóng lại được bằng Esc
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
  });

  it('LTA-10 đang gọi `Tiếp đón` (không hộp): ngăn KHÔNG đóng bằng Esc, lớp phủ, `Danh sách`, X; mọi nút thao tác vô hiệu, nút tiếp đón đổi chữ', async () => {
    const held = holdStatus();
    const { drawer, api } = await openReceptionDetail(ALL_TARGETS, (fake) =>
      fake.failNext('status', held.override),
    );
    fireEvent.click(inDrawer(drawer, 'Tiếp đón bệnh nhân'));

    expect(
      within(drawer).getByRole('button', {
        name: ACTION_TEXT.checkIn.confirming,
      }),
    ).toBeDisabled();
    expect(inDrawer(drawer, 'Vắng mặt')).toBeDisabled();
    expect(inDrawer(drawer, 'Hủy lịch')).toBeDisabled();
    expect(
      within(drawer).getByRole('button', { name: DETAIL_TEXT.back }),
    ).toBeDisabled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(drawer.parentElement as HTMLElement);
    expect(screen.getByRole('dialog')).toBe(drawer);
    expect(api.writes()).toHaveLength(1);

    await act(async () => held.release());
    await screen.findByText(ACTION_TEXT.checkIn.done);
    // Hết gửi và chi tiết đã tải lại: ngăn đóng được
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('lỗi khi gửi', () => {
  it.each([
    ['mạng đứt', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      'phản hồi HTML 502',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    ],
  ])(
    'LTA-11 %s ⇒ "chưa rõ" kèm `Tải lại chi tiết`, đúng MỘT POST, KHÔNG tự gửi lại; bấm lại thủ công được và lần hai thành công',
    async (_name, failure) => {
      const { box, api } = await openCancel({}, (fake) =>
        fake.failNext('status', failure),
      );
      fireEvent.change(reasonField(box), { target: { value: 'Bận' } });
      fireEvent.click(confirmCancel(box));

      const alert = await within(box).findByRole('alert');
      expect(alert).toHaveTextContent(ACTION_TEXT.unsure.DaHuy);
      expect(
        within(alert).getByRole('button', { name: ACTION_TEXT.reload }),
      ).toBeInTheDocument();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(api.writes()).toHaveLength(1);
      // Nút xác nhận vẫn còn và bấm lại được (lần hai không còn lỗi giả)
      expect(confirmCancel(box)).toBeEnabled();
      fireEvent.click(confirmCancel(box));
      await screen.findByText(ACTION_TEXT.cancel.done);
      expect(api.writes()).toHaveLength(2);
    },
  );

  it('LTA-11 `Tải lại chi tiết` trong hộp ⇒ đóng hộp, tải lại chi tiết và danh sách, KHÔNG gửi POST nào nữa', async () => {
    const { box, api } = await openCancel({}, (fake) =>
      fake.failNext('status', () =>
        Promise.reject(new TypeError('Failed to fetch')),
      ),
    );
    fireEvent.change(reasonField(box), { target: { value: 'Bận' } });
    fireEvent.click(confirmCancel(box));
    const alert = await within(box).findByRole('alert');
    fireEvent.click(
      within(alert).getByRole('button', { name: ACTION_TEXT.reload }),
    );

    await gone(ACTION_TEXT.cancel.title);
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    await waitFor(() => expect(listQueries(api)).toHaveLength(2));
    expect(api.writes()).toHaveLength(1);
  });

  it('LTA-11 `Tiếp đón` mất kết nối ⇒ thông báo "chưa rõ" ở ngăn kèm `Tải lại chi tiết`, không tự gửi lại', async () => {
    const { drawer, api } = await openReceptionDetail(ALL_TARGETS, (fake) =>
      fake.failNext('status', () =>
        Promise.reject(new TypeError('Failed to fetch')),
      ),
    );
    fireEvent.click(inDrawer(drawer, 'Tiếp đón bệnh nhân'));
    const alert = await within(drawer).findByRole('alert');
    expect(alert).toHaveTextContent(ACTION_TEXT.unsure.DaTiepDon);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(api.writes()).toHaveLength(1);
    fireEvent.click(
      within(alert).getByRole('button', { name: ACTION_TEXT.reload }),
    );
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    expect(within(drawer).queryByRole('alert')).toBeNull();
  });

  it('LTA-12 404 `KHONG_TIM_THAY` ⇒ MỘT câu trong hộp, chỉ còn `Đóng`; chi tiết và danh sách tải lại; sau `Đóng` ngăn hiện "không tìm thấy" và đóng ngăn thì danh sách tải lại nữa', async () => {
    const { box, api, drawer } = await openCancel({}, (fake) =>
      fake.failNext('status', () => apiErrorResponse(404, 'KHONG_TIM_THAY')),
    );
    // Lần tải lại chi tiết sau đó cũng 404 (lịch đã mất thật)
    api.failNext('detail', () => apiErrorResponse(404, 'KHONG_TIM_THAY'));
    fireEvent.change(reasonField(box), { target: { value: 'Bận' } });
    fireEvent.click(confirmCancel(box));

    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Không tìm thấy lịch hẹn này.',
    );
    expect(
      within(box).queryByRole('button', { name: ACTION_TEXT.cancel.confirm }),
    ).toBeNull();
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    await waitFor(() => expect(listQueries(api)).toHaveLength(2));

    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.close }),
    );
    await gone(ACTION_TEXT.cancel.title);
    expect(await within(drawer).findByRole('alert')).toHaveTextContent(
      DETAIL_TEXT.notFound,
    );
    // Đóng ngăn đã báo không tìm thấy ⇒ danh sách tải lại lần nữa (đường F8 sẵn có)
    fireEvent.click(
      within(drawer).getByRole('button', { name: DETAIL_TEXT.back }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(listQueries(api)).toHaveLength(3));
    expect(api.writes()).toHaveLength(1);
  });

  it('LTA-13 409 trạng thái đã đổi ở nơi khác ⇒ câu có nhãn trạng thái, chi tiết và danh sách tải lại, nút khớp máy chủ (hết nút) và chip đổi', async () => {
    const { box, api, drawer } = await openCancel({}, (fake) =>
      fake.failNext('status', () =>
        apiErrorResponse(409, 'LICH_HEN_KHONG_CHO_HUY', undefined, {
          trangThai: 'DaTiepDon',
        }),
      ),
    );
    api.failNext('detail', () =>
      jsonResponse(
        makeReceptionDetail({
          trangThai: 'DaTiepDon',
          chuyenDuoc: [],
          conPhaiThu: null,
        }),
      ),
    );
    fireEvent.change(reasonField(box), { target: { value: 'Bận' } });
    fireEvent.click(confirmCancel(box));

    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Lịch hẹn đang ở trạng thái Đã tiếp đón nên không thể hủy.',
    );
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    await waitFor(() => expect(listQueries(api)).toHaveLength(2));
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.close }),
    );
    await gone(ACTION_TEXT.cancel.title);
    await within(drawer).findByText('Đã tiếp đón');
    expect(
      within(drawer).queryByRole('group', { name: DETAIL_TEXT.actionsGroup }),
    ).toBeNull();
  });

  it('LTA-14 trong lúc chi tiết tải lại (giữ bản cũ) mọi nút thao tác vô hiệu (`busy`); bản mới về thì nút theo `chuyenDuoc[]` mới', async () => {
    const reload = holdResponse(() =>
      jsonResponse(
        makeReceptionDetail({ chuyenDuoc: ['DaHuy'], conPhaiThu: '5000.00' }),
      ),
    );
    const { drawer, api } = await openReceptionDetail(ALL_TARGETS, (fake) =>
      fake.failNext('status', () =>
        apiErrorResponse(409, 'CON_PHAN_CHUA_THANH_TOAN', undefined, {
          conPhaiThu: '5000.00',
        }),
      ),
    );
    api.failNext('detail', reload.override);
    fireEvent.click(inDrawer(drawer, 'Tiếp đón bệnh nhân'));
    await within(drawer).findByRole('alert');
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    // Bản cũ còn hiện nhưng nút bị vô hiệu tới khi bản mới về
    expect(inDrawer(drawer, 'Tiếp đón bệnh nhân')).toBeDisabled();
    expect(inDrawer(drawer, 'Vắng mặt')).toBeDisabled();
    expect(inDrawer(drawer, 'Hủy lịch')).toBeDisabled();

    await act(async () => reload.release());
    await waitFor(() => expect(inDrawer(drawer, 'Hủy lịch')).toBeEnabled());
    expect(
      within(drawer).queryByRole('button', { name: 'Tiếp đón bệnh nhân' }),
    ).toBeNull();
  });

  it('LTA-11 503 `HE_THONG_DANG_BAN` ⇒ câu bận, bấm lại được (không có `Tải lại chi tiết`); lần hai thành công', async () => {
    const { box, api } = await openNoShow({}, (fake) =>
      fake.failNext('status', () => apiErrorResponse(503, 'HE_THONG_DANG_BAN')),
    );
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.noShow.confirm }),
    );
    const alert = await within(box).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
    );
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(api.callsTo(DETAIL_PATH)).toHaveLength(1);
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.noShow.confirm }),
    );
    await screen.findByText(ACTION_TEXT.noShow.done);
    expect(api.writes()).toHaveLength(2);
  });

  it('LTA-11 401 hết phiên và 403 không quyền ⇒ câu riêng, chỉ còn `Đóng`, không `Tải lại chi tiết`', async () => {
    for (const [status, maLoi, text] of [
      [
        401,
        'CHUA_DANG_NHAP',
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      ],
      [403, 'KHONG_DU_QUYEN', ACTION_TEXT.forbidden],
    ] as const) {
      const { box, unmount } = await openNoShow({}, (fake) =>
        fake.failNext('status', () => apiErrorResponse(status, maLoi)),
      );
      fireEvent.click(
        within(box).getByRole('button', { name: ACTION_TEXT.noShow.confirm }),
      );
      const alert = await within(box).findByRole('alert');
      expect(alert).toHaveTextContent(text);
      expect(within(alert).queryByRole('button')).toBeNull();
      expect(
        within(box).queryByRole('button', { name: ACTION_TEXT.noShow.confirm }),
      ).toBeNull();
      unmount();
      cleanUpReceptionPage();
    }
  });

  it('LTA-05 máy chủ từ chối lý do (400 `LY_DO_BAT_BUOC`) dù client cho qua ⇒ câu hiện DƯỚI Ô lý do, bấm lại được sau khi sửa', async () => {
    const { box, api } = await openCancel({}, (fake) =>
      fake.failNext('status', () =>
        apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
        ]),
      ),
    );
    const field = reasonField(box);
    fireEvent.change(field, { target: { value: 'Bận' } });
    fireEvent.click(confirmCancel(box));
    expect(
      await within(box).findByText(ACTION_TEXT.cancel.reasonRequired),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(confirmCancel(box)).toBeEnabled();
    fireEvent.change(field, { target: { value: 'Bận việc đột xuất' } });
    fireEvent.click(confirmCancel(box));
    await screen.findByText(ACTION_TEXT.cancel.done);
    expect(api.writes()).toHaveLength(2);
  });
});

describe('dữ liệu cá nhân', () => {
  it('LTA-16 gõ lý do huỷ, gửi lỗi rồi gửi lại thành công: không localStorage, sessionStorage, cookie, console, URL không đổi và không chứa lý do', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { box, api } = await openCancel({}, (fake) =>
      fake.failNext('status', () => apiErrorResponse(503, 'HE_THONG_DANG_BAN')),
    );
    const before = currentUrl();
    fireEvent.change(reasonField(box), {
      target: { value: 'Bệnh nhân có số 0901234567 báo bận' },
    });
    fireEvent.click(confirmCancel(box));
    await within(box).findByRole('alert');
    fireEvent.click(confirmCancel(box));
    await screen.findByText(ACTION_TEXT.cancel.done);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(currentUrl()).toBe(before);
    expect(currentUrl()).not.toMatch(/0901234567|báo bận|CP2026/);
    // URL thật của trang (không chỉ URL của router): không query, không hash
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(api.writes()).toHaveLength(2);
  });

  it('LTA-16 vắng mặt và tiếp đón: cũng không kho trình duyệt, cookie, console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { box } = await openNoShow();
    fireEvent.click(
      within(box).getByRole('button', { name: ACTION_TEXT.noShow.confirm }),
    );
    await screen.findByText(ACTION_TEXT.noShow.done);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

// `ReceptionActions` đứng riêng (F9 chỉ thêm hai thứ vào file F8: handler nhận nút, prop `busy`); hành vi khi không có handler giữ nguyên như F8.
describe('nhóm nút `ReceptionActions`', () => {
  const detail = makeReceptionDetail({
    chuyenDuoc: ['DaHuy', 'DaTiepDon', 'VangMat'],
    conPhaiThu: '0.00',
  });
  const names = ['Tiếp đón bệnh nhân', 'Vắng mặt', 'Hủy lịch'];

  it('LTA-14 KHÔNG có `handlers` ⇒ hành vi của F8 không đổi: mọi nút theo `chuyenDuoc[]` vô hiệu kèm chữ ẩn "(chưa được triển khai)"', () => {
    render(<ReceptionActions detail={detail} />);
    for (const name of names) {
      expect(
        screen.getByRole('button', {
          name: `${name} ${DETAIL_TEXT.notImplementedHidden}`,
        }),
      ).toBeDisabled();
    }
    // `handlers` rỗng cũng vậy
    render(<ReceptionActions detail={detail} handlers={{}} />);
    expect(
      screen.getAllByRole('button', {
        name: `Hủy lịch ${DETAIL_TEXT.notImplementedHidden}`,
      }),
    ).toHaveLength(2);
  });

  it('LTA-14 nút nào có handler thì BẬT và handler nhận ĐÚNG phần tử nút đã bấm (để hộp trả tiêu điểm về đúng nút); nút không có handler vẫn vô hiệu', () => {
    const onCancel = vi.fn();
    render(<ReceptionActions detail={detail} handlers={{ DaHuy: onCancel }} />);
    const cancel = screen.getByRole('button', { name: 'Hủy lịch' });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel.mock.calls[0][0]).toBe(cancel);
    expect(
      screen.getByRole('button', {
        name: `Vắng mặt ${DETAIL_TEXT.notImplementedHidden}`,
      }),
    ).toBeDisabled();
  });

  it('LTA-14 `busy` vô hiệu CẢ NHÓM kể cả nút có handler (bấm không gọi handler); `sending` chỉ đổi chữ nút `Tiếp đón`', () => {
    const handlers = {
      DaHuy: vi.fn(),
      VangMat: vi.fn(),
      DaTiepDon: vi.fn(),
    };
    render(
      <ReceptionActions
        detail={detail}
        handlers={handlers}
        busy
        sending={{ target: 'DaTiepDon', label: ACTION_TEXT.checkIn.confirming }}
      />,
    );
    const checkIn = screen.getByRole('button', {
      name: ACTION_TEXT.checkIn.confirming,
    });
    expect(checkIn).toBeDisabled();
    for (const name of ['Vắng mặt', 'Hủy lịch']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    fireEvent.click(checkIn);
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('LTA-14 `Thu tiền & tiếp đón` (LTN-05) vô hiệu dù có `handlers` và không `busy`: thuộc `payment`', () => {
    render(
      <ReceptionActions
        detail={makeReceptionDetail({
          chuyenDuoc: ['DaHuy'],
          conPhaiThu: '200000.00',
        })}
        handlers={{ DaHuy: vi.fn(), VangMat: vi.fn(), DaTiepDon: vi.fn() }}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Thu tiền & tiếp đón/ }),
    ).toBeDisabled();
    expect(screen.getByText(DETAIL_TEXT.notImplemented)).toBeVisible();
  });
});
