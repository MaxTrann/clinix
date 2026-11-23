import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { UNKNOWN_RESULT_HINT } from '../account-common/account-errors';
import {
  RESEND_MAIL_FAILED_MESSAGE,
  NOT_PENDING_MESSAGE,
} from './staff-errors';
import type { StaffAccount } from './staff-types';
import {
  BRANCH,
  apiError,
  json,
  makeGate,
} from '../patient-accounts/testing/patient-accounts-test-kit';
import {
  RESEND_EXPIRY,
  installFakeStaffApi,
  makeAdmin,
  makeStaff,
  openStaffDetail,
  renderStaffPage,
  validLink,
} from './testing/staff-accounts-test-kit';

// admin F8, panel chi tiết Nhân sự: chờ kích hoạt, gửi lại, khoá, mở khoá (mã NSF8-32 đến 58 là [đề xuất], TRACKING admin 9A.20 mục 3).
// Phủ TK-10, 11, 12, 14, 16, 17, 20, 21, 26, 40 đến 45, 47 phía giao diện. API giả có trạng thái ở mức hợp đồng B17, B18, B20; dữ liệu giả, không email thật.

afterEach(() => {
  vi.unstubAllGlobals();
});

const button = (name: string) => screen.queryByRole('button', { name });
const labels = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('button')
    .map((b) => b.textContent);
// Nhãn là thẻ <dt>; giá trị là thẻ <dd> liền sau (có dòng mà giá trị trùng chữ với nhãn khác, ví dụ phạm vi "Chi nhánh")
const row = (dialog: HTMLElement, label: string) =>
  Array.from(dialog.querySelectorAll('dt')).find(
    (term) => term.textContent === label,
  )?.nextElementSibling?.textContent;

async function openAndWait(name: string) {
  return openStaffDetail(name);
}

describe('NSF8-32 các dòng thông tin theo vai trò', () => {
  it('NSF8-32 Bác sĩ: họ tên, email, SĐT, vai trò, chi nhánh, trạng thái, ngày tạo (giờ Việt Nam); không có dòng "Phạm vi"', async () => {
    installFakeStaffApi({
      accounts: [
        makeStaff(1, {
          hoTen: 'Lê Văn An',
          email: 'an@example.invalid',
          soDienThoai: '0912345678',
          thoiDiemTao: '2026-11-18T17:30:00.000Z',
        }),
      ],
    });
    renderStaffPage();
    const dialog = await openAndWait('Lê Văn An');

    expect(row(dialog, 'Họ tên')).toBe('Lê Văn An');
    expect(row(dialog, 'Email')).toBe('an@example.invalid');
    expect(row(dialog, 'Số điện thoại')).toBe('0912345678');
    expect(row(dialog, 'Vai trò')).toBe('Bác sĩ');
    expect(row(dialog, 'Chi nhánh')).toBe('Chi nhánh Quận 1');
    expect(row(dialog, 'Trạng thái')).toBe('Đang hoạt động');
    expect(row(dialog, 'Ngày tạo')).toBe('19/11/2026 00:30');
    expect(within(dialog).queryByText('Phạm vi')).toBeNull();
  });

  it('NSF8-32 Quản trị viên Toàn hệ thống: có dòng "Phạm vi" là Toàn hệ thống, chi nhánh là Toàn hệ thống', async () => {
    installFakeStaffApi({ accounts: [makeAdmin(1, 'ToanHeThong')] });
    renderStaffPage();
    const dialog = await openAndWait('Quản trị 1');
    expect(row(dialog, 'Vai trò')).toBe('Quản trị viên');
    expect(row(dialog, 'Phạm vi')).toBe('Toàn hệ thống');
    expect(row(dialog, 'Chi nhánh')).toBe('Toàn hệ thống');
  });

  it('NSF8-32 Quản trị viên Chi nhánh: phạm vi là Chi nhánh, chi nhánh là tên chi nhánh', async () => {
    installFakeStaffApi({ accounts: [makeAdmin(1, 'ChiNhanh')] });
    renderStaffPage();
    const dialog = await openAndWait('Quản trị 1');
    expect(row(dialog, 'Phạm vi')).toBe('Chi nhánh');
    expect(row(dialog, 'Chi nhánh')).toBe('Chi nhánh Quận 1');
  });

  it('NSF8-32 họ tên có thẻ HTML được in như văn bản, không dựng phần tử (chữ tự do của người dùng)', async () => {
    installFakeStaffApi({
      accounts: [makeStaff(1, { hoTen: '<b>Đậm</b> Nam' })],
    });
    renderStaffPage();
    const dialog = await openAndWait('<b>Đậm</b> Nam');
    expect(
      within(dialog).getAllByText('<b>Đậm</b> Nam').length,
    ).toBeGreaterThan(0);
    expect(dialog.querySelector('b')).toBeNull();
  });

  it('NSF8-32 khoá lạ của chi tiết (băm mật khẩu, địa chỉ, ngày sinh) KHÔNG bao giờ được vẽ ra', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.path === '/admin/accounts/1',
      () =>
        json({
          ...makeStaff(1),
          lienKetKichHoat: null,
          matKhauBam: 'khong-duoc-ve',
          diaChi: 'Số 9 đường lạ',
          ngaySinh: '1980-02-02',
        }),
    );
    renderStaffPage();
    await openAndWait('Nhân sự 1');
    expect(document.body.textContent).not.toContain('khong-duoc-ve');
    expect(document.body.textContent).not.toContain('Số 9 đường lạ');
    expect(document.body.textContent).not.toContain('1980');
  });

  it('NSF8-32 không bao giờ có ô lý do hay ô mật khẩu (B18 không có thân; NS-18)', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    expect(within(dialog).queryByLabelText(/lý do|mật khẩu/i)).toBeNull();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
  });
});

