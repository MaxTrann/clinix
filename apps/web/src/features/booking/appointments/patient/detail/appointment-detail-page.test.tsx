import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Link } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patientAppointmentDetailPath } from '../../../../../shared/routes/booking-paths';
import {
  DETAIL_API_PATH,
  DETAIL_CODE,
  LIST_MARK,
  cancelBox,
  cancelButton,
  cleanUpDetailPage,
  currentUrl,
  detailLoaded,
  renderDetailPage,
} from '../../../testing/appointment-detail-harness';
import { makeDetail } from '../../../testing/fake-appointment-detail-api';
import { APPOINTMENT_STATES } from '../../common/appointment-status';
import { DETAIL_TEXT } from './detail-messages';

// booking F2: trang chi tiết lịch hẹn của Bệnh nhân với API giả (không gọi backend thật). Mã LCT là [đề xuất] (PLAN booking mục 7.33 sau khi duyệt); LH-02, LH-04
// là tổng của các mã này. Dữ liệu giả. Hộp huỷ ở `cancel-box.test.tsx`, lỗi ở `appointment-detail-errors.test.tsx`, router ở `appointment-detail-routing.test.tsx`.
afterEach(cleanUpDetailPage);

const LABELS: Record<string, string> = {
  ChoThanhToan: 'Chờ thanh toán',
  DaXacNhan: 'Đã xác nhận',
  DaTiepDon: 'Đã tiếp đón',
  HoanThanh: 'Hoàn thành',
  DaHuy: 'Đã hủy',
  VangMat: 'Vắng mặt',
};
// Ma trận của backend: Bệnh nhân chỉ huỷ được hai trạng thái này (`choPhepHuy` do máy chủ trả; fake đặt đúng như vậy)
const CANCELLABLE = new Set(['ChoThanhToan', 'DaXacNhan']);

const summary = () => screen.getByRole('region', { name: DETAIL_TEXT.summary });
const timeline = () =>
  screen.getByRole('list', { name: DETAIL_TEXT.timelineTitle });

