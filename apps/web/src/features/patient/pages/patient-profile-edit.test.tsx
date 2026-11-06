import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { apiError } from '../../../test/fake-auth-api';
import { logout } from '../../auth';
import { getAuthState } from '../../auth/auth-store';
import {
  INVALID_DATA_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  SAVED_MESSAGE,
  SAVE_NETWORK_MESSAGE,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_UNEXPECTED_MESSAGE,
  SYSTEM_MESSAGE,
  FIELD_MESSAGES,
} from '../profile/profile-errors';
import { ProfileForm } from '../profile/profile-form';
import type { Profile } from '../profile/profile-types';
import { hang, json, SAMPLE_PROFILE } from '../testing/fake-profile-api';
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
  renderProfilePage,
  saveButton,
  setUpApi,
  typeInto,
} from '../testing/profile-page-harness';

// patient F3 (TRACKING F3-G): chế độ sửa, kiểm phía web, lỗi và vòng đời khi lưu. Mã ca PW-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN 7.1.
const valueOf = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
const puts = (profile: { requests: { method: string; body: unknown }[] }) =>
  profile.requests.filter((request) => request.method === 'PUT');
const fieldError = (input: HTMLElement) => {
  const id = input.getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent : undefined;
};
// U+200B (ký tự định dạng, không nhìn thấy): viết bằng mã để người đọc thấy được
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const badRequest = (loi: { truong: string; ma: string }[]) => () =>
  json(400, { maLoi: 'DU_LIEU_KHONG_HOP_LE', thongBao: 'CÂU CỦA API', loi });