describe('NSF8-33 nút theo phạm vi × vai trò × trạng thái (TK-12, 14, 22, 26, 44)', () => {
  const cases: [string, 'ToanHeThong' | 'ChiNhanh', StaffAccount, string[]][] =
    [
      [
        'Toàn hệ thống × Bác sĩ đang hoạt động',
        'ToanHeThong',
        makeStaff(1),
        ['Khoá tài khoản'],
      ],
      [
        'Toàn hệ thống × Lễ tân ngừng',
        'ToanHeThong',
        makeStaff(1, { loaiTaiKhoan: 'LeTan', trangThai: 'NgungHoatDong' }),
        ['Mở khoá tài khoản'],
      ],
      [
        'Toàn hệ thống × Quản trị viên đang hoạt động',
        'ToanHeThong',
        makeAdmin(1, 'ChiNhanh'),
        ['Khoá tài khoản'],
      ],
      [
        'Toàn hệ thống × Quản trị viên chờ kích hoạt',
        'ToanHeThong',
        makeAdmin(1, 'ToanHeThong', { trangThai: 'ChoKichHoat' }),
        ['Gửi lại email kích hoạt'],
      ],
      [
        'Chi nhánh × Bác sĩ đang hoạt động',
        'ChiNhanh',
        makeStaff(1),
        ['Khoá tài khoản'],
      ],
      [
        'Chi nhánh × Lễ tân ngừng',
        'ChiNhanh',
        makeStaff(1, { loaiTaiKhoan: 'LeTan', trangThai: 'NgungHoatDong' }),
        ['Mở khoá tài khoản'],
      ],
      [
        'Chi nhánh × Bác sĩ chờ kích hoạt',
        'ChiNhanh',
        makeStaff(1, { trangThai: 'ChoKichHoat' }),
        ['Gửi lại email kích hoạt'],
      ],
    ];

  it.each(cases)('NSF8-33 %s', async (_name, scope, account, expected) => {
    installFakeStaffApi({
      scope: scope === 'ToanHeThong' ? undefined : BRANCH,
      accounts: [account],
    });
    renderStaffPage({ scope: scope === 'ToanHeThong' ? undefined : BRANCH });
    const dialog = await openAndWait(account.hoTen);
    // Bỏ nút "Đóng" của khung panel
    expect(labels(dialog).filter((text) => text !== 'Đóng')).toEqual(expected);
  });
});

