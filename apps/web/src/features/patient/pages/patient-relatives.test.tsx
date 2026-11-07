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
import {
  SAMPLE_RELATIVES,
  hang,
  json,
  type FakeRelative,
} from '../testing/fake-profile-api';
import { renderProfilePage } from '../testing/profile-page-harness';
import {
  addButton,
  cardOf,
  cards,
  editButtonOf,
  labelsOf,
  namesInOrder,
  relativesRegion,
  valueOf,
  waitForList,
} from '../testing/relatives-harness';

// patient F6 (TRACKING F6-D, F6-H): danh sách người thân, NT-20. Mã ca RW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN mục 7.2.
// NT-23 (ngừng sử dụng) thuộc F7: không phủ ở đây.
const relative = (
  id: string,
  extra: Partial<FakeRelative> = {},
): FakeRelative => ({
  ...SAMPLE_RELATIVES[0],
  hoSoNguoiThanId: id,
  hoTen: `Người ${id}`,
  ...extra,
});
const countLine = () => screen.getByText(/hồ sơ người thân ·/);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('mở trang (NT-20)', () => {
  it('RW-50 NT-20 một GET /api/patient/relatives có Authorization và một GET /api/profile; thứ tự khối Bản thân, Người thân, Bảo mật', async () => {
    const { profile } = await renderProfilePage({
      relatives: SAMPLE_RELATIVES,
    });
    await waitForList();

    expect(profile.relatives.count('GET')).toBe(1);
    expect(profile.relatives.requests[0].headers.get('Authorization')).toMatch(
      /^Bearer tok-/,
    );
    expect(profile.count('GET')).toBe(1);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Bản thân', 'Người thân', 'Bảo mật tài khoản']);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hồ sơ người khám' }),
    ).toBeInTheDocument();
  });

  it('RW-51 NT-20 khối Người thân tải song song và độc lập với khối Bản thân: GET /profile còn treo mà danh sách đã hiện', async () => {
    await renderProfilePage({
      relatives: SAMPLE_RELATIVES,
      before: ({ profile }) => {
        profile.hold('GET');
      },
    });
    await waitForList();

    expect(
      within(screen.getByRole('region', { name: 'Bản thân' })).getByRole(
        'status',
      ),
    ).toHaveTextContent('Đang tải');
    expect(namesInOrder()).toEqual(['Nguyễn Thị Bích', 'Nguyễn Minh Tuấn']);
  });

  it.each([
    ['không có hồ sơ', [], '0 hồ sơ người thân · 0 đang sử dụng'],
    ['một hồ sơ', [relative('1')], '1 hồ sơ người thân · 1 đang sử dụng'],
    [
      'hai hồ sơ đang dùng',
      SAMPLE_RELATIVES,
      '2 hồ sơ người thân · 2 đang sử dụng',
    ],
    [
      'có hồ sơ đã ngừng (tính vào N, không tính vào M)',
      [
        relative('1'),
        relative('2'),
        relative('3', { trangThaiHieuLuc: false }),
      ],
      '3 hồ sơ người thân · 2 đang sử dụng',
    ],
    [
      'tất cả đã ngừng',
      [relative('1', { trangThaiHieuLuc: false })],
      '1 hồ sơ người thân · 0 đang sử dụng',
    ],
  ])('RW-52 NT-20 dòng đếm: %s', async (_label, relatives, text) => {
    await renderProfilePage({ relatives });
    await waitForList();
    expect(countLine()).toHaveTextContent(text);
  });
});

