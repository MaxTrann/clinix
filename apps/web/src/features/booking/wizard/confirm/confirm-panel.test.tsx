import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../../shared/api/error-message';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import {
  DEFAULT_DRAFT,
  renderConfirmPanel,
  type ConfirmHarnessOptions,
} from '../../testing/confirm-step-harness';
import { makeCheckResult } from '../../testing/fake-booking-api';

// booking F5: giao diện Bước 5 "Xác nhận" (Figma `451:2`) với API giả, phần ĐỌC và HIỂN THỊ. WZ-04, WZ-05 (nhãn nút), WZ-06, WZ-07 (lỗi `checks`), WZ-08 (phần Bước 5), WZ-14 (phần Bước 5) của
// PLAN booking 7.15; XNS-01…XNS-09 là [đề xuất] (mục 7.40). Phần GỬI (`POST /booking/appointments`) ở `confirm-create.test.tsx` (XNA).
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const failure = (status: number, maLoi: string, chiTiet?: unknown) =>
  json(status, { maLoi, thongBao: 'câu của API', chiTiet });

const T24 = { soGioTruocToiThieu: 24, tyLeHoan: 100 };
const T2 = { soGioTruocToiThieu: 2, tyLeHoan: 50 };
const T0 = { soGioTruocToiThieu: 0, tyLeHoan: 0 };

const confirmButton = () =>
  screen.getByRole('button', { name: /^(Xác nhận|Đang xử lý)/ });
const detailsRegion = () =>
  screen.getByRole('region', { name: 'Chi tiết lịch hẹn' });
const costRegion = () => screen.getByRole('region', { name: 'Chi phí' });
// Hàng "nhãn, giá trị" chứa nhãn `label` (cả thẻ chi tiết lẫn thẻ chi phí đều là một `div` bao dt và dd)
const row = (region: HTMLElement, label: string) =>
  within(region).getByText(label).closest('div')!;