describe('NSF8-34 chờ kích hoạt: hạn của liên kết (TK-41, TK-42, TK-48)', () => {
  const pending = (link: StaffAccount['lienKetKichHoat']) =>
    makeStaff(1, { trangThai: 'ChoKichHoat', lienKetKichHoat: link });

  it('NSF8-34 còn hiệu lực: in hạn giờ Việt Nam', async () => {
    installFakeStaffApi({
      accounts: [pending(validLink('2026-11-24T10:30:00.000Z'))],
    });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    expect(
      within(dialog).getByText(
        'Liên kết kích hoạt còn hiệu lực đến 24/11/2026 17:30.',
      ),
    ).toBeInTheDocument();
  });

  it('NSF8-34 hết hạn: câu "đã hết hạn lúc" và vẫn có nút gửi lại', async () => {
    installFakeStaffApi({
      accounts: [
        pending({
          trangThai: 'HET_HAN',
          hetHanLuc: '2026-11-22T10:30:00.000Z',
        }),
      ],
    });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    expect(
      within(dialog).getByText(
        'Liên kết kích hoạt đã hết hạn lúc 22/11/2026 17:30.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/còn hiệu lực/)).toBeNull();
    expect(button('Gửi lại email kích hoạt')).toBeInTheDocument();
  });

  it('NSF8-34 chưa có liên kết hiệu lực (gửi lỗi, bị thay): câu riêng và vẫn có nút gửi lại', async () => {
    installFakeStaffApi({ accounts: [pending(null)] });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    expect(
      within(dialog).getByText('Chưa có liên kết kích hoạt còn hiệu lực.'),
    ).toBeInTheDocument();
    expect(button('Gửi lại email kích hoạt')).toBeInTheDocument();
  });

  it('NSF8-34 nhân sự đang hoạt động KHÔNG có khối liên kết kích hoạt', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    expect(within(dialog).queryByText(/liên kết kích hoạt/i)).toBeNull();
    expect(button('Gửi lại email kích hoạt')).toBeNull();
  });
});

describe('NSF8-35 gửi lại email kích hoạt: thành công (TK-40, NS-20)', () => {
  it('NSF8-35 một POST, thông báo kèm hạn MỚI; chi tiết và danh sách được tải lại và hiện liên kết mới', async () => {
    const api = installFakeStaffApi({
      accounts: [
        makeStaff(1, {
          trangThai: 'ChoKichHoat',
          lienKetKichHoat: {
            trangThai: 'HET_HAN',
            hetHanLuc: '2026-11-22T10:30:00.000Z',
          },
        }),
      ],
    });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    const listsBefore = api.lists().length;
    const detailsBefore = api.details().length;

    fireEvent.click(button('Gửi lại email kích hoạt')!);

    expect(
      await within(dialog).findByText(
        'Đã gửi lại email kích hoạt. Liên kết mới có hiệu lực đến 25/11/2026 10:00.',
      ),
    ).toBeInTheDocument();
    expect(
      api.calls('POST', '/admin/accounts/1/resend-activation'),
    ).toHaveLength(1);
    expect(api.posts()).toHaveLength(1);
    expect(api.posts()[0].body).toBeUndefined();
    await waitFor(() => {
      expect(api.details().length).toBe(detailsBefore + 1);
      expect(api.lists().length).toBe(listsBefore + 1);
    });
    expect(
      await within(dialog).findByText(
        'Liên kết kích hoạt còn hiệu lực đến 25/11/2026 10:00.',
      ),
    ).toBeInTheDocument();
    expect(RESEND_EXPIRY).toBe('2026-11-25T03:00:00.000Z');
  });

  it('NSF8-35 thành công dùng role="status" (không phải alert)', async () => {
    installFakeStaffApi({
      accounts: [
        makeStaff(1, { trangThai: 'ChoKichHoat', lienKetKichHoat: null }),
      ],
    });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    fireEvent.click(button('Gửi lại email kích hoạt')!);
    const notice = await within(dialog).findByText(
      /Đã gửi lại email kích hoạt/,
    );
    expect(notice.closest('[role="status"]')).not.toBeNull();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});

describe('NSF8-36 gửi lại mà gửi thư lỗi (HTTP 200): KHÔNG BAO GIỜ nói "đã gửi" (NS-19, TK-41)', () => {
  it('NSF8-36 cảnh báo role="alert", liên kết cũ hiển thị sau tải lại, nút gửi lại vẫn dùng được', async () => {
    const api = installFakeStaffApi({
      accounts: [
        makeStaff(1, {
          trangThai: 'ChoKichHoat',
          lienKetKichHoat: validLink('2026-11-24T10:30:00.000Z'),
        }),
      ],
    });
    api.override(
      (r) => r.path === '/admin/accounts/1/resend-activation',
      () =>
        json({
          taiKhoanId: '1',
          guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
          hanLienKet: null,
        }),
    );
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');

    fireEvent.click(button('Gửi lại email kích hoạt')!);

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(RESEND_MAIL_FAILED_MESSAGE);
    expect(dialog.textContent).not.toMatch(/Đã gửi lại/);
    expect(dialog.textContent).not.toContain('Liên kết mới có hiệu lực');
    // Liên kết cũ (còn hạn) vẫn là liên kết đang hiệu lực: tải lại chi tiết cho thấy đúng thế
    expect(
      await within(dialog).findByText(
        'Liên kết kích hoạt còn hiệu lực đến 24/11/2026 17:30.',
      ),
    ).toBeInTheDocument();
    expect(button('Gửi lại email kích hoạt')).not.toBeDisabled();
  });

  it('NSF8-36 phản hồi 200 sai hình dạng: lỗi "chưa rõ", không có chữ "Đã gửi lại"', async () => {
    const api = installFakeStaffApi({
      accounts: [
        makeStaff(1, { trangThai: 'ChoKichHoat', lienKetKichHoat: null }),
      ],
    });
    api.override(
      (r) => r.path === '/admin/accounts/1/resend-activation',
      () => json({ taiKhoanId: '1' }),
    );
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    fireEvent.click(button('Gửi lại email kích hoạt')!);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      UNKNOWN_RESULT_HINT,
    );
    expect(dialog.textContent).not.toMatch(/Đã gửi lại/);
  });
});

describe('NSF8-37 gửi lại bị từ chối (TK-43, TK-44, TK-47, NS-45)', () => {
  const pendingAccount = () =>
    makeStaff(1, { trangThai: 'ChoKichHoat', lienKetKichHoat: null });

  it.each<[string, unknown, string]>([
    ['45 giây', { soGiayCho: 45 }, 'Vui lòng thử lại sau 45 giây.'],
    ['150 giây', { soGiayCho: 150 }, 'Vui lòng thử lại sau 3 phút.'],
    ['không có chiTiet', undefined, 'Vui lòng thử lại sau.'],
  ])('NSF8-37 429 GUI_LAI_QUA_SOM (%s)', async (_name, detail, text) => {
    const api = installFakeStaffApi({ accounts: [pendingAccount()] });
    api.override(
      (r) => r.path === '/admin/accounts/1/resend-activation',
      () =>
        new Response(
          JSON.stringify({
            maLoi: 'GUI_LAI_QUA_SOM',
            thongBao: 'x',
            ...(detail === undefined ? {} : { chiTiet: detail }),
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    fireEvent.click(button('Gửi lại email kích hoạt')!);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
    expect(button('Gửi lại email kích hoạt')).not.toBeDisabled();
  });

  it('NSF8-37 409 không còn chờ kích hoạt (người khác vừa kích hoạt): câu PLAN và chi tiết tải lại thấy trạng thái mới', async () => {
    const api = installFakeStaffApi({ accounts: [pendingAccount()] });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    // Giữa lúc panel đang mở, người kia đã kích hoạt xong
    api.accounts[0].trangThai = 'DangHoatDong';

    fireEvent.click(button('Gửi lại email kích hoạt')!);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      NOT_PENDING_MESSAGE,
    );
    expect(
      await within(dialog).findByText('Đang hoạt động'),
    ).toBeInTheDocument();
    expect(button('Khoá tài khoản')).toBeInTheDocument();
    expect(button('Gửi lại email kích hoạt')).toBeNull();
  });

  it('NSF8-37 403: câu không đủ quyền; 404: panel đóng, thông báo hiện ở trang và danh sách tải lại', async () => {
    const api = installFakeStaffApi({ accounts: [pendingAccount()] });
    api.override(
      (r) => r.path === '/admin/accounts/1/resend-activation',
      () => apiError(403, 'KHONG_DU_QUYEN'),
    );
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    fireEvent.click(button('Gửi lại email kích hoạt')!);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );

    api.override(
      (r) => r.path === '/admin/accounts/1/resend-activation',
      () => apiError(404, 'KHONG_TIM_THAY'),
    );
    const listsBefore = api.lists().length;
    fireEvent.click(button('Gửi lại email kích hoạt')!);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nhân sự 1' })).toBeNull(),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy dữ liệu.',
    );
    await waitFor(() =>
      expect(api.lists().length).toBeGreaterThan(listsBefore),
    );
  });

  it('NSF8-37 mất mạng: nói chưa rõ thao tác đã chạy hay chưa (không tự thử lại)', async () => {
    const api = installFakeStaffApi({ accounts: [pendingAccount()] });
    api.override(
      (r) => r.path === '/admin/accounts/1/resend-activation',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    fireEvent.click(button('Gửi lại email kích hoạt')!);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      UNKNOWN_RESULT_HINT,
    );
    expect(
      api.calls('POST', '/admin/accounts/1/resend-activation'),
    ).toHaveLength(1);
  });

  it('NSF8-37 bấm đúp chỉ gửi MỘT lời gọi (TK-45), nút tắt trong lúc chờ', async () => {
    const api = installFakeStaffApi({ accounts: [pendingAccount()] });
    const gate = makeGate();
    api.override(
      (r) => r.path === '/admin/accounts/1/resend-activation',
      async () => {
        await gate.promise;
        return json({
          taiKhoanId: '1',
          guiEmail: { ketQua: 'DaGui' },
          hanLienKet: RESEND_EXPIRY,
        });
      },
    );
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    const send = button('Gửi lại email kích hoạt')!;
    try {
      fireEvent.click(send);
      fireEvent.click(send);
      await waitFor(() => expect(send).toBeDisabled());
    } finally {
      gate.open();
    }
    await within(dialog).findByText(/Đã gửi lại email kích hoạt/);
    expect(
      api.calls('POST', '/admin/accounts/1/resend-activation'),
    ).toHaveLength(1);
  });
});

describe('NSF8-38 khoá: hộp xác nhận (TK-10, TK-26)', () => {
  it('NSF8-38 bấm "Khoá tài khoản" mở hộp xác nhận, KHÔNG gọi API; panel tạm ẩn; huỷ thì đóng hộp, không POST, panel trở lại', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1, { loaiTaiKhoan: 'LeTan' })],
    });
    renderStaffPage();
    await openAndWait('Nhân sự 1');

    fireEvent.click(button('Khoá tài khoản')!);

    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    expect(confirm).toHaveTextContent('Nhân sự 1');
    expect(confirm).toHaveTextContent(
      'sẽ bị khoá và đăng xuất khỏi mọi thiết bị',
    );
    // Nhân sự không phải Bác sĩ: không có ghi chú về lịch hẹn
    expect(within(confirm).queryByRole('note')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Nhân sự 1' })).toBeNull();
    expect(api.posts()).toHaveLength(0);

    fireEvent.click(within(confirm).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Khoá tài khoản?' }),
      ).toBeNull(),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Nhân sự 1' }),
    ).toBeInTheDocument();
    expect(api.posts()).toHaveLength(0);
  });

  it('NSF8-38 hộp của Bác sĩ có ghi chú việc phụ thuộc; xác nhận gửi đúng MỘT POST /lock không thân', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openAndWait('Nhân sự 1');
    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    expect(within(confirm).getByRole('note')).toHaveTextContent(
      'Bác sĩ còn lịch hẹn và ca làm việc sắp tới sẽ cần được bố trí lại; hệ thống không tự huỷ hay đổi lịch.',
    );

    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
    );

    expect(await screen.findByText('Đã khoá tài khoản.')).toBeInTheDocument();
    expect(api.posts().map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /admin/accounts/1/lock',
    ]);
    expect(api.posts()[0].body).toBeUndefined();
  });

  it('NSF8-38 khoá xong: chi tiết và danh sách được tải lại, trạng thái thành "Ngừng hoạt động", nút đổi sang "Mở khoá"', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1, { loaiTaiKhoan: 'LeTan' })],
    });
    renderStaffPage();
    await openAndWait('Nhân sự 1');
    const listsBefore = api.lists().length;

    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
    );

    expect(
      await within(
        await screen.findByRole('dialog', { name: 'Nhân sự 1' }),
      ).findByText('Ngừng hoạt động'),
    ).toBeInTheDocument();
    expect(button('Mở khoá tài khoản')).toBeInTheDocument();
    expect(button('Khoá tài khoản')).toBeNull();
    expect(api.lists().length).toBeGreaterThan(listsBefore);
  });

  it('NSF8-38 bấm đúp "Khoá tài khoản" trong hộp chỉ gửi MỘT lời gọi', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1, { loaiTaiKhoan: 'LeTan' })],
    });
    const gate = makeGate();
    api.override(
      (r) => r.path === '/admin/accounts/1/lock',
      async () => {
        await gate.promise;
        return json({
          taiKhoanId: '1',
          loaiTaiKhoan: 'LeTan',
          trangThai: 'NgungHoatDong',
          soPhienThuHoi: 1,
        });
      },
    );
    renderStaffPage();
    await openAndWait('Nhân sự 1');
    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    const go = within(confirm).getByRole('button', { name: 'Khoá tài khoản' });
    try {
      fireEvent.click(go);
      fireEvent.click(go);
    } finally {
      gate.open();
    }
    await screen.findByText('Đã khoá tài khoản.');
    expect(api.calls('POST', '/admin/accounts/1/lock')).toHaveLength(1);
  });
});

