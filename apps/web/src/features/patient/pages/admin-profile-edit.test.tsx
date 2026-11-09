import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { apiError } from '../../../test/fake-auth-api';
import { getAuthState } from '../../auth/auth-store';
import {
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  SAVED_MESSAGE,
  SAVE_NETWORK_MESSAGE,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_UNEXPECTED_MESSAGE,
  SYSTEM_MESSAGE,
} from '../profile/profile-errors';
import {
  ADMIN_BRANCH_NAME,
  adminSidebar,
  renderAdminProfilePage,
} from '../testing/admin-profile-harness';
import {
  SAMPLE_ADMIN,
  SAMPLE_ADMIN_BRANCH,
  hang,
  json,
} from '../testing/fake-profile-api';
import {
  FORM_NAME,
  addressInput,
  birthInput,
  cancelButton,
  form,
  genderSelect,
  nameInput,
  openEditForm,
  phoneInput,
  saveButton,
  typeInto,
} from '../testing/profile-page-harness';
import { puts, rowValue } from '../testing/reception-profile-harness';

// patient F5 (TRACKING F5-F, F5-I): trang Quản trị viên ở chế độ sửa, thân PUT, lưu thành công, lỗi và vòng đời. Mã ca AP-nn là [đề xuất];
// mỗi ca ghi mã HS của PLAN mục 7.1. Luật của chính `ProfileForm` đã có test ở F3 (PW-30…PW-57) và F4 (TT-20…TT-57): ở đây kiểm phần RIÊNG của
// Quản trị viên (phạm vi và chi nhánh chỉ đọc, khoá thừa không vào PUT, tên ở thanh bên Admin, QUAY LẠI trạng thái cũ).
const EMAIL_NOTE = 'Email dùng để đăng nhập, không thể chỉnh sửa.';
const SCOPE_NOTE =
  'Phạm vi quản trị do quản trị viên khác phân công, không thể tự thay đổi.';
const BRANCH_NOTE =
  'Chi nhánh do quản trị viên khác phân công, không thể tự thay đổi.';
const SECRETS = /Riêng Tư|0912345678|31\/01\/2000|Kín Đáo/;
const fieldError = (input: HTMLElement) => {
  const id = input.getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent : undefined;
};
const badRequest = (loi: { truong: string; ma: string }[]) => () =>
  json(400, { maLoi: 'DU_LIEU_KHONG_HOP_LE', thongBao: 'CÂU CỦA API', loi });
