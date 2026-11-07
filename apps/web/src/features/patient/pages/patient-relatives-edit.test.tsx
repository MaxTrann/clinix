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
} from '../../../shared/api/error-message';
import { apiError } from '../../../test/fake-auth-api';
import { logout } from '../../auth';
import { getAuthState } from '../../auth/auth-store';
import {
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  SAVE_NETWORK_MESSAGE,
  SAVE_UNEXPECTED_MESSAGE,
  SYSTEM_MESSAGE,
} from '../profile/profile-errors';
import {
  DEACTIVATED_MESSAGE,
  MISSING_MESSAGE,
  RELATIONSHIP_REQUIRED_MESSAGE,
  UPDATED_MESSAGE,
} from '../relatives/relative-errors';
import {
  SAMPLE_RELATIVES,
  hang,
  json,
  type FakeRelative,
} from '../testing/fake-profile-api';
import { renderProfilePage } from '../testing/profile-page-harness';
import {
  VALID_INPUT,
  addButton,
  addForm,
  cardOf,
  editButtonOf,
  editFormOf,
  fieldsOf,
  fill,
  labelsOf,
  namesInOrder,
  relativesRegion,
  valueOf,
  waitForList,
} from '../testing/relatives-harness';

// patient F6 (TRACKING F6-F, F6-G, F6-H): sửa tại chỗ, NT-22 (frame 434:2), nhiều form độc lập, vòng đời. Mã ca RW-nn là [đề xuất];
// mỗi ca ghi mã NT của PLAN mục 7.2. NT-23 (ngừng sử dụng) thuộc F7: không phủ ở đây.
const BICH = 'Nguyễn Thị Bích';
const TUAN = 'Nguyễn Minh Tuấn';
const THREE: FakeRelative[] = [
  ...SAMPLE_RELATIVES,
  {
    ...SAMPLE_RELATIVES[0],
    hoSoNguoiThanId: '3',
    hoTen: 'Lê Văn Ba',
    moiQuanHe: 'Cha',
    gioiTinh: 'Nam',
  },
];
const puts = (profile: { relatives: { requests: { method: string }[] } }) =>
  profile.relatives.requests.filter((request) => request.method === 'PUT');
const SECRETS = /Trần Thị Cúc|0912345678|12\/04\/1992|1992-04-12|Riêng Tư/;
const sleep = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
const statusText = () =>
  within(relativesRegion())
    .getAllByRole('status')
    .map((el) => el.textContent)
    .join('');