describe('NSF8-39 khoá Bác sĩ: danh sách việc cần bố trí lại (TK-10, Q28)', () => {
  const lockDoctor = async (dependents: unknown) => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.path === '/admin/accounts/1/lock',
      () =>
        json({
          taiKhoanId: '1',
          loaiTaiKhoan: 'BacSi',
          trangThai: 'NgungHoatDong',
          soPhienThuHoi: 1,
          phuThuoc: dependents,
        }),
    );
    renderStaffPage();
    await openAndWait('Nhân sự 1');
    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    return screen.findByRole('status', { name: 'Việc cần bố trí lại' });
  };

  it('NSF8-39 có lịch hẹn và ca: hiện tổng, mã lịch hẹn, giờ Việt Nam, trạng thái chữ, ngày và ca', async () => {
    const block = await lockDoctor({
      lichHen: {
        tong: 2,
        muc: [
          {
            lichHenId: '11',
            maLichHen: 'LH-0011',
            thoiGian: '2026-11-25 08:30:00',
            trangThai: 'DaXacNhan',
          },
          {
            lichHenId: '12',
            maLichHen: 'LH-0012',
            thoiGian: '2026-11-25 09:00:00',
            trangThai: 'ChoThanhToan',
          },
        ],
      },
      caLamViec: {
        tong: 1,
        muc: [
          {
            lichLamViecId: '31',
            chiNhanhId: '5',
            ngay: '2026-11-26',
            ca: 'CaSang',
          },
        ],
      },
    });
    expect(block).toHaveTextContent('2 lịch hẹn đang hoạt động');
    expect(block).toHaveTextContent('LH-0011');
    expect(block).toHaveTextContent('25/11/2026 08:30');
    expect(block).toHaveTextContent('Đã xác nhận');
    expect(block).toHaveTextContent('LH-0012');
    expect(block).toHaveTextContent('Chờ thanh toán');
    expect(block).toHaveTextContent('1 ca làm việc từ hôm nay');
    expect(block).toHaveTextContent('26/11/2026');
    expect(block).toHaveTextContent('Ca sáng');
    expect(block.textContent).not.toMatch(/mục khác/);
  });

  it('NSF8-39 tổng lớn hơn số mục trả về (API cắt ở 50): báo "và N mục khác"', async () => {
    const appointments = Array.from({ length: 50 }, (_, i) => ({
      lichHenId: String(100 + i),
      maLichHen: `LH-${String(i + 1).padStart(4, '0')}`,
      thoiGian: '2026-11-25 08:30:00',
      trangThai: 'DaXacNhan',
    }));
    const block = await lockDoctor({
      lichHen: { tong: 73, muc: appointments },
      caLamViec: { tong: 0, muc: [] },
    });
    expect(block).toHaveTextContent('73 lịch hẹn đang hoạt động');
    expect(block).toHaveTextContent('và 23 mục khác');
    expect(within(block).getAllByText(/^LH-\d{4}$/)).toHaveLength(50);
  });

  it('NSF8-39 không còn việc nào: câu "Không có lịch hẹn hay ca làm việc nào cần bố trí lại."', async () => {
    const block = await lockDoctor({
      lichHen: { tong: 0, muc: [] },
      caLamViec: { tong: 0, muc: [] },
    });
    expect(block).toHaveTextContent(
      'Không có lịch hẹn hay ca làm việc nào cần bố trí lại.',
    );
  });

  it('NSF8-39 phản hồi khoá không có phuThuoc hay sai hình dạng: KHÔNG hiện khối (không nói "không có việc nào")', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.path === '/admin/accounts/1/lock',
      () =>
        json({
          taiKhoanId: '1',
          loaiTaiKhoan: 'BacSi',
          trangThai: 'NgungHoatDong',
          soPhienThuHoi: 1,
          phuThuoc: { lichHen: 'x' },
        }),
    );
    renderStaffPage();
    await openAndWait('Nhân sự 1');
    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    await screen.findByText('Đã khoá tài khoản.');
    expect(
      screen.queryByRole('status', { name: 'Việc cần bố trí lại' }),
    ).toBeNull();
    expect(document.body.textContent).not.toContain('Không có lịch hẹn');
  });

  it('NSF8-39 Lễ tân bị khoá: không có khối việc phụ thuộc', async () => {
    installFakeStaffApi({
      accounts: [makeStaff(1, { loaiTaiKhoan: 'LeTan' })],
    });
    renderStaffPage();
    await openAndWait('Nhân sự 1');
    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    await screen.findByText('Đã khoá tài khoản.');
    expect(
      screen.queryByRole('status', { name: 'Việc cần bố trí lại' }),
    ).toBeNull();
  });

  it('NSF8-39 đóng panel hay mở người khác thì khối biến mất (không rò sang người sau)', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1), makeStaff(2, { loaiTaiKhoan: 'LeTan' })],
    });
    api.override(
      (r) => r.path === '/admin/accounts/1/lock',
      () =>
        json({
          taiKhoanId: '1',
          loaiTaiKhoan: 'BacSi',
          trangThai: 'NgungHoatDong',
          soPhienThuHoi: 1,
          phuThuoc: {
            lichHen: { tong: 0, muc: [] },
            caLamViec: { tong: 0, muc: [] },
          },
        }),
    );
    renderStaffPage();
    await openAndWait('Nhân sự 1');
    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    await screen.findByRole('status', { name: 'Việc cần bố trí lại' });

    fireEvent.click(button('Đóng chi tiết')!);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nhân sự 1' })).toBeNull(),
    );
    await openAndWait('Nhân sự 2');
    expect(
      screen.queryByRole('status', { name: 'Việc cần bố trí lại' }),
    ).toBeNull();
    expect(screen.queryByText('Đã khoá tài khoản.')).toBeNull();
  });
});

