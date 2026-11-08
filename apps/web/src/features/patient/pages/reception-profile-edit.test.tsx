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
  BIRTH_DATE_AFTER_TODAY_MESSAGE,
  BIRTH_DATE_TOO_EARLY_MESSAGE,
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  SAVED_MESSAGE,
  SAVE_NETWORK_MESSAGE,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_UNEXPECTED_MESSAGE,
  SYSTEM_MESSAGE,
} from '../profile/profile-errors';
import { hang, json, SAMPLE_RECEPTIONIST } from '../testing/fake-profile-api';
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
import {
  puts,
  renderReceptionProfilePage,
  rowValue,
} from '../testing/reception-profile-harness';

// patient F4 (TRACKING F4-F, F4-H): trang Lễ tân ở chế độ sửa, kiểm phía web, thân PUT, lưu thành công, lỗi và vòng đời khi lưu.
// Mã ca TT-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1. Luật của chính `ProfileForm` đã có test ở F3 (PW-30…PW-57): ở đây kiểm
// phần RIÊNG của trang Lễ tân (bố cục một cột, email và chi nhánh chỉ đọc, dữ liệu chi nhánh của phản hồi PUT) và các ca không được cắt.
const BRANCH_NOTE =
  'Chi nhánh do quản trị viên phân công, không thể tự thay đổi.';
const EMAIL_NOTE = 'Email dùng để đăng nhập, không thể chỉnh sửa.';
const fieldError = (input: HTMLElement) => {
  const id = input.getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent : undefined;
};
const badRequest = (loi: { truong: string; ma: string }[]) => () =>
  json(400, { maLoi: 'DU_LIEU_KHONG_HOP_LE', thongBao: 'CÂU CỦA API', loi });
