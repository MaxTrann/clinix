import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { GENERIC_ERROR_MESSAGE } from '../../../../shared/api/error-message';
import {
  DEFAULT_DRAFT,
  renderConfirmPanel,
  type ConfirmHarnessOptions,
} from '../../testing/confirm-step-harness';
import {
  makeCheckResult,
  makeCreatedDone,
  makeCreatedResult,
  type createFakeBookingApi,
} from '../../testing/fake-booking-api';
import { CREATE_FAILURE_TEXT } from './create-failure';

// booking F5: nút xác nhận và lời gọi `POST /booking/appointments` với API giả. WZ-05 (thân gửi), WZ-06, WZ-07, WZ-09 (phần F5), WZ-12, WZ-13 của PLAN booking 7.15;
// XNA-02…XNA-10 và XNS-08 là [đề xuất] (mục 7.40). XNA-01 (điều hướng qua ứng dụng thật) ở `confirm-flow.test.tsx`. Đặt lịch KHÔNG idempotent: mọi ca ở đây đếm SỐ LẦN
// `POST` ở API giả (`api.count`), không đếm lần gọi hàm.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const failure = (
  status: number,
  maLoi: string,
  chiTiet?: unknown,
  extra: object = {},
) => json(status, { maLoi, thongBao: 'câu của API', chiTiet, ...extra });
const CREATE = ['POST', '/booking/appointments'] as const;
type FakeApi = ReturnType<typeof createFakeBookingApi>;

const confirmButton = () =>
  screen.getByRole('button', { name: /^(Xác nhận|Đang xử lý)/ });
const alertBox = () => screen.getByRole('alert');
async function ready(options?: ConfirmHarnessOptions) {
  const view = renderConfirmPanel(options);
  await screen.findByRole('region', { name: 'Chi tiết lịch hẹn' });
  await waitFor(() => expect(confirmButton()).toBeEnabled());
  return view;
}
// Đợi các lời gọi và cập nhật đang chờ chạy xong (để khẳng định "không có lần gửi nào nữa")
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
// Giữ lời gọi tạo lịch tới khi test cho chạy
function hold(api: FakeApi) {
  const box: { release: (response: Response) => void } = { release: () => {} };
  api.failCreateNext(
    () =>
      new Promise<Response>((resolve) => {
        box.release = resolve;
      }),
  );
  return box;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('booking F5 — gửi và thân yêu cầu', () => {
  it('XNA-03 WZ-05 thân gửi đúng từ bản nháp: bản thân `null`, không lý do `null` (KHÔNG chuỗi rỗng), ĐÚNG ba khoá; thành công ⇒ `onCreated` đúng một lần với 201 đã kiểm', async () => {
    const { api, onCreated } = await ready();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(api.createBodies).toStrictEqual([
      { khungGioId: '5', hoSoNguoiThanId: null, lyDoKham: null },
    ]);
    expect(onCreated).toHaveBeenCalledWith(makeCreatedResult());
    expect(api.count(...CREATE)).toBe(1);
  });

  it('XNA-03 người thân (id lớn hơn 2^53) và lý do đã chuẩn hoá đi nguyên vẹn; `checks` cũng theo hồ sơ đó', async () => {
    const draft = {
      khungGioId: '9223372036854775807',
      hoSoNguoiThanId: '9007199254740993',
      lyDoKham: 'đau lưng 2 tuần\nkhó ngủ',
    };
    const { api, onCreated } = await ready({ draft });
    expect(api.checkBodies).toStrictEqual([
      {
        khungGioId: '9223372036854775807',
        hoSoNguoiThanId: '9007199254740993',
      },
    ]);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(api.createBodies).toStrictEqual([draft]);
  });

  it('XNA-03 cọc 0đ: 201 `DaXacNhan` được chuyển cho `onCreated` nguyên vẹn (`canThanhToan` false, `hanThanhToan` null)', async () => {
    const { onCreated } = await ready({
      before: (fake) => {
        fake.check = makeCheckResult({ tienCoc: '0.00', chinhSachHoan: null });
        fake.created = makeCreatedDone();
      },
    });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0][0]).toMatchObject({
      trangThai: 'DaXacNhan',
      canThanhToan: false,
      hanThanhToan: null,
    });
  });
});