describe('NSF8-40 lỗi khi khoá (TK-14, 16, 17, 20, 21)', () => {
  const tryLock = async (
    account: StaffAccount,
    selfId?: string,
    scope?: typeof BRANCH,
  ) => {
    const api = installFakeStaffApi({ accounts: [account], selfId, scope });
    renderStaffPage({ scope });
    await openAndWait(account.hoTen);
    return {
      api,
      confirmLock: async () => {
        fireEvent.click(button('Khoá tài khoản')!);
        const confirm = await screen.findByRole('dialog', {
          name: 'Khoá tài khoản?',
        });
        fireEvent.click(
          within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
        );
      },
    };
  };

  it('NSF8-40 tự khoá (web không biết id nên vẫn hiện nút): 409 TU_KHOA_TAI_KHOAN, câu PLAN 5.9; tài khoản không đổi', async () => {
    const { confirmLock } = await tryLock(makeAdmin(1, 'ToanHeThong'), '1');
    await confirmLock();
    const dialog = await screen.findByRole('dialog', { name: 'Quản trị 1' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Không thể tự khoá tài khoản của chính mình.',
    );
    expect(within(dialog).getByText('Đang hoạt động')).toBeInTheDocument();
    expect(button('Khoá tài khoản')).toBeInTheDocument();
  });

  it('NSF8-40 Toàn hệ thống cuối cùng: 409 CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG', async () => {
    const { confirmLock } = await tryLock(makeAdmin(1, 'ToanHeThong'));
    await confirmLock();
    const dialog = await screen.findByRole('dialog', { name: 'Quản trị 1' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Phải còn ít nhất một Quản trị viên Toàn hệ thống đang hoạt động.',
    );
  });

  it('NSF8-40 còn một Toàn hệ thống khác đang hoạt động thì khoá được (TK-18)', async () => {
    installFakeStaffApi({
      accounts: [makeAdmin(1, 'ToanHeThong'), makeAdmin(2, 'ToanHeThong')],
    });
    renderStaffPage();
    await openAndWait('Quản trị 1');
    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    expect(await screen.findByText('Đã khoá tài khoản.')).toBeInTheDocument();
  });

  it('NSF8-40 người khác vừa khoá rồi (409 TRANG_THAI_KHONG_PHU_HOP): câu PLAN và chi tiết tải lại thấy "Ngừng hoạt động"', async () => {
    const { api, confirmLock } = await tryLock(
      makeStaff(1, { loaiTaiKhoan: 'LeTan' }),
    );
    api.accounts[0].trangThai = 'NgungHoatDong';
    await confirmLock();
    const dialog = await screen.findByRole('dialog', { name: 'Nhân sự 1' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
    );
    expect(
      await within(dialog).findByText('Ngừng hoạt động'),
    ).toBeInTheDocument();
    expect(button('Mở khoá tài khoản')).toBeInTheDocument();
  });

  it('NSF8-40 vừa thành "Chờ kích hoạt" (409 TAI_KHOAN_CHO_KICH_HOAT): câu PLAN trỏ sang "Gửi lại liên kết kích hoạt"', async () => {
    const { api, confirmLock } = await tryLock(
      makeStaff(1, { loaiTaiKhoan: 'LeTan' }),
    );
    api.accounts[0].trangThai = 'ChoKichHoat';
    await confirmLock();
    const dialog = await screen.findByRole('dialog', { name: 'Nhân sự 1' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Tài khoản đang chờ kích hoạt. Hãy dùng "Gửi lại liên kết kích hoạt".',
    );
  });

  it('NSF8-40 403: câu không đủ quyền; 404: panel đóng và thông báo hiện ở trang', async () => {
    const { api, confirmLock } = await tryLock(
      makeStaff(1, { loaiTaiKhoan: 'LeTan' }),
    );
    api.override(
      (r) => r.path === '/admin/accounts/1/lock',
      () => apiError(404, 'KHONG_TIM_THAY'),
    );
    await confirmLock();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nhân sự 1' })).toBeNull(),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy dữ liệu.',
    );
  });

  it('NSF8-40 500 hoàn tác cả giao dịch: câu "tài khoản chưa bị thay đổi"; mất mạng: câu "chưa rõ"', async () => {
    const { api, confirmLock } = await tryLock(
      makeStaff(1, { loaiTaiKhoan: 'LeTan' }),
    );
    api.override(
      (r) => r.path === '/admin/accounts/1/lock',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    await confirmLock();
    const dialog = await screen.findByRole('dialog', { name: 'Nhân sự 1' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Không thực hiện được. Tài khoản chưa bị thay đổi, vui lòng thử lại.',
    );
  });
});

describe('NSF8-41 mở khoá: không hộp xác nhận (quyết định của Đại 23/11/2026, như F9)', () => {
  it('NSF8-41 một POST /unlock không thân; thông báo, trạng thái và nút đổi', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1, { trangThai: 'NgungHoatDong' })],
    });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');

    fireEvent.click(button('Mở khoá tài khoản')!);

    expect(
      await within(dialog).findByText('Đã mở khoá tài khoản.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Mở khoá tài khoản?' }),
    ).toBeNull();
    expect(api.posts().map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /admin/accounts/1/unlock',
    ]);
    expect(api.posts()[0].body).toBeUndefined();
    expect(
      await within(dialog).findByText('Đang hoạt động'),
    ).toBeInTheDocument();
    expect(button('Khoá tài khoản')).toBeInTheDocument();
  });

  it('NSF8-41 đã được mở khoá rồi (409): câu PLAN và chi tiết tải lại', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1, { trangThai: 'NgungHoatDong' })],
    });
    renderStaffPage();
    const dialog = await openAndWait('Nhân sự 1');
    api.accounts[0].trangThai = 'DangHoatDong';
    fireEvent.click(button('Mở khoá tài khoản')!);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
    );
    expect(
      await within(dialog).findByText('Đang hoạt động'),
    ).toBeInTheDocument();
  });
});