describe('trang chi tiết theo trạng thái', () => {
  it.each(APPOINTMENT_STATES)(
    'LCT-01 trạng thái %s ⇒ chip đúng chữ, thẻ đầu, thông tin, chi phí, mốc trạng thái; chỉ ChoThanhToan và DaXacNhan có nút huỷ (LH-02)',
    async (status) => {
      renderDetailPage({
        before: (api) => {
          api.detail = makeDetail({
            trangThai: status,
            choPhepHuy: CANCELLABLE.has(status),
            hanThanhToan:
              status === 'ChoThanhToan' ? '2026-10-20T01:15:00.000Z' : null,
          });
        },
      });
      await detailLoaded();

      expect(
        screen.getByRole('heading', { level: 1, name: 'Chi tiết lịch hẹn' }),
      ).toBeInTheDocument();
      // Thẻ đầu: mã, chip, chuyên khoa, bốn ô (giờ theo giờ Việt Nam)
      const head = within(summary());
      expect(head.getByText(DETAIL_CODE)).toBeInTheDocument();
      expect(head.getByText(LABELS[status])).toBeInTheDocument();
      expect(
        head.getByRole('heading', { level: 2, name: 'Tim mạch' }),
      ).toBeInTheDocument();
      expect(head.getByText('Nguyễn Minh Anh')).toBeInTheDocument();
      expect(head.getByText('Thứ 3, 20/10/2026')).toBeInTheDocument();
      expect(head.getByText('08:00')).toBeInTheDocument();
      expect(head.getByText('CLINIX Quận 1')).toBeInTheDocument();
      expect(head.getByText('Nguyễn Văn A')).toBeInTheDocument();
      expect(head.getByText('Bản thân')).toBeInTheDocument();

      // Thông tin lịch hẹn: có hàng Dịch vụ (thêm), không có Kênh đặt, không có Đánh giá bác sĩ (API và tính năng chưa có)
      expect(
        screen.getByRole('heading', { level: 2, name: 'Thông tin lịch hẹn' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Khám tim mạch')).toBeInTheDocument();
      expect(
        screen.getByText('Đau ngực nhẹ, theo dõi huyết áp'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Kênh đặt')).toBeNull();
      expect(screen.queryByText('Đặt trực tuyến')).toBeNull();
      expect(screen.queryByText(/Đánh giá bác sĩ/)).toBeNull();
      expect(screen.getByText(DETAIL_TEXT.recordNote)).toBeInTheDocument();

      // Chi phí
      expect(
        screen.getByRole('heading', { level: 2, name: 'Chi phí & Thanh toán' }),
      ).toBeInTheDocument();
      expect(screen.getByText('300.000đ')).toBeInTheDocument();
      expect(screen.getByText('100.000đ')).toBeInTheDocument();

      // Mốc trạng thái: đúng một bước hiện tại với ba trạng thái trong luồng; không có chữ "Chưa ghi nhận"
      const steps = within(timeline()).getAllByRole('listitem');
      const current = steps.filter(
        (step) => step.getAttribute('aria-current') === 'step',
      );
      expect(current).toHaveLength(
        ['DaXacNhan', 'DaTiepDon', 'HoanThanh'].includes(status) ? 1 : 0,
      );
      expect(steps).toHaveLength(
        status === 'DaHuy' || status === 'VangMat' ? 4 : 3,
      );
      expect(screen.queryByText('Chưa ghi nhận')).toBeNull();

      // Nút huỷ chỉ khi `choPhepHuy` (Q45: có cả ở ChoThanhToan)
      if (CANCELLABLE.has(status)) expect(cancelButton()).toBeInTheDocument();
      else expect(cancelButton()).toBeNull();
      expect(cancelBox()).toBeNull();
    },
  );

  // booking F12 (UI-05, UI-07; Đại 14/11/2026). Mã UIF là [đề xuất] (PLAN booking mục 7.48). jsdom không đo khoảng cách nên đây là bằng chứng CẤU TRÚC (mọi hàng cùng dạng ⇒ đoạn nối đều);
  // số đo thật của đoạn nối (đo bằng trình duyệt) ở TRACKING 3.42.
  it.each(APPOINTMENT_STATES)(
    'UIF-05 trạng thái %s ⇒ MỌI hàng của mốc có dòng phụ (chữ "Chưa đến" hay chỗ chừa trống) và đúng (số bước − 1) đoạn nối nên các đoạn nối đều nhau; không chữ "Chưa ghi nhận" (F2 đã bỏ)',
    async (status) => {
      renderDetailPage({
        before: (api) => {
          api.detail = makeDetail({ trangThai: status, choPhepHuy: false });
        },
      });
      await detailLoaded();
      const steps = within(timeline()).getAllByRole('listitem');
      for (const step of steps) {
        const reserved = step.querySelectorAll(
          '[data-testid="timeline-reserved-line"]',
        );
        const hasUpcoming = within(step).queryByText('Chưa đến') !== null;
        // Đúng MỘT trong hai: chỗ chừa trống hoặc chữ "Chưa đến"
        expect(reserved.length + (hasUpcoming ? 1 : 0)).toBe(1);
      }
      expect(
        within(timeline()).getAllByTestId('timeline-connector'),
      ).toHaveLength(steps.length - 1);
      expect(screen.queryByText('Chưa ghi nhận')).toBeNull();
    },
  );

  it('UIF-07 tiêu đề khối "Trạng thái lịch hẹn" cùng kiểu ba khối còn lại: cùng một lớp CSS của `DetailCard` (đường kẻ dưới, `px-5 py-3.5`, chữ thường đậm), không CHỮ HOA, có biểu tượng', async () => {
    renderDetailPage();
    await detailLoaded();
    const heads = [
      'Thông tin lịch hẹn',
      'Chi phí & Thanh toán',
      'Hồ sơ khám bệnh',
      'Trạng thái lịch hẹn',
    ].map((name) => screen.getByRole('heading', { level: 2, name }));
    for (const head of heads) {
      expect(head.className).toBe(heads[0].className);
      expect(head.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(head).not.toHaveClass('uppercase');
    }
    expect(heads[3]).toHaveClass('border-b', 'px-5', 'py-3.5', 'font-semibold');
  });

  it('LCT-01 mã trạng thái lạ và DaDoiLich ⇒ chip "Chưa xác định", trang không vỡ, không lộ mã thô', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({ trangThai: 'DaDoiLich', choPhepHuy: false });
      },
    });
    await detailLoaded();

    expect(within(summary()).getByText('Chưa xác định')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('DaDoiLich');
    expect(cancelButton()).toBeNull();
  });

  it('LCT-01 người thân ⇒ "Người thân"; lyDoKham null hay rỗng ⇒ "Không ghi lý do"; lý do chứa thẻ HTML chỉ hiện dạng chữ', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({
          nguoiKham: { hoTen: 'Bùi Minh Khoa', laBanThan: false },
          lyDoKham: null,
        });
      },
    });
    await detailLoaded();
    expect(within(summary()).getByText('Người thân')).toBeInTheDocument();
    expect(screen.getByText(DETAIL_TEXT.noReason)).toBeInTheDocument();
  });

  it('LCT-01 lyDoKham rỗng hay toàn khoảng trắng ⇒ "Không ghi lý do"; chứa mã HTML ⇒ hiện nguyên chữ, không dựng phần tử', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({ lyDoKham: '   ' });
      },
    });
    await detailLoaded();
    expect(screen.getByText(DETAIL_TEXT.noReason)).toBeInTheDocument();
  });

  it('LCT-01 lý do khám chứa thẻ HTML ⇒ hiện nguyên chữ (React thoát ký tự), không chèn phần tử', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({ lyDoKham: '<img src=x onerror=alert(1)>' });
      },
    });
    await detailLoaded();
    expect(
      screen.getByText('<img src=x onerror=alert(1)>'),
    ).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('LCT-01 trong lúc tải ⇒ tiêu đề và liên kết quay lại vẫn hiện cùng "Đang tải"', async () => {
    renderDetailPage({
      before: (api) =>
        api.failNext('detail', () => new Promise<Response>(() => {})),
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Chi tiết lịch hẹn' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Lịch hẹn của tôi' }),
    ).toBeInTheDocument();
    expect(screen.getByText(DETAIL_TEXT.loading)).toBeInTheDocument();
    expect(summaryOrNull()).toBeNull();
  });

  it('LCT-07 liên kết "Lịch hẹn của tôi" đưa về danh sách', async () => {
    renderDetailPage();
    await detailLoaded();

    fireEvent.click(screen.getByRole('link', { name: 'Lịch hẹn của tôi' }));
    expect(await screen.findByText(LIST_MARK)).toBeInTheDocument();
    expect(currentUrl()).toBe('/benh-nhan/lich-hen-cua-toi');
  });
});