async function ready(options?: ConfirmHarnessOptions) {
  const view = renderConfirmPanel(options);
  await screen.findByRole('region', { name: 'Chi tiết lịch hẹn' });
  return view;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('booking F5 — tóm tắt Bước 5 (WZ-04)', () => {
  it('XNS-01 WZ-04 đủ trường khi cọc > 0: dịch vụ, bác sĩ kèm chuyên khoa, chi nhánh kèm địa chỉ, giờ Việt Nam (17:30 UTC ⇒ 00:30 hôm sau), người khám, lý do, giá, cọc, chính sách hoàn, số dư ví', async () => {
    const { api } = await ready({
      draft: { ...DEFAULT_DRAFT, lyDoKham: 'đau lưng 2 tuần' },
      before: (fake) => {
        fake.check = makeCheckResult({
          dichVu: { ten: 'Khám tim mạch', thoiLuongPhut: 30 },
          chuyenKhoa: 'Nội tim mạch',
          thoiGian: '2026-10-19T17:30:00.000Z',
          chinhSachHoan: [T24, T2, T0],
          soDuVi: '350000.00',
        });
      },
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Xác nhận thông tin' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Kiểm tra lại trước khi hoàn tất. Bạn có thể sửa từng mục.',
      ),
    ).toBeInTheDocument();

    const details = detailsRegion();
    expect(row(details, 'Dịch vụ')).toHaveTextContent('Khám tim mạch');
    expect(row(details, 'Bác sĩ')).toHaveTextContent('ThS.BS. Nguyễn Minh Anh');
    expect(row(details, 'Bác sĩ')).toHaveTextContent('Nội tim mạch');
    expect(row(details, 'Chi nhánh')).toHaveTextContent(
      'CLINIX Chi nhánh Quận 3',
    );
    expect(row(details, 'Chi nhánh')).toHaveTextContent(
      '123 Nguyễn Thị Minh Khai',
    );
    // 17:30 UTC ngày 19/10 là 00:30 ngày 20/10/2026 (Thứ 3) theo giờ Việt Nam
    expect(row(details, 'Ngày và giờ khám')).toHaveTextContent(
      '00:30 · Thứ 3, 20/10/2026',
    );
    expect(row(details, 'Người khám')).toHaveTextContent('Nguyễn Văn A');
    expect(row(details, 'Người khám')).toHaveTextContent('Bản thân');
    expect(row(details, 'Lý do khám')).toHaveTextContent('đau lưng 2 tuần');

    const cost = costRegion();
    expect(row(cost, 'Giá dịch vụ')).toHaveTextContent('300.000đ');
    expect(row(cost, 'Tổng giá khám')).toHaveTextContent('300.000đ');
    expect(row(cost, 'Cọc cần thanh toán')).toHaveTextContent('100.000đ');
    expect(row(cost, 'Số dư ví hiện tại')).toHaveTextContent('350.000đ');
    expect(
      within(cost).getByRole('heading', {
        name: 'Chính sách hoàn cọc khi hủy lịch',
      }),
    ).toBeInTheDocument();
    expect(
      within(cost)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Hủy từ 24 giờ trở lên trước giờ hẹn: hoàn 100%',
      'Hủy từ 2 đến dưới 24 giờ trước giờ hẹn: hoàn 50%',
      'Hủy dưới 2 giờ trước giờ hẹn: không hoàn',
    ]);
    expect(
      within(cost).getByText(
        'Phần còn lại thanh toán tại quầy trước khi tiếp đón.',
      ),
    ).toBeInTheDocument();
    // Vào Bước 5 chỉ có `checks` (chỉ đọc), KHÔNG tạo lịch, KHÔNG giữ chỗ
    expect(api.checkBodies).toEqual([
      { khungGioId: '5', hoSoNguoiThanId: null },
    ]);
    expect(api.bookingWrites()).toEqual([]);
  });

  it('XNS-01 người thân: dòng phụ "Người thân" (từ `tomTat`, không từ bản nháp) và `checks` theo đúng hồ sơ trong bản nháp', async () => {
    const { api } = await ready({
      draft: { ...DEFAULT_DRAFT, hoSoNguoiThanId: '101' },
      before: (fake) => {
        fake.check = makeCheckResult({
          nguoiKham: { hoTen: 'Nguyễn Thị Bích', laBanThan: false },
        });
      },
    });
    expect(api.checkBodies).toEqual([
      { khungGioId: '5', hoSoNguoiThanId: '101' },
    ]);
    expect(row(detailsRegion(), 'Người khám')).toHaveTextContent(
      'Nguyễn Thị Bích',
    );
    expect(row(detailsRegion(), 'Người khám')).toHaveTextContent('Người thân');
    expect(row(detailsRegion(), 'Người khám')).not.toHaveTextContent(
      'Bản thân',
    );
  });

  it('XNS-01 mỗi số tiền là chuỗi của API, đúng chỗ, không đổi qua Number (số lớn hơn 2^53, "0.10")', async () => {
    await ready({
      before: (fake) => {
        fake.check = makeCheckResult({
          giaDichVu: '9007199254740993.00',
          phuPhi: '0.10',
          giaApDung: '9007199254740993.10',
          tienCoc: '1234567.00',
          soDuVi: '0.10',
        });
      },
    });
    const cost = costRegion();
    expect(row(cost, 'Giá dịch vụ')).toHaveTextContent(
      '9.007.199.254.740.993đ',
    );
    expect(row(cost, 'Phụ phí bác sĩ')).toHaveTextContent('0đ');
    expect(row(cost, 'Tổng giá khám')).toHaveTextContent(
      '9.007.199.254.740.993đ',
    );
    expect(row(cost, 'Cọc cần thanh toán')).toHaveTextContent('1.234.567đ');
    expect(row(cost, 'Số dư ví hiện tại')).toHaveTextContent('0đ');
  });

  it('XNS-02 WZ-04 số dư ví: `null` ⇒ KHÔNG có dòng (không phải "không đủ tiền"); "0.00" ⇒ hiện "0đ"', async () => {
    await ready({
      before: (fake) => (fake.check = makeCheckResult({ soDuVi: null })),
    });
    expect(within(costRegion()).queryByText('Số dư ví hiện tại')).toBeNull();
    expect(costRegion()).not.toHaveTextContent('Số dư');
  });

  it('XNS-02 số dư ví "0.00" vẫn hiện "0đ" (khác `null`)', async () => {
    await ready({
      before: (fake) => (fake.check = makeCheckResult({ soDuVi: '0.00' })),
    });
    expect(row(costRegion(), 'Số dư ví hiện tại')).toHaveTextContent('0đ');
  });

  it('XNS-03 WZ-04 phụ phí lớn hơn 0 ⇒ hiện dòng "Phụ phí bác sĩ" đúng số; "Tổng giá khám" là số của API (KHÔNG cộng ở client): API giả cố ý đặt tổng khác giá dịch vụ cộng phụ phí', async () => {
    await ready({
      before: (fake) => {
        fake.check = makeCheckResult({
          giaDichVu: '300000.00',
          phuPhi: '50000.00',
          giaApDung: '999000.00',
        });
      },
    });
    const cost = costRegion();
    expect(row(cost, 'Giá dịch vụ')).toHaveTextContent('300.000đ');
    expect(row(cost, 'Phụ phí bác sĩ')).toHaveTextContent('50.000đ');
    expect(row(cost, 'Tổng giá khám')).toHaveTextContent('999.000đ');
    expect(cost).not.toHaveTextContent('350.000đ');
  });

  it('XNS-03 phụ phí bằng 0 ⇒ ẩn dòng (khớp Figma khi không có phụ phí); không bao giờ có số "Còn lại tại quầy" (không trừ tiền ở client)', async () => {
    await ready({
      before: (fake) => {
        fake.check = makeCheckResult({
          giaDichVu: '300000.00',
          phuPhi: '0.00',
          giaApDung: '300000.00',
          tienCoc: '100000.00',
        });
      },
    });
    const cost = costRegion();
    expect(within(cost).queryByText('Phụ phí bác sĩ')).toBeNull();
    expect(within(cost).queryByText('Còn lại tại quầy')).toBeNull();
    // Phép trừ 300.000 − 100.000 không được tự tính và hiện ra
    expect(cost).not.toHaveTextContent('200.000đ');
  });
});