const FORM_PROFILE: Profile = {
  hoTen: 'Nguyễn Văn A',
  email: 'nguyenvana@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: null,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('vào form sửa (HS-18)', () => {
  it('PW-30 HS-18 form tại chỗ: ô điền đúng dữ liệu, focus Họ và tên, KHÔNG có ô sửa email, có câu chỉ đọc; Esc không mất dữ liệu', async () => {
    await renderProfilePage();
    await openEditForm();

    expect(nameInput().value).toBe('Nguyễn Văn A');
    expect(phoneInput().value).toBe('0901234567');
    expect(genderSelect().value).toBe('Nam');
    expect(birthInput().value).toBe('15/05/1990');
    expect(addressInput().value).toBe('12 Đường Mẫu, Quận Một');
    expect(nameInput()).toHaveFocus();

    // Email: khối chữ chỉ đọc, không có ô nhập nào tên Email
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
    const email = within(form()).getByRole('group', { name: 'Email' });
    expect(email).toHaveTextContent('nguyenvana@example.invalid');
    expect(email).toHaveAccessibleDescription(
      'Email dùng để đăng nhập, không thể thay đổi.',
    );
    // Vào form thì nút "Chỉnh sửa" biến mất (sửa tại chỗ, không đổi trang)
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();

    typeInto(nameInput(), 'Tên đang gõ dở');
    fireEvent.keyDown(nameInput(), { key: 'Escape' });
    expect(form()).toBeInTheDocument();
    expect(nameInput().value).toBe('Tên đang gõ dở');
  });

  it('PW-30 HS-18 ô giới tính đủ 4 lựa chọn đúng mã; dấu * chỉ ở Họ và tên và Số điện thoại (kèm required); tên ô đúng chữ', async () => {
    await renderProfilePage();
    await openEditForm();

    expect(
      within(genderSelect())
        .getAllByRole('option')
        .map((option) => [
          option.textContent,
          (option as HTMLOptionElement).value,
        ]),
    ).toEqual([
      ['Chọn giới tính', ''],
      ['Nam', 'Nam'],
      ['Nữ', 'Nu'],
      ['Khác', 'Khac'],
    ]);

    // Mỗi dấu * thuộc nhãn của đúng ô bắt buộc, và form không còn dấu * nào khác
    const stars = Array.from(
      form().querySelectorAll('[aria-hidden="true"]'),
    ).filter((element) => element.textContent === '*');
    expect(stars.map((star) => star.closest('label')?.htmlFor)).toEqual([
      nameInput().id,
      phoneInput().id,
    ]);
    expect(form().textContent?.match(/\*/g)).toHaveLength(2);
    expect(
      Array.from(form().querySelectorAll('input[required], select[required]')),
    ).toEqual([nameInput(), phoneInput()]);

    // Tên truy cập không đọc dấu * (aria-hidden); ngày sinh có khoảng trắng thật trước "(dd/mm/yyyy)"
    expect(nameInput()).toHaveAccessibleName('Họ và tên');
    expect(phoneInput()).toHaveAccessibleName('Số điện thoại');
    expect(birthInput()).toHaveAccessibleName('Ngày sinh (dd/mm/yyyy)');
    // happy-dom tự chèn khoảng trắng giữa hai phần tử con khi tính tên, nên kiểm thêm chữ thật của nhãn (trình duyệt ghép đúng như vậy)
    const birthLabel = form().querySelector(`label[for="${birthInput().id}"]`);
    expect(birthLabel?.textContent).toBe('Ngày sinh (dd/mm/yyyy)');
  });

  it('PW-30 HS-18 thứ tự Tab theo thứ tự form: họ tên, SĐT, giới tính, ngày sinh, địa chỉ, Hủy, Lưu', async () => {
    await renderProfilePage();
    await openEditForm();
    const order = [
      nameInput(),
      phoneInput(),
      genderSelect(),
      birthInput(),
      addressInput(),
      cancelButton(),
      saveButton(),
    ];
    // Mọi phần tử focus được của form, theo thứ tự DOM (= thứ tự Tab); email là khối chữ nên không có mặt
    const inDom = Array.from(
      form().querySelectorAll('input, select, textarea, button, a[href]'),
    );
    expect(inDom).toEqual(order);
  });

  it('PW-23b HS-18 giới tính lạ (Male): ô chọn ở "Chọn giới tính", bấm Lưu gửi gioiTinh null (ghi đè mã lạ, có chủ ý)', async () => {
    const { profile } = await renderProfilePage({
      initial: { gioiTinh: 'Male' },
    });
    await openEditForm();

    expect(genderSelect().value).toBe('');
    expect(
      within(genderSelect()).getByRole('option', { selected: true }),
    ).toHaveTextContent('Chọn giới tính');

    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)[0].body).toEqual({
      hoTen: 'Nguyễn Văn A',
      soDienThoai: '0901234567',
      gioiTinh: null,
      ngaySinh: '1990-05-15',
      diaChi: '12 Đường Mẫu, Quận Một',
    });
  });

  it('PW-38 HS-18 gợi ý "(dd/mm/yyyy)" luôn hiện trong nhãn Ngày sinh: có dữ liệu, ô trống và khi ô đang lỗi', async () => {
    await renderProfilePage();
    await openEditForm();
    const hint = () => within(form()).getByText('(dd/mm/yyyy)');
    const named = 'Ngày sinh (dd/mm/yyyy)';

    expect(hint()).toBeVisible();
    expect(birthInput()).toHaveAccessibleName(named);

    typeInto(birthInput(), '');
    expect(hint()).toBeVisible();

    typeInto(birthInput(), '31/02/2000');
    fireEvent.click(saveButton());
    expect(birthInput()).toHaveAttribute('aria-invalid', 'true');
    expect(hint()).toBeVisible();
    expect(birthInput()).toHaveAccessibleName(named);
  });
});