const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const SECRETS = /Riêng Tư|0912345678|31\/01\/2000|Kín Đáo/;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('vào form sửa (HS-18, HS-21)', () => {
  it('TT-20 HS-18 HS-21 form tại chỗ: thẻ đầu giữ nguyên, thẻ thông tin hết nút "Chỉnh sửa", ô điền đúng dữ liệu, focus Họ và tên; Esc không mất dữ liệu', async () => {
    await renderReceptionProfilePage();
    await openEditForm();

    expect(screen.getByRole('form', { name: FORM_NAME })).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Thông tin cá nhân' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();
    expect(nameInput().value).toBe('Lê Thị Lệ Ngân');
    expect(phoneInput().value).toBe('0965432109');
    expect(genderSelect().value).toBe('');
    expect(birthInput().value).toBe('');
    expect(addressInput().value).toBe('');
    expect(nameInput()).toHaveFocus();

    typeInto(addressInput(), 'Số 9 đường Mẫu');
    fireEvent.keyDown(addressInput(), { key: 'Escape' });
    expect(addressInput().value).toBe('Số 9 đường Mẫu');
    expect(screen.getByRole('form', { name: FORM_NAME })).toBeInTheDocument();
  });

  it('TT-21 HS-21 email và chi nhánh là khối chữ KHÔNG có ô sửa, kèm câu chỉ đọc của Figma (email "không thể chỉnh sửa", chi nhánh đủ câu)', async () => {
    await renderReceptionProfilePage();
    await openEditForm();

    expect(screen.getAllByRole('textbox')).toHaveLength(4);
    expect(screen.queryByRole('textbox', { name: /Email/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Chi nhánh/ })).toBeNull();
    const email = screen.getByRole('group', { name: 'Email' });
    expect(
      within(email).getByText('letan@example.invalid'),
    ).toBeInTheDocument();
    expect(email.querySelector('input, select, textarea')).toBeNull();
    const branch = screen.getByRole('group', { name: 'Chi nhánh công tác' });
    expect(
      within(branch).getByText('CLINIX Chi nhánh Quận 3'),
    ).toBeInTheDocument();
    expect(branch.querySelector('input, select, textarea')).toBeNull();
    expect(screen.getByText(EMAIL_NOTE)).toBeInTheDocument();
    expect(
      screen.queryByText('Email dùng để đăng nhập, không thể thay đổi.'),
    ).toBeNull();
    expect(screen.getByText(BRANCH_NOTE)).toBeInTheDocument();
    expect(email).toHaveAccessibleDescription(EMAIL_NOTE);
    expect(branch).toHaveAccessibleDescription(BRANCH_NOTE);
  });

  it('TT-22 HS-18 thứ tự trên form: họ tên, SĐT, giới tính, ngày sinh, địa chỉ, email, chi nhánh, Hủy, Lưu; thứ tự Tab không có email, chi nhánh', async () => {
    await renderReceptionProfilePage();
    await openEditForm();

    const email = screen.getByRole('group', { name: 'Email' });
    const branch = screen.getByRole('group', { name: 'Chi nhánh công tác' });
    const inOrder = [
      nameInput(),
      phoneInput(),
      genderSelect(),
      birthInput(),
      addressInput(),
      email,
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

  it('TT-23 HS-18 dấu * và required chỉ ở Họ và tên và Số điện thoại (SĐT bắt buộc dù Figma 504:2 không vẽ *)', async () => {
    await renderReceptionProfilePage();
    await openEditForm();

    expect(nameInput()).toBeRequired();
    expect(phoneInput()).toBeRequired();
    expect(genderSelect()).not.toBeRequired();
    expect(birthInput()).not.toBeRequired();
    expect(addressInput()).not.toBeRequired();
    const stars = Array.from(form().querySelectorAll('label span')).filter(
      (span) => span.textContent === '*',
    );
    expect(stars).toHaveLength(2);
  });

  it('TT-24 HS-17 hồ sơ có đủ dữ liệu: ô điền đúng (giới tính theo mã, ngày dd/mm/yyyy); chi nhánh thiếu ⇒ khối chi nhánh "Chưa cập nhật"', async () => {
    await renderReceptionProfilePage({
      initial: {
        gioiTinh: 'Nu',
        ngaySinh: '1990-05-15',
        diaChi: '12 Đường Mẫu',
        chiNhanh: null,
      },
    });
    await openEditForm();

    expect(genderSelect().value).toBe('Nu');
    expect(birthInput().value).toBe('15/05/1990');
    expect(addressInput().value).toBe('12 Đường Mẫu');
    const branch = screen.getByRole('group', { name: 'Chi nhánh công tác' });
    expect(within(branch).getByText('Chưa cập nhật')).toBeInTheDocument();
  });
});

describe('thân PUT và lưu thành công (HS-18, HS-19, HS-21)', () => {
  it('TT-30 HS-18 HS-21 PUT đúng NĂM khoá và giá trị chuẩn hoá; KHÔNG email, KHÔNG chiNhanh dù hồ sơ có chi nhánh', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    typeInto(nameInput(), '  Trần Thị B  ');
    typeInto(phoneInput(), ' 0901 234 567 ');
    fireEvent.change(genderSelect(), { target: { value: 'Nu' } });
    typeInto(birthInput(), '31/01/2000');
    typeInto(addressInput(), '   ');

    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

    expect(puts(profile)).toHaveLength(1);
    const body = puts(profile)[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['diaChi', 'gioiTinh', 'hoTen', 'ngaySinh', 'soDienThoai'].sort(),
    );
    expect(body).toEqual({
      hoTen: 'Trần Thị B',
      soDienThoai: '0901 234 567',
      gioiTinh: 'Nu',
      ngaySinh: '2000-01-31',
      diaChi: null,
    });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('chiNhanh');
    expect(JSON.stringify(body)).not.toContain('letan@example.invalid');
    expect(JSON.stringify(body)).not.toContain('Quận 3');
  });

  it('TT-31 HS-18 xoá giới tính, ngày sinh, địa chỉ đã có ⇒ gửi null', async () => {
    const { profile } = await renderReceptionProfilePage({
      initial: { gioiTinh: 'Nam', ngaySinh: '1990-05-15', diaChi: 'Số 1' },
    });
    await openEditForm();
    fireEvent.change(genderSelect(), { target: { value: '' } });
    typeInto(birthInput(), '');
    typeInto(addressInput(), '');

    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

    expect(puts(profile)[0].body).toMatchObject({
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
    });
    expect(rowValue('Giới tính')).toBe('Chưa cập nhật');
    expect(rowValue('Ngày sinh')).toBe('Chưa cập nhật');
    expect(rowValue('Địa chỉ')).toBe('Chưa cập nhật');
  });

  it('TT-32 HS-19 HS-21 sau lưu thẻ hiện dữ liệu của PHẢN HỒI PUT (tên, SĐT, chi nhánh) dù khác hẳn thứ đã gõ; không hiện chữ đã gõ', async () => {
    const { profile } = await renderReceptionProfilePage({
      withLayout: false,
    });
    await openEditForm();
    typeInto(nameInput(), 'Tên người dùng gõ');
    profile.failNext('PUT', () =>
      json(200, {
        ...SAMPLE_RECEPTIONIST,
        hoTen: 'Tên máy chủ trả về',
        soDienThoai: '0988888888',
        chiNhanh: { chiNhanhId: '7', ten: 'CLINIX Chi nhánh Quận 7' },
      }),
    );

    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

    expect(rowValue('Họ và tên')).toBe('Tên máy chủ trả về');
    expect(rowValue('Số điện thoại')).toBe('0988888888');
    expect(rowValue('Chi nhánh công tác')).toBe('CLINIX Chi nhánh Quận 7');
    expect(
      screen.getByText('Lễ tân · CLINIX Chi nhánh Quận 7'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tên người dùng gõ')).toBeNull();
    expect(screen.queryByText(/Chi nhánh Quận 3/)).toBeNull();
  });

  it('TT-33 HS-19 thông báo role=status, về chế độ xem, SĐT là bản máy chủ chuẩn hoá, focus "Chỉnh sửa"; thông báo ở lại không hẹn giờ, mất khi sửa lại', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    typeInto(phoneInput(), '0901 234 568');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

    expect(screen.getByRole('status')).toHaveTextContent(SAVED_MESSAGE);
    expect(rowValue('Số điện thoại')).toBe('0901234568');
    expect(puts(profile)).toHaveLength(1);
    expect(screen.queryByRole('form', { name: FORM_NAME })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toHaveFocus(),
    );

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(screen.getByText(SAVED_MESSAGE)).toBeInTheDocument();
    vi.useRealTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
  });

  it('TT-34 HS-19 trong khung Lễ tân: sau PUT đúng một GET /api/auth/me mới và tên ở thanh bên đổi', async () => {
    const { auth, account } = await renderReceptionProfilePage();
    const aside = await screen.findByRole('complementary', {
      name: 'Điều hướng Lễ tân',
    });
    expect(within(aside).getByText('Lê Thị Lệ Ngân')).toBeInTheDocument();
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');
    // Phía máy chủ tên đã đổi: /auth/me sẽ trả tên mới
    account.hoTen = 'Trần Thị B';
    const meBefore = auth.meCalls;

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(within(aside).getByText('Trần Thị B')).toBeInTheDocument(),
    );
    expect(within(aside).queryByText('Lê Thị Lệ Ngân')).toBeNull();
    expect(auth.meCalls - meBefore).toBe(1);
    expect(getAuthState().user?.hoTen).toBe('Trần Thị B');
  });

  it('TT-35 HS-19 /auth/me lỗi sau lưu ⇒ vẫn báo thành công, không hộp lỗi; thanh bên chưa đổi tên', async () => {
    const { auth } = await renderReceptionProfilePage();
    const aside = await screen.findByRole('complementary', {
      name: 'Điều hướng Lễ tân',
    });
    auth.failNext('/auth/me', () => apiError(500, 'LOI_HE_THONG'));
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');

    fireEvent.click(saveButton());

    await screen.findByText(SAVED_MESSAGE);
    await waitFor(() => expect(auth.meCalls).toBe(2));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(rowValue('Họ và tên')).toBe('Trần Thị B');
    expect(within(aside).getByText('Lê Thị Lệ Ngân')).toBeInTheDocument();
  });

  it('TT-36 HS-20 sau khi lưu, sửa lại thấy dữ liệu vừa lưu và "Hủy" trả đúng dữ liệu đó (không phải dữ liệu ban đầu)', async () => {
    await renderReceptionProfilePage();
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(nameInput().value).toBe('Trần Thị B');
    typeInto(nameInput(), 'Tên bị bỏ');
    fireEvent.click(cancelButton());

    expect(rowValue('Họ và tên')).toBe('Trần Thị B');
  });

  it('TT-37 HS-18 Enter trong ô gửi form ⇒ đúng một PUT và thành công', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    typeInto(addressInput(), 'Số 9 đường Mẫu');

    fireEvent.submit(addressInput());

    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });
});

describe('kiểm phía web trước khi gửi (HS-18)', () => {
  it('TT-40 HS-18 SĐT trống ⇒ chặn: 0 PUT, câu lỗi dưới ô, focus ô SĐT; sửa lại rồi gửi thành công', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    typeInto(phoneInput(), '');

    fireEvent.click(saveButton());

    expect(fieldError(phoneInput())).toBe(FIELD_MESSAGES.SDT_KHONG_HOP_LE);
    expect(phoneInput()).toHaveFocus();
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true');
    expect(puts(profile)).toHaveLength(0);

    typeInto(phoneInput(), '0912345678');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });

  it.each([
    ['9 số', '090123456'],
    ['11 số', '09012345678'],
    ['không bắt đầu bằng 0', '1901234567'],
    ['có chữ', '09012345ab'],
  ])(
    'TT-41 HS-18 SĐT %s ⇒ 0 PUT và câu SDT_KHONG_HOP_LE',
    async (_label, phone) => {
      const { profile } = await renderReceptionProfilePage();
      await openEditForm();
      typeInto(phoneInput(), phone);

      fireEvent.click(saveButton());

      expect(fieldError(phoneInput())).toBe(FIELD_MESSAGES.SDT_KHONG_HOP_LE);
      expect(puts(profile)).toHaveLength(0);
    },
  );

  it.each([
    [
      'họ tên trống',
      () => typeInto(nameInput(), '   '),
      nameInput,
      NAME_REQUIRED_MESSAGE,
    ],
    [
      'họ tên không có chữ cái',
      () => typeInto(nameInput(), '12345'),
      nameInput,
      FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
    ],
    [
      'ngày sinh sau hôm nay',
      () => typeInto(birthInput(), '31/12/2999'),
      birthInput,
      BIRTH_DATE_AFTER_TODAY_MESSAGE,
    ],
    [
      'ngày sinh trước 1900',
      () => typeInto(birthInput(), '31/12/1899'),
      birthInput,
      BIRTH_DATE_TOO_EARLY_MESSAGE,
    ],
    [
      'ngày không có thật',
      () => typeInto(birthInput(), '31/02/2000'),
      birthInput,
      FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
    ],
    [
      'địa chỉ 256 ký tự',
      () => typeInto(addressInput(), 'a'.repeat(256)),
      addressInput,
      FIELD_MESSAGES.DIA_CHI_KHONG_HOP_LE,
    ],
  ])(
    'TT-42 HS-18 %s ⇒ 0 PUT, câu đúng dưới ô, focus ô đó',
    async (_label, fill, pick, message) => {
      const { profile } = await renderReceptionProfilePage();
      await openEditForm();
      fill();

      fireEvent.click(saveButton());

      expect(fieldError(pick())).toBe(message);
      expect(pick()).toHaveFocus();
      expect(puts(profile)).toHaveLength(0);
    },
  );

  it('TT-43 HS-18 nhiều ô sai cùng lúc ⇒ focus ô ĐẦU theo thứ tự form; sửa dần rồi gửi lại ⇒ đúng một PUT thành công', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    typeInto(nameInput(), '');
    typeInto(phoneInput(), '123');
    typeInto(birthInput(), '99/99/9999');

    fireEvent.click(saveButton());

    expect(nameInput()).toHaveFocus();
    expect(fieldError(nameInput())).toBe(NAME_REQUIRED_MESSAGE);
    expect(fieldError(phoneInput())).toBe(FIELD_MESSAGES.SDT_KHONG_HOP_LE);
    expect(fieldError(birthInput())).toBe(
      FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
    );
    expect(puts(profile)).toHaveLength(0);

    typeInto(nameInput(), 'Trần Thị B');
    typeInto(phoneInput(), '0912345678');
    typeInto(birthInput(), '');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });
});