const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('vào form sửa (HS-18, HS-21)', () => {
  it('AP-40 HS-18 HS-21 form tại chỗ: thẻ đầu giữ nguyên (không nhãn trạng thái), thẻ thông tin hết nút "Chỉnh sửa", ô điền đúng dữ liệu, focus Họ và tên; Esc không mất dữ liệu', async () => {
    await renderAdminProfilePage({ withLayout: false });
    await openEditForm();

    expect(screen.getByRole('form', { name: FORM_NAME })).toBeInTheDocument();
    expect(screen.getByText('Quản trị viên toàn hệ thống')).toBeInTheDocument();
    expect(screen.queryByText('Đang hoạt động')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Thông tin cá nhân' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();
    expect(nameInput().value).toBe('Admin CLINIX');
    expect(phoneInput().value).toBe('0954321098');
    expect(genderSelect().value).toBe('');
    expect(birthInput().value).toBe('');
    expect(addressInput().value).toBe('');
    expect(nameInput()).toHaveFocus();

    typeInto(addressInput(), 'Số 9 đường Mẫu');
    fireEvent.keyDown(addressInput(), { key: 'Escape' });
    expect(addressInput().value).toBe('Số 9 đường Mẫu');
    expect(screen.getByRole('form', { name: FORM_NAME })).toBeInTheDocument();
  });

  it('AP-41 HS-21 Toàn hệ thống: email và phạm vi là khối chữ KHÔNG có ô sửa, kèm câu chỉ đọc; KHÔNG có khối chi nhánh', async () => {
    await renderAdminProfilePage({ withLayout: false });
    await openEditForm();

    expect(screen.getAllByRole('textbox')).toHaveLength(4);
    expect(
      screen.queryByRole('textbox', { name: /Email|Phạm vi|Chi nhánh/ }),
    ).toBeNull();
    const email = screen.getByRole('group', { name: 'Email' });
    expect(
      within(email).getByText('admin@example.invalid'),
    ).toBeInTheDocument();
    expect(email.querySelector('input, select, textarea')).toBeNull();
    expect(email).toHaveAccessibleDescription(EMAIL_NOTE);
    const scope = screen.getByRole('group', { name: 'Phạm vi quản trị' });
    expect(within(scope).getByText('Toàn hệ thống')).toBeInTheDocument();
    expect(scope.querySelector('input, select, textarea')).toBeNull();
    expect(scope).toHaveAccessibleDescription(SCOPE_NOTE);
    expect(screen.getByText(SCOPE_NOTE)).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Chi nhánh quản trị' }),
    ).toBeNull();
    expect(screen.queryByText(BRANCH_NOTE)).toBeNull();
  });

  it('AP-42 HS-18 HS-21 Chi nhánh: thêm khối "Chi nhánh quản trị" (tên + câu chỉ đọc); thứ tự họ tên, SĐT, giới tính, ngày sinh, địa chỉ, email, phạm vi, chi nhánh, Hủy, Lưu; Tab không dừng ở khối chỉ đọc', async () => {
    await renderAdminProfilePage({ withLayout: false, scope: 'ChiNhanh' });
    await openEditForm();

    expect(screen.getAllByRole('textbox')).toHaveLength(4);
    const email = screen.getByRole('group', { name: 'Email' });
    const scope = screen.getByRole('group', { name: 'Phạm vi quản trị' });
    const branch = screen.getByRole('group', { name: 'Chi nhánh quản trị' });
    expect(within(scope).getByText('Chi nhánh')).toBeInTheDocument();
    expect(within(branch).getByText(ADMIN_BRANCH_NAME)).toBeInTheDocument();
    expect(branch.querySelector('input, select, textarea')).toBeNull();
    expect(branch).toHaveAccessibleDescription(BRANCH_NOTE);
    const inOrder = [
      nameInput(),
      phoneInput(),
      genderSelect(),
      birthInput(),
      addressInput(),
      email,
      scope,
      branch,
      cancelButton(),
      saveButton(),
    ];
    inOrder.forEach((element, index) => {
      if (index > 0) expect(follows(inOrder[index - 1], element)).toBe(true);
    });
    const tabbable = Array.from(
      form().querySelectorAll('input, select, textarea, button, a[href]'),
    );
    expect(tabbable).toEqual([
      nameInput(),
      phoneInput(),
      genderSelect(),
      birthInput(),
      addressInput(),
      cancelButton(),
      saveButton(),
    ]);
  });

  it('AP-43 HS-21 phạm vi lạ ⇒ khối phạm vi "Chưa cập nhật" và KHÔNG có khối chi nhánh (dù có chiNhanh)', async () => {
    await renderAdminProfilePage({
      withLayout: false,
      scope: 'ChiNhanh',
      initial: { phamViQuanTri: 'Khac' as never },
    });
    await openEditForm();

    const scope = screen.getByRole('group', { name: 'Phạm vi quản trị' });
    expect(within(scope).getByText('Chưa cập nhật')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Chi nhánh quản trị' }),
    ).toBeNull();
    expect(screen.queryByText(ADMIN_BRANCH_NAME)).toBeNull();
  });

  it('AP-44 HS-21 phạm vi Chi nhánh mà chiNhanh thiếu ⇒ khối chi nhánh "Chưa cập nhật", form vẫn dùng được và lưu được', async () => {
    await renderAdminProfilePage({
      withLayout: false,
      scope: 'ChiNhanh',
      initial: { chiNhanh: null },
    });
    await openEditForm();

    const branch = screen.getByRole('group', { name: 'Chi nhánh quản trị' });
    expect(within(branch).getByText('Chưa cập nhật')).toBeInTheDocument();
    typeInto(phoneInput(), '0912345678');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
  });
});