describe('kiểm phía web trước khi gửi (HS-18)', () => {
  it.each([
    [
      'họ tên trống',
      () => typeInto(nameInput(), ''),
      nameInput,
      NAME_REQUIRED_MESSAGE,
    ],
    [
      'SĐT sai',
      () => typeInto(phoneInput(), '12345'),
      phoneInput,
      FIELD_MESSAGES.SDT_KHONG_HOP_LE,
    ],
    [
      'ngày sinh không có thật',
      () => typeInto(birthInput(), '31/02/2000'),
      birthInput,
      FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
    ],
    [
      'ngày sinh 31/11 (tháng 11 chỉ có 30 ngày)',
      () => typeInto(birthInput(), '31/11/1990'),
      birthInput,
      FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
    ],
    [
      'địa chỉ 256 ký tự',
      () => typeInto(addressInput(), 'a'.repeat(256)),
      addressInput,
      FIELD_MESSAGES.DIA_CHI_KHONG_HOP_LE,
    ],
    [
      'địa chỉ có ký tự định dạng (U+200B)',
      () => typeInto(addressInput(), '12 Đường' + ZERO_WIDTH_SPACE + 'Mẫu'),
      addressInput,
      FIELD_MESSAGES.DIA_CHI_KHONG_HOP_LE,
    ],
  ])(
    'PW-31 HS-18 %s ⇒ câu dưới đúng ô, aria-invalid, không PUT, dữ liệu giữ, focus ô lỗi',
    async (_label, makeInvalid, field, message) => {
      const { profile } = await renderProfilePage();
      await openEditForm();
      makeInvalid();
      // Ô khác đã sửa nhưng hợp lệ: phải được giữ nguyên
      if (field !== addressInput) typeInto(addressInput(), 'Địa chỉ mới');

      fireEvent.click(saveButton());

      expect(puts(profile)).toHaveLength(0);
      expect(field()).toHaveAttribute('aria-invalid', 'true');
      expect(fieldError(field())).toBe(message);
      expect(screen.getByText(message)).toBeVisible();
      expect(field()).toHaveFocus();
      if (field !== addressInput) {
        expect(addressInput().value).toBe('Địa chỉ mới');
        expect(addressInput()).not.toHaveAttribute('aria-invalid');
      }
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('PW-32 HS-18 nhiều ô sai cùng lúc ⇒ focus ô đầu theo form; sửa dần rồi gửi lại ⇒ đúng một PUT thành công', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    typeInto(nameInput(), '');
    typeInto(phoneInput(), '1');
    typeInto(birthInput(), 'x');
    typeInto(addressInput(), 'a'.repeat(256));

    fireEvent.click(saveButton());
    expect(nameInput()).toHaveFocus();
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true');
    expect(birthInput()).toHaveAttribute('aria-invalid', 'true');
    expect(addressInput()).toHaveAttribute('aria-invalid', 'true');

    typeInto(nameInput(), 'Trần Thị B');
    fireEvent.click(saveButton());
    expect(phoneInput()).toHaveFocus();

    typeInto(phoneInput(), '0912345678');
    fireEvent.click(saveButton());
    expect(birthInput()).toHaveFocus();

    typeInto(birthInput(), '31/01/2000');
    fireEvent.click(saveButton());
    expect(addressInput()).toHaveFocus();
    expect(puts(profile)).toHaveLength(0);

    typeInto(addressInput(), 'Số 1');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });

  it('PW-32 HS-18 sau lỗi, gõ lại vào một ô ⇒ mọi câu lỗi dưới ô, aria-invalid và hộp lỗi chung biến mất', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();

    // Lỗi phía web (câu dưới hai ô): gõ vào ô KHÁC cũng xoá hết
    typeInto(nameInput(), '');
    typeInto(phoneInput(), '1');
    fireEvent.click(saveButton());
    expect(fieldError(nameInput())).toBe(NAME_REQUIRED_MESSAGE);
    expect(fieldError(phoneInput())).toBe(FIELD_MESSAGES.SDT_KHONG_HOP_LE);

    typeInto(addressInput(), 'Số 2');
    expect(screen.queryByText(NAME_REQUIRED_MESSAGE)).toBeNull();
    expect(screen.queryByText(FIELD_MESSAGES.SDT_KHONG_HOP_LE)).toBeNull();
    for (const input of [nameInput(), phoneInput()]) {
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(input).not.toHaveAttribute('aria-describedby');
    }

    // Lỗi từ máy chủ (hộp cảnh báo chung): gõ vào một ô cũng làm hộp biến mất
    typeInto(nameInput(), 'Trần Thị B');
    typeInto(phoneInput(), '0912345678');
    profile.failNext('PUT', () =>
      json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'CÂU CỦA API' }),
    );
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(SYSTEM_MESSAGE);

    typeInto(phoneInput(), '0912345679');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(SYSTEM_MESSAGE)).toBeNull();
  });

  it('PW-36 HS-18 họ tên và SĐT cùng sai ⇒ 0 PUT, kể cả khi bấm lại', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    typeInto(nameInput(), '123');
    typeInto(phoneInput(), '');

    fireEvent.click(saveButton());
    fireEvent.click(saveButton());

    expect(puts(profile)).toHaveLength(0);
    expect(fieldError(nameInput())).toBe(FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE);
    expect(fieldError(phoneInput())).toBe(FIELD_MESSAGES.SDT_KHONG_HOP_LE);
  });

  it('PW-31 HS-18 ngày sinh ngày mai và trước 1900 ⇒ câu riêng; hôm nay và 01/01/1900 được gửi', async () => {
    vi.setSystemTime(new Date('2026-11-05T16:59:59Z'));
    const { profile } = await renderProfilePage();
    await openEditForm();

    typeInto(birthInput(), '06/11/2026');
    fireEvent.click(saveButton());
    expect(fieldError(birthInput())).toBe('Ngày sinh không được sau hôm nay.');

    typeInto(birthInput(), '31/12/1899');
    fireEvent.click(saveButton());
    expect(fieldError(birthInput())).toBe(
      'Ngày sinh không được trước 01/01/1900.',
    );
    expect(puts(profile)).toHaveLength(0);

    typeInto(birthInput(), '05/11/2026');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)[0].body).toMatchObject({ ngaySinh: '2026-11-05' });
  });

  it('PW-31 HS-18 ngày hôm nay tính theo giờ Việt Nam: 00:00:00 ngày 06/11 (+07:00) thì 06/11/2026 hợp lệ', async () => {
    vi.setSystemTime(new Date('2026-11-05T17:00:00Z'));
    const { profile } = await renderProfilePage();
    await openEditForm();
    typeInto(birthInput(), '06/11/2026');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)[0].body).toMatchObject({ ngaySinh: '2026-11-06' });
  });
});

