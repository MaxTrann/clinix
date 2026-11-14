import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PATIENT_APPOINTMENTS_PATH,
  bookingPaymentPath,
} from '../../../../shared/routes/booking-paths';
import {
  PAYMENT_MARK,
  cleanUpDonePage,
  renderDonePage,
} from '../../testing/done-step-harness';
import { makeDetail } from '../../testing/fake-appointment-detail-api';
import { DONE_TEXT, ENDED_SENTENCES } from './done-messages';

// booking F7: nội dung của Bước 6 theo `trangThai` (TRACKING 3.36 F7-G). HTS-01…HTS-04 là [đề xuất] (PLAN booking mục 7.42); WZ-11. CHỈ `DaXacNhan` được hiện "Đặt lịch thành công":
// lịch ở trạng thái khác mà hiện chữ đó là tuyên bố sai. Dữ liệu giả; không gọi backend thật.
afterEach(cleanUpDonePage);

const success = () => screen.queryByText(DONE_TEXT.successTitle);
const h1 = (name: string) => screen.findByRole('heading', { level: 1, name });
const costRegion = () => screen.queryByRole('region', { name: 'Chi phí' });

// Một thông báo trạng thái KHÔNG phải phiếu: không "Đặt lịch thành công", không thẻ chi phí, không số "Thu tại quầy", nhưng luôn có hai nút
function expectNotAReceipt() {
  expect(success()).toBeNull();
  expect(costRegion()).toBeNull();
  expect(screen.queryByText('Thu tại quầy')).toBeNull();
  expect(
    screen.getByRole('link', { name: DONE_TEXT.myAppointments }),
  ).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);
}

describe('HTS nội dung theo trạng thái', () => {
  it('HTS-01 WZ-11 `DaXacNhan`: "Đặt lịch thành công" và câu của Figma, đúng một `h1`', async () => {
    renderDonePage();

    await h1(DONE_TEXT.successTitle);
    expect(screen.getByText(DONE_TEXT.successNote)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Chi phí' })).toBeInTheDocument();
  });

  it('HTS-02 WZ-11 `ChoThanhToan`: KHÔNG "Đặt lịch thành công"; câu chờ thanh toán; "Tiếp tục thanh toán" tới trang Thanh toán của đúng mã; không thẻ chi phí', async () => {
    const { router } = renderDonePage({
      before: (api) => {
        api.detail = makeDetail({
          trangThai: 'ChoThanhToan',
          hanThanhToan: '2026-10-19T03:15:00.000Z',
        });
      },
    });

    await h1(DONE_TEXT.pendingTitle);
    expect(screen.getByText(DONE_TEXT.pendingNote)).toBeInTheDocument();
    expect(screen.getByText('Chờ thanh toán')).toBeInTheDocument();
    expectNotAReceipt();

    const pay = screen.getByRole('link', { name: DONE_TEXT.payNow });
    expect(pay).toHaveAttribute('href', bookingPaymentPath('CP20261020001'));
    fireEvent.click(pay);
    expect(await screen.findByText(PAYMENT_MARK)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      '/dat-lich/thanh-toan/CP20261020001',
    );
  });

  it.each([
    ['DaHuy', 'Đã hủy', ENDED_SENTENCES.DaHuy],
    ['VangMat', 'Vắng mặt', ENDED_SENTENCES.VangMat],
    ['HoanThanh', 'Hoàn thành', ENDED_SENTENCES.HoanThanh],
    ['DaTiepDon', 'Đã tiếp đón', ENDED_SENTENCES.DaTiepDon],
  ] as const)(
    'HTS-03 WZ-11 `%s`: chip "%s", câu đúng trạng thái, về "Lịch hẹn của tôi"; không phiếu thành công, không "Thu tại quầy" dù cổng `payment` có số',
    async (trangThai, chip, sentence) => {
      renderDonePage({
        before: (api) => {
          api.detail = makeDetail({
            trangThai,
            // Có số của cổng `payment` mà thẻ chi phí vẫn không được vẽ
            thanhToan: { daThu: '100000.00', conPhaiThu: '200000.00' },
          });
        },
      });

      await h1(DONE_TEXT.statusTitle);
      expect(screen.getByText(chip)).toBeInTheDocument();
      expect(screen.getByText(sentence)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: DONE_TEXT.payNow })).toBeNull();
      expectNotAReceipt();
    },
  );

  it.each(['DaDoiLich', 'MA_LA'])(
    'HTS-04 WZ-11 mã trạng thái lạ "%s": câu trung tính, chip "Chưa xác định", không lộ mã thô, không phiếu',
    async (trangThai) => {
      renderDonePage({
        before: (api) => {
          api.detail = makeDetail({ trangThai });
        },
      });

      await h1(DONE_TEXT.statusTitle);
      expect(screen.getByText(DONE_TEXT.unknownState)).toBeInTheDocument();
      expect(screen.getByText('Chưa xác định')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(trangThai);
      expectNotAReceipt();
    },
  );
});