describe('booking F5 — cọc 0đ và cọc > 0 (XNS-04)', () => {
  it('XNS-04 WZ-05 cọc 0đ: nút "Xác nhận đặt lịch"; KHÔNG dòng cọc, chính sách hoàn, câu giữ chỗ, câu chính sách cọc', async () => {
    await ready({
      before: (fake) => {
        fake.check = makeCheckResult({
          tienCoc: '0.00',
          chinhSachHoan: null,
          soDuVi: null,
        });
      },
    });
    expect(confirmButton()).toHaveTextContent('Xác nhận đặt lịch');
    const cost = costRegion();
    expect(within(cost).queryByText('Cọc cần thanh toán')).toBeNull();
    expect(
      within(cost).queryByText('Chính sách hoàn cọc khi hủy lịch'),
    ).toBeNull();
    expect(cost).not.toHaveTextContent('giữ chỗ');
    expect(cost).not.toHaveTextContent('Chính sách cọc là giá trị đề xuất');
    expect(
      within(cost).getByText(
        'Phần còn lại thanh toán tại quầy trước khi tiếp đón.',
      ),
    ).toBeInTheDocument();
  });

  it('XNS-04 cọc > 0: nút "Xác nhận và thanh toán cọc"; có câu giữ chỗ KHÔNG nêu số phút và câu chính sách cọc của Figma', async () => {
    await ready();
    expect(confirmButton()).toHaveTextContent('Xác nhận và thanh toán cọc');
    const cost = costRegion();
    expect(cost).toHaveTextContent(
      'Khi bấm xác nhận, khung giờ được giữ chỗ trong thời gian có hạn để bạn hoàn tất cọc.',
    );
    // Số phút là cấu hình của máy chủ mà `checks` không trả: không có con số cứng ở client
    expect(cost).not.toHaveTextContent('15 phút');
    expect(cost).toHaveTextContent(
      'Chính sách cọc là giá trị đề xuất mô phỏng, chưa phải quy định chính thức của CLINIX.',
    );
  });

  it('XNS-04 cọc > 0 mà chưa có mốc hoàn (`[]`) ⇒ "Không hoàn cọc khi hủy lịch."', async () => {
    await ready({
      before: (fake) => (fake.check = makeCheckResult({ chinhSachHoan: [] })),
    });
    expect(costRegion()).toHaveTextContent('Không hoàn cọc khi hủy lịch.');
  });
});

