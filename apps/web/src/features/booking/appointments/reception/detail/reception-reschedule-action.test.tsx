import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  holdResponse,
  LIST_MARK,
} from '../../../testing/appointment-detail-harness';
import { makeReceptionDetail } from '../../../testing/fake-reception-api';
import { cleanUpReceptionPage } from '../../../testing/reception-harness';
import { renderReceptionReschedule } from '../../../testing/reception-reschedule-harness';
import {
  currentUrl,
  GRID_PATH,
  OLD_DETAIL_PATH,
  RECEPTION_CODE,
  RTEXT,
} from '../../../testing/reception-reschedule-helpers';
import { RESCHEDULE_NOT_ALLOWED_MESSAGE } from '../../common/reschedule-errors';
import type { ReceptionAppointmentDetail } from '../api/reception-appointment-types';
import { DETAIL_TEXT } from './detail-messages';
import { ReceptionActions } from './reception-actions';

// reschedule F3, mã ca WDO-01 (PLAN reschedule 7.11): nút "Đổi lịch hộ" ở thẻ `Thao tác` của chi tiết lịch Lễ tân. Hiện theo cờ `choPhepDoiLich` của MÁY CHỦ (web không có bộ luật thứ hai), không làm hỏng các nút
// cũ (Tiếp đón, Vắng mặt, Hủy, Thu tiền; các ca của `reception-actions.test.tsx` chạy nguyên văn). Dữ liệu giả.
afterEach(cleanUpReceptionPage);

async function openDetail(detail: Partial<ReceptionAppointmentDetail> = {}) {
  const view = renderReceptionReschedule({
    path: OLD_DETAIL_PATH,
    before: (api) => {
      api.reception.details[RECEPTION_CODE] = makeReceptionDetail(detail);
    },
  });
  await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });
  return view;
}
const actionsGroup = () =>
  screen.queryByRole('group', { name: DETAIL_TEXT.sections.actions });
const rescheduleLink = () =>
  screen.queryByRole('link', { name: RTEXT.changeButton });
const rescheduleButton = () =>
  screen.queryByRole('button', { name: RTEXT.changeButton });