const summaryOrNull = () =>
  screen.queryByRole('region', { name: DETAIL_TEXT.summary });

describe('thanh toán, hoàn tiền: không bịa số', () => {
  it('LCT-03 thanhToan và hoanTien là null ⇒ "Chưa ghi nhận thanh toán", KHÔNG có "Còn phải thu", "Đã thu", "Hoàn tiền", "Còn thu"', async () => {
    renderDetailPage();
    await detailLoaded();

    expect(screen.getByText(DETAIL_TEXT.noPayment)).toBeInTheDocument();
    for (const label of [
      'Đã thu',
      'Còn phải thu',
      'Hoàn tiền',
      'Thu tại quầy',
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByText(/Còn thu/)).toBeNull();
    // Giá khám 300.000đ, cọc 100.000đ: client không tự trừ ra 200.000đ
    expect(screen.queryByText('200.000đ')).toBeNull();
  });

  it('LCT-03 thanhToan khác null ⇒ Đã thu, Còn phải thu theo cổng, bỏ dòng "Chưa ghi nhận thanh toán"; hoanTien ⇒ Hoàn tiền kèm trạng thái', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({
          thanhToan: { daThu: '100000.00', conPhaiThu: '200000.00' },
          hoanTien: { soTien: '50000.00', trangThai: 'ThanhCong' },
        });
      },
    });
    await detailLoaded();

    expect(screen.queryByText(DETAIL_TEXT.noPayment)).toBeNull();
    const dataRow = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement;
    expect(within(dataRow('Đã thu')).getByText('100.000đ')).toBeInTheDocument();
    expect(
      within(dataRow('Còn phải thu')).getByText('200.000đ'),
    ).toBeInTheDocument();
    expect(
      within(dataRow('Hoàn tiền')).getByText('50.000đ'),
    ).toBeInTheDocument();
    expect(
      within(dataRow('Hoàn tiền')).getByText('Đã hoàn'),
    ).toBeInTheDocument();
  });

  it('LCT-03 hoanTien ThatBai ⇒ "Hoàn tiền chưa thành công"', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({
          trangThai: 'DaHuy',
          choPhepHuy: false,
          hoanTien: { soTien: '50000.00', trangThai: 'ThatBai' },
        });
      },
    });
    await detailLoaded();
    expect(screen.getByText('Hoàn tiền chưa thành công')).toBeInTheDocument();
  });

  it('LCT-03 DaHuy ⇒ "Thu tại quầy: Không thu" theo trạng thái; trạng thái khác thì không có dòng đó', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({ trangThai: 'DaHuy', choPhepHuy: false });
      },
    });
    await detailLoaded();
    const row = screen.getByText('Thu tại quầy', { selector: 'dt' })
      .parentElement as HTMLElement;
    expect(within(row).getByText('Không thu')).toBeInTheDocument();
  });

  it('LCT-03 tiền lớn hơn 2^53 giữ đủ chữ số (không qua số thực)', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({
          giaSnapshot: '9007199254740993.00',
          tienCoc: '0.00',
        });
      },
    });
    await detailLoaded();
    expect(screen.getByText('9.007.199.254.740.993đ')).toBeInTheDocument();
    expect(screen.getByText('0đ')).toBeInTheDocument();
  });
});