describe('thân PUT và lưu thành công (HS-18, HS-19, HS-21)', () => {
  it.each([
    ['Toàn hệ thống', 'ToanHeThong'],
    ['Chi nhánh', 'ChiNhanh'],
  ] as const)(
    'AP-50 HS-18 HS-21 phạm vi %s: PUT đúng NĂM khoá và giá trị chuẩn hoá; KHÔNG email, KHÔNG phamViQuanTri, KHÔNG chiNhanh dù hồ sơ có',
    async (_label, scope) => {
      const { profile } = await renderAdminProfilePage({
        withLayout: false,
        scope,
      });
      await openEditForm();
      typeInto(nameInput(), '  Trần Thị B  ');
      typeInto(phoneInput(), '0912 345 678');
      typeInto(genderSelect(), 'Nu');
      typeInto(birthInput(), '15/05/1990');
      typeInto(addressInput(), '  12 Đường Mẫu  ');

      fireEvent.click(saveButton());
      await screen.findByText(SAVED_MESSAGE);

      const sent = puts(profile);
      expect(sent).toHaveLength(1);
      const body = sent[0].body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        'diaChi',
        'gioiTinh',
        'hoTen',
        'ngaySinh',
        'soDienThoai',
      ]);
      expect(body).toMatchObject({
        hoTen: 'Trần Thị B',
        gioiTinh: 'Nu',
        ngaySinh: '1990-05-15',
        diaChi: '12 Đường Mẫu',
      });
      expect(body).not.toHaveProperty('email');
      expect(body).not.toHaveProperty('phamViQuanTri');
      expect(body).not.toHaveProperty('chiNhanh');
    },
  );

  it('AP-51 HS-19 HS-21 sau lưu thẻ hiện dữ liệu của PHẢN HỒI PUT (tên, SĐT, phạm vi, chi nhánh) dù khác hẳn thứ đã gõ và khác lần GET đầu', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    typeInto(nameInput(), 'Tên Đã Gõ');
    typeInto(phoneInput(), '0911111111');
    profile.failNext('PUT', () =>
      json(200, {
        ...SAMPLE_ADMIN_BRANCH,
        hoTen: 'Tên Của Máy Chủ',
        soDienThoai: '0922222222',
      }),
    );

    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

    expect(
      screen.getByText('Tên Của Máy Chủ', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tên Đã Gõ')).toBeNull();
    expect(rowValue('Họ và tên')).toBe('Tên Của Máy Chủ');
    expect(rowValue('Số điện thoại')).toBe('0922222222');
    expect(rowValue('Phạm vi quản trị')).toBe('Chi nhánh');
    expect(rowValue('Chi nhánh quản trị')).toBe(ADMIN_BRANCH_NAME);
    expect(screen.getByText('Quản trị viên chi nhánh')).toBeInTheDocument();
    expect(profile.count('GET')).toBe(1);
  });

  it('AP-52 HS-19 HS-21 thông báo role=status, về chế độ xem, phạm vi và chi nhánh KHÔNG đổi, focus "Chỉnh sửa", thông báo ở lại', async () => {
    await renderAdminProfilePage({ withLayout: false, scope: 'ChiNhanh' });
    await openEditForm();
    typeInto(phoneInput(), '0912345678');

    fireEvent.click(saveButton());

    const notice = await screen.findByText(SAVED_MESSAGE);
    expect(notice.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('form', { name: FORM_NAME })).toBeNull();
    expect(rowValue('Số điện thoại')).toBe('0912345678');
    expect(rowValue('Phạm vi quản trị')).toBe('Chi nhánh');
    expect(rowValue('Chi nhánh quản trị')).toBe(ADMIN_BRANCH_NAME);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toHaveFocus(),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(screen.getByText(SAVED_MESSAGE)).toBeInTheDocument();
  });

  it('AP-53 HS-19 trong khung Admin: sau PUT đúng một GET /api/auth/me mới và tên ở thanh bên Admin đổi; /admin/me không gọi lại, dòng phụ thanh bên giữ nguyên', async () => {
    const { auth, account, adminMe } = await renderAdminProfilePage({
      scope: 'ChiNhanh',
    });
    const aside = await adminSidebar();
    expect(within(aside).getByText('Admin CLINIX')).toBeInTheDocument();
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');
    // Phía máy chủ tên đã đổi: /auth/me sẽ trả tên mới
    account.hoTen = 'Trần Thị B';
    const meBefore = auth.meCalls;

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(within(aside).getByText('Trần Thị B')).toBeInTheDocument(),
    );
    expect(within(aside).queryByText('Admin CLINIX')).toBeNull();
    expect(auth.meCalls - meBefore).toBe(1);
    expect(getAuthState().user?.hoTen).toBe('Trần Thị B');
    expect(adminMe.calls).toBe(1);
    expect(
      within(aside).getByText(`Quản trị viên · ${ADMIN_BRANCH_NAME}`),
    ).toBeInTheDocument();
  });

  it('AP-54 HS-19 /auth/me lỗi sau lưu ⇒ vẫn báo thành công, không hộp lỗi; thanh bên chưa đổi tên', async () => {
    const { auth } = await renderAdminProfilePage();
    const aside = await adminSidebar();
    auth.failNext('/auth/me', () => apiError(500, 'LOI_HE_THONG'));
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');

    fireEvent.click(saveButton());

    await screen.findByText(SAVED_MESSAGE);
    await waitFor(() => expect(auth.meCalls).toBe(2));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(rowValue('Họ và tên')).toBe('Trần Thị B');
    expect(within(aside).getByText('Admin CLINIX')).toBeInTheDocument();
  });
});

