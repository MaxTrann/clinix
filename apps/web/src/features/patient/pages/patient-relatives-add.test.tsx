import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { apiError } from '../../../test/fake-auth-api';
import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import { logout } from '../../auth';
import { getAuthState } from '../../auth/auth-store';
import {
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  SYSTEM_MESSAGE,
} from '../profile/profile-errors';
import {
  ADDED_MESSAGE,
  ADD_NETWORK_MESSAGE,
  ADD_TIMEOUT_MESSAGE,
  ADD_UNEXPECTED_MESSAGE,
  BIRTH_DATE_REQUIRED_MESSAGE,
  RELATIONSHIP_REQUIRED_MESSAGE,
} from '../relatives/relative-errors';
import {
  SAMPLE_RELATIVES,
  hang,
  json,
  type FakeRelative,
} from '../testing/fake-profile-api';
import { renderProfilePage } from '../testing/profile-page-harness';
import {
  ADD_FORM_NAME,
  VALID_INPUT,
  addButton,
  addForm,
  cardOf,
  fieldsOf,
  fill,
  namesInOrder,
  openAddForm,
  relativesRegion,
  valueOf,
  waitForList,
} from '../testing/relatives-harness';

// patient F6 (TRACKING F6-E, F6-H): thêm người thân, NT-21 (frame 433:2). Mã ca RW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN mục 7.2.
const THREE: FakeRelative[] = [
  ...SAMPLE_RELATIVES,
  {
    ...SAMPLE_RELATIVES[0],
    hoSoNguoiThanId: '3',
    hoTen: 'Cụ Ngừng Dùng',
    trangThaiHieuLuc: false,
  },
];
const posts = (profile: { relatives: { requests: { method: string }[] } }) =>
  profile.relatives.requests.filter((request) => request.method === 'POST');
const SECRETS = /Trần Thị Cúc|0912345678|12\/04\/1992|1992-04-12/;