async function renderList(
  relatives: FakeRelative[] = SAMPLE_RELATIVES,
  withLayout = true,
) {
  const api = await renderProfilePage({ relatives, withLayout });
  await waitForList();
  return api;
}
// Mở form sửa của một thẻ
function openEdit(name: string) {
  fireEvent.click(editButtonOf(name));
  return fieldsOf(editFormOf(name));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('mở form sửa và "Hủy" (NT-22; frame 434:2)', () => {
  it('RW-100 NT-22 "Chỉnh sửa" ⇒ thẻ đổi thành form TẠI CHỖ với dữ liệu hiện tại, focus ô Họ và tên; thẻ kia và khối Bản thân không đổi; không có ô "Trạng thái hồ sơ"', async () => {
    await renderList();
    const fields = openEdit(BICH);

    expect(fields.name).toHaveFocus();
    expect(fields.name).toHaveValue(BICH);
    expect(fields.relationship).toHaveValue('Me');
    expect(fields.gender).toHaveValue('Nu');
    expect(fields.birth).toHaveValue('08/03/1960');
    expect(fields.phone).toHaveValue('0909123456');
    expect(fields.submit).toHaveTextContent('Lưu thay đổi');
    const card = cardOf(BICH);
    expect(card.querySelector('dl')).toBeNull();
    expect(card).toContainElement(editFormOf(BICH));
    expect(within(card).queryByText('Trạng thái hồ sơ')).toBeNull();
    expect(
      screen.queryByRole('button', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    // Thẻ kia vẫn ở chế độ xem; nút "Chỉnh sửa" của Bản thân vẫn đó
    expect(labelsOf(cardOf(TUAN))).toHaveLength(6);
    expect(editButtonOf(TUAN)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toBeVisible();
  });

  it('RW-101 NT-22 "Hủy" ⇒ về chế độ xem với dữ liệu cũ, focus nút "Chỉnh sửa" của chính thẻ, không PUT; sau lỗi 400 rồi "Hủy" ⇒ mở lại thấy dữ liệu CŨ', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    fill(editFormOf(BICH), { name: 'Tên đã gõ dở', phone: '0911111111' });
    fireEvent.click(fields.cancel);

    expect(
      screen.queryByRole('form', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    expect(valueOf(cardOf(BICH), 'Họ và tên')).toBe(BICH);
    expect(valueOf(cardOf(BICH), 'Số điện thoại')).toBe('0909123456');
    await waitFor(() => expect(editButtonOf(BICH)).toHaveFocus());
    expect(puts(profile)).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();

    // Một lần lỗi 400 rồi Hủy
    const again = openEdit(BICH);
    fill(editFormOf(BICH), { name: 'Tên khác' });
    profile.relatives.failNext('PUT', () =>
      json(400, {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'x',
        loi: [{ truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' }],
      }),
    );
    fireEvent.click(again.submit);
    await within(editFormOf(BICH)).findByText(
      FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
    );
    fireEvent.click(again.cancel);
    expect(openEdit(BICH).name).toHaveValue(BICH);
  });

  it('RW-102 NT-22 hồ sơ đã ngừng không có nút "Chỉnh sửa" (Q9), nên không mở được form', async () => {
    await renderList([
      SAMPLE_RELATIVES[0],
      { ...SAMPLE_RELATIVES[1], trangThaiHieuLuc: false },
    ]);
    expect(within(cardOf(TUAN)).queryByRole('button')).toBeNull();
    expect(
      screen.queryByRole('button', { name: `Chỉnh sửa hồ sơ ${TUAN}` }),
    ).toBeNull();
    expect(editButtonOf(BICH)).toBeVisible();
  });
});

describe('lưu thành công (NT-22; Q9)', () => {
  it('RW-103 NT-22 thẻ hiện dữ liệu của PHẢN HỒI PUT (SĐT đã chuẩn hoá), thông báo role=status, focus nút "Chỉnh sửa", thân PUT đúng NĂM khoá tới đúng đường dẫn, không GET lại, thứ tự không đổi', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    fill(editFormOf(BICH), {
      name: '  Nguyễn Thị Bích Hợp ',
      phone: '0909 123 457',
    });
    fireEvent.click(fields.submit);

    await waitFor(() => expect(statusText()).toContain(UPDATED_MESSAGE));
    const [put] = puts(
      profile,
    ) as (typeof profile.relatives.requests)[number][];
    expect(put.path).toBe('/api/patient/relatives/1');
    expect(put.headers.get('Authorization')).toMatch(/^Bearer tok-/);
    expect(put.body).toEqual({
      hoTen: 'Nguyễn Thị Bích Hợp',
      moiQuanHe: 'Me',
      gioiTinh: 'Nu',
      ngaySinh: '1960-03-08',
      soDienThoai: '0909 123 457',
    });
    expect(Object.keys(put.body)).toHaveLength(5);

    expect(namesInOrder()).toEqual(['Nguyễn Thị Bích Hợp', TUAN]);
    const card = cardOf('Nguyễn Thị Bích Hợp');
    // Máy chủ chuẩn hoá SĐT thành 10 số liền: thẻ hiện bản đó, không phải ô đã nhập
    expect(valueOf(card, 'Số điện thoại')).toBe('0909123457');
    expect(card.querySelector('form')).toBeNull();
    await waitFor(() =>
      expect(editButtonOf('Nguyễn Thị Bích Hợp')).toHaveFocus(),
    );
    expect(profile.relatives.count('GET')).toBe(1);
    expect(valueOf(cardOf(TUAN), 'Họ và tên')).toBe(TUAN);
  });

  it('RW-104 NT-22 bỏ trống SĐT ⇒ gửi null (xoá SĐT) ⇒ thẻ hiện "Chưa cập nhật"', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    fill(editFormOf(BICH), { phone: '  ' });
    fireEvent.click(fields.submit);

    await screen.findByText(UPDATED_MESSAGE);
    expect(puts(profile)[0]).toMatchObject({ body: { soDienThoai: null } });
    expect(valueOf(cardOf(BICH), 'Số điện thoại')).toBe('Chưa cập nhật');
  });

  it('RW-105 NT-22 đổi mối quan hệ (Mẹ ⇒ Vợ) và giới tính được: thân PUT mang mã mới, nhãn đầu thẻ đổi', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    fill(editFormOf(BICH), { relationship: 'Vo', gender: 'Khac' });
    fireEvent.click(fields.submit);

    await screen.findByText(UPDATED_MESSAGE);
    expect(puts(profile)[0]).toMatchObject({
      body: { moiQuanHe: 'Vo', gioiTinh: 'Khac' },
    });
    expect(valueOf(cardOf(BICH), 'Quan hệ')).toBe('Vợ');
    expect(within(cardOf(BICH)).getAllByText('Vợ')).toHaveLength(2);
    expect(valueOf(cardOf(BICH), 'Giới tính')).toBe('Khác');
  });

  it('RW-106 NT-22 mã quan hệ và giới tính LẠ ⇒ ô hiện "Chọn …", Lưu bị chặn (không PUT) với câu "Vui lòng chọn …", focus ô quan hệ; chọn lại thì lưu được', async () => {
    const { profile } = await renderList([
      { ...SAMPLE_RELATIVES[0], moiQuanHe: 'Mẹ', gioiTinh: 'Male' },
    ]);
    const fields = openEdit(BICH);
    expect(fields.relationship).toHaveValue('');
    expect(fields.gender).toHaveValue('');

    fireEvent.click(fields.submit);
    expect(puts(profile)).toHaveLength(0);
    expect(
      within(editFormOf(BICH)).getByText(RELATIONSHIP_REQUIRED_MESSAGE),
    ).toBeInTheDocument();
    expect(
      within(editFormOf(BICH)).getByText(FIELD_MESSAGES.GIOI_TINH_KHONG_HOP_LE),
    ).toBeInTheDocument();
    expect(fields.relationship).toHaveFocus();

    fill(editFormOf(BICH), { relationship: 'Me', gender: 'Nu' });
    fireEvent.click(fields.submit);
    await screen.findByText(UPDATED_MESSAGE);
    expect(puts(profile)[0]).toMatchObject({
      body: { moiQuanHe: 'Me', gioiTinh: 'Nu' },
    });
  });

  it('RW-107 NT-22 id vượt 2^53 đi nguyên vẹn trong đường dẫn PUT và sửa đúng hồ sơ (hồ sơ id kề bên không đổi)', async () => {
    const { profile } = await renderList([
      {
        ...SAMPLE_RELATIVES[0],
        hoSoNguoiThanId: '9007199254740992',
        hoTen: 'Người chẵn',
      },
      {
        ...SAMPLE_RELATIVES[0],
        hoSoNguoiThanId: '9007199254740993',
        hoTen: 'Người lẻ',
      },
    ]);
    const fields = openEdit('Người lẻ');
    fill(editFormOf('Người lẻ'), { name: 'Người lẻ đã sửa' });
    fireEvent.click(fields.submit);

    await screen.findByText(UPDATED_MESSAGE);
    expect(puts(profile)[0]).toMatchObject({
      path: '/api/patient/relatives/9007199254740993',
    });
    expect(namesInOrder()).toEqual(['Người chẵn', 'Người lẻ đã sửa']);
    expect(profile.relatives.items.map((item) => item.hoTen)).toEqual([
      'Người chẵn',
      'Người lẻ đã sửa',
    ]);
  });

  it('RW-108 NT-22 đang lưu: nút "Đang lưu…" vô hiệu, aria-busy, Hủy vô hiệu; hai lần gửi liên tiếp (cả cùng một đợt) chỉ ra MỘT PUT', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    const release = profile.relatives.hold('PUT');
    const form = editFormOf(BICH);
    const events = [
      new Event('submit', { bubbles: true, cancelable: true }),
      new Event('submit', { bubbles: true, cancelable: true }),
    ];
    act(() => {
      for (const event of events) form.dispatchEvent(event);
    });

    expect(events.map((event) => event.defaultPrevented)).toEqual([true, true]);
    expect(puts(profile)).toHaveLength(1);
    await waitFor(() => expect(fields.submit).toBeDisabled());
    expect(fields.submit).toHaveTextContent('Đang lưu…');
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(fields.cancel).toBeDisabled();
    fireEvent.click(fields.submit);
    expect(puts(profile)).toHaveLength(1);

    release(200, { ...SAMPLE_RELATIVES[0], hoTen: BICH });
    await screen.findByText(UPDATED_MESSAGE);
    expect(puts(profile)).toHaveLength(1);
  });
});

describe('thất bại (NT-22)', () => {
  it('RW-109 NT-22 400 loi[] đảo thứ tự ⇒ câu dưới ô, focus ô lỗi đầu THEO FORM, dữ liệu giữ; loi[] lạ ⇒ hộp chung', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    profile.relatives.failNext('PUT', () =>
      json(400, {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'x',
        loi: [
          { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
          { truong: 'gioiTinh', ma: 'GIOI_TINH_KHONG_HOP_LE' },
        ],
      }),
    );
    fireEvent.click(fields.submit);
    await within(editFormOf(BICH)).findByText(FIELD_MESSAGES.SDT_KHONG_HOP_LE);
    expect(fields.gender).toHaveFocus();
    expect(fields.phone).toHaveValue('0909123456');
    expect(within(editFormOf(BICH)).queryByRole('alert')).toBeNull();

    profile.relatives.failNext('PUT', () =>
      json(400, {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'x',
        loi: [{ truong: 'benhNhanId', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      }),
    );
    fireEvent.click(fields.submit);
    const alert = await within(editFormOf(BICH)).findByRole('alert');
    expect(alert).toHaveTextContent(INVALID_DATA_MESSAGE);
    expect(alert).toHaveFocus();
  });

  it('RW-110 NT-22 404 ⇒ thông báo "không còn tồn tại" + GET tải lại ⇒ thẻ biến mất, thẻ kia ở lại; form THÊM đang mở và dữ liệu gõ dở của nó không bị phá', async () => {
    const { profile } = await renderList();
    fireEvent.click(addButton());
    fill(addForm(), { name: 'Đang gõ dở' });
    const fields = openEdit(BICH);
    profile.relatives.failNext('PUT', () => {
      profile.relatives.items.splice(0, 1);
      return apiError(404, 'KHONG_TIM_THAY');
    });
    fireEvent.click(fields.submit);

    await waitFor(() => expect(statusText()).toContain(MISSING_MESSAGE));
    await waitFor(() => expect(namesInOrder()).toEqual([TUAN]));
    expect(profile.relatives.count('GET')).toBe(2);
    expect(screen.getByText(/hồ sơ người thân ·/)).toHaveTextContent(
      '1 hồ sơ người thân · 1 đang sử dụng',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fieldsOf(addForm()).name).toHaveValue('Đang gõ dở');
  });

  it('RW-111 NT-22 409 HO_SO_NGUOI_THAN_DA_NGUNG ⇒ câu 5.9 + GET tải lại ⇒ thẻ chuyển sang "Ngừng sử dụng", mất nút sửa và form, xuống cuối danh sách, đếm M giảm', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    profile.relatives.failNext('PUT', () => {
      profile.relatives.items[0].trangThaiHieuLuc = false;
      return apiError(409, 'HO_SO_NGUOI_THAN_DA_NGUNG');
    });
    fireEvent.click(fields.submit);

    await waitFor(() => expect(statusText()).toContain(DEACTIVATED_MESSAGE));
    await waitFor(() =>
      expect(valueOf(cardOf(BICH), 'Trạng thái hồ sơ')).toBe('Ngừng sử dụng'),
    );
    expect(
      screen.queryByRole('form', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    expect(namesInOrder()).toEqual([TUAN, BICH]);
    expect(screen.getByText(/hồ sơ người thân ·/)).toHaveTextContent(
      '2 hồ sơ người thân · 1 đang sử dụng',
    );
    expect(profile.relatives.count('GET')).toBe(2);
    expect(puts(profile)).toHaveLength(1);
  });

  it('RW-112 NT-22 tải lại sau 409 thất bại ⇒ giữ danh sách cũ và form, hiện ErrorState + "Thử lại"; "Thử lại" thành công ⇒ thẻ chuyển sang đã ngừng, câu lỗi biến mất', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    profile.relatives.failNext('PUT', () => {
      profile.relatives.items[0].trangThaiHieuLuc = false;
      return apiError(409, 'HO_SO_NGUOI_THAN_DA_NGUNG');
    });
    profile.relatives.failNext('GET', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(fields.submit);

    const alert = await within(relativesRegion()).findByRole('alert');
    expect(alert).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(editFormOf(BICH)).toBeInTheDocument();
    expect(namesInOrder()).toEqual([BICH, TUAN]);
    expect(statusText()).toContain(DEACTIVATED_MESSAGE);

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(namesInOrder()).toEqual([TUAN, BICH]));
    expect(within(relativesRegion()).queryByRole('alert')).toBeNull();
    expect(
      screen.queryByRole('form', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    expect(profile.relatives.count('GET')).toBe(3);
  });

  const failures: [string, () => Response, string][] = [
    [
      'mất mạng',
      () => {
        throw new TypeError('Failed to fetch');
      },
      SAVE_NETWORK_MESSAGE,
    ],
    [
      '500 LOI_HE_THONG',
      () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      SYSTEM_MESSAGE,
    ],
    [
      '502 HTML',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      SAVE_UNEXPECTED_MESSAGE,
    ],
    [
      '403 mã khác',
      () => apiError(403, 'KHONG_DU_QUYEN'),
      GENERIC_ERROR_MESSAGE,
    ],
  ];

  it.each(failures)(
    'RW-113 NT-22 %s ⇒ câu đúng, dữ liệu giữ, KHÔNG tự gửi lại; PUT idempotent nên bấm Lưu lại được ⇒ thành công; không có nút "Tải lại danh sách"',
    async (_label, failure, message) => {
      const { profile } = await renderList();
      const fields = openEdit(BICH);
      fill(editFormOf(BICH), { phone: '0912345678' });
      profile.relatives.failNext('PUT', failure);
      fireEvent.click(fields.submit);

      const alert = await within(editFormOf(BICH)).findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(within(alert).queryByRole('button')).toBeNull();
      expect(fields.phone).toHaveValue('0912345678');
      expect(fields.submit).toBeEnabled();
      await sleep(50);
      expect(puts(profile)).toHaveLength(1);

      fireEvent.click(fields.submit);
      await screen.findByText(UPDATED_MESSAGE);
      expect(puts(profile)).toHaveLength(2);
      expect(valueOf(cardOf(BICH), 'Số điện thoại')).toBe('0912345678');
    },
  );

  it('RW-114 NT-22 quá giờ 15 giây ⇒ câu quá giờ, dữ liệu giữ, không tự gửi lại sau 60 giây, bấm Lưu lại được', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    vi.useFakeTimers();
    profile.relatives.failNext('PUT', (init) => hang(init));
    fireEvent.click(fields.submit);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(within(editFormOf(BICH)).getByRole('alert')).toHaveTextContent(
      'Máy chủ phản hồi quá lâu',
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(puts(profile)).toHaveLength(1);
    expect(fields.submit).toBeEnabled();
    vi.useRealTimers();
    fireEvent.click(fields.submit);
    await screen.findByText(UPDATED_MESSAGE);
    expect(puts(profile)).toHaveLength(2);
  });
});

describe('nhiều form độc lập (câu d; F6-G)', () => {
  it('RW-115 NT-22 mở form sửa hai thẻ và form thêm cùng lúc: lưu một thẻ không đóng form kia, dữ liệu gõ dở của các form còn lại giữ nguyên', async () => {
    await renderList(THREE);
    fireEvent.click(addButton());
    fill(addForm(), { name: 'Thêm dở' });
    const a = openEdit(BICH);
    const b = openEdit(TUAN);
    fill(editFormOf(TUAN), { name: 'Tuấn sửa dở' });
    fill(editFormOf(BICH), { name: 'Bích đã sửa xong' });
    fireEvent.click(a.submit);

    await screen.findByText(UPDATED_MESSAGE);
    expect(
      screen.queryByRole('form', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    expect(valueOf(cardOf('Bích đã sửa xong'), 'Họ và tên')).toBe(
      'Bích đã sửa xong',
    );
    expect(b.name).toHaveValue('Tuấn sửa dở');
    expect(fieldsOf(addForm()).name).toHaveValue('Thêm dở');
    expect(editFormOf(TUAN)).toBeInTheDocument();
  });

  it('RW-116 NT-22 tải lại nền (sau 404) đang bay rồi một lần lưu thành công ⇒ kết quả GET cũ bị bỏ, hồ sơ vừa lưu KHÔNG bị xoá', async () => {
    const { profile } = await renderList(THREE);
    const b = openEdit(TUAN);
    profile.relatives.failNext('PUT', () => apiError(404, 'KHONG_TIM_THAY'));
    const releaseGet = profile.relatives.hold('GET');
    fireEvent.click(b.submit);
    await waitFor(() => expect(profile.relatives.count('GET')).toBe(2));

    const a = openEdit(BICH);
    fill(editFormOf(BICH), { name: 'Bích mới lưu' });
    fireEvent.click(a.submit);
    await waitFor(() => expect(namesInOrder()).toContain('Bích mới lưu'));

    // GET cũ về muộn, chụp trước lần lưu: mang theo tên CŨ của hồ sơ 1
    releaseGet(200, { items: THREE });
    await sleep(30);
    expect(namesInOrder()).toContain('Bích mới lưu');
    expect(namesInOrder()).not.toContain(BICH);
  });
});

describe('phiên, gỡ trang, riêng tư (NT-22)', () => {
  it('RW-117 NT-22 PUT bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, form không hiện câu lỗi, không thử lại', async () => {
    const { profile } = await renderList(SAMPLE_RELATIVES, false);
    const fields = openEdit(BICH);
    profile.relatives.failNext('PUT', () =>
      json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
    );
    fireEvent.click(fields.submit);
    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    await waitFor(() => expect(fields.submit).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(puts(profile)).toHaveLength(1);
  });

  it('RW-118 NT-22 đăng xuất giữa lúc lưu (client huỷ) ⇒ không lỗi chưa bắt, không hộp lỗi, không thông báo', async () => {
    const { profile } = await renderList(SAMPLE_RELATIVES, false);
    const fields = openEdit(BICH);
    profile.relatives.failNext('PUT', (init) => hang(init));
    fireEvent.click(fields.submit);
    await waitFor(() => expect(fields.submit).toBeDisabled());

    await act(async () => {
      await logout();
    });
    expect(getAuthState().status).toBe('unauthenticated');
    await waitFor(() => expect(fields.submit).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(UPDATED_MESSAGE)).toBeNull();
  });

  it('RW-119 NT-22 gỡ trang giữa lúc lưu: PUT vẫn thành công hoặc lỗi mạng ⇒ không onSaved, không setState, không console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    for (const outcome of ['ok', 'network'] as const) {
      const { profile, unmount } = await renderList();
      const fields = openEdit(BICH);
      const release = profile.relatives.hold('PUT');
      fireEvent.click(fields.submit);
      await waitFor(() => expect(puts(profile)).toHaveLength(1));
      unmount();
      if (outcome === 'ok')
        release(200, { ...SAMPLE_RELATIVES[0], hoTen: 'Đã đổi' });
      else release(502, {});
      await sleep(30);
      expect(screen.queryByText(UPDATED_MESSAGE)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('RW-120 NT-22 mọi luồng lỗi không gọi console.*; họ tên, SĐT, ngày sinh không lọt vào URL, thông báo, lịch sử hay kho trình duyệt', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const { profile, router } = await renderList();
    const fields = openEdit(BICH);
    fill(editFormOf(BICH), { ...VALID_INPUT, name: 'Trần Thị Riêng Tư' });
    const attempts: [() => Response, string][] = [
      [
        () => {
          throw new TypeError('Failed to fetch');
        },
        SAVE_NETWORK_MESSAGE,
      ],
      [
        () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
        SYSTEM_MESSAGE,
      ],
      [
        () =>
          json(400, {
            maLoi: 'DU_LIEU_KHONG_HOP_LE',
            thongBao: 'x',
            loi: [{ truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' }],
          }),
        FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
      ],
    ];
    for (const [failure, message] of attempts) {
      profile.relatives.failNext('PUT', failure);
      fireEvent.click(fields.submit);
      const shown = await screen.findByText((text) => text.includes(message));
      expect(shown.textContent).not.toMatch(SECRETS);
    }
    // 404 và 409 cũng chỉ dùng câu cố định
    profile.relatives.failNext('PUT', () =>
      apiError(409, 'HO_SO_NGUOI_THAN_DA_NGUNG'),
    );
    fireEvent.click(fields.submit);
    await waitFor(() => expect(statusText()).toContain(DEACTIVATED_MESSAGE));
    expect(statusText()).not.toMatch(SECRETS);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    const where = [
      window.location.href,
      document.title,
      JSON.stringify(window.history.state),
      JSON.stringify(router.state.location),
      JSON.stringify({ ...window.localStorage }),
      JSON.stringify({ ...window.sessionStorage }),
    ].join('\n');
    expect(where).not.toMatch(SECRETS);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