describe('booking F5 — chống bấm đúp (WZ-12)', () => {
  it('XNA-02 WZ-12 ba lần bấm trong CÙNG một lượt (state chưa kịp vẽ lại) ⇒ đúng MỘT POST; nút "Đang xử lý…" và `aria-disabled`; bấm thêm khi đang chờ vẫn một POST; xong ⇒ `onCreated` đúng một lần', async () => {
    let box!: ReturnType<typeof hold>;
    const { api, onCreated } = await ready({
      before: (fake) => (box = hold(fake)),
    });
    const button = confirmButton();
    act(() => {
      button.click();
      button.click();
      button.click();
    });
    await waitFor(() =>
      expect(button).toHaveAttribute('aria-disabled', 'true'),
    );
    expect(button).toHaveTextContent('Đang xử lý…');
    fireEvent.click(button);
    await settle();
    expect(api.count(...CREATE)).toBe(1);

    box.release(json(201, api.created));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    // Sau khi tạo xong (đang chuyển trang) vẫn khoá: bấm nữa cũng không có POST thứ hai
    fireEvent.click(button);
    await settle();
    expect(api.count(...CREATE)).toBe(1);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveTextContent('Đang xử lý…');
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('XNA-02 nút chỉ DÙNG `aria-disabled` khi đang gửi (không `disabled`) để tiêu điểm bàn phím không rơi khỏi nút', async () => {
    let box!: ReturnType<typeof hold>;
    const { api } = await ready({ before: (fake) => (box = hold(fake)) });
    const button = confirmButton();
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent('Đang xử lý…'));
    expect(button).not.toBeDisabled();
    expect(document.activeElement).toBe(button);
    box.release(json(201, api.created));
    await settle();
  });

  it('XNA-10 WZ-12 trong lúc gửi `Sửa` và `Quay lại` bị khoá (không `href`, không điều hướng); gửi lỗi xong thì mở lại', async () => {
    let box!: ReturnType<typeof hold>;
    const { api, router } = await ready({
      before: (fake) => (box = hold(fake)),
    });
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(confirmButton()).toHaveTextContent('Đang xử lý…'),
    );

    for (const name of [
      'Sửa thông tin người khám',
      'Sửa dịch vụ',
      'Sửa bác sĩ',
      'Sửa ngày và giờ khám',
      'Sửa người khám',
      'Sửa lý do khám',
      'Quay lại',
    ]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).not.toHaveAttribute('href');
      fireEvent.click(link);
    }
    expect(router.state.location.pathname).toBe('/dat-lich/xac-nhan');

    box.release(failure(503, 'HE_THONG_DANG_BAN'));
    await screen.findByRole('alert');
    expect(
      screen.getByRole('link', { name: 'Sửa người khám' }),
    ).toHaveAttribute('href', '/dat-lich/thong-tin?khungGioId=5');
    expect(api.count(...CREATE)).toBe(1);
  });
});