async function renderList(
  relatives: FakeRelative[] = SAMPLE_RELATIVES,
  withLayout = true,
) {
  const api = await renderProfilePage({ relatives, withLayout });
  await waitForList();
  return api;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('mở form thêm (NT-21; frame 433:2)', () => {
  it('RW-70 NT-21 form hiện DƯỚI danh sách, focus ô Họ và tên, đủ năm ô đúng nhãn, thứ tự Tab = thứ tự form; ô chọn bắt đầu rỗng', async () => {
    await renderList();
    fireEvent.click(addButton());
    const form = addForm();

    const list = within(relativesRegion()).getByRole('list');
    expect(
      list.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(relativesRegion()).getByRole('heading', { name: ADD_FORM_NAME }),
    ).toBeInTheDocument();
    const fields = fieldsOf(form);
    expect(fields.name).toHaveFocus();
    expect(fields.name).toHaveAttribute('placeholder', 'Nhập họ và tên');
    expect(fields.relationship).toHaveValue('');
    expect(fields.gender).toHaveValue('');
    expect(
      Array.from(fields.relationship.options).map((option) => option.text),
    ).toEqual([
      'Chọn mối quan hệ',
      'Cha',
      'Mẹ',
      'Vợ',
      'Chồng',
      'Con',
      'Anh/Chị/Em',
      'Ông/Bà',
      'Khác',
    ]);
    expect(
      Array.from(fields.gender.options).map((option) => option.text),
    ).toEqual(['Chọn giới tính', 'Nam', 'Nữ', 'Khác']);
    // Bốn ô bắt buộc (có `*`), SĐT tuỳ chọn; nhãn phụ luôn hiện trong tên truy cập
    for (const field of [
      fields.name,
      fields.relationship,
      fields.gender,
      fields.birth,
    ]) {
      expect(field).toBeRequired();
    }
    expect(fields.phone).not.toBeRequired();
    expect(
      form.querySelector('label[for="' + fields.birth.id + '"]')?.textContent,
    ).toBe('Ngày sinh* (dd/mm/yyyy)');
    expect(
      form.querySelector('label[for="' + fields.phone.id + '"]')?.textContent,
    ).toBe('Số điện thoại (Tùy chọn)');
    expect(
      Array.from(form.querySelectorAll('input, select, button')).map((el) =>
        el.id === '' ? el.textContent : el.id,
      ),
    ).toEqual([
      fields.name.id,
      fields.relationship.id,
      fields.gender.id,
      fields.birth.id,
      fields.phone.id,
      'Hủy',
      'Thêm hồ sơ',
    ]);
    // Một form một lúc cho thao tác thêm: nút "Thêm người thân" vô hiệu khi form mở; không có nút đóng X (trùng việc của "Hủy")
    expect(addButton()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Đóng' })).toBeNull();
  });
});

describe('kiểm phía web trước khi gửi (NT-21; A1/4a)', () => {
  const cases: [
    string,
    Partial<typeof VALID_INPUT>,
    'name' | 'relationship' | 'gender' | 'birth' | 'phone',
    string,
  ][] = [
    ['thiếu họ tên', { name: '' }, 'name', NAME_REQUIRED_MESSAGE],
    ['họ tên chỉ khoảng trắng', { name: '   ' }, 'name', NAME_REQUIRED_MESSAGE],
    [
      'họ tên không có chữ cái',
      { name: '12345' },
      'name',
      FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
    ],
    [
      'chưa chọn quan hệ',
      { relationship: '' },
      'relationship',
      RELATIONSHIP_REQUIRED_MESSAGE,
    ],
    [
      'chưa chọn giới tính',
      { gender: '' },
      'gender',
      FIELD_MESSAGES.GIOI_TINH_KHONG_HOP_LE,
    ],
    ['thiếu ngày sinh', { birth: '' }, 'birth', BIRTH_DATE_REQUIRED_MESSAGE],
    [
      'ngày không có thật 31/02/2000',
      { birth: '31/02/2000' },
      'birth',
      FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
    ],
    [
      'ngày không có thật 29/02/2023',
      { birth: '29/02/2023' },
      'birth',
      FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
    ],
    [
      'sai dạng ngày',
      { birth: '1992-04-12' },
      'birth',
      FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
    ],
    [
      'ngày tương lai',
      { birth: '01/01/2999' },
      'birth',
      'Ngày sinh không được sau hôm nay.',
    ],
    [
      'trước 1900',
      { birth: '31/12/1899' },
      'birth',
      'Ngày sinh không được trước 01/01/1900.',
    ],
    ['SĐT sai', { phone: '123' }, 'phone', FIELD_MESSAGES.SDT_KHONG_HOP_LE],
  ];

  it.each(cases)(
    'RW-71 NT-21 %s ⇒ câu dưới đúng ô, KHÔNG có POST, dữ liệu giữ, focus đúng ô',
    async (_label, patch, key, message) => {
      const { profile } = await renderList();
      const fields = openAddForm({ ...VALID_INPUT, ...patch });
      fireEvent.click(fields.submit);

      const shown = within(addForm()).getByText(message);
      expect(shown).toBeInTheDocument();
      expect(fields[key]).toHaveAttribute('aria-invalid', 'true');
      expect(fields[key].getAttribute('aria-describedby')).toBe(shown.id);
      expect(fields[key]).toHaveFocus();
      expect(posts(profile)).toHaveLength(0);
      expect(fields.name).toHaveValue(patch.name ?? VALID_INPUT.name);
      expect(fields.birth).toHaveValue(patch.birth ?? VALID_INPUT.birth);
      expect(within(addForm()).queryByRole('alert')).toBeNull();
    },
  );

  it('RW-72 NT-21 cả năm ô sai ⇒ năm câu, focus ô Họ và tên (đầu theo form), dữ liệu đã gõ giữ; gõ lại thì lỗi biến mất', async () => {
    const { profile } = await renderList();
    const fields = openAddForm({ name: '', birth: 'x', phone: '1' });
    fireEvent.click(fields.submit);

    const form = addForm();
    expect(form.querySelectorAll('[aria-invalid="true"]')).toHaveLength(5);
    expect(fields.name).toHaveFocus();
    expect(fields.birth).toHaveValue('x');
    expect(fields.phone).toHaveValue('1');
    expect(posts(profile)).toHaveLength(0);

    fill(form, { name: 'Trần Thị Cúc' });
    expect(form.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
  });

  it('RW-73 NT-21 SĐT để trống là hợp lệ (tuỳ chọn) ⇒ POST được', async () => {
    const { profile } = await renderList();
    const fields = openAddForm({ ...VALID_INPUT, phone: '' });
    fireEvent.click(fields.submit);
    await screen.findByText(ADDED_MESSAGE);
    expect(posts(profile)).toHaveLength(1);
  });
});

describe('gửi và thành công (NT-21; HSNT b3-b5, A1/4b-4c)', () => {
  it('RW-74 NT-21 thân POST đúng NĂM khoá, giá trị chuẩn hoá: họ tên và SĐT cắt khoảng trắng, ngày dd/mm/yyyy ⇒ YYYY-MM-DD, mã quan hệ và giới tính; có Authorization', async () => {
    const { profile } = await renderList();
    const fields = openAddForm({
      ...VALID_INPUT,
      name: '  Trần Thị Cúc  ',
      phone: ' 0912 345 678 ',
    });
    fireEvent.click(fields.submit);
    await screen.findByText(ADDED_MESSAGE);

    const [post] = posts(
      profile,
    ) as (typeof profile.relatives.requests)[number][];
    expect(post.path).toBe('/api/patient/relatives');
    expect(post.headers.get('Authorization')).toMatch(/^Bearer tok-/);
    expect(post.body).toEqual({
      hoTen: 'Trần Thị Cúc',
      moiQuanHe: 'Vo',
      gioiTinh: 'Nu',
      ngaySinh: '1992-04-12',
      soDienThoai: '0912 345 678',
    });
    expect(Object.keys(post.body)).toHaveLength(5);
  });

  it('RW-75 NT-21 SĐT trống ⇒ gửi soDienThoai null; ô chọn Anh/Chị/Em ⇒ mã AnhChiEm', async () => {
    const { profile } = await renderList();
    const fields = openAddForm({
      ...VALID_INPUT,
      relationship: 'AnhChiEm',
      phone: '   ',
    });
    fireEvent.click(fields.submit);
    await screen.findByText(ADDED_MESSAGE);
    expect(posts(profile)[0]).toMatchObject({
      body: { moiQuanHe: 'AnhChiEm', soDienThoai: null },
    });
  });

  it('RW-76 NT-21 thành công ⇒ hồ sơ mới đúng thứ tự (sau hồ sơ đang dùng, trước hồ sơ đã ngừng), đếm cập nhật, form đóng, thông báo role=status, focus nút Thêm, SĐT là bản của phản hồi; không GET lại', async () => {
    const { profile } = await renderList(THREE);
    const fields = openAddForm({ ...VALID_INPUT, phone: '0912 345 678' });
    fireEvent.click(fields.submit);

    await screen.findByText(ADDED_MESSAGE);
    expect(namesInOrder()).toEqual([
      'Nguyễn Thị Bích',
      'Nguyễn Minh Tuấn',
      'Trần Thị Cúc',
      'Cụ Ngừng Dùng',
    ]);
    expect(screen.getByText(/hồ sơ người thân ·/)).toHaveTextContent(
      '4 hồ sơ người thân · 3 đang sử dụng',
    );
    expect(valueOf(cardOf('Trần Thị Cúc'), 'Số điện thoại')).toBe('0912345678');
    expect(valueOf(cardOf('Trần Thị Cúc'), 'Quan hệ')).toBe('Vợ');
    expect(screen.queryByRole('form', { name: ADD_FORM_NAME })).toBeNull();
    expect(
      within(relativesRegion())
        .getAllByRole('status')
        .some((el) => el.textContent === ADDED_MESSAGE),
    ).toBe(true);
    await waitFor(() => expect(addButton()).toHaveFocus());
    expect(addButton()).toBeEnabled();
    expect(profile.relatives.count('GET')).toBe(1);
    expect(profile.relatives.items.at(-1)?.hoSoNguoiThanId).toBe('4');
  });

  it('RW-77 NT-21 thêm vào danh sách rỗng ⇒ hết câu "Chưa có hồ sơ", có một thẻ, "1 hồ sơ người thân · 1 đang sử dụng"; mở form lần hai thì form trống', async () => {
    await renderList([]);
    fireEvent.click(addButton());
    fill(addForm(), VALID_INPUT);
    fireEvent.click(fieldsOf(addForm()).submit);
    await screen.findByText(ADDED_MESSAGE);

    expect(screen.queryByText(/Chưa có hồ sơ người thân\./)).toBeNull();
    expect(namesInOrder()).toEqual(['Trần Thị Cúc']);
    expect(screen.getByText(/hồ sơ người thân ·/)).toHaveTextContent(
      '1 hồ sơ người thân · 1 đang sử dụng',
    );
    fireEvent.click(addButton());
    expect(fieldsOf(addForm()).name).toHaveValue('');
    expect(screen.queryByText(ADDED_MESSAGE)).toBeNull();
  });

  it('RW-78 NT-21 đang gửi: "Đang thêm…" vô hiệu, aria-busy, Hủy vô hiệu; hai lần gửi liên tiếp (cả cùng một đợt) chỉ ra MỘT POST', async () => {
    const { profile } = await renderList();
    const release = profile.relatives.hold('POST');
    const fields = openAddForm();

    const events = [
      new Event('submit', { bubbles: true, cancelable: true }),
      new Event('submit', { bubbles: true, cancelable: true }),
    ];
    act(() => {
      for (const event of events) addForm().dispatchEvent(event);
    });
    expect(events.map((event) => event.defaultPrevented)).toEqual([true, true]);
    expect(posts(profile)).toHaveLength(1);
    await waitFor(() => expect(fields.submit).toBeDisabled());
    expect(fields.submit).toHaveTextContent('Đang thêm…');
    expect(addForm()).toHaveAttribute('aria-busy', 'true');
    expect(fields.cancel).toBeDisabled();

    fireEvent.click(fields.submit);
    fireEvent.submit(addForm());
    expect(posts(profile)).toHaveLength(1);

    release(201, {
      ...SAMPLE_RELATIVES[0],
      hoSoNguoiThanId: '5',
      hoTen: 'Trần Thị Cúc',
    });
    await screen.findByText(ADDED_MESSAGE);
    expect(posts(profile)).toHaveLength(1);
  });
});

describe('thất bại (NT-21; A1/4b)', () => {
  const badRequest = (loi: { truong: string; ma: string }[]) => () =>
    json(400, { maLoi: 'DU_LIEU_KHONG_HOP_LE', thongBao: 'x', loi });

  it('RW-79 NT-21 400 loi[] đảo thứ tự ⇒ câu dưới từng ô, focus ô lỗi ĐẦU THEO FORM (ngày sinh, không phải SĐT), dữ liệu giữ; sửa rồi gửi lại được', async () => {
    const { profile } = await renderList();
    const fields = openAddForm();
    profile.relatives.failNext(
      'POST',
      badRequest([
        { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
        { truong: 'ngaySinh', ma: 'NGAY_SINH_KHONG_HOP_LE' },
        { truong: 'moiQuanHe', ma: 'MOI_QUAN_HE_KHONG_HOP_LE' },
      ]),
    );
    fireEvent.click(fields.submit);

    await within(addForm()).findByText(RELATIONSHIP_REQUIRED_MESSAGE);
    expect(
      within(addForm()).getByText(FIELD_MESSAGES.SDT_KHONG_HOP_LE),
    ).toBeInTheDocument();
    expect(
      within(addForm()).getByText(FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE),
    ).toBeInTheDocument();
    expect(fields.relationship).toHaveFocus();
    expect(fields.name).toHaveValue(VALID_INPUT.name);
    expect(fields.phone).toHaveValue(VALID_INPUT.phone);
    expect(within(addForm()).queryByRole('alert')).toBeNull();

    fireEvent.click(fields.submit);
    await screen.findByText(ADDED_MESSAGE);
    expect(posts(profile)).toHaveLength(2);
  });

  it.each([
    ['trường ngoài form', [{ truong: 'email', ma: 'TRUONG_KHONG_DUOC_PHEP' }]],
    ['mã lạ', [{ truong: 'hoTen', ma: 'MA_LA' }]],
    ['mã trùng thuộc tính Object', [{ truong: 'hoTen', ma: 'constructor' }]],
    ['không có loi[]', []],
  ])(
    'RW-80 NT-21 400 với loi[] %s ⇒ hộp cảnh báo chung "Dữ liệu không hợp lệ.", focus hộp, dữ liệu giữ',
    async (_label, loi) => {
      const { profile } = await renderList();
      const fields = openAddForm();
      profile.relatives.failNext('POST', badRequest(loi));
      fireEvent.click(fields.submit);

      const alert = await within(addForm()).findByRole('alert');
      expect(alert).toHaveTextContent(INVALID_DATA_MESSAGE);
      expect(alert).toHaveFocus();
      expect(fields.name).toHaveValue(VALID_INPUT.name);
      expect(addForm().querySelectorAll('[aria-invalid="true"]')).toHaveLength(
        0,
      );
    },
  );

  const failures: [string, () => Response, string, boolean][] = [
    [
      'mất mạng',
      () => {
        throw new TypeError('Failed to fetch');
      },
      ADD_NETWORK_MESSAGE,
      true,
    ],
    [
      '502 HTML',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      ADD_UNEXPECTED_MESSAGE,
      true,
    ],
    [
      '500 LOI_HE_THONG',
      () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      SYSTEM_MESSAGE,
      false,
    ],
    [
      '403 mã khác',
      () => apiError(403, 'KHONG_DU_QUYEN'),
      GENERIC_ERROR_MESSAGE,
      false,
    ],
  ];

  it.each(failures)(
    'RW-81 NT-21 %s ⇒ câu đúng, dữ liệu giữ, KHÔNG tự gửi lại, nút "Tải lại danh sách" chỉ khi không rõ kết quả; bấm Thêm lại được',
    async (_label, failure, message, uncertain) => {
      const { profile } = await renderList();
      const fields = openAddForm();
      profile.relatives.failNext('POST', failure);
      fireEvent.click(fields.submit);

      const alert = await within(addForm()).findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(
        within(alert).queryByRole('button', { name: 'Tải lại danh sách' }) !==
          null,
      ).toBe(uncertain);
      expect(fields.name).toHaveValue(VALID_INPUT.name);
      expect(fields.submit).toBeEnabled();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(posts(profile)).toHaveLength(1);

      fireEvent.click(fields.submit);
      await screen.findByText(ADDED_MESSAGE);
      expect(posts(profile)).toHaveLength(2);
    },
  );

  it('RW-82 NT-21 quá giờ 15 giây ⇒ câu quá giờ (nói chưa rõ đã thêm), dữ liệu giữ, không tự gửi lại sau 60 giây', async () => {
    const { profile } = await renderList();
    const fields = openAddForm();
    vi.useFakeTimers();
    profile.relatives.failNext('POST', (init) => hang(init));
    fireEvent.click(fields.submit);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(within(addForm()).getByRole('alert')).toHaveTextContent(
      ADD_TIMEOUT_MESSAGE,
    );
    expect(fields.name).toHaveValue(VALID_INPUT.name);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(posts(profile)).toHaveLength(1);
    expect(fields.submit).toBeEnabled();
  });

  it('RW-83 NT-21 POST ghi xong rồi mất kết nối ⇒ "Tải lại danh sách" gọi GET và thấy hồ sơ đã được ghi; form và dữ liệu vẫn còn, không thêm POST', async () => {
    const { profile } = await renderList();
    const fields = openAddForm();
    profile.relatives.failNext('POST', () => {
      // Máy chủ đã ghi trước khi kết nối đứt
      profile.relatives.items.push({
        ...SAMPLE_RELATIVES[0],
        hoSoNguoiThanId: '3',
        hoTen: 'Trần Thị Cúc',
      });
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(fields.submit);
    const alert = await within(addForm()).findByRole('alert');
    expect(namesInOrder()).not.toContain('Trần Thị Cúc');

    fireEvent.click(
      within(alert).getByRole('button', { name: 'Tải lại danh sách' }),
    );
    await waitFor(() => expect(namesInOrder()).toContain('Trần Thị Cúc'));
    expect(profile.relatives.count('GET')).toBe(2);
    expect(screen.getByText(/hồ sơ người thân ·/)).toHaveTextContent(
      '3 hồ sơ người thân · 3 đang sử dụng',
    );
    expect(posts(profile)).toHaveLength(1);
    expect(addForm()).toBeInTheDocument();
    expect(fields.name).toHaveValue(VALID_INPUT.name);
  });

  it('RW-84 NT-21 tải lại nền thất bại ⇒ danh sách cũ giữ, form giữ, ErrorState + "Thử lại" gọi lại', async () => {
    const { profile } = await renderList();
    const fields = openAddForm();
    profile.relatives.failNext('POST', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(fields.submit);
    const alert = await within(addForm()).findByRole('alert');

    profile.relatives.failNext('GET', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(
      within(alert).getByRole('button', { name: 'Tải lại danh sách' }),
    );
    const refreshAlert = await waitFor(() => {
      const found = within(relativesRegion())
        .getAllByRole('alert')
        .find((el) => !addForm().contains(el));
      if (!found) throw new Error('chưa có');
      return found;
    });
    expect(namesInOrder()).toEqual(['Nguyễn Thị Bích', 'Nguyễn Minh Tuấn']);
    expect(fields.name).toHaveValue(VALID_INPUT.name);

    fireEvent.click(
      within(refreshAlert).getByRole('button', { name: 'Thử lại' }),
    );
    await waitFor(() => expect(profile.relatives.count('GET')).toBe(3));
    await waitFor(() =>
      expect(
        within(relativesRegion())
          .queryAllByRole('alert')
          .filter((el) => !addForm().contains(el)),
      ).toHaveLength(0),
    );
    expect(fields.name).toHaveValue(VALID_INPUT.name);
  });
});

describe('hủy, phiên và vòng đời (NT-21)', () => {
  it('RW-85 NT-21 "Hủy" ⇒ form biến mất, không POST, focus về nút "Thêm người thân" (bật lại); không hộp xác nhận', async () => {
    const { profile } = await renderList();
    const fields = openAddForm();
    fireEvent.click(fields.cancel);

    expect(screen.queryByRole('form', { name: ADD_FORM_NAME })).toBeNull();
    expect(posts(profile)).toHaveLength(0);
    await waitFor(() => expect(addButton()).toHaveFocus());
    expect(addButton()).toBeEnabled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('RW-86 NT-21 POST bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, form không hiện câu lỗi, không thử lại', async () => {
    const { profile } = await renderList(SAMPLE_RELATIVES, false);
    const fields = openAddForm();
    profile.relatives.failNext('POST', () =>
      json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
    );
    fireEvent.click(fields.submit);
    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(posts(profile)).toHaveLength(1);
  });

  it('RW-87 NT-21 đăng xuất giữa lúc thêm (client huỷ) ⇒ không lỗi chưa bắt, không hộp lỗi', async () => {
    const { profile } = await renderList(SAMPLE_RELATIVES, false);
    const fields = openAddForm();
    profile.relatives.failNext('POST', (init) => hang(init));
    fireEvent.click(fields.submit);
    await waitFor(() => expect(fields.submit).toBeDisabled());

    await act(async () => {
      await logout();
    });
    expect(getAuthState().status).toBe('unauthenticated');
    await waitFor(() => expect(fields.submit).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(ADDED_MESSAGE)).toBeNull();
  });

  it('RW-88 NT-21 gỡ trang giữa lúc thêm: POST vẫn thành công ⇒ không onSaved, không setState, không console.error; lỗi mạng sau khi gỡ cũng im lặng', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const { profile, unmount } = await renderList();
    const fields = openAddForm();
    const release = profile.relatives.hold('POST');
    fireEvent.click(fields.submit);
    await waitFor(() => expect(posts(profile)).toHaveLength(1));
    // Gỡ cả trang giữa lúc lưu
    unmount();
    release(201, {
      ...SAMPLE_RELATIVES[0],
      hoSoNguoiThanId: '9',
      hoTen: 'Trần Thị Cúc',
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(ADDED_MESSAGE)).toBeNull();
  });

  it('RW-89 NT-21 mọi luồng lỗi không gọi console.*; họ tên, SĐT, ngày sinh không lọt vào URL, thông báo, lịch sử hay kho trình duyệt', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const { profile, router } = await renderList();
    const fields = openAddForm();
    const attempts: [() => Response, string][] = [
      [
        () => {
          throw new TypeError('Failed to fetch');
        },
        ADD_NETWORK_MESSAGE,
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
      profile.relatives.failNext('POST', failure);
      fireEvent.click(fields.submit);
      const shown = await screen.findByText((text) => text.includes(message));
      expect(shown.textContent).not.toMatch(SECRETS);
    }
    fireEvent.click(fields.submit);
    await screen.findByText(ADDED_MESSAGE);
    expect(screen.getByText(ADDED_MESSAGE).textContent).not.toMatch(SECRETS);

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