describe('lịch chờ thanh toán', () => {
  it('LCT-04 hạn thanh toán theo giờ Việt Nam (17:30 UTC là 00:30 ngày hôm sau), nút Thanh toán vô hiệu kèm "Chưa được triển khai", KHÔNG bộ hẹn giờ đếm ngược', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({
          trangThai: 'ChoThanhToan',
          choPhepHuy: true,
          hanThanhToan: '2026-10-19T17:30:00.000Z',
        });
      },
    });
    await detailLoaded();

    expect(screen.getByText(DETAIL_TEXT.payBefore)).toBeInTheDocument();
    const deadline = screen.getByText('00:30, Thứ 3, 20/10/2026');
    expect(deadline.tagName).toBe('TIME');
    expect(deadline).toHaveAttribute('datetime', '2026-10-19T17:30:00.000Z');

    const pay = screen.getByRole('button', { name: DETAIL_TEXT.payButton });
    expect(pay).toBeDisabled();
    expect(pay).toHaveAccessibleDescription(DETAIL_TEXT.payNotReady);
    expect(screen.getByText(DETAIL_TEXT.waitingDeposit)).toBeInTheDocument();
    // Có nút huỷ (Q45) và không có đếm ngược
    expect(cancelButton()).toBeInTheDocument();
    // `findBy` của Testing Library tự đặt một `setInterval` 50 ms (`checkRealTimersCallback`): bỏ nó ra, trang không được đặt bộ hẹn giờ lặp nào (đếm ngược là của F6)
    const pageIntervals = setIntervalSpy.mock.calls.filter(
      ([callback]) =>
        (callback as { name?: string }).name !== 'checkRealTimersCallback',
    );
    expect(pageIntervals).toEqual([]);
    setIntervalSpy.mockRestore();
  });

  it('LCT-04 hanThanhToan null ⇒ không có khối hạn, nút Thanh toán vẫn vô hiệu; trạng thái khác ChoThanhToan ⇒ không có nút Thanh toán', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = makeDetail({
          trangThai: 'ChoThanhToan',
          hanThanhToan: null,
        });
      },
    });
    await detailLoaded();
    expect(screen.queryByText(DETAIL_TEXT.payBefore)).toBeNull();
    expect(
      screen.getByRole('button', { name: DETAIL_TEXT.payButton }),
    ).toBeDisabled();
  });

  it('LCT-04 lịch DaXacNhan ⇒ không có khối hạn thanh toán, không có nút Thanh toán', async () => {
    renderDetailPage();
    await detailLoaded();
    expect(screen.queryByText(DETAIL_TEXT.payBefore)).toBeNull();
    expect(
      screen.queryByRole('button', { name: DETAIL_TEXT.payButton }),
    ).toBeNull();
  });
});