describe('booking F5 — mất mạng, quá giờ, lỗi lạ, 503 (WZ-13)', () => {
  it.each<[string, () => Response]>([
    [
      'mạng đứt',
      () => {
        throw new TypeError('fetch failed');
      },
    ],
    [
      '502 HTML',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    ],
    [
      '504 HTML',
      () => new Response('<html>Gateway Timeout</html>', { status: 504 }),
    ],
    ['201 thân rỗng', () => new Response('', { status: 201 })],
    ['201 sai hình dạng', () => json(201, { maLichHen: 'CLX-20261019-7K3M9' })],
    [
      '201 `canThanhToan` lệch `trangThai`',
      () => json(201, makeCreatedResult({ canThanhToan: false })),
    ],
  ])(
    'XNA-04 WZ-13 "chưa rõ" (%s): KHÔNG chuyển bước, KHÔNG tự gửi lại (một POST sau khi chờ), câu "chưa rõ" kèm liên kết Lịch hẹn của tôi mở TAB MỚI; nút chính còn bật',
    async (_name, respond) => {
      const { api, router, onCreated } = await ready({
        before: (fake) => fake.failCreateNext(() => respond()),
      });
      fireEvent.click(confirmButton());
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(CREATE_FAILURE_TEXT.uncertain);
      expect(alert).toHaveTextContent(CREATE_FAILURE_TEXT.uncertainNote);
      const link = within(alert).getByRole('link', {
        name: /Lịch hẹn của tôi/,
      });
      expect(link).toHaveAttribute('href', '/benh-nhan/lich-hen-cua-toi');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));

      await settle();
      expect(api.count(...CREATE)).toBe(1);
      expect(onCreated).not.toHaveBeenCalled();
      expect(router.state.location.pathname).toBe('/dat-lich/xac-nhan');
      expect(confirmButton()).toBeEnabled();
      expect(confirmButton()).toHaveTextContent('Xác nhận và thanh toán cọc');
      // Không khẳng định thất bại hay thành công
      expect(alert).not.toHaveTextContent('thất bại');
      expect(alert).not.toHaveTextContent('thành công');
    },
  );

  it('XNA-04 sau "chưa rõ", bấm lại ⇒ POST thứ hai; thành công ⇒ `onCreated` đúng một lần', async () => {
    const { api, onCreated } = await ready({
      before: (fake) =>
        fake.failCreateNext(() => {
          throw new TypeError('fetch failed');
        }),
    });
    fireEvent.click(confirmButton());
    await screen.findByRole('alert');
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(api.count(...CREATE)).toBe(2);
  });

  it('XNA-04 WZ-06 sau "chưa rõ", bấm lại mà báo A2 `KHUNG_GIO_DANG_GIU` ⇒ câu A2 kèm gợi ý "có thể chính là lịch bạn vừa đặt" và liên kết Lịch hẹn của tôi; KHÔNG có gợi ý nếu chưa từng "chưa rõ"', async () => {
    const { api } = await ready({
      before: (fake) =>
        fake.failCreateNext(() => {
          throw new TypeError('fetch failed');
        }),
    });
    fireEvent.click(confirmButton());
    await screen.findByRole('alert');

    api.failCreateNext(() => failure(409, 'KHUNG_GIO_DANG_GIU'));
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(alertBox()).toHaveTextContent(
        'Khung giờ này đang được người khác giữ chỗ.',
      ),
    );
    expect(alertBox()).toHaveTextContent(
      CREATE_FAILURE_TEXT.afterUncertainNote,
    );
    expect(
      within(alertBox()).getByRole('link', { name: /Lịch hẹn của tôi/ }),
    ).toBeInTheDocument();
    expect(
      within(alertBox()).getByRole('link', { name: 'Chọn lại dịch vụ' }),
    ).toHaveAttribute('href', '/dat-lich');
    expect(api.count(...CREATE)).toBe(2);
  });

  it('XNA-04 A2 khi CHƯA từng "chưa rõ" ⇒ không có gợi ý, không liên kết Lịch hẹn của tôi', async () => {
    await ready({
      before: (fake) =>
        fake.failCreateNext(() => failure(409, 'KHUNG_GIO_DA_DAT')),
    });
    fireEvent.click(confirmButton());
    await screen.findByRole('alert');
    expect(alertBox()).not.toHaveTextContent(
      CREATE_FAILURE_TEXT.afterUncertainNote,
    );
    expect(
      within(alertBox()).queryByRole('link', { name: /Lịch hẹn của tôi/ }),
    ).toBeNull();
  });

  it.each<[string, () => Response]>([
    ['500 JSON `LOI_HE_THONG`', () => failure(500, 'LOI_HE_THONG')],
    ['4xx mã lạ', () => failure(418, 'MA_LA')],
    [
      '400 không phải lỗi lý do khám',
      () =>
        failure(400, 'DU_LIEU_KHONG_HOP_LE', undefined, {
          loi: [{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }],
        }),
    ],
  ])(
    'XNA-05 WZ-13 lỗi lạ (%s): câu chung, KHÔNG phải "chưa rõ", không chuyển bước, bấm lại được; một POST mỗi lần bấm',
    async (_name, respond) => {
      const { api, onCreated, router } = await ready({
        before: (fake) => fake.failCreateNext(() => respond()),
      });
      fireEvent.click(confirmButton());
      await waitFor(() =>
        expect(alertBox()).toHaveTextContent(GENERIC_ERROR_MESSAGE),
      );
      expect(alertBox()).not.toHaveTextContent('Chưa rõ');
      await settle();
      expect(api.count(...CREATE)).toBe(1);
      expect(onCreated).not.toHaveBeenCalled();
      expect(router.state.location.pathname).toBe('/dat-lich/xac-nhan');
      expect(confirmButton()).toBeEnabled();

      fireEvent.click(confirmButton());
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(api.count(...CREATE)).toBe(2);
    },
  );

  it('XNA-06 WZ-13 503 `HE_THONG_DANG_BAN`: câu 5.14, nút bật, KHÔNG tự gửi lại (một POST sau khi chờ); bấm lại ⇒ POST thứ hai và thành công', async () => {
    const { api, onCreated } = await ready({
      before: (fake) =>
        fake.failCreateNext(() => failure(503, 'HE_THONG_DANG_BAN')),
    });
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(alertBox()).toHaveTextContent(
        'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
      ),
    );
    await settle();
    expect(api.count(...CREATE)).toBe(1);
    expect(confirmButton()).toBeEnabled();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(api.count(...CREATE)).toBe(2);
    // Lỗi cũ không còn
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('XNA-07 WZ-13 `usePageActive`: rời trang trong lúc POST còn chờ rồi 201 về ⇒ KHÔNG `onCreated` (không kéo người dùng quay lại), không đặt state', async () => {
    let box!: ReturnType<typeof hold>;
    const { api, active, onCreated } = await ready({
      before: (fake) => (box = hold(fake)),
    });
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(confirmButton()).toHaveTextContent('Đang xử lý…'),
    );

    active.current = false;
    box.release(json(201, api.created));
    await settle();
    expect(onCreated).not.toHaveBeenCalled();
    expect(api.count(...CREATE)).toBe(1);
    // State không đổi: vẫn "Đang xử lý…" (không có gì được đặt sau khi rời trang)
    expect(confirmButton()).toHaveTextContent('Đang xử lý…');
  });

  it('XNA-07 rời trang rồi lỗi về ⇒ không hiện thông báo lỗi (state không đổi)', async () => {
    let box!: ReturnType<typeof hold>;
    const { active } = await ready({ before: (fake) => (box = hold(fake)) });
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(confirmButton()).toHaveTextContent('Đang xử lý…'),
    );
    active.current = false;
    box.release(failure(409, 'KHUNG_GIO_DA_DAT'));
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmButton()).toHaveTextContent('Đang xử lý…');
  });
});

