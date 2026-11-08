import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import { logout } from '../../auth';
import { getAuthState } from '../../auth/auth-store';
import { hang, json, SAMPLE_RECEPTIONIST } from '../testing/fake-profile-api';
import {
  renderReceptionProfilePage,
  rowLabels,
  rowValue,
} from '../testing/reception-profile-harness';

// patient F4 (TRACKING F4-E, F4-H): trang "Thông tin cá nhân" của Lễ tân, chế độ xem, tải và lỗi tải. Mã ca TT-nn là [đề xuất];
// mỗi ca ghi mã HS của PLAN mục 7.1. Chế độ sửa ở `reception-profile-edit.test.tsx`, đường dẫn và menu ở `reception-profile-routing.test.tsx`.
const BRANCH_NAME = 'CLINIX Chi nhánh Quận 3';
const ROW_LABELS = [
  'Họ và tên',
  'Email',
  'Số điện thoại',
  'Giới tính',
  'Ngày sinh',
  'Địa chỉ',
  'Chi nhánh công tác',
];
const ready = () => screen.findByRole('button', { name: 'Chỉnh sửa' });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('xem hồ sơ (HS-17, HS-21)', () => {
  it('TT-01 HS-17 HS-21 mở trang ⇒ đúng MỘT GET /api/profile có Authorization, không gọi danh sách người thân; h1, phụ đề, thẻ "Thông tin cá nhân"', async () => {
    const { profile } = await renderReceptionProfilePage();
    await ready();

    expect(profile.count('GET')).toBe(1);
    const get = profile.requests.find((request) => request.method === 'GET');
    expect(get?.headers.get('Authorization')).toMatch(/^Bearer tok-/);
    expect(profile.relatives.count('GET')).toBe(0);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Quản lý thông tin tài khoản của bạn'),
    ).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Thông tin cá nhân' });
    expect(
      within(card).getByRole('heading', {
        level: 2,
        name: 'Thông tin cá nhân',
      }),
    ).toBeInTheDocument();
  });

  it('TT-02 HS-17 HS-21 bảy hàng đúng thứ tự Figma; trường trống "Chưa cập nhật"; chi nhánh ở hàng cuối', async () => {
    await renderReceptionProfilePage();
    await ready();

    expect(rowLabels()).toEqual(ROW_LABELS);
    expect(rowValue('Họ và tên')).toBe('Lê Thị Lệ Ngân');
    expect(rowValue('Email')).toBe('letan@example.invalid');
    expect(rowValue('Số điện thoại')).toBe('0965432109');
    expect(rowValue('Giới tính')).toBe('Chưa cập nhật');
    expect(rowValue('Ngày sinh')).toBe('Chưa cập nhật');
    expect(rowValue('Địa chỉ')).toBe('Chưa cập nhật');
    expect(rowValue('Chi nhánh công tác')).toBe(BRANCH_NAME);
  });

  it('TT-03 HS-17 hồ sơ đầy đủ: ngày dd/mm/yyyy, địa chỉ, giới tính bằng chữ', async () => {
    await renderReceptionProfilePage({
      initial: {
        gioiTinh: 'Nu',
        ngaySinh: '1990-05-15',
        diaChi: '12 Đường Mẫu, Quận Một',
      },
    });
    await ready();

    expect(rowValue('Giới tính')).toBe('Nữ');
    expect(rowValue('Ngày sinh')).toBe('15/05/1990');
    expect(rowValue('Địa chỉ')).toBe('12 Đường Mẫu, Quận Một');
  });

  it.each([
    ['Nam', 'Nam'],
    ['Nu', 'Nữ'],
    ['Khac', 'Khác'],
    ['Male', 'Chưa cập nhật'],
  ])('TT-03 HS-17 mã giới tính %s ⇒ "%s"', async (code, text) => {
    await renderReceptionProfilePage({ initial: { gioiTinh: code } });
    await ready();
    expect(rowValue('Giới tính')).toBe(text);
  });

  it('TT-04 HS-21 thẻ đầu: tên, "Lễ tân · {chi nhánh}", nhãn "Đang hoạt động", avatar chữ "LT" aria-hidden; không nút hay biểu tượng máy ảnh', async () => {
    const { container } = await renderReceptionProfilePage({
      withLayout: false,
    });
    await ready();

    expect(
      screen.getByText('Lê Thị Lệ Ngân', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Lễ tân · ${BRANCH_NAME}`)).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    const initials = screen.getByText('LT');
    expect(initials).toHaveAttribute('aria-hidden', 'true');
    expect(initials.closest('button')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /ảnh|camera|máy ảnh/i }),
    ).toBeNull();
    expect(container.querySelector('svg.lucide-camera')).toBeNull();
    // Nút duy nhất của thẻ thông tin là "Chỉnh sửa"
    const card = screen.getByRole('region', { name: 'Thông tin cá nhân' });
    expect(within(card).getAllByRole('button')).toHaveLength(1);
  });

  it.each([
    ['null', (body: Record<string, unknown>) => ({ ...body, chiNhanh: null })],
    [
      'không có khoá',
      (body: Record<string, unknown>) => {
        const { chiNhanh: _drop, ...rest } = body;
        void _drop;
        return rest;
      },
    ],
  ])(
    'TT-05 HS-21 chi nhánh %s ⇒ trang không vỡ: chỉ "Lễ tân", ô chi nhánh "Chưa cập nhật"',
    async (_label, withoutBranch) => {
      await renderReceptionProfilePage({
        withLayout: false,
        before: ({ profile }) =>
          profile.failNext('GET', () =>
            json(200, withoutBranch({ ...SAMPLE_RECEPTIONIST })),
          ),
      });
      await ready();

      expect(screen.getByText('Lễ tân')).toBeInTheDocument();
      expect(screen.queryByText(/Lễ tân ·/)).toBeNull();
      expect(rowValue('Chi nhánh công tác')).toBe('Chưa cập nhật');
      expect(rowValue('Họ và tên')).toBe('Lê Thị Lệ Ngân');
    },
  );

  it('TT-06 HS-21 id chi nhánh vượt 2^53 không làm vỡ trang; tên chi nhánh hiện đúng', async () => {
    await renderReceptionProfilePage({
      initial: {
        chiNhanh: { chiNhanhId: '9007199254740993', ten: 'Chi nhánh số lớn' },
      },
    });
    await ready();
    expect(rowValue('Chi nhánh công tác')).toBe('Chi nhánh số lớn');
  });

  it('TT-07 HS-17 họ tên 100 ký tự và tên chi nhánh rất dài hiện đủ ở thẻ đầu và ở hàng, không cắt chữ', async () => {
    const name = `Nguyễn ${'Văn '.repeat(23)}A`;
    const branch = `CLINIX Chi nhánh ${'Phạm Ngũ Lão '.repeat(10)}`.trim();
    await renderReceptionProfilePage({
      withLayout: false,
      initial: { hoTen: name, chiNhanh: { chiNhanhId: '3', ten: branch } },
    });
    await ready();

    expect(Array.from(name)).toHaveLength(100);
    expect(screen.getAllByText(name)).toHaveLength(2); // thẻ đầu và hàng "Họ và tên"
    expect(screen.getByText(`Lễ tân · ${branch}`)).toBeInTheDocument();
    expect(rowValue('Chi nhánh công tác')).toBe(branch);
  });

  it('TT-08 HS-17 khối "Đổi mật khẩu" của auth có mặt; KHÔNG có tiêu đề "Bảo mật tài khoản", dòng "demo123" hay "Mô phỏng trong bộ nhớ"', async () => {
    await renderReceptionProfilePage();
    await ready();

    expect(
      screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cập nhật mật khẩu' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Bảo mật tài khoản' }),
    ).toBeNull();
    expect(screen.queryByText(/demo123/)).toBeNull();
    expect(screen.queryByText(/Mô phỏng trong bộ nhớ/)).toBeNull();
  });

  it('TT-09 HS-17 thứ tự trang: h1, thẻ thông tin, rồi khối đổi mật khẩu; không có khối Bản thân, Người thân của trang Bệnh nhân', async () => {
    await renderReceptionProfilePage();
    await ready();

    const h1 = screen.getByRole('heading', { level: 1 });
    const card = screen.getByRole('region', { name: 'Thông tin cá nhân' });
    const password = screen.getByRole('heading', { name: 'Đổi mật khẩu' });
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(h1, card)).toBe(true);
    expect(follows(card, password)).toBe(true);
    expect(screen.queryByRole('region', { name: 'Bản thân' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Người thân' })).toBeNull();
  });
});

describe('tải và lỗi tải (HS-17)', () => {
  it('TT-10 HS-17 đang tải: "Đang tải" và h1, chưa có "Chỉnh sửa", khối đổi mật khẩu vẫn có; xong thì hiện hồ sơ', async () => {
    let release: (status: number, body: unknown) => void = () => undefined;
    await renderReceptionProfilePage({
      before: ({ profile }) => {
        release = profile.hold('GET');
      },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Thông tin cá nhân' }),
    ).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
    ).toBeInTheDocument();

    release(200, SAMPLE_RECEPTIONIST);
    await ready();
    expect(rowValue('Họ và tên')).toBe('Lê Thị Lệ Ngân');
    // Hết "Đang tải"; còn vùng thông báo trống có sẵn của SavedNotice (cho người đọc màn hình)
    expect(screen.queryByText(/Đang tải/)).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
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
    [
      'chiNhanh sai hình dạng',
      () => json(200, { ...SAMPLE_RECEPTIONIST, chiNhanh: 5 }),
      GENERIC_ERROR_MESSAGE,
    ],
  ])(
    'TT-11 HS-17 lỗi tải (%s) ⇒ câu lỗi + "Thử lại" ⇒ GET lần hai ⇒ dữ liệu; h1 và khối đổi mật khẩu vẫn có',
    async (_label, failure, message) => {
      const { profile } = await renderReceptionProfilePage({
        before: ({ profile }) => profile.failNext('GET', failure),
      });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(
        screen.getByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();

      // Giữ GET lần hai: trong lúc chờ quay lại "Đang tải", câu lỗi và nút "Thử lại" biến mất
      const release = profile.hold('GET');
      fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
      expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();

      release(200, SAMPLE_RECEPTIONIST);
      await ready();
      expect(rowValue('Họ và tên')).toBe('Lê Thị Lệ Ngân');
      expect(profile.count('GET')).toBe(2);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('TT-12 HS-17 quá giờ (15 giây) ⇒ câu quá giờ + "Thử lại"', async () => {
    await renderReceptionProfilePage({
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

  it('TT-13 HS-17 GET bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, trang không hiện thêm câu lỗi', async () => {
    await renderReceptionProfilePage({
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

  it('TT-14 HS-17 gỡ trang giữa lúc tải ⇒ yêu cầu GET bị huỷ, không câu lỗi', async () => {
    let signal: AbortSignal | null | undefined;
    const { unmount } = await renderReceptionProfilePage({
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

  it('TT-14 HS-17 gỡ trang rồi GET mới về muộn ⇒ bỏ qua kết quả, không lỗi, không console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    let release: (status: number, body: unknown) => void = () => undefined;
    const { unmount } = await renderReceptionProfilePage({
      before: ({ profile }) => {
        release = profile.hold('GET');
      },
    });

    unmount();
    release(200, SAMPLE_RECEPTIONIST);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Lê Thị Lệ Ngân')).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('TT-15 HS-17 đăng xuất giữa lúc tải (client huỷ) ⇒ không câu lỗi, không "Thử lại"', async () => {
    await renderReceptionProfilePage({
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
