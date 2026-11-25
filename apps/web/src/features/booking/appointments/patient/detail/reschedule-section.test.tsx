import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanUpDetailPage,
  confirmButton,
  DETAIL_CODE,
  detailLoaded,
  openCancelBox,
} from '../../../testing/appointment-detail-harness';
import { makeDetail } from '../../../testing/fake-appointment-detail-api';
import { makePreview } from '../../../testing/fake-reschedule-api';
import { renderReschedule } from '../../../testing/reschedule-harness';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';
import { RESCHEDULE_TEXT } from '../reschedule/reschedule-text';
import { CANCEL_TEXT, DETAIL_TEXT } from './detail-messages';

// reschedule F1, mã ca WDH-01 và WDH-24 [đề xuất] (PLAN reschedule 7.11): nút "Đổi lịch" ở chi tiết lịch hẹn của Bệnh nhân. Hiện theo CỜ của máy chủ (`choPhepDoiLich`, `yeuCauDoiLich`); nhãn "Gửi yêu cầu đổi lịch"
// theo `loai` của preview (Đại chọn 25/11/2026, câu A2: gọi preview chỉ khi `choPhepDoiLich` và chưa có yêu cầu chờ). Dữ liệu giả.
afterEach(cleanUpDetailPage);

const DETAIL_PATH = `/benh-nhan/lich-hen-cua-toi/${DETAIL_CODE}`;
const RESCHEDULE_PATH = `${DETAIL_PATH}/doi-lich`;
const PENDING = {
  trangThai: 'ChoDuyet',
  thoiGianMongMuon: '2026-12-02T02:00:00.000Z',
  ghiChuXuLy: null,
  thoiDiemTao: '2026-11-25T01:00:00.000Z',
} as const;

function renderDetail(
  detail: Partial<PatientAppointmentDetail>,
  preview: unknown = makePreview(),
) {
  const view = renderReschedule({
    path: DETAIL_PATH,
    before: (api) => {
      api.detail.detail = makeDetail(detail);
      api.preview = preview;
    },
  });
  return view;
}

const changeLink = () =>
  screen.queryByRole('link', { name: RESCHEDULE_TEXT.changeButton });
const requestLink = () =>
  screen.queryByRole('link', { name: RESCHEDULE_TEXT.requestButton });
const disabledButton = () =>
  screen.queryByRole('button', { name: RESCHEDULE_TEXT.changeButton });
const noRescheduleControl = () => {
  expect(changeLink()).toBeNull();
  expect(requestLink()).toBeNull();
  expect(disabledButton()).toBeNull();
};