describe('QUAY LẠI trạng thái cũ (HS-18, HS-20; bài học F8)', () => {
  it('AP-55 HS-20 sửa, đổi, "Hủy", mở lại ⇒ form có dữ liệu CŨ (không giữ chữ đã gõ), không PUT, không thông báo, focus "Chỉnh sửa"', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    typeInto(nameInput(), 'Tên sẽ bị bỏ');
    typeInto(phoneInput(), '0912345678');

    fireEvent.click(cancelButton());

    expect(screen.queryByRole('form', { name: FORM_NAME })).toBeNull();
    expect(rowValue('Họ và tên')).toBe('Admin CLINIX');
    expect(rowValue('Số điện thoại')).toBe('0954321098');
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toHaveFocus(),
    );
    expect(puts(profile)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(nameInput().value).toBe('Admin CLINIX');
    expect(phoneInput().value).toBe('0954321098');
    expect(nameInput()).toHaveFocus();
  });

  it('AP-56 HS-20 sau một lần 400 rồi "Hủy" ⇒ mở lại form thấy dữ liệu CŨ và không còn câu lỗi', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    typeInto(nameInput(), 'Tên đã gõ');
    profile.failNext(
      'PUT',
      badRequest([{ truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' }]),
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(fieldError(nameInput())).toBeTruthy());

    fireEvent.click(cancelButton());
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));

    expect(nameInput().value).toBe('Admin CLINIX');
    expect(fieldError(nameInput())).toBeUndefined();
  });

  it('AP-57 HS-19 HS-20 lưu rồi sửa lại ⇒ thông báo "Đã cập nhật" BIẾN MẤT; gõ rồi "Hủy" ⇒ thấy dữ liệu VỪA LƯU (không phải ban đầu), thông báo không quay lại', async () => {
    await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    expect(nameInput().value).toBe('Trần Thị B');
    typeInto(nameInput(), 'Tên bị bỏ');
    fireEvent.click(cancelButton());

    expect(rowValue('Họ và tên')).toBe('Trần Thị B');
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(nameInput().value).toBe('Trần Thị B');
  });

  it('AP-58 HS-20 rời trang đang sửa (sang tổng quan Admin) rồi Back ⇒ GET MỚI, về chế độ xem với dữ liệu cũ, không form, không thông báo', async () => {
    const { profile, router } = await renderAdminProfilePage();
    await openEditForm();
    typeInto(nameInput(), 'Chữ chưa lưu');

    await act(() => router.navigate('/admin'));
    expect(screen.queryByRole('form', { name: FORM_NAME })).toBeNull();
    await act(() => router.navigate(-1));

    await screen.findByRole('button', { name: 'Chỉnh sửa' });
    expect(profile.count('GET')).toBe(2);
    expect(rowValue('Họ và tên')).toBe('Admin CLINIX');
    expect(screen.queryByRole('form', { name: FORM_NAME })).toBeNull();
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    expect(puts(profile)).toHaveLength(0);
  });
});