describe('nút "Đổi lịch hộ" theo `choPhepDoiLich` (WDO-01)', () => {
  it('WDO-01 lịch `DaXacNhan` đổi được ⇒ LIÊN KẾT tới trang chọn khung giờ nằm trong thẻ `Thao tác`; chi tiết KHÔNG gọi thêm preview hay lưới', async () => {
    const { api } = await openDetail();
    const group = actionsGroup();
    expect(group).not.toBeNull();
    const link = within(group as HTMLElement).getByRole('link', {
      name: RTEXT.changeButton,
    });
    expect(link).toHaveAttribute('href', GRID_PATH);
    expect(rescheduleButton()).toBeNull();
    expect(api.previewCalls).toEqual([]);
    expect(api.slots.slotCalls).toEqual([]);
    expect(api.submitCalls).toEqual([]);
  });

  it('WDO-01 bấm liên kết ⇒ sang trang chọn khung giờ của ĐÚNG lịch (URL có mã lịch đã mã hoá)', async () => {
    await openDetail();
    fireEvent.click(rescheduleLink() as HTMLElement);
    expect(
      await screen.findByRole('heading', { level: 1, name: RTEXT.title }),
    ).toBeInTheDocument();
    expect(currentUrl()).toBe(GRID_PATH);
  });

  it('WDO-01 `choPhepDoiLich = false` ở `DaXacNhan` ⇒ nút VÔ HIỆU kèm lý do bằng chữ (tên mô tả của nút), KHÔNG liên kết', async () => {
    await openDetail({ choPhepDoiLich: false });
    const button = rescheduleButton();
    expect(button).toBeDisabled();
    expect(rescheduleLink()).toBeNull();
    expect(button).toHaveAccessibleDescription(RESCHEDULE_NOT_ALLOWED_MESSAGE);
    expect(screen.getByText(RESCHEDULE_NOT_ALLOWED_MESSAGE)).toBeVisible();
  });

  it('WDO-01 lịch `ChoThanhToan` (chỉ `DaXacNhan` đổi được) ⇒ nút vô hiệu kèm lý do; nút Hủy vẫn còn', async () => {
    await openDetail({
      trangThai: 'ChoThanhToan',
      choPhepDoiLich: false,
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: null,
    });
    expect(rescheduleButton()).toBeDisabled();
    expect(
      within(actionsGroup() as HTMLElement).getByRole('button', {
        name: 'Hủy lịch',
      }),
    ).toBeEnabled();
  });

  it.each(['DaTiepDon', 'HoanThanh', 'DaHuy', 'VangMat', 'DaDoiLich'])(
    'WDO-01 lịch `%s` ⇒ KHÔNG hiện nút "Đổi lịch hộ" (kể cả khi cờ còn `true`); không có thao tác nào khác thì cả thẻ `Thao tác` không dựng',
    async (state) => {
      await openDetail({
        trangThai: state,
        choPhepDoiLich: true,
        chuyenDuoc: [],
        conPhaiThu: null,
      });
      expect(rescheduleLink()).toBeNull();
      expect(rescheduleButton()).toBeNull();
      expect(actionsGroup()).toBeNull();
    },
  );

  it('WDO-01 `coYeuCauChoDuyet = true` ⇒ dòng nhắc dưới nút, nút VẪN bật (không chặn đổi hộ, KDL-19); `false` ⇒ không có dòng nhắc', async () => {
    await openDetail({ coYeuCauChoDuyet: true });
    expect(rescheduleLink()).toHaveAttribute('href', GRID_PATH);
    expect(screen.getByText(RTEXT.pendingRequest)).toBeInTheDocument();
  });

  it('WDO-01 không có yêu cầu chờ ⇒ không có dòng nhắc yêu cầu', async () => {
    await openDetail({ coYeuCauChoDuyet: false });
    expect(screen.queryByText(RTEXT.pendingRequest)).toBeNull();
  });

  it('WDO-01 thẻ `Thao tác` vẫn hiện khi KHÔNG có thao tác trạng thái nào mà lịch đổi được: chỉ có nút "Đổi lịch hộ"', async () => {
    await openDetail({ chuyenDuoc: [], conPhaiThu: null });
    const group = actionsGroup() as HTMLElement;
    expect(within(group).getAllByRole('link')).toHaveLength(1);
    expect(within(group).queryAllByRole('button')).toHaveLength(0);
  });

  it('WDO-01 KHÔNG làm mất các nút cũ: Tiếp đón, Vắng mặt, Hủy và "Đổi lịch hộ" cùng hiện; Thu tiền hiện khi còn phải thu', async () => {
    await openDetail({
      chuyenDuoc: ['DaHuy', 'DaTiepDon', 'VangMat'],
      conPhaiThu: '200000.00',
    });
    const group = actionsGroup() as HTMLElement;
    for (const name of [
      'Tiếp đón bệnh nhân',
      'Vắng mặt',
      'Hủy lịch',
      /Thu tiền/,
    ]) {
      expect(within(group).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(
      within(group).getByRole('link', { name: RTEXT.changeButton }),
    ).toBeInTheDocument();
  });

  it('WDO-01 đang gửi một thao tác khác (Tiếp đón): "Đổi lịch hộ" thành nút VÔ HIỆU (không bấm đi nơi khác giữa lúc chờ), xong lại là liên kết', async () => {
    const hold = holdResponse(
      () =>
        new Response(
          JSON.stringify({ maLichHen: RECEPTION_CODE, trangThai: 'DaTiepDon' }),
          { status: 200 },
        ),
    );
    const { api } = renderReceptionReschedule({
      path: OLD_DETAIL_PATH,
      before: (fake) => {
        fake.reception.details[RECEPTION_CODE] = makeReceptionDetail({
          chuyenDuoc: ['DaTiepDon', 'DaHuy'],
          conPhaiThu: '0.00',
        });
        fake.reception.failNext('status', hold.override);
      },
    });
    await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });
    expect(rescheduleLink()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp đón bệnh nhân' }));
    await waitFor(() => expect(api.reception.writes()).toHaveLength(1));
    expect(rescheduleLink()).toBeNull();
    expect(rescheduleButton()).toBeDisabled();
    // phản hồi bị giữ đi qua `failNext` nên không chạy `serveStatus`: đổi chi tiết sang `DaTiepDon` đúng lúc máy chủ "trả lời"
    api.reception.details[RECEPTION_CODE] = makeReceptionDetail({
      trangThai: 'DaTiepDon',
      chuyenDuoc: [],
      conPhaiThu: null,
      choPhepDoiLich: false,
    });
    hold.release();
    // sau khi tiếp đón xong lịch là `DaTiepDon` ⇒ không còn nút "Đổi lịch hộ"
    await waitFor(() => expect(rescheduleButton()).toBeNull());
    expect(rescheduleLink()).toBeNull();
  });

  it('WDO-01 liên kết quay lại danh sách của trang không bị ảnh hưởng (đối chứng: trang vẫn dựng được chi tiết, không có chữ máy chủ)', async () => {
    await openDetail();
    expect(screen.queryByText(LIST_MARK)).toBeNull();
    expect(
      screen.getByRole('link', { name: DETAIL_TEXT.back }),
    ).toBeInTheDocument();
  });
});

describe('`ReceptionActions` dựng được KHÔNG có Router khi không có nút đổi lịch (WDO-01)', () => {
  it('WDO-01 prop `reschedule` vắng hoặc `null` ⇒ hành vi cũ: không có thao tác nào thì không dựng thẻ', () => {
    const detail = makeReceptionDetail({ chuyenDuoc: [], conPhaiThu: null });
    const { container, rerender } = render(
      <ReceptionActions detail={detail} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<ReceptionActions detail={detail} reschedule={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('WDO-01 có `reschedule` ⇒ thẻ hiện kể cả khi không có thao tác nào, và nút nằm trong nhóm `Thao tác`', () => {
    const detail = makeReceptionDetail({ chuyenDuoc: [], conPhaiThu: null });
    render(
      <ReceptionActions
        detail={detail}
        reschedule={<button type="button">Nút thử</button>}
      />,
    );
    const group = screen.getByRole('group', {
      name: DETAIL_TEXT.sections.actions,
    });
    expect(
      within(group).getByRole('button', { name: 'Nút thử' }),
    ).toBeInTheDocument();
  });
});