describe('nút "Đổi lịch" theo cờ của máy chủ (WDH-01)', () => {
  it('WDH-01 `choPhepDoiLich` và còn lần tự đổi ⇒ liên kết "Đổi lịch" tới trang chọn khung giờ; MỘT lời gọi xem trước, không `khungGioId`', async () => {
    const { api } = renderDetail({ choPhepDoiLich: true });
    await detailLoaded();
    const link = await screen.findByRole('link', {
      name: RESCHEDULE_TEXT.changeButton,
    });
    expect(link).toHaveAttribute('href', RESCHEDULE_PATH);
    expect(api.previewCalls).toEqual([
      { maLichHen: DETAIL_CODE, khungGioId: null },
    ]);
    expect(requestLink()).toBeNull();
    expect(disabledButton()).toBeNull();
  });

  it('WDH-01 hết lần tự đổi (`loai = GuiYeuCau`) ⇒ nhãn "Gửi yêu cầu đổi lịch", cùng đích', async () => {
    renderDetail(
      { choPhepDoiLich: true },
      makePreview({ loai: 'GuiYeuCau', soLanDaDoi: 2, soLanToiDa: 2 }),
    );
    await detailLoaded();
    const link = await screen.findByRole('link', {
      name: RESCHEDULE_TEXT.requestButton,
    });
    expect(link).toHaveAttribute('href', RESCHEDULE_PATH);
    expect(changeLink()).toBeNull();
  });

  it('WDH-24 nhãn là "Đổi lịch" trong lúc preview chưa về (bấm được ngay) và KHÔNG đổi chữ khi preview báo `TuDoi`', async () => {
    const { api } = renderDetail({ choPhepDoiLich: true });
    api.failNext('preview', () => new Promise<Response>(() => undefined));
    await detailLoaded();
    expect(
      await screen.findByRole('link', { name: RESCHEDULE_TEXT.changeButton }),
    ).toHaveAttribute('href', RESCHEDULE_PATH);
    expect(requestLink()).toBeNull();
  });

  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['HTML 502', () => new Response('<html>502</html>', { status: 502 })],
    [
      '403',
      () =>
        new Response(
          JSON.stringify({ maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    ],
    [
      '200 sai hợp đồng',
      () =>
        new Response(JSON.stringify({ choPhepDoi: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ],
  ])(
    'WDH-24 preview lỗi (%s) ⇒ nút vẫn là "Đổi lịch" bấm được; chi tiết không báo lỗi của preview (trang đổi lịch tự báo)',
    async (_name, response) => {
      renderReschedule({
        path: DETAIL_PATH,
        before: (api) => {
          api.detail.detail = makeDetail({ choPhepDoiLich: true });
          api.failNext('preview', response);
        },
      });
      await detailLoaded();
      expect(
        await screen.findByRole('link', { name: RESCHEDULE_TEXT.changeButton }),
      ).toHaveAttribute('href', RESCHEDULE_PATH);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('WDH-01 đã có yêu cầu CHỜ DUYỆT ⇒ nút "Đổi lịch" VÔ HIỆU kèm lý do (tên mô tả của nút), không liên kết và KHÔNG gọi preview', async () => {
    const { api } = renderDetail({
      choPhepDoiLich: false,
      yeuCauDoiLich: { ...PENDING },
    });
    await detailLoaded();
    const button = screen.getByRole('button', {
      name: RESCHEDULE_TEXT.changeButton,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(RESCHEDULE_TEXT.pendingReason);
    expect(screen.getByText(RESCHEDULE_TEXT.pendingReason)).toBeVisible();
    expect(changeLink()).toBeNull();
    expect(requestLink()).toBeNull();
    expect(api.previewCalls).toEqual([]);
  });

  it('WDH-01 yêu cầu chờ duyệt thắng cả khi cờ `choPhepDoiLich` vẫn `true` (không tin cờ một mình): vẫn vô hiệu, không gọi preview', async () => {
    const { api } = renderDetail({
      choPhepDoiLich: true,
      yeuCauDoiLich: { ...PENDING },
    });
    await detailLoaded();
    expect(
      screen.getByRole('button', { name: RESCHEDULE_TEXT.changeButton }),
    ).toBeDisabled();
    expect(changeLink()).toBeNull();
    expect(api.previewCalls).toEqual([]);
  });

  it.each(['DaDuyet', 'TuChoi'] as const)(
    'WDH-01 yêu cầu trước đã %s (không còn chờ) ⇒ không chặn: liên kết "Đổi lịch" khi cờ cho phép',
    async (trangThai) => {
      renderDetail({
        choPhepDoiLich: true,
        yeuCauDoiLich: {
          ...PENDING,
          trangThai,
          ghiChuXuLy: 'Ghi chú của lễ tân',
        },
      });
      await detailLoaded();
      expect(
        await screen.findByRole('link', {
          name: RESCHEDULE_TEXT.changeButton,
        }),
      ).toBeInTheDocument();
      expect(disabledButton()).toBeNull();
    },
  );

  it.each(['DaXacNhan', 'ChoThanhToan'])(
    'WDH-01 lịch %s mà `choPhepDoiLich = false` (không có yêu cầu chờ) ⇒ nút vô hiệu kèm "Lịch hẹn này hiện không thể đổi.", không liên kết, không gọi preview',
    async (trangThai) => {
      const { api } = renderDetail({ choPhepDoiLich: false, trangThai });
      await detailLoaded();
      const button = screen.getByRole('button', {
        name: RESCHEDULE_TEXT.changeButton,
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(
        'Lịch hẹn này hiện không thể đổi.',
      );
      expect(changeLink()).toBeNull();
      expect(api.previewCalls).toEqual([]);
    },
  );

  it.each(['DaTiepDon', 'HoanThanh', 'DaHuy', 'VangMat', 'DaDoiLich', 'LA_LA'])(
    'WDH-01 lịch %s mà `choPhepDoiLich = false` ⇒ KHÔNG có nút đổi lịch nào (như nút Hủy), không gọi preview',
    async (trangThai) => {
      const { api } = renderDetail({ choPhepDoiLich: false, trangThai });
      await detailLoaded();
      noRescheduleControl();
      expect(api.previewCalls).toEqual([]);
    },
  );

  it.each(['DaHuy', 'HoanThanh', 'DaDoiLich'])(
    'WDH-01 lịch %s còn yêu cầu chờ duyệt tồn (R6) ⇒ KHÔNG hiện nút vô hiệu trên lịch đã kết thúc (banner yêu cầu là việc của F2)',
    async (trangThai) => {
      const { api } = renderDetail({
        choPhepDoiLich: false,
        trangThai,
        yeuCauDoiLich: { ...PENDING },
      });
      await detailLoaded();
      noRescheduleControl();
      expect(api.previewCalls).toEqual([]);
    },
  );

  it('WDH-01 huỷ lịch xong ngay tại trang ⇒ nút "Đổi lịch" biến mất cùng nút Hủy (không GET lại chi tiết, `choPhepDoiLich` về false)', async () => {
    const { api } = renderDetail({ choPhepDoiLich: true, choPhepHuy: true });
    api.detail.cancelResult = {
      maLichHen: DETAIL_CODE,
      trangThai: 'DaHuy',
      hoanCoc: null,
    };
    await openCancelBox();
    expect(
      screen.getByRole('link', { name: RESCHEDULE_TEXT.changeButton }),
    ).toBeInTheDocument();
    fireEvent.click(confirmButton());
    await screen.findByText(CANCEL_TEXT.cancelled);
    expect(changeLink()).toBeNull();
    expect(disabledButton()).toBeNull();
    expect(
      api.detail.callsTo('GET', `/patient/appointments/${DETAIL_CODE}`),
    ).toHaveLength(1);
  });

  it('WDH-01 nút nằm TRƯỚC nút "Hủy lịch hẹn" ở cột thao tác, và chi tiết chưa tải thì chưa có nút', async () => {
    renderDetail({ choPhepDoiLich: true, choPhepHuy: true });
    expect(changeLink()).toBeNull();
    await detailLoaded();
    const link = await screen.findByRole('link', {
      name: RESCHEDULE_TEXT.changeButton,
    });
    const cancel = screen.getByRole('button', {
      name: DETAIL_TEXT.cancelButton,
    });
    expect(
      link.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('WDH-01 hộp huỷ KHÔNG bị ảnh hưởng: lịch đổi được vẫn huỷ được (nút Hủy còn nguyên)', async () => {
    renderDetail({ choPhepDoiLich: true, choPhepHuy: true });
    await detailLoaded();
    expect(
      await screen.findByRole('button', { name: DETAIL_TEXT.cancelButton }),
    ).toBeEnabled();
  });
});
