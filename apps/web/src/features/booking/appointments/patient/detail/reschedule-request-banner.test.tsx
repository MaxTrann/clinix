import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeDetail } from '../../../testing/fake-appointment-detail-api';
import type { RescheduleRequestSummary } from '../api/patient-appointment-types';
import { RESCHEDULE_TEXT } from '../../common/reschedule-text';
import { RescheduleRequestBanner } from './reschedule-request-banner';

// reschedule F2, mã ca WDH-40 [đề xuất] và WDH-09 (PLAN reschedule 7.11): banner `yeuCauDoiLich` ở chi tiết lịch. Ba trạng thái, ghi chú là VĂN BẢN THUẦN, giờ theo giờ Việt Nam, ẩn khi lịch đã kết thúc. Dữ liệu giả.
afterEach(cleanup);

const REQUEST: RescheduleRequestSummary = {
  trangThai: 'ChoDuyet',
  thoiGianMongMuon: '2026-12-02T03:00:00.000Z',
  ghiChuXuLy: null,
  thoiDiemTao: '2026-11-25T03:05:00.000Z',
};
function show(
  request: RescheduleRequestSummary | null,
  trangThai = 'DaXacNhan',
) {
  return render(
    <RescheduleRequestBanner
      detail={makeDetail({ trangThai, yeuCauDoiLich: request })}
    />,
  );
}
const banner = () =>
  screen.queryByRole('region', { name: RESCHEDULE_TEXT.bannerTitle });

describe('banner yêu cầu đổi lịch (WDH-40, WDH-09)', () => {
  it('WDH-40 chưa có yêu cầu (`null`) ⇒ không vẽ gì', () => {
    const { container } = show(null);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['DaXacNhan', 'ChoThanhToan'])(
    'WDH-09 `ChoDuyet` ở lịch %s ⇒ "Đang chờ duyệt" kèm khung giờ mong muốn và giờ gửi theo giờ Việt Nam, lịch giữ nguyên',
    (status) => {
      show(REQUEST, status);
      const region = banner() as HTMLElement;
      expect(region).toHaveTextContent(RESCHEDULE_TEXT.bannerPending);
      expect(region).toHaveTextContent('10:00');
      expect(region).toHaveTextContent('02/12/2026');
      expect(region).toHaveTextContent('Đã gửi lúc 10:05 25/11/2026');
      expect(region).toHaveTextContent(RESCHEDULE_TEXT.bannerPendingNote);
      expect(region).not.toHaveTextContent(RESCHEDULE_TEXT.bannerRejected);
    },
  );

  it('WDH-40 giờ theo NGÀY Việt Nam, không theo múi giờ máy: 17:30Z ⇒ 00:30 ngày hôm sau', () => {
    show({
      ...REQUEST,
      thoiGianMongMuon: '2026-12-01T17:30:00.000Z',
      thoiDiemTao: '2026-11-24T17:45:00.000Z',
    });
    const region = banner() as HTMLElement;
    expect(region).toHaveTextContent('00:30');
    expect(region).toHaveTextContent('02/12/2026');
    expect(region).toHaveTextContent('Đã gửi lúc 00:45 25/11/2026');
    expect(region).not.toHaveTextContent('17:30');
  });

  it('WDH-09 `TuChoi` ⇒ "Bị từ chối: {ghi chú}", không còn chữ "Đang chờ duyệt"', () => {
    show({
      ...REQUEST,
      trangThai: 'TuChoi',
      ghiChuXuLy: 'Khung giờ này đã kín, xin chọn tuần sau.',
    });
    const region = banner() as HTMLElement;
    expect(
      screen.getByText('Bị từ chối: Khung giờ này đã kín, xin chọn tuần sau.'),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent(RESCHEDULE_TEXT.bannerRejectedNote);
    expect(region).not.toHaveTextContent(RESCHEDULE_TEXT.bannerPending);
  });

  it('WDH-09 `TuChoi` mà ghi chú `null` ⇒ chỉ "Bị từ chối" (không "null", không dấu hai chấm)', () => {
    show({ ...REQUEST, trangThai: 'TuChoi', ghiChuXuLy: null });
    const region = banner() as HTMLElement;
    expect(region).toHaveTextContent(/Bị từ chối(?!:)/);
    expect(region.textContent).not.toContain('null');
  });

  it('WDH-40 ghi chú là VĂN BẢN THUẦN: thẻ HTML hiện thành chữ, không tạo phần tử, không chạy mã', () => {
    const note =
      '<b>Đậm</b><img src=x onerror=alert(1)><script>boom()</script>';
    const { container } = show({
      ...REQUEST,
      trangThai: 'TuChoi',
      ghiChuXuLy: note,
    });
    expect(container.querySelector('b, img, script')).toBeNull();
    expect(screen.getByText(`Bị từ chối: ${note}`)).toBeInTheDocument();
  });

  it('WDH-40 ghi chú dài 255 ký tự không khoảng trắng và ghi chú nhiều dòng: giữ nguyên chữ, có lớp bẻ chữ và giữ xuống dòng (bố cục không đo được ở happy-dom)', () => {
    const long = 'x'.repeat(255);
    show({ ...REQUEST, trangThai: 'TuChoi', ghiChuXuLy: long });
    const line = screen.getByText(`Bị từ chối: ${long}`);
    expect(line.className).toContain('break-words');
    expect(line.className).toContain('whitespace-pre-line');
    cleanup();
    show({ ...REQUEST, trangThai: 'TuChoi', ghiChuXuLy: 'Dòng một\nDòng hai' });
    expect(screen.getByText(/Bị từ chối: Dòng một/).textContent).toBe(
      'Bị từ chối: Dòng một\nDòng hai',
    );
  });

  it('WDH-09 `DaDuyet` (gần như không gặp) vẫn vẽ được', () => {
    show({ ...REQUEST, trangThai: 'DaDuyet', ghiChuXuLy: 'Đã duyệt.' });
    expect(banner()).toHaveTextContent(RESCHEDULE_TEXT.bannerApproved);
    expect(banner()).not.toHaveTextContent(RESCHEDULE_TEXT.bannerPending);
  });

  it.each([
    'DaHuy',
    'HoanThanh',
    'DaTiepDon',
    'VangMat',
    'DaDoiLich',
    'TrangThaiLa',
  ])(
    'WDH-40 lịch đã kết thúc (%s) ⇒ ẩn banner dù có yêu cầu `ChoDuyet`, `TuChoi` hay `DaDuyet` (yêu cầu tồn không tự đóng khi lịch bị huỷ)',
    (status) => {
      for (const trangThai of ['ChoDuyet', 'TuChoi', 'DaDuyet'] as const) {
        const view = show({ ...REQUEST, trangThai, ghiChuXuLy: 'x' }, status);
        expect(view.container).toBeEmptyDOMElement();
        view.unmount();
      }
    },
  );

  it('WDH-40 banner là vùng có tên (không phải cảnh báo ngắt lời): không `role="alert"`', () => {
    show(REQUEST);
    expect(banner()).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