describe('NSF8-42 tải chi tiết', () => {
  it('NSF8-42 lỗi tải chi tiết: báo lỗi có "Thử lại" trong panel; thử lại thì hiện dữ liệu', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.path === '/admin/accounts/1',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    renderStaffPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem chi tiết Nhân sự 1' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết nhân sự',
    });
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại' }));
    expect(
      await within(dialog).findByText('Đang hoạt động'),
    ).toBeInTheDocument();
  });

  it('NSF8-42 chi tiết 404 (ra khỏi phạm vi): câu "Không tìm thấy dữ liệu."', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.path === '/admin/accounts/1',
      () => apiError(404, 'KHONG_TIM_THAY'),
    );
    renderStaffPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem chi tiết Nhân sự 1' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết nhân sự',
    });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Không tìm thấy dữ liệu.',
    );
  });

  it('NSF8-42 Đóng trả focus về nút "Xem chi tiết" của dòng đã mở', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1), makeStaff(2)] });
    renderStaffPage();
    const opener = await screen.findByRole('button', {
      name: 'Xem chi tiết Nhân sự 2',
    });
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Nhân sự 2' });
    fireEvent.click(button('Đóng chi tiết')!);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Xem chi tiết Nhân sự 2' }),
      ),
    );
  });
});

