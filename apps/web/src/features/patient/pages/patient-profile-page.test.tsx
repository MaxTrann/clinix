import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
  GENERIC_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import { apiError } from '../../../test/fake-auth-api';
import { logout } from '../../auth';
import { getAuthState } from '../../auth/auth-store';
import { SAVED_MESSAGE } from '../profile/profile-errors';
import { hang, json, SAMPLE_PROFILE } from '../testing/fake-profile-api';
import {
  FORM_NAME,
  addressInput,
  birthInput,
  nameInput,
  openEditForm,
  phoneInput,
  renderProfilePage,
  saveButton,
  typeInto,
} from '../testing/profile-page-harness';

// patient F3 (TRACKING F3-G): xem, tải, lưu thành công và thanh bên. Mã ca PW-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1.
// HS-21 (chi nhánh, phạm vi) thuộc F4, F5 và HS-22 (QR) thuộc F9: không phủ ở đây.
const valueOf = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('xem hồ sơ (HS-17)', () => {
  it('PW-20 HS-17 mở trang ⇒ đúng một GET /api/profile có Authorization; hiện dữ liệu hiện tại', async () => {
    const { profile } = await renderProfilePage();
    await screen.findByText('12 Đường Mẫu, Quận Một');

    expect(profile.count('GET')).toBe(1);
    const get = profile.requests.find((request) => request.method === 'GET');
    expect(get?.headers.get('Authorization')).toMatch(/^Bearer tok-/);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Hồ sơ người khám' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Bản thân' }),
    ).toBeInTheDocument();
    expect(valueOf('Họ và tên')).toBe('Nguyễn Văn A');
    expect(valueOf('Email')).toBe('nguyenvana@example.invalid');
    expect(valueOf('Số điện thoại')).toBe('0901234567');
    expect(valueOf('Giới tính')).toBe('Nam');
    expect(valueOf('Ngày sinh')).toBe('15/05/1990');
    expect(valueOf('Địa chỉ')).toBe('12 Đường Mẫu, Quận Một');
    expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toBeVisible();
    // Chưa lưu gì thì chưa có thông báo thành công
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    // Thứ tự ô đúng frame Figma 416:2
    const card = screen.getByRole('region', { name: 'Bản thân' });
    expect(
      Array.from(card.querySelectorAll('dt')).map((term) => term.textContent),
    ).toEqual([
      'Họ và tên',
      'Email',
      'Số điện thoại',
      'Giới tính',
      'Ngày sinh',
      'Địa chỉ',
    ]);
  });

  it.each([
    ['Nu', 'Nữ'],
    ['Khac', 'Khác'],
  ])('PW-20 HS-17 mã giới tính %s hiện là "%s"', async (code, label) => {
    await renderProfilePage({ initial: { gioiTinh: code } });
    await screen.findByText('12 Đường Mẫu, Quận Một');
    expect(valueOf('Giới tính')).toBe(label);
  });

  it('PW-21 HS-17 giới tính, ngày sinh, địa chỉ trống (null) ⇒ "Chưa cập nhật" ba lần; họ tên, email, SĐT vẫn hiện', async () => {
    await renderProfilePage({
      initial: { gioiTinh: null, ngaySinh: null, diaChi: null },
    });
    await screen.findByText('Nguyễn Văn A', { selector: 'dd' });

    expect(valueOf('Giới tính')).toBe('Chưa cập nhật');
    expect(valueOf('Ngày sinh')).toBe('Chưa cập nhật');
    expect(valueOf('Địa chỉ')).toBe('Chưa cập nhật');
    expect(screen.getAllByText('Chưa cập nhật')).toHaveLength(3);
    expect(valueOf('Số điện thoại')).toBe('0901234567');
  });

  it.each([
    ['1900-01-01', '01/01/1900'],
    ['2024-02-29', '29/02/2024'],
    ['1990-05-15', '15/05/1990'],
  ])(
    'PW-22 HS-17 ngày sinh %s hiện %s (đổi bằng chuỗi, không lệch múi giờ)',
    async (iso, display) => {
      vi.stubEnv('TZ', 'America/New_York');
      await renderProfilePage({ initial: { ngaySinh: iso } });
      await screen.findByText('12 Đường Mẫu, Quận Một');
      expect(valueOf('Ngày sinh')).toBe(display);
    },
  );

  it('PW-23 HS-17 gioiTinh lạ (Male) ⇒ trang không vỡ, hiện "Chưa cập nhật"', async () => {
    await renderProfilePage({ initial: { gioiTinh: 'Male' } });
    await screen.findByText('12 Đường Mẫu, Quận Một');
    expect(valueOf('Giới tính')).toBe('Chưa cập nhật');
    expect(valueOf('Họ và tên')).toBe('Nguyễn Văn A');
  });

  it('PW-24 HS-17 đang tải: có "Đang tải" và h1; xong thì hiện hồ sơ', async () => {
    let release: (status: number, body: unknown) => void = () => undefined;
    await renderProfilePage({
      before: ({ profile }) => {
        release = profile.hold('GET');
      },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hồ sơ người khám' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();

    release(200, SAMPLE_PROFILE);
    await screen.findByRole('button', { name: 'Chỉnh sửa' });
    expect(valueOf('Họ và tên')).toBe('Nguyễn Văn A');
  });

  it.each([
    [
      'mất mạng',
      () => {
        throw new TypeError('Failed to fetch');
      },
      NETWORK_ERROR_MESSAGE,
    ],
    [
      '500',
      () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'CÂU CỦA API' }),
      GENERIC_ERROR_MESSAGE,
    ],
    [
      '502 HTML',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      GENERIC_ERROR_MESSAGE,
    ],
    [
      'phản hồi sai hình dạng',
      () => json(200, { ok: true }),
      GENERIC_ERROR_MESSAGE,
    ],
  ])(
    'PW-25 HS-17 lỗi tải (%s) ⇒ câu lỗi + "Thử lại" ⇒ GET lần hai ⇒ dữ liệu; khối Bảo mật vẫn có',
    async (_label, failure, message) => {
      const { profile } = await renderProfilePage({
        before: ({ profile }) => profile.failNext('GET', failure),
      });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(
        screen.getByRole('heading', { level: 1, name: 'Hồ sơ người khám' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
      ).toBeInTheDocument();

      // Giữ GET lần hai: trong lúc chờ phải quay lại "Đang tải", câu lỗi và nút "Thử lại" biến mất
      const release = profile.hold('GET');
      fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
      expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();

      release(200, SAMPLE_PROFILE);
      await screen.findByRole('button', { name: 'Chỉnh sửa' });
      expect(valueOf('Họ và tên')).toBe('Nguyễn Văn A');
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('PW-25 HS-17 quá giờ (15 giây) ⇒ câu quá giờ + "Thử lại"', async () => {
    await renderProfilePage({
      before: ({ profile }) => {
        vi.useFakeTimers();
        profile.failNext('GET', (init) => hang(init));
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(TIMEOUT_ERROR_MESSAGE);
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  });

  it('PW-26 HS-17 không có biểu tượng máy ảnh: avatar là chữ "NV" aria-hidden, không phải nút', async () => {
    const { container } = await renderProfilePage();
    await screen.findByText('12 Đường Mẫu, Quận Một');

    const initials = screen.getByText('NV');
    expect(initials).toHaveAttribute('aria-hidden', 'true');
    expect(initials.closest('button')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /ảnh|camera|máy ảnh/i }),
    ).toBeNull();
    expect(container.querySelector('svg.lucide-camera')).toBeNull();
    // Nút duy nhất của khối Bản thân là "Chỉnh sửa"
    const card = screen.getByRole('region', { name: 'Bản thân' });
    expect(within(card).getAllByRole('button')).toHaveLength(1);
  });

  it('PW-27 HS-17 khối "Bảo mật tài khoản" có mặt kèm khối "Đổi mật khẩu" của auth', async () => {
    await renderProfilePage();
    await screen.findByText('12 Đường Mẫu, Quận Một');

    const security = screen.getByRole('region', { name: 'Bảo mật tài khoản' });
    expect(
      within(security).getByRole('heading', { name: 'Đổi mật khẩu' }),
    ).toBeInTheDocument();
    expect(
      within(security).getByRole('button', { name: 'Cập nhật mật khẩu' }),
    ).toBeInTheDocument();
  });

  it('PW-28 HS-17 GET bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, trang không hiện thêm câu lỗi', async () => {
    await renderProfilePage({
      withLayout: false,
      before: ({ profile }) =>
        profile.failNext('GET', () =>
          json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
        ),
    });
    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    expect(getAuthState().sessionEnded).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('PW-29 HS-17 gỡ trang giữa lúc tải ⇒ yêu cầu GET bị huỷ, không câu lỗi', async () => {
    let signal: AbortSignal | null | undefined;
    const { unmount } = await renderProfilePage({
      before: ({ profile }) =>
        profile.failNext('GET', (init) => {
          signal = init?.signal;
          return hang(init);
        }),
    });
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('PW-29 HS-17 gỡ trang rồi GET mới về (máy chủ trả muộn) ⇒ bỏ qua kết quả, không lỗi, không console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    let release: (status: number, body: unknown) => void = () => undefined;
    const { unmount } = await renderProfilePage({
      before: ({ profile }) => {
        release = profile.hold('GET');
      },
    });

    unmount();
    release(200, SAMPLE_PROFILE);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Nguyễn Văn A', { selector: 'dd' })).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('PW-29 HS-17 đăng xuất giữa lúc tải (client huỷ) ⇒ không câu lỗi, không "Thử lại"', async () => {
    await renderProfilePage({
      withLayout: false,
      before: ({ profile }) => profile.failNext('GET', (init) => hang(init)),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');

    await act(async () => {
      await logout();
    });
    expect(getAuthState().status).toBe('unauthenticated');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('lưu thành công (HS-19)', () => {
  async function saveWith(phone: string) {
    const api = await renderProfilePage();
    await openEditForm();
    typeInto(phoneInput(), phone);
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_MESSAGE);
    return api;
  }

  it('PW-40 HS-19 thông báo role=status, về chế độ xem với dữ liệu của PHẢN HỒI PUT, focus nút "Chỉnh sửa"; thông báo ở lại, mất khi sửa lại', async () => {
    const { profile } = await saveWith('0901 234 568');

    expect(screen.getByRole('status')).toHaveTextContent(SAVED_MESSAGE);
    // Máy chủ chuẩn hoá SĐT thành 10 số liền: trang hiện bản đó, không phải ô đã nhập
    expect(valueOf('Số điện thoại')).toBe('0901234568');
    expect(profile.requests.filter((r) => r.method === 'PUT')).toHaveLength(1);
    expect(screen.queryByRole('form', { name: FORM_NAME })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toHaveFocus(),
    );

    // Không hẹn giờ tự mất
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(screen.getByText(SAVED_MESSAGE)).toBeInTheDocument();
    vi.useRealTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
  });

  it('PW-40 HS-19 hiện dữ liệu của phản hồi dù khác hẳn thứ đã nhập (không phản chiếu ô)', async () => {
    const { profile } = await renderProfilePage();
    await openEditForm();
    typeInto(nameInput(), 'Tên người dùng gõ');
    profile.failNext('PUT', () =>
      json(200, { ...SAMPLE_PROFILE, hoTen: 'Tên máy chủ trả về' }),
    );
    fireEvent.click(saveButton());

    await screen.findByText(SAVED_MESSAGE);
    expect(valueOf('Họ và tên')).toBe('Tên máy chủ trả về');
    expect(screen.queryByText('Tên người dùng gõ')).toBeNull();
  });

  it('PW-41 HS-19 trang trong khung Bệnh nhân: sau PUT đúng một GET /api/auth/me mới và tên ở thanh bên đổi', async () => {
    const { auth, account } = await renderProfilePage();
    const aside = await screen.findByRole('complementary', {
      name: 'Điều hướng Bệnh nhân',
    });
    expect(within(aside).getByText('Nguyễn Văn A')).toBeInTheDocument();
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');
    // Phía máy chủ tên đã đổi: /auth/me sẽ trả tên mới
    account.hoTen = 'Trần Thị B';
    const meBefore = auth.meCalls;

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(within(aside).getByText('Trần Thị B')).toBeInTheDocument(),
    );
    expect(within(aside).queryByText('Nguyễn Văn A')).toBeNull();
    expect(auth.meCalls - meBefore).toBe(1);
    expect(getAuthState().user?.hoTen).toBe('Trần Thị B');
  });

  it.each([
    ['500', () => apiError(500, 'LOI_HE_THONG')],
    ['401 mã lạ (hook không làm gì)', () => apiError(401, 'MA_LA')],
  ])(
    'PW-42 HS-19 /auth/me lỗi (%s) ⇒ refreshCurrentUser trả false nhưng vẫn báo thành công, không hộp lỗi',
    async (_label, failure) => {
      const { auth } = await renderProfilePage();
      const aside = await screen.findByRole('complementary', {
        name: 'Điều hướng Bệnh nhân',
      });
      auth.failNext('/auth/me', failure);
      await openEditForm();
      typeInto(nameInput(), 'Trần Thị B');
      fireEvent.click(saveButton());

      await screen.findByText(SAVED_MESSAGE);
      await waitFor(() => expect(auth.meCalls).toBe(2));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(valueOf('Họ và tên')).toBe('Trần Thị B');
      // Thanh bên chưa đổi tên (không phải lưu thất bại)
      expect(within(aside).getByText('Nguyễn Văn A')).toBeInTheDocument();
    },
  );

  it('PW-43 HS-19 /auth/me bị giữ ⇒ trang đã về chế độ xem trước khi /auth/me về (không đứng chờ)', async () => {
    const { auth, account } = await renderProfilePage();
    const aside = await screen.findByRole('complementary', {
      name: 'Điều hướng Bệnh nhân',
    });
    const releaseMe = auth.hold('/auth/me');
    await openEditForm();
    typeInto(nameInput(), 'Trần Thị B');
    fireEvent.click(saveButton());

    // /auth/me chưa về mà trang đã ở chế độ xem với thông báo thành công
    await screen.findByText(SAVED_MESSAGE);
    expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toBeVisible();
    expect(within(aside).getByText('Nguyễn Văn A')).toBeInTheDocument();

    releaseMe(200, { ...account, hoTen: 'Trần Thị B' });
    await waitFor(() =>
      expect(within(aside).getByText('Trần Thị B')).toBeInTheDocument(),
    );
  });

  it('PW-40 HS-19 sau khi lưu, bấm "Hủy" ở lần sửa kế tiếp vẫn trả về đúng dữ liệu vừa lưu', async () => {
    await saveWith('0901 234 568');
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(phoneInput().value).toBe('0901234568');
    expect(addressInput().value).toBe('12 Đường Mẫu, Quận Một');
    expect(birthInput().value).toBe('15/05/1990');
  });
});