describe('API trả lỗi 400 (HS-18)', () => {
  it('PW-33 HS-18 loi[] đảo thứ tự ⇒ câu đúng ô, focus Họ và tên (không phải mục đầu của loi[]), dữ liệu giữ, sửa rồi gửi lại thành công', async () => {
    const { profile } = await renderProfilePage();
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
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();

    typeInto(nameInput(), 'Trần Thị C');
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(2);
    expect(valueOf('Họ và tên')).toBe('Trần Thị C');
  });

  it('PW-33 HS-18 mã GIOI_TINH_KHONG_HOP_LE và NGAY_SINH_KHONG_HOP_LE gắn đúng ô giới tính, ngày sinh', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    profile.failNext(
      'PUT',
      badRequest([
        { truong: 'ngaySinh', ma: 'NGAY_SINH_KHONG_HOP_LE' },
        { truong: 'gioiTinh', ma: 'GIOI_TINH_KHONG_HOP_LE' },
      ]),
    );
    fireEvent.click(saveButton());

    await waitFor(() => expect(genderSelect()).toHaveFocus());
    expect(fieldError(genderSelect())).toBe('Vui lòng chọn giới tính.');
    expect(fieldError(birthInput())).toBe('Ngày sinh không hợp lệ.');
  });

  it.each([
    [
      'truong ngoài form (email, TRUONG_KHONG_DUOC_PHEP)',
      [{ truong: 'email', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
    ],
    ['ma lạ ở một ô của form', [{ truong: 'hoTen', ma: 'MA_LA' }]],
    ['loi[] rỗng', []],
  ])(
    'PW-34 HS-18 %s ⇒ hộp cảnh báo chung, không câu dưới ô, dữ liệu giữ, focus hộp',
    async (_label, loi) => {
      const { profile } = await renderProfilePage();
      await openEditForm();
      typeInto(phoneInput(), '0912345678');
      profile.failNext('PUT', badRequest(loi));

      fireEvent.click(saveButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(INVALID_DATA_MESSAGE);
      expect(alert).toHaveFocus();
      expect(nameInput()).not.toHaveAttribute('aria-invalid');
      expect(phoneInput().value).toBe('0912345678');
      expect(form()).toBeInTheDocument();
    },
  );
});

describe('thân PUT (HS-18)', () => {
  it('PW-35 HS-18 đúng năm khoá và giá trị chuẩn hoá: cắt khoảng trắng, địa chỉ trống ⇒ null, ngày ⇒ YYYY-MM-DD, giới tính ⇒ mã', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    typeInto(nameInput(), '  Trần Thị B  ');
    typeInto(phoneInput(), ' 0901 234 567 ');
    fireEvent.change(genderSelect(), { target: { value: 'Nu' } });
    typeInto(birthInput(), '31/01/2000');
    typeInto(addressInput(), '   ');

    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);

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
  });

  it('PW-35 HS-18 xoá giới tính, ngày sinh, địa chỉ ⇒ gửi null (xoá được)', async () => {
    const { profile } = await renderProfilePage();
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
    expect(valueOf('Giới tính')).toBe('Chưa cập nhật');
    expect(valueOf('Ngày sinh')).toBe('Chưa cập nhật');
    expect(valueOf('Địa chỉ')).toBe('Chưa cập nhật');
  });

  it('PW-37 HS-18 Enter trong ô (gửi form) ⇒ một PUT và thành công', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    typeInto(addressInput(), 'Số 9');

    fireEvent.submit(form());

    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
    expect(valueOf('Địa chỉ')).toBe('Số 9');
  });

  it('PW-37 HS-18 sự kiện submit luôn bị chặn hành vi mặc định (trình duyệt không tải lại trang): khi sai, khi hợp lệ', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    const submit = () => {
      const event = new Event('submit', { bubbles: true, cancelable: true });
      act(() => {
        form().dispatchEvent(event);
      });
      return event;
    };

    typeInto(nameInput(), '');
    expect(submit().defaultPrevented).toBe(true);
    expect(puts(profile)).toHaveLength(0);

    typeInto(nameInput(), 'Trần Thị B');
    expect(submit().defaultPrevented).toBe(true);
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });
});