describe('booking F5 — tải và lỗi `checks` (XNS-05)', () => {
  it('XNS-05 đang tải: nút chính TẮT, vùng `aria-busy`, chưa có thẻ nào; chưa có POST tạo lịch', async () => {
    const { api } = renderConfirmPanel({
      before: (fake) =>
        fake.failCheckNext(() => new Promise<Response>(() => {})),
    });
    // `<output>` của `LocationProbe` cũng có vai trò `status`, nên tìm theo chữ
    const loading = await screen.findByText('Đang kiểm tra lịch hẹn...');
    expect(loading).toHaveAttribute('role', 'status');
    expect(loading.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveTextContent('Xác nhận');
    expect(
      screen.queryByRole('region', { name: 'Chi tiết lịch hẹn' }),
    ).toBeNull();
    expect(api.count('POST', '/booking/appointments')).toBe(0);
  });

  it.each<[string, () => Response, string, boolean]>([
    [
      'A2 đã đặt',
      () => failure(409, 'KHUNG_GIO_DA_DAT'),
      'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
      true,
    ],
    [
      'A2 đang giữ',
      () => failure(409, 'KHUNG_GIO_DANG_GIU'),
      'Khung giờ này đang được người khác giữ chỗ. Vui lòng chọn khung giờ khác hoặc thử lại sau ít phút.',
      true,
    ],
    [
      'A3 trùng giờ',
      () =>
        failure(409, 'LICH_HEN_TRUNG_THOI_GIAN', {
          maLichHen: 'CLX-20261019-7K3M9',
        }),
      'Hồ sơ này đã có lịch hẹn CLX-20261019-7K3M9 trùng thời gian.',
      false,
    ],
    [
      'A3 vượt tối đa',
      () => failure(409, 'VUOT_SO_LICH_HEN_TOI_DA', { toiDa: 3 }),
      'Hồ sơ này đã có 3 lịch hẹn đang hoạt động, là mức tối đa.',
      false,
    ],
    [
      'A6 chi nhánh nghỉ',
      () => failure(409, 'CHI_NHANH_NGHI', { thuTrongTuan: 7 }),
      'Chi nhánh nghỉ vào Chủ nhật.',
      true,
    ],
    [
      'A6 ngoài giờ',
      () =>
        failure(409, 'NGOAI_GIO_HOAT_DONG', {
          gioMo: '07:30',
          gioDong: '17:00',
        }),
      'Ngoài giờ hoạt động, chi nhánh mở cửa từ 07:30 đến 17:00.',
      true,
    ],
    [
      'A4 khoá no-show',
      () => failure(403, 'DAT_LICH_BI_KHOA_NO_SHOW'),
      'Tài khoản đang bị khoá đặt lịch trực tuyến do vắng mặt nhiều lần. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.',
      false,
    ],
    [
      'hồ sơ ngừng',
      () => failure(409, 'HO_SO_NGUOI_THAN_DA_NGUNG'),
      'Hồ sơ này đã ngừng sử dụng. Vui lòng chọn hồ sơ khác.',
      false,
    ],
  ])(
    'XNS-05 WZ-06 WZ-07 lỗi `checks` %s ⇒ câu theo `maLoi`, nút chính TẮT, không có POST tạo lịch',
    async (_name, respond, message, hasReselect) => {
      const { api } = renderConfirmPanel({
        before: (fake) => fake.failCheckNext(() => respond()),
      });
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(confirmButton()).toBeDisabled();
      expect(
        Boolean(screen.queryByRole('link', { name: 'Chọn lại dịch vụ' })),
      ).toBe(hasReselect);
      expect(screen.queryByRole('region', { name: 'Chi phí' })).toBeNull();
      expect(api.count('POST', '/booking/appointments')).toBe(0);
    },
  );

  it('XNS-05 mạng đứt ⇒ câu chung kèm `Thử lại`, nút TẮT; `Thử lại` gọi lại `checks` rồi vẽ tóm tắt và bật nút', async () => {
    const { api } = renderConfirmPanel({
      before: (fake) =>
        fake.failCheckNext(() => {
          throw new TypeError('fetch failed');
        }),
    });
    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('region', { name: 'Chi tiết lịch hẹn' });
    expect(api.count('POST', '/booking/checks')).toBe(2);
    expect(confirmButton()).toBeEnabled();
  });

  it('XNS-05 502 HTML, 5xx và mã lạ ⇒ câu chung kèm `Thử lại`', async () => {
    for (const respond of [
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      () => failure(500, 'LOI_HE_THONG'),
      () => failure(409, 'MA_LA'),
    ]) {
      const { unmount } = renderConfirmPanel({
        before: (fake) => fake.failCheckNext(() => respond()),
      });
      expect(
        await screen.findByText(GENERIC_ERROR_MESSAGE),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Thử lại' }),
      ).toBeInTheDocument();
      expect(confirmButton()).toBeDisabled();
      unmount();
    }
  });

  it('XNS-05 `checks` 200 sai hình dạng (thiếu `soDuVi`) ⇒ coi là lỗi, KHÔNG vẽ dữ liệu sai, nút TẮT', async () => {
    renderConfirmPanel({
      before: (fake) => {
        fake.check = makeCheckResult({ soDuVi: undefined });
      },
    });
    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Chi phí' })).toBeNull();
    expect(confirmButton()).toBeDisabled();
  });
});

describe('booking F5 — `Sửa` và `Quay lại` (XNS-06)', () => {
  it('XNS-06 WZ-08 đích của từng liên kết: Người khám, Lý do khám, liên kết đầu trang và `Quay lại` ⇒ Bước 4; Dịch vụ, Bác sĩ, Ngày giờ ⇒ Bước 1 (tạm); Chi nhánh không có `Sửa`', async () => {
    await ready();
    const info = '/dat-lich/thong-tin?khungGioId=5';
    for (const name of [
      'Sửa người khám',
      'Sửa lý do khám',
      'Sửa thông tin người khám',
      'Quay lại',
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', info);
    }
    for (const name of ['Sửa dịch vụ', 'Sửa bác sĩ', 'Sửa ngày và giờ khám']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        '/dat-lich',
      );
    }
    expect(screen.queryByRole('link', { name: 'Sửa chi nhánh' })).toBeNull();
  });

  it('XNS-06 bấm `Sửa người khám` ⇒ tới Bước 4, không lời gọi ghi (bản nháp nằm ở context của wizard, không bị đụng)', async () => {
    const { api, router } = await ready();
    fireEvent.click(screen.getByRole('link', { name: 'Sửa người khám' }));
    await screen.findByText('Bước 4 của luồng đặt lịch');
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/dat-lich/thong-tin?khungGioId=5',
    );
    expect(api.bookingWrites()).toEqual([]);
  });
});