describe('booking F5 — lỗi nghiệp vụ khi tạo (WZ-06, WZ-07)', () => {
  it('XNA-08 WZ-06 A2 `KHUNG_GIO_DA_DAT`: đúng câu, liên kết chọn lại khung giờ, nút chính TẮT (cùng yêu cầu cùng kết quả); tiêu điểm tới vùng thông báo', async () => {
    const { api } = await ready({
      before: (fake) =>
        fake.failCreateNext(() => failure(409, 'KHUNG_GIO_DA_DAT')),
    });
    fireEvent.click(confirmButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
    );
    expect(
      within(alert).getByRole('link', { name: 'Chọn lại dịch vụ' }),
    ).toHaveAttribute('href', '/dat-lich');
    expect(confirmButton()).toBeDisabled();
    expect(document.activeElement).toBe(alert.parentElement);
    expect(api.count(...CREATE)).toBe(1);
  });

  it('XNA-08 WZ-06 A2 `KHUNG_GIO_DANG_GIU`: câu "thử lại sau ít phút", liên kết chọn lại, nút chính BẬT (thử lại được)', async () => {
    await ready({
      before: (fake) =>
        fake.failCreateNext(() => failure(409, 'KHUNG_GIO_DANG_GIU')),
    });
    fireEvent.click(confirmButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Khung giờ này đang được người khác giữ chỗ. Vui lòng chọn khung giờ khác hoặc thử lại sau ít phút.',
    );
    expect(
      within(alert).getByRole('link', { name: 'Chọn lại dịch vụ' }),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it.each<[string, () => Response, string, string[]]>([
    [
      'A3 vượt số lịch tối đa',
      () => failure(409, 'VUOT_SO_LICH_HEN_TOI_DA', { toiDa: 3 }),
      'Hồ sơ này đã có 3 lịch hẹn đang hoạt động, là mức tối đa.',
      ['Sửa thông tin người khám'],
    ],
    [
      'A3 trùng thời gian',
      () =>
        failure(409, 'LICH_HEN_TRUNG_THOI_GIAN', {
          maLichHen: 'CLX-20261019-7K3M9',
        }),
      'Hồ sơ này đã có lịch hẹn CLX-20261019-7K3M9 trùng thời gian.',
      ['Sửa thông tin người khám'],
    ],
    [
      'A3 hồ sơ vừa ngừng',
      () => failure(409, 'HO_SO_NGUOI_THAN_DA_NGUNG'),
      'Hồ sơ này đã ngừng sử dụng. Vui lòng chọn hồ sơ khác.',
      ['Sửa thông tin người khám'],
    ],
    [
      '404 không tìm thấy (câu trung tính)',
      () => failure(404, 'KHONG_TIM_THAY'),
      'Không tìm thấy thông tin để đặt lịch. Vui lòng chọn lại hồ sơ đi khám hoặc khung giờ.',
      ['Sửa thông tin người khám', 'Chọn lại dịch vụ'],
    ],
    [
      'A6 chi nhánh nghỉ Thứ 4',
      () => failure(409, 'CHI_NHANH_NGHI', { thuTrongTuan: 3 }),
      'Chi nhánh nghỉ vào Thứ 4.',
      ['Chọn lại dịch vụ'],
    ],
    [
      'A6 ngoài giờ',
      () =>
        failure(409, 'NGOAI_GIO_HOAT_DONG', {
          gioMo: '07:30',
          gioDong: '17:00',
        }),
      'Ngoài giờ hoạt động, chi nhánh mở cửa từ 07:30 đến 17:00.',
      ['Chọn lại dịch vụ'],
    ],
    [
      'A6 chưa khai báo',
      () => failure(409, 'CHI_NHANH_CHUA_KHAI_BAO'),
      'Chi nhánh chưa công bố giờ nhận khám vào ngày này.',
      ['Chọn lại dịch vụ'],
    ],
    [
      'A6 ca không nhận khám',
      () => failure(409, 'CA_KHONG_TON_TAI'),
      'Chi nhánh không nhận khám vào buổi này.',
      ['Chọn lại dịch vụ'],
    ],
    [
      'A3/11a khung giờ đã qua',
      () => failure(409, 'KHUNG_GIO_DA_QUA'),
      'Khung giờ này đã qua. Vui lòng chọn khung giờ khác.',
      ['Chọn lại dịch vụ'],
    ],
    [
      'A4 khoá no-show',
      () => failure(403, 'DAT_LICH_BI_KHOA_NO_SHOW'),
      'Tài khoản đang bị khoá đặt lịch trực tuyến do vắng mặt nhiều lần. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.',
      [],
    ],
    [
      '403 không đủ quyền',
      () => failure(403, 'KHONG_DU_QUYEN'),
      'Tài khoản này không được phép đặt lịch.',
      [],
    ],
    [
      '401 hết phiên',
      () => failure(401, 'CHUA_DANG_NHAP'),
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      [],
    ],
    [
      '400 lý do khám không hợp lệ',
      () =>
        failure(400, 'DU_LIEU_KHONG_HOP_LE', undefined, {
          loi: [{ truong: 'lyDoKham', ma: 'LY_DO_KHAM_KHONG_HOP_LE' }],
        }),
      'Lý do khám không hợp lệ (tối đa 500 ký tự).',
      ['Sửa lý do khám'],
    ],
  ])(
    'XNA-09 WZ-07 %s ⇒ đúng câu theo `maLoi`, đúng liên kết, nút chính TẮT, một POST',
    async (_name, respond, message, linkNames) => {
      const { api } = await ready({
        before: (fake) => fake.failCreateNext(() => respond()),
      });
      fireEvent.click(confirmButton());
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(
        within(alert)
          .queryAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(linkNames);
      expect(confirmButton()).toBeDisabled();
      expect(api.count(...CREATE)).toBe(1);
    },
  );

  it('XNA-09 liên kết sửa lỗi hồ sơ đưa về Bước 4 (bản nháp còn), liên kết chọn lại khung giờ về Bước 1; không lời gọi ghi thêm', async () => {
    const { api, router } = await ready({
      before: (fake) =>
        fake.failCreateNext(() => failure(409, 'LICH_HEN_TRUNG_THOI_GIAN')),
    });
    fireEvent.click(confirmButton());
    const alert = await screen.findByRole('alert');
    fireEvent.click(
      within(alert).getByRole('link', { name: 'Sửa thông tin người khám' }),
    );
    await screen.findByText('Bước 4 của luồng đặt lịch');
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/dat-lich/thong-tin?khungGioId=5',
    );
    expect(api.count(...CREATE)).toBe(1);
  });
});

describe('booking F5 — không kho trình duyệt, URL, log (WZ-09)', () => {
  it('XNS-08 WZ-09 suốt Bước 5 (mở, lỗi 503, bấm lại, "chưa rõ", thành công): `localStorage.length` và `sessionStorage.length` bằng 0, cookie không đổi, URL, tiêu đề tab và `console` không chứa lý do khám', async () => {
    const reason = 'đau ngực dữ dội, khó thở về đêm';
    window.localStorage.clear();
    window.sessionStorage.clear();
    const cookieBefore = document.cookie;
    const titleBefore = document.title;
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { api, onCreated } = await ready({
      draft: { ...DEFAULT_DRAFT, lyDoKham: reason },
    });
    const noLeak = () => {
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
      expect(document.cookie).toBe(cookieBefore);
      expect(document.title).toBe(titleBefore);
      expect(document.title).not.toContain('đau ngực');
      const url = screen.getByTestId('url').textContent ?? '';
      expect(url).not.toContain('đau');
      expect(decodeURIComponent(url)).not.toContain(reason);
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain('đau ngực');
      }
    };
    noLeak();

    api.failCreateNext(() => failure(503, 'HE_THONG_DANG_BAN'));
    fireEvent.click(confirmButton());
    await screen.findByRole('alert');
    noLeak();

    api.failCreateNext(() => {
      throw new TypeError('fetch failed');
    });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(alertBox()).toHaveTextContent('Chưa rõ'));
    noLeak();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    noLeak();
    expect(api.createBodies.every((body) => body.lyDoKham === reason)).toBe(
      true,
    );
    expect(api.count(...CREATE)).toBe(3);
  });
});