describe('lỗi và vòng đời khi lưu (HS-18, HS-20)', () => {
  it('AP-60 HS-18 400 loi[] đảo thứ tự ⇒ câu đúng ô, focus ô ĐẦU theo form, dữ liệu giữ; sửa rồi gửi lại ⇒ thành công', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    typeInto(nameInput(), 'Tên đã gõ');
    typeInto(phoneInput(), '0912345678');
    profile.failNext(
      'PUT',
      badRequest([
        { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
        { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
      ]),
    );

    fireEvent.click(saveButton());

    await waitFor(() => expect(fieldError(nameInput())).toBeTruthy());
    expect(fieldError(nameInput())).toBe(FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE);
    expect(fieldError(phoneInput())).toBe(FIELD_MESSAGES.SDT_KHONG_HOP_LE);
    expect(nameInput()).toHaveFocus();
    expect(nameInput().value).toBe('Tên đã gõ');
    expect(phoneInput().value).toBe('0912345678');

    typeInto(phoneInput(), '0912345679');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(2);
  });

  it('AP-61 HS-18 400 báo trường không được phép (email, phamViQuanTri, chiNhanh) ⇒ hộp lỗi chung, focus hộp, dữ liệu giữ', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    typeInto(phoneInput(), '0912345678');
    profile.failNext(
      'PUT',
      badRequest([
        { truong: 'phamViQuanTri', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        { truong: 'chiNhanh', ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]),
    );

    fireEvent.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(INVALID_DATA_MESSAGE);
    expect(alert).toHaveFocus();
    expect(phoneInput().value).toBe('0912345678');
  });

  it.each([
    [
      'mất mạng',
      () => {
        throw new TypeError('Failed to fetch');
      },
      SAVE_NETWORK_MESSAGE,
    ],
    [
      '500 LOI_HE_THONG',
      () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'CÂU CỦA API' }),
      SYSTEM_MESSAGE,
    ],
    [
      '200 nhưng chiNhanh sai hình dạng',
      () => json(200, { ...SAMPLE_ADMIN_BRANCH, chiNhanh: 5 }),
      SAVE_UNEXPECTED_MESSAGE,
    ],
  ])(
    'AP-62 HS-20 %s ⇒ câu đúng, dữ liệu giữ, KHÔNG tự thử lại, bấm Lưu lại được ⇒ thành công',
    async (_label, failure, message) => {
      const { profile } = await renderAdminProfilePage({
        withLayout: false,
        scope: 'ChiNhanh',
      });
      await openEditForm();
      typeInto(phoneInput(), '0912345678');
      profile.failNext('PUT', failure);

      fireEvent.click(saveButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      expect(phoneInput().value).toBe('0912345678');
      expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect(puts(profile)).toHaveLength(1);

      fireEvent.click(saveButton());
      await screen.findByText(SAVED_MESSAGE);
      expect(puts(profile)).toHaveLength(2);
      expect(rowValue('Số điện thoại')).toBe('0912345678');
    },
  );

  it('AP-63 HS-20 quá giờ 15 giây ⇒ câu quá giờ, dữ liệu giữ, không tự gửi lại sau 60 giây, bấm Lưu lại được', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    typeInto(phoneInput(), '0912345678');
    vi.useFakeTimers();
    profile.failNext('PUT', (init) => hang(init));

    fireEvent.click(saveButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(SAVE_TIMEOUT_MESSAGE);
    expect(phoneInput().value).toBe('0912345678');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(puts(profile)).toHaveLength(1);

    vi.useRealTimers();
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(2);
  });

  it('AP-64 HS-20 đang lưu: hai lần gửi liên tiếp chỉ ra MỘT PUT; nút "Đang lưu…" vô hiệu, form aria-busy, "Hủy" vô hiệu', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    const release = profile.hold('PUT');

    const events = [
      new Event('submit', { bubbles: true, cancelable: true }),
      new Event('submit', { bubbles: true, cancelable: true }),
    ];
    act(() => {
      for (const event of events) form().dispatchEvent(event);
    });

    expect(puts(profile)).toHaveLength(1);
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(saveButton()).toHaveTextContent('Đang lưu…');
    expect(form()).toHaveAttribute('aria-busy', 'true');
    expect(cancelButton()).toBeDisabled();

    release(200, SAMPLE_ADMIN);
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });

  it('AP-65 HS-18 SĐT trống ⇒ chặn: 0 PUT, câu lỗi dưới ô, focus ô SĐT; sửa lại rồi gửi thành công', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    typeInto(phoneInput(), '');

    fireEvent.click(saveButton());

    await waitFor(() => expect(fieldError(phoneInput())).toBeTruthy());
    expect(phoneInput()).toHaveFocus();
    expect(puts(profile)).toHaveLength(0);

    typeInto(phoneInput(), '0912345678');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });

  it('AP-66 HS-20 PUT bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, trang không hiện câu lỗi, không thử lại', async () => {
    const { profile } = await renderAdminProfilePage({ withLayout: false });
    await openEditForm();
    profile.failNext('PUT', () =>
      json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
    );

    fireEvent.click(saveButton());

    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    expect(getAuthState().sessionEnded).toBe(true);
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(puts(profile)).toHaveLength(1);
  });
});