describe('booking F5 — lý do khám (XNS-07)', () => {
  it('XNS-07 WZ-04 không nhập (`null`) ⇒ "Không nhập"', async () => {
    await ready();
    expect(row(detailsRegion(), 'Lý do khám')).toHaveTextContent('Không nhập');
  });

  it('XNS-07 lý do nhiều dòng giữ xuống dòng; ký tự như `<b>` hiện nguyên chữ (không diễn giải HTML)', async () => {
    const reason = 'đau lưng 2 tuần\n<b>khó ngủ</b>';
    const { container } = await ready({
      draft: { ...DEFAULT_DRAFT, lyDoKham: reason },
    });
    const value = within(row(detailsRegion(), 'Lý do khám')).getByText(
      (_text, element) =>
        element?.textContent === reason && element.tagName === 'SPAN',
    );
    expect(value).toHaveClass('whitespace-pre-line');
    expect(container.querySelector('b')).toBeNull();
    expect(row(detailsRegion(), 'Lý do khám')).not.toHaveTextContent(
      'Không nhập',
    );
  });

  it('XNS-07 đúng 500 điểm mã hiện đủ, không cắt', async () => {
    const reason = 'ê'.repeat(500);
    await ready({ draft: { ...DEFAULT_DRAFT, lyDoKham: reason } });
    expect(row(detailsRegion(), 'Lý do khám').textContent).toContain(reason);
  });
});

describe('booking F5 — trợ năng Bước 5 (XNS-09)', () => {
  it('XNS-09 WZ-14 `h1`, hai vùng có tên, thứ tự Tab theo thứ tự đọc, tên riêng của từng nút `Sửa`', async () => {
    const { container } = await ready();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(detailsRegion()).toBeInTheDocument();
    expect(costRegion()).toBeInTheDocument();

    const focusables = [
      ...container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      ),
    ];
    expect(
      focusables.map(
        (element) => element.getAttribute('aria-label') ?? element.textContent,
      ),
    ).toEqual([
      'Sửa thông tin người khám',
      'Sửa dịch vụ',
      'Sửa bác sĩ',
      'Sửa ngày và giờ khám',
      'Sửa người khám',
      'Sửa lý do khám',
      'Quay lại',
      'Xác nhận và thanh toán cọc',
    ]);
    expect(
      new Set(
        focusables.map(
          (element) =>
            element.getAttribute('aria-label') ?? element.textContent,
        ),
      ).size,
    ).toBe(focusables.length);
  });
});