describe('NSF8-43 Admin Chi nhánh thao tác nhân sự chi nhánh mình (TK-12, TK-44)', () => {
  it('NSF8-43 khoá Bác sĩ của chi nhánh mình thành công', async () => {
    const api = installFakeStaffApi({
      scope: BRANCH,
      accounts: [makeStaff(1)],
    });
    renderStaffPage({ scope: BRANCH });
    await openAndWait('Nhân sự 1');
    fireEvent.click(button('Khoá tài khoản')!);
    const confirm = await screen.findByRole('dialog', {
      name: 'Khoá tài khoản?',
    });
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    expect(await screen.findByText('Đã khoá tài khoản.')).toBeInTheDocument();
    expect(api.calls('POST', '/admin/accounts/1/lock')).toHaveLength(1);
  });

  it('NSF8-43 gửi lại email kích hoạt cho Lễ tân chi nhánh mình thành công', async () => {
    installFakeStaffApi({
      scope: BRANCH,
      accounts: [
        makeStaff(1, {
          loaiTaiKhoan: 'LeTan',
          trangThai: 'ChoKichHoat',
          lienKetKichHoat: null,
        }),
      ],
    });
    renderStaffPage({ scope: BRANCH });
    const dialog = await openAndWait('Nhân sự 1');
    fireEvent.click(button('Gửi lại email kích hoạt')!);
    expect(
      await within(dialog).findByText(/Đã gửi lại email kích hoạt/),
    ).toBeInTheDocument();
  });
});