describe('dữ liệu cá nhân (HS-20)', () => {
  it('AP-67 HS-20 mọi luồng lỗi và lưu không gọi console.*; họ tên, SĐT, ngày sinh, địa chỉ không lọt vào URL, tiêu đề, lịch sử hay kho trình duyệt', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const titleBefore = document.title;
    const { profile, router } = await renderAdminProfilePage();
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị Riêng Tư');
    typeInto(phoneInput(), '0912345678');
    typeInto(birthInput(), '31/01/2000');
    typeInto(addressInput(), '99 Đường Kín Đáo');

    const attempts: [() => Response, string][] = [
      [
        () => {
          throw new TypeError('Failed to fetch');
        },
        SAVE_NETWORK_MESSAGE,
      ],
      [
        () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'CÂU CỦA API' }),
        SYSTEM_MESSAGE,
      ],
      [
        badRequest([{ truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' }]),
        FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
      ],
    ];
    for (const [failure, message] of attempts) {
      profile.failNext('PUT', failure);
      fireEvent.click(saveButton());
      const shown = await screen.findByText(message);
      expect(shown.textContent).not.toMatch(SECRETS);
    }
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.title).toBe(titleBefore);
    const here = router.state.location;
    expect(`${here.pathname}${here.search}${here.hash}`).not.toMatch(SECRETS);
    expect(JSON.stringify(here.state ?? null)).not.toMatch(SECRETS);
  });
});