describe('API trả lỗi và vòng đời khi lưu (HS-18, HS-20)', () => {
  it('TT-50 HS-18 400 loi[] đảo thứ tự ⇒ câu đúng ô, focus Họ và tên (không phải mục đầu của loi[]), dữ liệu giữ, không hộp lỗi chung; sửa rồi gửi lại thành công', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');
    typeInto(phoneInput(), '0912345678');
    typeInto(addressInput(), 'Số 1');
    profile.failNext(
      'PUT',
      badRequest([
        { truong: 'diaChi', ma: 'DIA_CHI_KHONG_HOP_LE' },
        { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
        { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
      ]),
    );

    fireEvent.click(saveButton());

    await waitFor(() => expect(nameInput()).toHaveFocus());
    expect(fieldError(nameInput())).toBe(FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE);
    expect(fieldError(phoneInput())).toBe(FIELD_MESSAGES.SDT_KHONG_HOP_LE);
    expect(fieldError(addressInput())).toBe(
      FIELD_MESSAGES.DIA_CHI_KHONG_HOP_LE,
    );
    expect(nameInput().value).toBe('Trần Thị B');
    expect(phoneInput().value).toBe('0912345678');
    expect(addressInput().value).toBe('Số 1');
    expect(screen.queryByRole('alert')).toBeNull();

    typeInto(nameInput(), 'Trần Thị C');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(2);
    expect(rowValue('Họ và tên')).toBe('Trần Thị C');
  });

  it('TT-51 HS-18 400 báo trường không được phép (email, chiNhanh) ⇒ hộp lỗi chung "Dữ liệu không hợp lệ.", focus hộp, dữ liệu giữ', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    typeInto(phoneInput(), '0912345678');
    profile.failNext(
      'PUT',
      badRequest([
        { truong: 'email', ma: 'TRUONG_KHONG_DUOC_PHEP' },
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
      '502 HTML',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      SAVE_UNEXPECTED_MESSAGE,
    ],
    [
      '200 nhưng chiNhanh sai hình dạng',
      () => json(200, { ...SAMPLE_RECEPTIONIST, chiNhanh: 5 }),
      SAVE_UNEXPECTED_MESSAGE,
    ],
  ])(
    'TT-52 HS-20 %s ⇒ câu đúng, dữ liệu giữ, KHÔNG tự thử lại, bấm Lưu lại được ⇒ thành công',
    async (_label, failure, message) => {
      const { profile } = await renderReceptionProfilePage();
      await openEditForm();
      typeInto(phoneInput(), '0912345678');
      profile.failNext('PUT', failure);

      fireEvent.click(saveButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      expect(phoneInput().value).toBe('0912345678');
      expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
      // Không tự gửi lại: chờ một lúc rồi đếm
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect(puts(profile)).toHaveLength(1);
      expect(saveButton()).toBeEnabled();

      fireEvent.click(saveButton());
      await screen.findByText(SAVED_MESSAGE);
      expect(puts(profile)).toHaveLength(2);
      expect(rowValue('Số điện thoại')).toBe('0912345678');
    },
  );

  it('TT-53 HS-20 quá giờ 15 giây ⇒ câu quá giờ, dữ liệu giữ, không tự gửi lại sau 60 giây, bấm Lưu lại được', async () => {
    const { profile } = await renderReceptionProfilePage();
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
    expect(saveButton()).toBeEnabled();

    vi.useRealTimers();
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(2);
  });

  it('TT-54 HS-20 đang lưu: hai lần gửi liên tiếp chỉ ra MỘT PUT; nút "Đang lưu…" vô hiệu, form aria-busy, "Hủy" vô hiệu; bấm thêm không gửi thêm', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    const release = profile.hold('PUT');

    // Hai lần gửi trong cùng một đợt (state chưa kịp render): chỉ chống bằng ref mới ngăn được
    const events = [
      new Event('submit', { bubbles: true, cancelable: true }),
      new Event('submit', { bubbles: true, cancelable: true }),
    ];
    act(() => {
      for (const event of events) form().dispatchEvent(event);
    });

    expect(events.map((event) => event.defaultPrevented)).toEqual([true, true]);
    expect(puts(profile)).toHaveLength(1);
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(saveButton()).toHaveTextContent('Đang lưu…');
    expect(form()).toHaveAttribute('aria-busy', 'true');
    expect(cancelButton()).toBeDisabled();

    fireEvent.click(saveButton());
    fireEvent.submit(form());
    expect(puts(profile)).toHaveLength(1);

    release(200, SAMPLE_RECEPTIONIST);
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });

  it('TT-55 HS-20 "Hủy" ⇒ về chế độ xem với dữ liệu cũ, focus "Chỉnh sửa", không PUT, không thông báo', async () => {
    const { profile } = await renderReceptionProfilePage();
    await openEditForm();
    typeInto(nameInput(), 'Tên sẽ bị bỏ');
    typeInto(phoneInput(), '0912345678');

    fireEvent.click(cancelButton());

    expect(screen.queryByRole('form', { name: FORM_NAME })).toBeNull();
    expect(rowValue('Họ và tên')).toBe('Lê Thị Lệ Ngân');
    expect(rowValue('Số điện thoại')).toBe('0965432109');
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toHaveFocus(),
    );
    expect(puts(profile)).toHaveLength(0);
  });

  it('TT-55 HS-20 sau một lần 400 rồi "Hủy" ⇒ mở lại form thấy dữ liệu CŨ, không phải ô đã nhập', async () => {
    const { profile } = await renderReceptionProfilePage();
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

    expect(nameInput().value).toBe('Lê Thị Lệ Ngân');
    expect(fieldError(nameInput())).toBeUndefined();
  });

  it('TT-56 HS-20 PUT bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, trang không hiện câu lỗi, không thử lại', async () => {
    const { profile } = await renderReceptionProfilePage({
      withLayout: false,
    });
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
  it('TT-57 HS-20 mọi luồng lỗi không gọi console.*; họ tên, SĐT, ngày sinh, địa chỉ không lọt vào URL, tiêu đề, lịch sử hay kho trình duyệt', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const { profile, router } = await renderReceptionProfilePage();
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
    const where = [
      window.location.href,
      document.title,
      JSON.stringify(window.history.state),
      JSON.stringify(router.state.location),
      JSON.stringify({ ...window.localStorage }),
      JSON.stringify({ ...window.sessionStorage }),
    ].join('\n');
    for (const secret of [
      'Trần Thị Riêng Tư',
      '0912345678',
      '31/01/2000',
      '2000-01-31',
      'Kín Đáo',
    ]) {
      expect(where).not.toContain(secret);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