describe('đang lưu và lỗi khi lưu (HS-20)', () => {
  it('PW-50 HS-20 đang lưu: nút "Đang lưu…" vô hiệu, form aria-busy, "Hủy" vô hiệu; hai lần gửi liên tiếp chỉ ra MỘT PUT', async () => {
    const { profile } = await renderProfilePage();
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

    // Cả lần gửi bị chặn (lần hai) cũng không để trình duyệt tải lại trang
    expect(events.map((event) => event.defaultPrevented)).toEqual([true, true]);
    expect(puts(profile)).toHaveLength(1);
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(saveButton()).toHaveTextContent('Đang lưu…');
    expect(form()).toHaveAttribute('aria-busy', 'true');
    expect(cancelButton()).toBeDisabled();

    // Bấm thêm khi đang lưu cũng không gửi thêm
    fireEvent.click(saveButton());
    fireEvent.submit(form());
    expect(puts(profile)).toHaveLength(1);

    release(200, SAMPLE_PROFILE);
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });

  const failures: [
    string,
    (init?: RequestInit) => Response | Promise<Response>,
    string,
  ][] = [
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
  ];

  it.each(failures)(
    'PW-51 HS-20 %s ⇒ câu đúng, dữ liệu giữ, KHÔNG tự thử lại, bấm Lưu lại được ⇒ thành công',
    async (_label, failure, message) => {
      const { profile } = await renderProfilePage();
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
      expect(valueOf('Số điện thoại')).toBe('0912345678');
    },
  );

  it('PW-51 HS-20 quá giờ 15 giây ⇒ câu quá giờ, dữ liệu giữ, không tự gửi lại sau 60 giây, bấm Lưu lại được', async () => {
    const { profile } = await renderProfilePage();
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
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();

    vi.useRealTimers();
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    expect(puts(profile)).toHaveLength(2);
  });

  it('PW-52 HS-20 "Hủy" ⇒ về chế độ xem với dữ liệu cũ, focus "Chỉnh sửa", không PUT', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    typeInto(nameInput(), 'Tên sẽ bị bỏ');
    typeInto(phoneInput(), '0912345678');

    fireEvent.click(cancelButton());

    expect(screen.queryByRole('form', { name: FORM_NAME })).toBeNull();
    expect(valueOf('Họ và tên')).toBe('Nguyễn Văn A');
    expect(valueOf('Số điện thoại')).toBe('0901234567');
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toHaveFocus(),
    );
    expect(puts(profile)).toHaveLength(0);
  });

  it('PW-52 HS-20 sau một lần 400 rồi "Hủy" ⇒ mở lại form thấy dữ liệu CŨ, không phải ô đã nhập', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    typeInto(nameInput(), 'Tên sẽ bị bỏ');
    profile.failNext(
      'PUT',
      badRequest([{ truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' }]),
    );
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(fieldError(nameInput())).toBe(FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE),
    );

    fireEvent.click(cancelButton());
    expect(valueOf('Họ và tên')).toBe('Nguyễn Văn A');

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(nameInput().value).toBe('Nguyễn Văn A');
    expect(nameInput()).not.toHaveAttribute('aria-invalid');
  });

  it('PW-53 HS-20 PUT bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, trang không hiện câu lỗi, không thử lại', async () => {
    const { profile } = await renderProfilePage({ withLayout: false });
    await openEditForm();
    profile.failNext('PUT', () =>
      json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
    );

    fireEvent.click(saveButton());

    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    expect(getAuthState().sessionEnded).toBe(true);
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(nameInput()).not.toHaveAttribute('aria-invalid');
    expect(puts(profile)).toHaveLength(1);
  });

  it('PW-54 HS-20 đăng xuất giữa lúc lưu (client huỷ) ⇒ không lỗi chưa bắt, không hộp lỗi', async () => {
    const { profile } = await renderProfilePage({ withLayout: false });
    await openEditForm();
    profile.failNext('PUT', (init) => hang(init));
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toBeDisabled());

    await act(async () => {
      await logout();
    });

    expect(getAuthState().status).toBe('unauthenticated');
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
  });

  it('PW-55 HS-20 gỡ form giữa lúc lưu: PUT vẫn thành công ⇒ onSaved KHÔNG được gọi, nhưng GET /api/auth/me vẫn được gọi đúng một lần, không console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const { auth, profile } = await setUpApi();
    const release = profile.hold('PUT');
    const onSaved = vi.fn();
    const view = render(
      <ProfileForm
        profile={FORM_PROFILE}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(puts(profile)).toHaveLength(1));
    const meBefore = auth.meCalls;

    view.unmount();
    release(200, SAMPLE_PROFILE);

    await waitFor(() => expect(auth.meCalls - meBefore).toBe(1));
    expect(onSaved).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('PW-55 HS-20 gỡ form giữa lúc lưu rồi PUT lỗi mạng ⇒ không báo gì, không onSaved, không gọi /auth/me, không console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const { auth, profile } = await setUpApi();
    let fail: () => void = () => undefined;
    profile.failNext(
      'PUT',
      () =>
        new Promise<Response>((_resolve, reject) => {
          fail = () => reject(new TypeError('Failed to fetch'));
        }),
    );
    const onSaved = vi.fn();
    const view = render(
      <ProfileForm
        profile={FORM_PROFILE}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(puts(profile)).toHaveLength(1));
    const meBefore = auth.meCalls;

    view.unmount();
    fail();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(onSaved).not.toHaveBeenCalled();
    expect(auth.meCalls).toBe(meBefore);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('PW-42 HS-19 form còn gắn mà /auth/me lỗi (refreshCurrentUser trả false) ⇒ KHÔNG phải lưu thất bại: không hộp lỗi, nút Lưu dùng lại được', async () => {
    const { auth } = await setUpApi();
    auth.failNext('/auth/me', () => apiError(500, 'LOI_HE_THONG'));
    const onSaved = vi.fn();
    render(
      <ProfileForm
        profile={FORM_PROFILE}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(auth.meCalls).toBe(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saveButton()).toBeEnabled();
    expect(saveButton()).toHaveTextContent('Lưu thay đổi');
  });

  it('PW-55 HS-20 form còn gắn: onSaved nhận hồ sơ đọc lại từ máy chủ, đúng một lần', async () => {
    const { profile } = await setUpApi();
    const onSaved = vi.fn();
    render(
      <ProfileForm
        profile={FORM_PROFILE}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    typeInto(phoneInput(), '0912 345 678');
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      soDienThoai: '0912345678',
    });
    expect(puts(profile)).toHaveLength(1);
  });
});

const SECRETS = /Riêng Tư|0912345678|31\/01\/2000|Kín Đáo/;

describe('dữ liệu cá nhân (HS-20)', () => {
  it('PW-57 HS-20 mọi luồng lỗi không gọi console.*; họ tên, SĐT, ngày sinh, địa chỉ không lọt vào URL, tiêu đề, lịch sử hay kho trình duyệt', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const { profile, router } = await renderProfilePage();
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
      [badRequest([{ truong: 'email', ma: 'X' }]), INVALID_DATA_MESSAGE],
    ];
    for (const [failure, message] of attempts) {
      profile.failNext('PUT', failure);
      fireEvent.click(saveButton());
      // Câu thông báo là câu cố định: không chứa dữ liệu người dùng nhập
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