describe('thẻ từng người (NT-20; frame 416:2)', () => {
  it('RW-53 NT-20 mỗi thẻ đủ sáu ô theo thứ tự Figma; ngày dd/mm/yyyy; SĐT trống ⇒ "Chưa cập nhật"; nhãn quan hệ ở đầu thẻ', async () => {
    await renderProfilePage({ relatives: SAMPLE_RELATIVES });
    await waitForList();

    const first = cardOf('Nguyễn Thị Bích');
    expect(labelsOf(first)).toEqual([
      'Họ và tên',
      'Quan hệ',
      'Giới tính',
      'Ngày sinh',
      'Số điện thoại',
      'Trạng thái hồ sơ',
    ]);
    expect(valueOf(first, 'Họ và tên')).toBe('Nguyễn Thị Bích');
    expect(valueOf(first, 'Quan hệ')).toBe('Mẹ');
    expect(valueOf(first, 'Giới tính')).toBe('Nữ');
    expect(valueOf(first, 'Ngày sinh')).toBe('08/03/1960');
    expect(valueOf(first, 'Số điện thoại')).toBe('0909123456');
    expect(valueOf(first, 'Trạng thái hồ sơ')).toBe('Đang sử dụng');
    // Nhãn dưới tên (badge) và avatar chữ viết tắt
    expect(within(first).getAllByText('Mẹ')).toHaveLength(2);
    expect(within(first).getByText('NT')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    const second = cardOf('Nguyễn Minh Tuấn');
    expect(valueOf(second, 'Quan hệ')).toBe('Con');
    expect(valueOf(second, 'Giới tính')).toBe('Nam');
    expect(valueOf(second, 'Số điện thoại')).toBe('Chưa cập nhật');
  });

  it.each([
    ['Cha', 'Cha'],
    ['Me', 'Mẹ'],
    ['Vo', 'Vợ'],
    ['Chong', 'Chồng'],
    ['Con', 'Con'],
    ['AnhChiEm', 'Anh/Chị/Em'],
    ['OngBa', 'Ông/Bà'],
    ['Khac', 'Khác'],
  ])(
    'RW-54 NT-20 mã quan hệ %s ⇒ nhãn tiếng Việt %s (ô xem và nhãn đầu thẻ)',
    async (code, label) => {
      await renderProfilePage({
        relatives: [relative('1', { moiQuanHe: code })],
      });
      await waitForList();
      const card = cardOf('Người 1');
      expect(valueOf(card, 'Quan hệ')).toBe(label);
      expect(within(card).getAllByText(label).length).toBeGreaterThanOrEqual(2);
    },
  );

  it.each([
    ['Nam', 'Nam'],
    ['Nu', 'Nữ'],
    ['Khac', 'Khác'],
  ])('RW-55 NT-20 mã giới tính %s ⇒ %s', async (code, label) => {
    await renderProfilePage({ relatives: [relative('1', { gioiTinh: code })] });
    await waitForList();
    expect(valueOf(cardOf('Người 1'), 'Giới tính')).toBe(label);
  });

  it.each([
    ['1900-01-01', '01/01/1900'],
    ['2024-02-29', '29/02/2024'],
    ['1999-12-31', '31/12/1999'],
    ['2026-11-07', '07/11/2026'],
  ])(
    'RW-56 NT-20 ngày sinh biên %s ⇒ %s (đổi bằng chuỗi, kể cả ở múi giờ âm)',
    async (iso, shown) => {
      // `new Date('1990-05-15')` là nửa đêm UTC: ở múi giờ âm đọc ra ngày hôm trước
      vi.stubEnv('TZ', 'America/New_York');
      await renderProfilePage({
        relatives: [relative('1', { ngaySinh: iso })],
      });
      await waitForList();
      expect(valueOf(cardOf('Người 1'), 'Ngày sinh')).toBe(shown);
    },
  );

  it('RW-57 NT-20 Q10: hồ sơ đã ngừng vẫn hiện, "Ngừng sử dụng", KHÔNG có nút sửa; hồ sơ đang dùng có nút sửa', async () => {
    await renderProfilePage({
      relatives: [relative('1'), relative('2', { trangThaiHieuLuc: false })],
    });
    await waitForList();

    expect(valueOf(cardOf('Người 2'), 'Trạng thái hồ sơ')).toBe(
      'Ngừng sử dụng',
    );
    expect(within(cardOf('Người 2')).queryByRole('button')).toBeNull();
    expect(valueOf(cardOf('Người 1'), 'Trạng thái hồ sơ')).toBe('Đang sử dụng');
    expect(editButtonOf('Người 1')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Chỉnh sửa hồ sơ Người 2' }),
    ).toBeNull();
  });

  it('RW-58 NT-20 thứ tự: đang dùng trước rồi id tăng dần (so bằng chuỗi), hồ sơ đã ngừng ở cuối, dù API trả lộn xộn', async () => {
    await renderProfilePage({
      relatives: [
        relative('1', { trangThaiHieuLuc: false }),
        relative('10'),
        relative('9007199254740993'),
        relative('9'),
        relative('9007199254740992'),
        relative('3', { trangThaiHieuLuc: false }),
      ],
    });
    await waitForList();
    expect(namesInOrder()).toEqual([
      'Người 9',
      'Người 10',
      'Người 9007199254740992',
      'Người 9007199254740993',
      'Người 1',
      'Người 3',
    ]);
  });

  it('RW-59 NT-20 Q22 danh sách rỗng ⇒ câu gợi ý, không thẻ nào; nút "Thêm người thân" bật', async () => {
    await renderProfilePage({ relatives: [] });
    await waitForList();
    expect(
      within(relativesRegion()).getByText(
        'Chưa có hồ sơ người thân. Bấm "Thêm người thân" để tạo hồ sơ.',
      ),
    ).toBeInTheDocument();
    expect(within(relativesRegion()).queryAllByRole('listitem')).toHaveLength(
      0,
    );
    expect(addButton()).toBeEnabled();
  });

  it('RW-60 NT-20 mã quan hệ, giới tính lạ và tên 100 ký tự không làm vỡ trang: "Chưa cập nhật"', async () => {
    const longName = 'Ê'.repeat(100);
    await renderProfilePage({
      relatives: [
        relative('1', { hoTen: longName, moiQuanHe: 'Mẹ', gioiTinh: 'Male' }),
      ],
    });
    await waitForList();
    const card = cardOf(longName);
    expect(valueOf(card, 'Quan hệ')).toBe('Chưa cập nhật');
    expect(valueOf(card, 'Giới tính')).toBe('Chưa cập nhật');
    expect(valueOf(card, 'Họ và tên')).toBe(longName);
    // Nhãn dưới tên cũng không bịa quan hệ
    expect(within(card).getAllByText('Chưa cập nhật')).toHaveLength(3);
  });

  it('RW-61 NT-20 tên truy cập nút sửa của thẻ khác nút "Chỉnh sửa" của Bản thân và khác nhau giữa các thẻ', async () => {
    await renderProfilePage({ relatives: SAMPLE_RELATIVES });
    await waitForList();
    // Đúng MỘT nút tên "Chỉnh sửa": của khối Bản thân
    const self = screen.getByRole('button', { name: 'Chỉnh sửa' });
    expect(
      within(screen.getByRole('region', { name: 'Bản thân' })).getByRole(
        'button',
        { name: 'Chỉnh sửa' },
      ),
    ).toBe(self);
    const names = within(relativesRegion())
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual([
      'Thêm người thân',
      'Chỉnh sửa hồ sơ Nguyễn Thị Bích',
      'Chỉnh sửa hồ sơ Nguyễn Minh Tuấn',
    ]);
  });
});

describe('đang tải và lỗi tải (NT-20; Q22)', () => {
  it('RW-62 NT-20 đang tải: "Đang tải" trong khối Người thân, nút Thêm vô hiệu, chưa có dòng đếm; xong thì hiện danh sách', async () => {
    let release: (status: number, body: unknown) => void = () => undefined;
    await renderProfilePage({
      relatives: SAMPLE_RELATIVES,
      before: ({ profile }) => {
        release = profile.relatives.hold('GET');
      },
    });
    expect(
      within(relativesRegion()).getByText('Đang tải...'),
    ).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    expect(screen.queryByText(/hồ sơ người thân ·/)).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hồ sơ người khám' }),
    ).toBeInTheDocument();

    release(200, { items: SAMPLE_RELATIVES });
    await waitForList();
    expect(addButton()).toBeEnabled();
    expect(within(relativesRegion()).queryByText('Đang tải...')).toBeNull();
  });

  const failures: [string, () => Response, string][] = [
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
  ];

  it.each(failures)(
    'RW-63 NT-20 lỗi tải (%s) ⇒ câu lỗi + "Thử lại" CHỈ trong khối Người thân; h1, khối Bản thân, khối Bảo mật không mất; "Thử lại" gọi lại ⇒ danh sách',
    async (_label, failure, message) => {
      const { profile } = await renderProfilePage({
        relatives: SAMPLE_RELATIVES,
        before: ({ profile }) => profile.relatives.failNext('GET', failure),
      });

      const alert = await within(relativesRegion()).findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(addButton()).toBeDisabled();
      expect(
        screen.getByRole('heading', { level: 1, name: 'Hồ sơ người khám' }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'Chỉnh sửa' }),
      ).toBeVisible();
      expect(
        screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
      ).toBeInTheDocument();

      const release = profile.relatives.hold('GET');
      fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
      expect(
        within(relativesRegion()).getByText('Đang tải...'),
      ).toBeInTheDocument();
      expect(within(relativesRegion()).queryByRole('alert')).toBeNull();

      release(200, { items: SAMPLE_RELATIVES });
      await waitForList();
      expect(profile.relatives.count('GET')).toBe(2);
      expect(namesInOrder()).toEqual(['Nguyễn Thị Bích', 'Nguyễn Minh Tuấn']);
    },
  );

  it('RW-64 NT-20 quá giờ 15 giây ⇒ câu quá giờ + "Thử lại"', async () => {
    await renderProfilePage({
      before: ({ profile }) => {
        vi.useFakeTimers();
        profile.relatives.failNext('GET', (init) => hang(init));
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(within(relativesRegion()).getByRole('alert')).toHaveTextContent(
      TIMEOUT_ERROR_MESSAGE,
    );
    expect(
      within(relativesRegion()).getByRole('button', { name: 'Thử lại' }),
    ).toBeVisible();
  });

  it('RW-65 NT-20 khối Bản thân lỗi thì danh sách người thân vẫn hiện (độc lập hai chiều)', async () => {
    await renderProfilePage({
      relatives: SAMPLE_RELATIVES,
      before: ({ profile }) =>
        profile.failNext('GET', () =>
          json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
        ),
    });
    await waitForList();
    expect(
      within(screen.getByRole('region', { name: 'Bản thân' })).getByRole(
        'alert',
      ),
    ).toBeInTheDocument();
    expect(namesInOrder()).toHaveLength(2);
    expect(within(relativesRegion()).queryByRole('alert')).toBeNull();
  });
});

describe('phiên và gỡ trang', () => {
  it('RW-66 NT-20 GET bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, khối không hiện thêm câu lỗi hay "Thử lại"', async () => {
    await renderProfilePage({
      withLayout: false,
      before: ({ profile }) =>
        profile.relatives.failNext('GET', () =>
          json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
        ),
    });
    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('RW-67 NT-20 gỡ trang giữa lúc tải ⇒ yêu cầu GET bị huỷ, không câu lỗi', async () => {
    let signal: AbortSignal | null | undefined;
    const { unmount } = await renderProfilePage({
      before: ({ profile }) =>
        profile.relatives.failNext('GET', (init) => {
          signal = init?.signal;
          return hang(init);
        }),
    });
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('RW-67 NT-20 gỡ trang rồi GET mới về (máy chủ trả muộn) ⇒ bỏ qua kết quả, không lỗi, không console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    let release: (status: number, body: unknown) => void = () => undefined;
    const { unmount } = await renderProfilePage({
      relatives: SAMPLE_RELATIVES,
      before: ({ profile }) => {
        release = profile.relatives.hold('GET');
      },
    });

    unmount();
    release(200, { items: SAMPLE_RELATIVES });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Nguyễn Thị Bích')).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('RW-68 NT-20 đăng xuất giữa lúc tải (client huỷ) ⇒ không câu lỗi, không "Thử lại"', async () => {
    await renderProfilePage({
      withLayout: false,
      before: ({ profile }) =>
        profile.relatives.failNext('GET', (init) => hang(init)),
    });
    expect(
      within(relativesRegion()).getByText('Đang tải...'),
    ).toBeInTheDocument();
    await act(async () => {
      await logout();
    });
    expect(getAuthState().status).toBe('unauthenticated');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('RW-69 NT-20 dữ liệu người thân không lọt vào URL, tiêu đề, lịch sử hay kho trình duyệt; không console.*', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const { router } = await renderProfilePage({ relatives: SAMPLE_RELATIVES });
    await waitForList();
    expect(cards()).toHaveLength(2);

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
      'Nguyễn Thị Bích',
      '0909123456',
      '08/03/1960',
      '1960-03-08',
    ]) {
      expect(where).not.toContain(secret);
    }
  });
});