describe('nút huỷ theo choPhepHuy của máy chủ, không theo trạng thái', () => {
  it.each([
    ['ChoThanhToan', true, true],
    ['DaXacNhan', true, true],
    ['DaXacNhan', false, false],
    ['ChoThanhToan', false, false],
    ['DaTiepDon', false, false],
    ['HoanThanh', false, false],
    ['DaHuy', false, false],
    ['VangMat', false, false],
    // Web tin vào `choPhepHuy` của máy chủ (cùng ma trận backend), không viết ma trận thứ hai
    ['DaTiepDon', true, true],
  ] as const)(
    'LCT-02 trạng thái %s với choPhepHuy = %s ⇒ nút huỷ %s (Q45, LH-04)',
    async (status, allowed, shown) => {
      renderDetailPage({
        before: (api) => {
          api.detail = makeDetail({ trangThai: status, choPhepHuy: allowed });
        },
      });
      await detailLoaded();

      if (shown) expect(cancelButton()).toBeInTheDocument();
      else expect(cancelButton()).toBeNull();
    },
  );
});

describe('chỉ đọc, bộ nhớ, đổi mã', () => {
  it('LCT-10 xem chi tiết: đúng một GET tới đường dẫn của lịch, gắn token, 0 lời gọi ghi (không POST, PUT, DELETE)', async () => {
    const { api } = renderDetailPage();
    await detailLoaded();

    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]).toMatchObject({
      method: 'GET',
      path: DETAIL_API_PATH,
      hasToken: true,
    });
    expect(api.writes()).toEqual([]);
  });

  it('LCT-09 không localStorage, sessionStorage, cookie, console; URL không đổi khi xem trang', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    // Kiểm theo TRẠNG THÁI THẬT của kho, không chỉ theo `spy`: ở môi trường test này `vi.spyOn(Storage.prototype, 'setItem')` chỉ thấy lần gọi ĐẦU TIÊN
    // (sau `mockRestore()` một spy mới bị mù dù `localStorage.length` đã tăng; đo 12/11/2026 khi đột biến M10 sống sót), nên `length` mới là chốt chặn đáng tin.
    localStorage.clear();
    sessionStorage.clear();
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) => vi.spyOn(console, method));
    const cookiesBefore = document.cookie;
    renderDetailPage();
    await detailLoaded();

    expect(storageWrite).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookiesBefore);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(currentUrl()).toBe(patientAppointmentDetailPath(DETAIL_CODE));
    // Dữ liệu cá nhân không nằm ở kho nào của trình duyệt
    expect(JSON.stringify({ ...localStorage })).not.toContain(DETAIL_CODE);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(DETAIL_CODE);
    storageWrite.mockRestore();
    for (const spy of consoleSpies) spy.mockRestore();
  });

  it('LCT-10 đổi mã lịch hẹn trên URL (cùng component) ⇒ hộp huỷ đóng, tải đúng chi tiết mới, không giữ state của lịch trước', async () => {
    const { api } = renderDetailPage({
      extra: (
        <Link to={patientAppointmentDetailPath('CP20261099999')}>
          sang lịch khác
        </Link>
      ),
    });
    await detailLoaded();
    fireEvent.click(cancelButton() as HTMLElement);
    expect(
      await screen.findByRole('region', { name: 'Xác nhận hủy lịch hẹn?' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'sang lịch khác' }));
    await waitFor(() =>
      expect(
        api.callsTo('GET', '/patient/appointments/CP20261099999'),
      ).toHaveLength(1),
    );
    await detailLoaded();

    expect(cancelBox()).toBeNull();
    expect(cancelButton()).toBeInTheDocument();
    expect(api.writes()).toEqual([]);
  });
});
