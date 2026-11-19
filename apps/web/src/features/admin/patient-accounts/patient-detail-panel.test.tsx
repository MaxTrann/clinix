import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  BRANCH,
  apiError,
  installFakeApi,
  json,
  makeGate,
  makePatient,
  openDetail,
  renderPatientPage,
  rowButton,
} from './testing/patient-accounts-test-kit';

// admin F9, chi tiết Bệnh nhân, khoá và mở khoá (mã TKF9-30 đến 39 là [đề xuất], TRACKING admin 9A.12 mục 3). Phủ TK-26 (ẩn nút theo quyền, hộp xác nhận,
// hiển thị lỗi A1 đến A6) và phía giao diện của TK-04 (Chi nhánh chỉ sáu trường), TK-15. API giả có trạng thái ở mức hợp đồng B17 và B18.

const LOCK_TITLE = 'Khoá tài khoản bệnh nhân?';
const lockButton = () =>
  screen.queryByRole('button', { name: 'Khoá tài khoản' });
const unlockButton = () =>
  screen.queryByRole('button', { name: 'Mở khoá tài khoản' });
const noShowButton = () =>
  screen.queryByRole('button', { name: 'Mở khoá no-show' });
const actionButtons = () => ({
  lock: lockButton() !== null,
  unlock: unlockButton() !== null,
  noShow: noShowButton() !== null,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TKF9-30 TK-26: nút nào hiện (Toàn hệ thống)', () => {
  it.each([
    [
      'đang hoạt động, không bị khoá no-show',
      { trangThai: 'DangHoatDong', khoaDatLichDoNoShow: false },
      { lock: true, unlock: false, noShow: false },
    ],
    [
      'ngừng hoạt động, không bị khoá no-show',
      { trangThai: 'NgungHoatDong', khoaDatLichDoNoShow: false },
      { lock: false, unlock: true, noShow: false },
    ],
    [
      'đang hoạt động, đang bị khoá no-show',
      { trangThai: 'DangHoatDong', khoaDatLichDoNoShow: true, soLanNoShow: 3 },
      { lock: true, unlock: false, noShow: true },
    ],
    [
      'ngừng hoạt động, đang bị khoá no-show',
      { trangThai: 'NgungHoatDong', khoaDatLichDoNoShow: true, soLanNoShow: 3 },
      { lock: false, unlock: true, noShow: true },
    ],
    [
      'chưa xác minh OTP (chưa có hồ sơ bệnh nhân, cờ null)',
      {
        trangThai: 'DangHoatDong',
        khoaDatLichDoNoShow: null,
        soLanNoShow: null,
        daXacMinhEmail: false,
      },
      { lock: true, unlock: false, noShow: false },
    ],
  ] as const)('TKF9-30 %s', async (_label, overrides, expected) => {
    installFakeApi({ accounts: [makePatient(1, overrides)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    expect(actionButtons()).toEqual(expected);
  });

  it('TKF9-30 chưa có hồ sơ bệnh nhân: số lần và cờ no-show là "Chưa có", không phải 0 hay "Không bị khoá"', async () => {
    installFakeApi({
      accounts: [
        makePatient(1, {
          khoaDatLichDoNoShow: null,
          soLanNoShow: null,
          daXacMinhEmail: false,
          ngaySinh: null,
          gioiTinh: null,
        }),
      ],
    });
    renderPatientPage();
    const panel = await openDetail('Bệnh nhân 1');
    const terms = within(panel)
      .getAllByRole('term')
      .map((t) => t.textContent);
    const values = within(panel)
      .getAllByRole('definition')
      .map((d) => d.textContent);
    const byLabel = Object.fromEntries(
      terms.map((label, i) => [label, values[i]]),
    );
    expect(byLabel['Khoá đặt lịch do no-show']).toBe('Chưa có');
    expect(byLabel['Số lần no-show']).toBe('Chưa có');
    expect(byLabel['Ngày sinh']).toBe('Chưa có');
    expect(byLabel['Xác minh email']).toBe('Chưa xác minh');
  });

  it('TKF9-30 chi tiết đang tải rồi tải lỗi: có "Thử lại", bấm thì tải lại và hiện đủ nội dung', async () => {
    const api = installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await screen.findByRole('table');
    api.override(
      (r) => r.path === '/admin/accounts/1',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    fireEvent.click(rowButton('Bệnh nhân 1'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('dialog', { name: 'Bệnh nhân 1' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('TKF9-31 TK-26 và TK-15: Admin Chi nhánh KHÔNG có nút hành động nào', () => {
  it.each([
    ['đang hoạt động', { trangThai: 'DangHoatDong' as const }],
    ['ngừng hoạt động', { trangThai: 'NgungHoatDong' as const }],
  ])(
    'TKF9-31 Bệnh nhân %s: không "Khoá", "Mở khoá" hay "Mở khoá no-show"; có ghi chú chỉ xem',
    async (_label, overrides) => {
      installFakeApi({ scope: BRANCH, accounts: [makePatient(1, overrides)] });
      renderPatientPage({ scope: BRANCH });
      const panel = await openDetail('Bệnh nhân 1');

      expect(actionButtons()).toEqual({
        lock: false,
        unlock: false,
        noShow: false,
      });
      // Không nút nào ngoài "Đóng"
      expect(
        within(panel)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Đóng']);
      expect(within(panel).getByRole('note')).toHaveTextContent(
        'Bạn chỉ có quyền xem',
      );
    },
  );

  it('TKF9-31 Chi nhánh mở chi tiết: KHÔNG có lời gọi /admin/system-config và không có lời gọi ghi nào', async () => {
    const api = installFakeApi({ scope: BRANCH, accounts: [makePatient(1)] });
    renderPatientPage({ scope: BRANCH });
    await openDetail('Bệnh nhân 1');
    expect(api.calls('GET', '/admin/system-config')).toHaveLength(0);
    expect(api.posts()).toHaveLength(0);
  });
});

describe('TKF9-32 TK-04 phía giao diện: Chi nhánh chỉ thấy sáu trường, kể cả khi API trả thừa', () => {
  it('TKF9-32 API trả đủ 13 khoá cho Chi nhánh: panel và bảng vẫn chỉ có sáu trường, không có địa chỉ, ngày tạo, no-show', async () => {
    installFakeApi({
      scope: BRANCH,
      overfull: true,
      accounts: [
        makePatient(1, {
          diaChi: 'Địa chỉ riêng tư',
          khoaDatLichDoNoShow: true,
          soLanNoShow: 9,
        }),
      ],
    });
    const { container } = renderPatientPage({ scope: BRANCH });
    const panel = await openDetail('Bệnh nhân 1');

    expect(
      within(panel)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual([
      'Họ tên',
      'Email',
      'Số điện thoại',
      'Ngày sinh',
      'Giới tính',
      'Trạng thái',
    ]);
    expect(container.ownerDocument.body.textContent).not.toContain(
      'Địa chỉ riêng tư',
    );
    expect(container.ownerDocument.body.textContent).not.toContain(
      '19/11/2026',
    );
    expect(container.ownerDocument.body.textContent).not.toMatch(/no-show/);
    expect(within(panel).getByText('07/05/1990')).toBeInTheDocument();
  });

  it('TKF9-32 Toàn hệ thống: mười một dòng, có địa chỉ, ngày tạo theo giờ Việt Nam, khoá và số lần no-show', async () => {
    installFakeApi({
      accounts: [makePatient(1, { khoaDatLichDoNoShow: true, soLanNoShow: 3 })],
    });
    renderPatientPage();
    const panel = await openDetail('Bệnh nhân 1');
    const terms = within(panel)
      .getAllByRole('term')
      .map((t) => t.textContent);
    expect(terms).toHaveLength(11);
    expect(within(panel).getByText('Số 1 đường mẫu')).toBeInTheDocument();
    expect(within(panel).getByText('19/11/2026 00:30')).toBeInTheDocument();
    expect(within(panel).getByText('Đang bị khoá')).toBeInTheDocument();
    expect(within(panel).getByText('3')).toBeInTheDocument();
  });

  it('TKF9-32 họ tên chứa thẻ HTML ở panel hiển thị nguyên văn', async () => {
    installFakeApi({
      accounts: [
        makePatient(1, { hoTen: '<img src="x" onerror="window.xss=1">' }),
      ],
    });
    const { container } = renderPatientPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /Xem chi tiết/ }));
    const panel = await screen.findByRole('dialog', {
      name: '<img src="x" onerror="window.xss=1">',
    });
    expect(
      within(panel).getAllByText('<img src="x" onerror="window.xss=1">').length,
    ).toBeGreaterThan(0);
    expect(container.ownerDocument.querySelector('img[src="x"]')).toBeNull();
  });
});

describe('TKF9-33 khoá có hộp xác nhận, mở khoá gọi ngay', () => {
  it('TKF9-33 bấm "Khoá": mở hộp, CHƯA gọi POST; "Huỷ" thì không gọi gì và panel trở lại', async () => {
    const api = installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');

    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    expect(dialog).toHaveTextContent('Bệnh nhân 1');
    expect(dialog).toHaveTextContent('đăng xuất khỏi mọi thiết bị ngay');
    expect(dialog).toHaveTextContent(
      'Lịch hẹn đã đặt không bị huỷ hay thay đổi.',
    );
    expect(api.posts()).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog', { name: LOCK_TITLE })).toBeNull();
    expect(
      await screen.findByRole('dialog', { name: 'Bệnh nhân 1' }),
    ).toBeInTheDocument();
    expect(api.posts()).toHaveLength(0);
  });

  it('TKF9-33 xác nhận: đúng MỘT POST …/lock không thân; hộp đóng; thông báo; trạng thái mới là của API; có nút "Mở khoá"', async () => {
    const api = installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
    );

    expect(await screen.findByText('Đã khoá tài khoản.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.queryByRole('dialog', { name: LOCK_TITLE })).toBeNull();
    expect(api.posts()).toHaveLength(1);
    expect(api.posts()[0].path).toBe('/admin/accounts/1/lock');
    expect(api.posts()[0].body).toBeUndefined();
    const panel = await screen.findByRole('dialog', { name: 'Bệnh nhân 1' });
    await waitFor(() =>
      expect(within(panel).getByText('Ngừng hoạt động')).toBeInTheDocument(),
    );
    expect(actionButtons()).toEqual({
      lock: false,
      unlock: true,
      noShow: false,
    });
  });

  it('TKF9-33 "Mở khoá tài khoản" gọi ngay (KHÔNG hộp xác nhận): POST …/unlock, rồi trạng thái "Đang hoạt động"', async () => {
    const api = installFakeApi({
      accounts: [makePatient(1, { trangThai: 'NgungHoatDong' })],
    });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(unlockButton() as HTMLElement);

    expect(
      await screen.findByText('Đã mở khoá tài khoản.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Khoá|Mở khoá/ })).toBeNull();
    expect(api.posts().map((r) => r.path)).toEqual([
      '/admin/accounts/1/unlock',
    ]);
    // `findBy`, không `getBy`: ngay sau thông báo, chi tiết còn đang tải lại và tên hộp tạm là tiêu đề mặc định (test chập chờn do đột biến M21 làm lộ)
    const panel = await screen.findByRole('dialog', { name: 'Bệnh nhân 1' });
    await waitFor(() =>
      expect(within(panel).getByText('Đang hoạt động')).toBeInTheDocument(),
    );
    expect(actionButtons()).toEqual({
      lock: true,
      unlock: false,
      noShow: false,
    });
  });
});

describe('TKF9-34 sau mỗi hành động chi tiết và danh sách được TẢI LẠI từ API (không đổi cục bộ)', () => {
  it('TKF9-34 sau khoá thành công: GET chi tiết lần hai và GET danh sách lần hai; bảng đổi sang "Ngừng hoạt động"', async () => {
    const api = installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    expect(api.calls('GET', '/admin/accounts/1')).toHaveLength(1);
    expect(api.lists()).toHaveLength(1);

    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    await screen.findByText('Đã khoá tài khoản.');

    await waitFor(() =>
      expect(api.calls('GET', '/admin/accounts/1')).toHaveLength(2),
    );
    await waitFor(() => expect(api.lists()).toHaveLength(2));
    const row = within(
      screen.getByRole('table', { name: 'Danh sách tài khoản bệnh nhân' }),
    ).getAllByRole('row')[1];
    await waitFor(() =>
      expect(within(row).getByText('Ngừng hoạt động')).toBeInTheDocument(),
    );
  });

  it('TKF9-34 POST trả 200 nhưng API KHÔNG đổi gì: giao diện KHÔNG tự đổi trạng thái (vẫn "Đang hoạt động", vẫn có nút "Khoá")', async () => {
    const api = installFakeApi({ accounts: [makePatient(1)] });
    api.override(
      (r) => r.method === 'POST',
      () => json({ taiKhoanId: '1' }),
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    await screen.findByText('Đã khoá tài khoản.');
    await waitFor(() =>
      expect(api.calls('GET', '/admin/accounts/1')).toHaveLength(2),
    );

    const panel = await screen.findByRole('dialog', { name: 'Bệnh nhân 1' });
    expect(within(panel).getByText('Đang hoạt động')).toBeInTheDocument();
    expect(actionButtons()).toEqual({
      lock: true,
      unlock: false,
      noShow: false,
    });
  });

  it('TKF9-34 thông báo "Đã khoá" còn hiện trong lúc chi tiết đang tải lại', async () => {
    const gate = makeGate();
    const api = installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    api.override(
      (r) => r.method === 'GET' && r.path === '/admin/accounts/1',
      async () => {
        await gate.promise;
        return json({ ...api.accounts[0] });
      },
    );
    try {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
      );
      expect(
        await screen.findByText('Đang tải chi tiết tài khoản…'),
      ).toBeInTheDocument();
      expect(screen.getByText('Đã khoá tài khoản.')).toBeInTheDocument();
    } finally {
      gate.open();
    }
    await waitFor(() =>
      expect(screen.queryByText('Đang tải chi tiết tài khoản…')).toBeNull(),
    );
  });
});

describe('TKF9-35 chặn gửi hai lần', () => {
  it('TKF9-35 "Mở khoá tài khoản" bấm hai lần trong CÙNG một lượt (trước khi vẽ lại): đúng MỘT POST', async () => {
    const gate = makeGate();
    const api = installFakeApi({
      accounts: [makePatient(1, { trangThai: 'NgungHoatDong' })],
    });
    api.override(
      (r) => r.method === 'POST',
      async () => {
        await gate.promise;
        return json({ taiKhoanId: '1' });
      },
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    const button = unlockButton() as HTMLButtonElement;
    try {
      act(() => {
        button.click();
        button.click();
      });
      await waitFor(() => expect(api.posts()).toHaveLength(1));
    } finally {
      gate.open();
    }
    await screen.findByText('Đã mở khoá tài khoản.');
    expect(api.posts()).toHaveLength(1);
  });

  it('TKF9-35 nút xác nhận khoá bấm hai lần trong CÙNG một lượt: đúng MỘT POST, và nút bị tắt khi đang xử lý', async () => {
    const gate = makeGate();
    const api = installFakeApi({ accounts: [makePatient(1)] });
    api.override(
      (r) => r.method === 'POST',
      async () => {
        await gate.promise;
        return json({ taiKhoanId: '1' });
      },
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    const confirm = within(dialog).getByRole('button', {
      name: 'Khoá tài khoản',
    }) as HTMLButtonElement;
    try {
      act(() => {
        confirm.click();
        confirm.click();
      });
      expect(
        await within(dialog).findByRole('button', { name: 'Đang xử lý…' }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole('button', { name: 'Huỷ' }),
      ).toBeDisabled();
      expect(api.posts()).toHaveLength(1);
    } finally {
      gate.open();
    }
    await screen.findByText('Đã khoá tài khoản.');
    expect(api.posts()).toHaveLength(1);
  });
});

describe('TKF9-36 hộp xác nhận mở trên panel: bàn phím không đụng nhau', () => {
  async function openLockDialog() {
    installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(lockButton() as HTMLElement);
    return screen.findByRole('dialog', { name: LOCK_TITLE });
  }

  it('TKF9-36 chỉ MỘT hộp thoại tại một thời điểm: panel tạm ẩn khi hộp xác nhận mở', async () => {
    await openLockDialog();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Bệnh nhân 1' })).toBeNull();
  });

  it('TKF9-36 Esc đóng CHỈ hộp xác nhận; panel trở lại; Esc lần hai mới đóng panel', async () => {
    await openLockDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: LOCK_TITLE })).toBeNull();
    expect(
      await screen.findByRole('dialog', { name: 'Bệnh nhân 1' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('TKF9-36 Tab ở nút ĐẦU của hộp không bị chặn (đi tiếp sang nút thứ hai); ở nút CUỐI quay về nút đầu; Shift+Tab ở nút đầu về nút cuối', async () => {
    const dialog = await openLockDialog();
    const cancel = within(dialog).getByRole('button', { name: 'Huỷ' });
    const confirm = within(dialog).getByRole('button', {
      name: 'Khoá tài khoản',
    });

    cancel.focus();
    // true = sự kiện KHÔNG bị `preventDefault`: trình duyệt tự đưa focus sang nút kế tiếp
    expect(fireEvent.keyDown(cancel, { key: 'Tab' })).toBe(true);
    expect(cancel).toHaveFocus();

    confirm.focus();
    expect(fireEvent.keyDown(confirm, { key: 'Tab' })).toBe(false);
    expect(cancel).toHaveFocus();

    expect(fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })).toBe(
      false,
    );
    expect(confirm).toHaveFocus();
  });

  it('TKF9-36 focus: mở panel từ nút hàng, mở rồi huỷ hộp thì focus về panel; đóng panel thì focus về nút hàng', async () => {
    installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await screen.findByRole('table');
    const opener = rowButton('Bệnh nhân 1');
    opener.focus();
    fireEvent.click(opener);
    const panel = await screen.findByRole('dialog', { name: 'Bệnh nhân 1' });
    expect(panel).toHaveFocus();

    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    expect(dialog).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    expect(
      await screen.findByRole('dialog', { name: 'Bệnh nhân 1' }),
    ).toHaveFocus();

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Đóng chi tiết',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(rowButton('Bệnh nhân 1')).toHaveFocus();
  });
});

describe('TKF9-38 TK-26: mọi lỗi A1 đến A6 + mạng + 500 hiện đúng chữ, hộp đóng, chi tiết được tải lại', () => {
  it.each([
    [403, 'KHONG_DU_QUYEN', 'Bạn không có quyền thực hiện thao tác này.'],
    [
      409,
      'TRANG_THAI_KHONG_PHU_HOP',
      'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
    ],
    [409, 'TU_KHOA_TAI_KHOAN', 'Không thể tự khoá tài khoản của chính mình.'],
    [
      409,
      'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
      'Phải còn ít nhất một Quản trị viên Toàn hệ thống đang hoạt động.',
    ],
    [
      409,
      'TAI_KHOAN_CHO_KICH_HOAT',
      'Tài khoản đang chờ kích hoạt. Hãy dùng "Gửi lại liên kết kích hoạt".',
    ],
    [
      500,
      'LOI_HE_THONG',
      'Không thực hiện được. Tài khoản chưa bị thay đổi, vui lòng thử lại.',
    ],
  ] as const)('TKF9-38 khoá gặp %s %s', async (status, maLoi, text) => {
    const api = installFakeApi({ accounts: [makePatient(1)] });
    api.override(
      (r) => r.method === 'POST',
      () => apiError(status, maLoi),
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByRole('dialog', { name: LOCK_TITLE })).toBeNull();
    // chi tiết và danh sách được tải lại từ API để người dùng thấy trạng thái thật
    await waitFor(() =>
      expect(api.calls('GET', '/admin/accounts/1')).toHaveLength(2),
    );
    await waitFor(() => expect(api.lists()).toHaveLength(2));
    expect(api.posts()).toHaveLength(1);
  });

  it('TKF9-38 mất mạng khi mở khoá: nói "Chưa rõ thao tác đã được thực hiện hay chưa", rồi tải lại để thấy trạng thái thật', async () => {
    const api = installFakeApi({
      accounts: [makePatient(1, { trangThai: 'NgungHoatDong' })],
    });
    api.override(
      (r) => r.method === 'POST',
      () => Promise.reject(new TypeError('Failed to fetch')),
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(unlockButton() as HTMLElement);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    expect(alert).toHaveTextContent(
      'Chưa rõ thao tác đã được thực hiện hay chưa.',
    );
    await waitFor(() =>
      expect(api.calls('GET', '/admin/accounts/1')).toHaveLength(2),
    );
    // sau lần tải lại, nút vẫn theo trạng thái thật của API (chưa mở khoá được)
    await waitFor(() => expect(unlockButton()).not.toBeNull());
  });

  it('TKF9-38 lỗi rồi bấm lại thành công: thông báo lỗi cũ biến mất, thay bằng "Đã mở khoá"', async () => {
    const api = installFakeApi({
      accounts: [makePatient(1, { trangThai: 'NgungHoatDong' })],
    });
    api.override(
      (r) => r.method === 'POST',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(unlockButton() as HTMLElement);
    await screen.findByRole('alert');
    await waitFor(() => expect(unlockButton()).not.toBeNull());

    fireEvent.click(unlockButton() as HTMLElement);
    expect(
      await screen.findByText('Đã mở khoá tài khoản.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('TKF9-38 404 khi khoá (tài khoản đã mất hoặc ra khỏi phạm vi): panel ĐÓNG, danh sách tải lại, thông báo ở trang; chi tiết không tải lại', async () => {
    const api = installFakeApi({ accounts: [makePatient(1)] });
    api.override(
      (r) => r.method === 'POST',
      () => apiError(404, 'KHONG_TIM_THAY'),
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy dữ liệu.',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(api.lists()).toHaveLength(2));
    expect(api.calls('GET', '/admin/accounts/1')).toHaveLength(1);
  });
});

describe('TKF9-39 không ghi họ tên, email ra log', () => {
  it('TKF9-39 luồng khoá thành công và luồng lỗi không gọi console.*', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (name) => vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    const api = installFakeApi({ accounts: [makePatient(1), makePatient(2)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(lockButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    await screen.findByText('Đã khoá tài khoản.');

    api.override(
      (r) => r.method === 'POST',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mở khoá tài khoản' }),
    );
    await screen.findByRole('alert');
    // Chờ giao diện YÊN trước khi đọc console: sau lỗi, trang tải lại chi tiết và danh sách (hai cập nhật trạng thái)
    await waitFor(() =>
      expect(screen.queryByText('Đang tải chi tiết tài khoản…')).toBeNull(),
    );
    await screen.findByRole('table', { name: 'Danh sách tài khoản bệnh nhân' });
    await screen.findByRole('button', { name: 'Mở khoá tài khoản' });

    // Điều ca này khẳng định: mã của F9 KHÔNG ghi gì ra console (nhất là họ tên, email). Cảnh báo `An update to … was not wrapped in act(...)` là của HẠ TẦNG test, không
    // phải của mã F9: `setup.ts` chờ thêm một `setImmediate` sau mỗi `findBy` khi môi trường `act` đã được bật lại, nên cập nhật trạng thái muộn của lần tải lại có thể rơi vào
    // đúng khoảng đó (bắt được thông điệp thật khi chạy cả `apps/web`, 19/11/2026: `PatientAccountsPage`, một lần). Vì vậy bỏ riêng loại cảnh báo này, giữ nguyên mọi dòng khác.
    // So với mảng rỗng (không chỉ `not.toHaveBeenCalled`) để khi đỏ thì thấy NGAY dòng đã bị ghi ra.
    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map(String).join(' '))
      .filter((line) => !/not wrapped in act/.test(line));
    expect(logged).toEqual([]);
    // và dù ở loại nào, không dòng nào chứa họ tên hay email của bệnh nhân
    const everything = spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map(String).join(' '))
      .join('\n');
    expect(everything).not.toMatch(/Bệnh nhân 1|bn1@example\.test/);
  });
});
