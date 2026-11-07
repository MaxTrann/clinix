import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { apiError } from '../../../test/fake-auth-api';
import {
  DEACTIVATE_DONE_MESSAGE,
  DEACTIVATE_NETWORK_MESSAGE,
  MISSING_MESSAGE,
} from '../relatives/relative-errors';
import {
  SAMPLE_RELATIVES,
  json,
  type FakeAppointment,
  type FakeRelative,
} from '../testing/fake-profile-api';
import { renderProfilePage } from '../testing/profile-page-harness';
import {
  VALID_INPUT,
  addButton,
  cardOf,
  editButtonOf,
  editFormOf,
  fieldsOf,
  fill,
  labelsOf,
  namesInOrder,
  openAddForm,
  relativesRegion,
  valueOf,
  waitForList,
} from '../testing/relatives-harness';

// patient F7 (TRACKING F7-C…F7-H): luồng "Ngừng sử dụng" qua trang "Hồ sơ người khám", NT-23 (HSNT A2/*a–*c; Q10, Q11) và khoảng trống (a)
// của F6 (form của thẻ khác giữ chữ khi danh sách sắp lại). Mã ca DW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN 7.2.
const BICH = 'Nguyễn Thị Bích';
const TUAN = 'Nguyễn Minh Tuấn';
const BA = 'Lê Văn Ba';
const DUNG = 'Phạm Thị Dung';
const FOUR: FakeRelative[] = [
  ...SAMPLE_RELATIVES,
  {
    ...SAMPLE_RELATIVES[0],
    hoSoNguoiThanId: '3',
    hoTen: BA,
    moiQuanHe: 'Cha',
    gioiTinh: 'Nam',
  },
  {
    ...SAMPLE_RELATIVES[0],
    hoSoNguoiThanId: '4',
    hoTen: DUNG,
    moiQuanHe: 'Khac',
    trangThaiHieuLuc: false,
  },
];
const LICH_1: FakeAppointment = {
  maLichHen: 'LH-0001',
  thoiGian: '2026-11-02T17:30:00.000Z',
  trangThai: 'DaXacNhan',
  bacSi: 'Bác sĩ Mẫu Một',
  chiNhanh: 'Chi nhánh Mẫu',
};
const LICH_2: FakeAppointment = {
  ...LICH_1,
  maLichHen: 'LH-0002',
  thoiGian: '2026-11-05T08:30:00.000Z',
  trangThai: 'ChoThanhToan',
};
const SECRETS = /Nguyễn Thị Bích|Bác sĩ Mẫu|LH-000/;
const sleep = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

type Api = Awaited<ReturnType<typeof renderProfilePage>>['profile'];
const posts = (profile: Api) =>
  profile.relatives.requests.filter((r) => r.method === 'DEACTIVATE');
const puts = (profile: Api) =>
  profile.relatives.requests.filter((r) => r.method === 'PUT');
const heading = () =>
  within(relativesRegion()).getByRole('heading', { name: 'Người thân' });
const noticeOf = () =>
  within(relativesRegion()).getByRole('status').querySelector('[data-tone]');
const inertChildren = () =>
  Array.from(document.body.children).filter((el) => el.hasAttribute('inert'));
const counts = () =>
  within(relativesRegion()).getByText(/hồ sơ người thân ·/).textContent;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function renderList(relatives: FakeRelative[] = FOUR) {
  const api = await renderProfilePage({ relatives });
  await waitForList();
  return api;
}
function openEdit(name: string) {
  fireEvent.click(editButtonOf(name));
  return fieldsOf(editFormOf(name));
}
const deactivateButtonOf = (name: string) =>
  within(editFormOf(name)).getByRole<HTMLButtonElement>('button', {
    name: `Ngừng sử dụng hồ sơ ${name}`,
  });
const openDialogOf = (name: string) => {
  fireEvent.click(deactivateButtonOf(name));
  return screen.getByRole('alertdialog', {
    name: `Ngừng sử dụng hồ sơ ${name}?`,
  });
};
const confirmIn = (dialog: HTMLElement) =>
  within(dialog).getByRole<HTMLButtonElement>('button', {
    name: /Ngừng sử dụng|Đang ngừng/,
  });
const cancelIn = (dialog: HTMLElement) =>
  within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Hủy' });

describe('nút "Ngừng sử dụng" (NT-23; Q10)', () => {
  it('DW-66 NT-23 chỉ có trong form SỬA của hồ sơ ĐANG dùng: không ở thẻ xem, hồ sơ đã ngừng, form thêm', async () => {
    await renderList();
    const named = () =>
      screen.queryAllByRole('button', { name: /Ngừng sử dụng/ });

    // Thẻ xem (đang dùng và đã ngừng): không có nút nào
    expect(named()).toHaveLength(0);
    expect(within(cardOf(DUNG)).queryByRole('button')).toBeNull();

    openEdit(BICH);
    expect(named().map((b) => b.getAttribute('aria-label'))).toEqual([
      `Ngừng sử dụng hồ sơ ${BICH}`,
    ]);
    expect(within(editFormOf(BICH)).getAllByRole('button')).toContain(
      deactivateButtonOf(BICH),
    );
    // Thẻ khác vẫn ở chế độ xem: không có
    expect(
      within(cardOf(TUAN)).queryByRole('button', { name: /Ngừng sử dụng/ }),
    ).toBeNull();

    // Form thêm: không có
    fireEvent.click(addButton());
    const add = screen.getByRole('form', { name: 'Thêm người thân mới' });
    expect(
      within(add).queryByRole('button', { name: /Ngừng sử dụng/ }),
    ).toBeNull();
    expect(
      within(add)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Hủy', 'Thêm hồ sơ']);

    // Nhiều form mở cùng lúc: mỗi form một nút, tên truy cập có họ tên của chính nó
    openEdit(TUAN);
    expect(named().map((b) => b.getAttribute('aria-label'))).toEqual([
      `Ngừng sử dụng hồ sơ ${BICH}`,
      `Ngừng sử dụng hồ sơ ${TUAN}`,
    ]);
  });

  it('DW-67 NT-23 nút đứng ĐẦU hàng nút cuối (thứ tự Tab: … Số điện thoại, Ngừng sử dụng, Hủy, Lưu thay đổi), type=button; Lưu vẫn là nút gửi', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    const buttons = within(editFormOf(BICH)).getAllByRole('button');

    expect(
      buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent),
    ).toEqual([`Ngừng sử dụng hồ sơ ${BICH}`, 'Hủy', 'Lưu thay đổi']);
    expect(buttons[0]).toHaveAttribute('type', 'button');
    expect(buttons[0]).toHaveTextContent('Ngừng sử dụng');
    expect(fields.submit).toHaveAttribute('type', 'submit');
    // Gửi form (Enter ở một ô nhập) là LƯU, không mở hộp thoại
    fireEvent.submit(editFormOf(BICH));
    await waitFor(() => expect(puts(profile)).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('mở và đóng hộp xác nhận (NT-23)', () => {
  it('DW-68 NT-23 bấm nút ⇒ hộp xác nhận có tên người, focus ở "Hủy", nền inert; form sửa phía sau và chữ đang gõ còn nguyên; chưa gọi API', async () => {
    const { profile, container } = await renderList();
    openEdit(BICH);
    fill(editFormOf(BICH), { name: 'Tên đã gõ dở', phone: '0911111111' });
    const dialog = openDialogOf(BICH);

    expect(cancelIn(dialog)).toHaveFocus();
    expect(container).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    expect(fieldsOf(editFormOf(BICH)).name).toHaveValue('Tên đã gõ dở');
    expect(posts(profile)).toHaveLength(0);
  });

  const closers: [string, (dialog: HTMLElement) => void][] = [
    ['nút "Hủy"', (dialog) => fireEvent.click(cancelIn(dialog))],
    ['phím Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
    [
      'bấm nền mờ',
      (dialog) => fireEvent.click(dialog.parentElement as HTMLElement),
    ],
  ];
  it.each(closers)(
    'DW-69 NT-23 đóng bằng %s ⇒ KHÔNG gọi API, hồ sơ vẫn đang dùng, focus về chính nút "Ngừng sử dụng" của thẻ đó, nền hết inert, cuộn lại được, chữ đang gõ còn',
    async (_label, close) => {
      const { profile, container } = await renderList();
      const fields = openEdit(BICH);
      fill(editFormOf(BICH), { name: 'Tên đã gõ dở' });
      const dialog = openDialogOf(BICH);
      close(dialog);

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(deactivateButtonOf(BICH)).toHaveFocus();
      expect(container).not.toHaveAttribute('inert');
      expect(inertChildren()).toHaveLength(0);
      expect(document.body.style.overflow).not.toBe('hidden');
      expect(fields.name).toHaveValue('Tên đã gõ dở');
      expect(namesInOrder()).toEqual([BICH, TUAN, BA, DUNG]);
      await sleep();
      expect(posts(profile)).toHaveLength(0);
    },
  );
});

describe('200: thẻ chuyển sang "Ngừng sử dụng" (NT-23; Q10)', () => {
  it('DW-70 NT-23 xác nhận ⇒ đúng MỘT POST đúng đường dẫn, không thân, có Authorization; thẻ xuống nhóm đã ngừng, mất nút sửa và form, dòng đếm giảm, thông báo thành công cố định, không GET thêm', async () => {
    const { profile, container } = await renderList();
    openEdit(BICH);
    expect(counts()).toBe('4 hồ sơ người thân · 3 đang sử dụng');
    const dialog = openDialogOf(BICH);
    fireEvent.click(confirmIn(dialog));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(posts(profile)).toHaveLength(1);
    const [request] = posts(profile);
    expect(request.httpMethod).toBe('POST');
    expect(request.path).toBe('/api/patient/relatives/1/deactivate');
    expect(request.rawBody).toBeUndefined();
    expect(request.headers.get('Authorization')).toMatch(/^Bearer .+/);
    expect(profile.relatives.items[0].trangThaiHieuLuc).toBe(false);

    // Thẻ xuống nhóm đã ngừng (đang dùng trước, id tăng dần trong nhóm)
    expect(namesInOrder()).toEqual([TUAN, BA, BICH, DUNG]);
    expect(valueOf(cardOf(BICH), 'Trạng thái hồ sơ')).toBe('Ngừng sử dụng');
    expect(labelsOf(cardOf(BICH))).toHaveLength(6);
    expect(
      screen.queryByRole('button', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    expect(
      screen.queryByRole('form', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    expect(within(cardOf(BICH)).queryByRole('button')).toBeNull();
    expect(counts()).toBe('4 hồ sơ người thân · 2 đang sử dụng');
    // Thông báo cố định, tông thành công, không có họ tên
    expect(noticeOf()).toHaveTextContent(DEACTIVATE_DONE_MESSAGE);
    expect(noticeOf()).toHaveAttribute('data-tone', 'success');
    expect(noticeOf()?.textContent).not.toMatch(SECRETS);
    // Không tải lại danh sách; nền và cuộn hết khoá
    expect(profile.relatives.count('GET')).toBe(1);
    expect(container).not.toHaveAttribute('inert');
    expect(inertChildren()).toHaveLength(0);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('DW-71 NT-23 sau 200 focus về tiêu đề "Người thân" của khối (nút của thẻ đã biến mất), kể cả khi form thêm đang mở (nút "Thêm người thân" đang vô hiệu)', async () => {
    await renderList();
    fireEvent.click(addButton());
    expect(addButton()).toBeDisabled();
    openEdit(BICH);
    fireEvent.click(confirmIn(openDialogOf(BICH)));

    await waitFor(() => expect(heading()).toHaveFocus());
    expect(heading()).toHaveAttribute('tabindex', '-1');
  });

  it('DW-72 NT-23 hồ sơ ĐÃ ngừng ở máy chủ nhưng web còn bản cũ (hai tab) ⇒ 200 như thường, giao diện y hệt (idempotent)', async () => {
    const { profile } = await renderList();
    openEdit(BICH);
    profile.relatives.items[0].trangThaiHieuLuc = false;
    fireEvent.click(confirmIn(openDialogOf(BICH)));

    await waitFor(() =>
      expect(valueOf(cardOf(BICH), 'Trạng thái hồ sơ')).toBe('Ngừng sử dụng'),
    );
    expect(posts(profile)).toHaveLength(1);
    expect(noticeOf()).toHaveTextContent(DEACTIVATE_DONE_MESSAGE);
  });

  it('DW-73 NT-23 id lớn hơn 2^53 đi nguyên vẹn trong đường dẫn; hai hồ sơ id sát nhau không bị nhầm', async () => {
    const big: FakeRelative[] = [
      {
        ...SAMPLE_RELATIVES[0],
        hoSoNguoiThanId: '9007199254740992',
        hoTen: BICH,
      },
      {
        ...SAMPLE_RELATIVES[0],
        hoSoNguoiThanId: '9007199254740993',
        hoTen: TUAN,
      },
    ];
    const { profile } = await renderList(big);
    openEdit(TUAN);
    fireEvent.click(confirmIn(openDialogOf(TUAN)));

    await waitFor(() => expect(posts(profile)).toHaveLength(1));
    expect(posts(profile)[0].path).toBe(
      '/api/patient/relatives/9007199254740993/deactivate',
    );
    await waitFor(() =>
      expect(valueOf(cardOf(TUAN), 'Trạng thái hồ sơ')).toBe('Ngừng sử dụng'),
    );
    expect(valueOf(cardOf(BICH), 'Trạng thái hồ sơ')).toBe('Đang sử dụng');
    expect(profile.relatives.items.map((i) => i.trangThaiHieuLuc)).toEqual([
      true,
      false,
    ]);
  });

  it('DW-74 NT-23 bấm đúp "Ngừng sử dụng" trong hộp thoại ⇒ đúng một POST', async () => {
    const { profile } = await renderList();
    openEdit(BICH);
    const dialog = openDialogOf(BICH);
    const release = profile.relatives.hold('DEACTIVATE');
    const confirm = confirmIn(dialog);
    // Hai lần bấm trong MỘT act: chỉ cờ ref chặn được lần hai (xem DW-43)
    act(() => {
      confirm.click();
      confirm.click();
    });
    await waitFor(() => expect(posts(profile)).toHaveLength(1));
    release(200, { trangThaiHieuLuc: false });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(posts(profile)).toHaveLength(1);
  });

  it('DW-75 NT-23 khoảng trống (a) của F6: form của thẻ KHÁC giữ nguyên chữ đang gõ khi danh sách sắp lại (khoá theo hồ sơ, không theo vị trí)', async () => {
    await renderList([FOUR[0], FOUR[1], FOUR[2]]);
    // Mở form ở thẻ đầu (sẽ bị ngừng) và thẻ cuối; gõ vào thẻ cuối
    openEdit(BICH);
    const ba = openEdit(BA);
    fill(editFormOf(BA), { name: 'Chữ đang gõ dở', phone: '0922222222' });
    fireEvent.click(confirmIn(openDialogOf(BICH)));

    await waitFor(() =>
      expect(valueOf(cardOf(BICH), 'Trạng thái hồ sơ')).toBe('Ngừng sử dụng'),
    );
    // Thẻ Bích xuống cuối; thẻ Ba lên trước nó và vẫn là form của Ba, chữ còn nguyên
    expect(namesInOrder()).toEqual([TUAN, BA, BICH]);
    expect(editFormOf(BA)).toBeInTheDocument();
    expect(ba.name).toBeInTheDocument();
    expect(fieldsOf(editFormOf(BA)).name).toHaveValue('Chữ đang gõ dở');
    expect(fieldsOf(editFormOf(BA)).phone).toHaveValue('0922222222');
    expect(
      screen.queryByRole('form', { name: `Chỉnh sửa hồ sơ ${BICH}` }),
    ).toBeNull();
    // Tên truy cập của nút ngừng của thẻ Ba vẫn là của Ba
    expect(deactivateButtonOf(BA)).toBeInTheDocument();
  });
});

describe('409: hồ sơ vẫn đang dùng, hiện lý do và lịch hẹn (NT-23; Q11)', () => {
  it('DW-76 NT-23 409 ⇒ hộp thoại đổi sang lý do + danh sách; thẻ vẫn đang dùng, vẫn đúng chỗ, không thông báo thành công, form và chữ đang gõ còn; đóng hộp thoại thì focus về nút ngừng', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    fill(editFormOf(BICH), { name: 'Tên đã gõ dở' });
    profile.relatives.blocking['1'] = [LICH_1, LICH_2];
    const dialog = openDialogOf(BICH);
    fireEvent.click(confirmIn(dialog));

    const list = await within(dialog).findByRole('list', {
      name: 'Lịch hẹn đang chặn',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(dialog).toHaveTextContent(
      'Không thể ngừng sử dụng hồ sơ này vì đang có lịch hẹn chưa hoàn tất.',
    );
    expect(namesInOrder()).toEqual([BICH, TUAN, BA, DUNG]);
    expect(counts()).toBe('4 hồ sơ người thân · 3 đang sử dụng');
    expect(noticeOf()).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deactivateButtonOf(BICH)).toHaveFocus();
    expect(fields.name).toHaveValue('Tên đã gõ dở');
    expect(editFormOf(BICH)).toBeInTheDocument();
    expect(profile.relatives.items[0].trangThaiHieuLuc).toBe(true);
    expect(profile.relatives.count('GET')).toBe(1);
    expect(inertChildren()).toHaveLength(0);
  });

  it('DW-77 NT-23 sau khi máy chủ hết lịch chặn (đã hủy), bấm lại ⇒ 200 và thẻ chuyển sang đã ngừng', async () => {
    const { profile } = await renderList();
    openEdit(BICH);
    profile.relatives.blocking['1'] = [LICH_1];
    const first = openDialogOf(BICH);
    fireEvent.click(confirmIn(first));
    await within(first).findByRole('list', { name: 'Lịch hẹn đang chặn' });
    fireEvent.click(within(first).getByRole('button', { name: 'Đóng' }));

    profile.relatives.blocking['1'] = [];
    fireEvent.click(confirmIn(openDialogOf(BICH)));
    await waitFor(() =>
      expect(valueOf(cardOf(BICH), 'Trạng thái hồ sơ')).toBe('Ngừng sử dụng'),
    );
    expect(posts(profile)).toHaveLength(2);
    expect(noticeOf()).toHaveTextContent(DEACTIVATE_DONE_MESSAGE);
  });

  it.each([
    'Asia/Ho_Chi_Minh',
    'UTC',
    'America/New_York',
    'Pacific/Kiritimati',
  ])(
    'DW-78 NT-23 giờ lịch hẹn theo giờ Việt Nam dưới TZ=%s, đủ ba nhãn trạng thái và mã lạ',
    async (zone) => {
      vi.stubEnv('TZ', zone);
      const { profile } = await renderList();
      openEdit(BICH);
      profile.relatives.blocking['1'] = [
        LICH_1,
        LICH_2,
        { ...LICH_1, maLichHen: 'LH-0003', trangThai: 'DaTiepDon' },
        { ...LICH_1, maLichHen: 'LH-0004', trangThai: 'MaLa' },
      ];
      const dialog = openDialogOf(BICH);
      fireEvent.click(confirmIn(dialog));
      const list = await within(dialog).findByRole('list', {
        name: 'Lịch hẹn đang chặn',
      });

      const dates = within(list)
        .getAllByText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)
        .map((el) => el.textContent);
      expect(dates).toEqual([
        '03/11/2026 00:30',
        '05/11/2026 15:30',
        '03/11/2026 00:30',
        '03/11/2026 00:30',
      ]);
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.querySelectorAll('dd')[2].textContent),
      ).toEqual([
        'Đã xác nhận',
        'Chờ thanh toán',
        'Đã tiếp đón',
        'Chưa hoàn tất',
      ]);
    },
  );
});

describe('404, mất mạng (NT-23)', () => {
  it('DW-79 NT-23 404 ⇒ đóng hộp thoại, thông báo LỖI "không còn tồn tại", tải lại danh sách (thẻ biến mất), nền hết inert', async () => {
    const { profile, container } = await renderList();
    openEdit(BICH);
    const dialog = openDialogOf(BICH);
    profile.relatives.items.splice(0, 1);
    fireEvent.click(confirmIn(dialog));

    await waitFor(() => expect(namesInOrder()).toEqual([TUAN, BA, DUNG]));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(noticeOf()).toHaveTextContent(MISSING_MESSAGE);
    expect(noticeOf()).toHaveAttribute('data-tone', 'error');
    expect(profile.relatives.count('GET')).toBe(2);
    expect(container).not.toHaveAttribute('inert');
    expect(inertChildren()).toHaveLength(0);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('DW-80 NT-23 mất mạng ⇒ hộp thoại GIỮ, câu "chưa rõ, bấm lại là an toàn", không tự gửi lại; bấm lại ⇒ lời gọi thứ hai và thẻ chuyển sang đã ngừng', async () => {
    const { profile } = await renderList();
    openEdit(BICH);
    const dialog = openDialogOf(BICH);
    profile.relatives.failNext('DEACTIVATE', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(confirmIn(dialog));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(DEACTIVATE_NETWORK_MESSAGE);
    expect(namesInOrder()).toEqual([BICH, TUAN, BA, DUNG]);
    await sleep(50);
    expect(posts(profile)).toHaveLength(1);

    fireEvent.click(confirmIn(dialog));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(posts(profile)).toHaveLength(2);
    expect(valueOf(cardOf(BICH), 'Trạng thái hồ sơ')).toBe('Ngừng sử dụng');
  });

  it('DW-81 NT-23 hộp thoại đang mở mà thẻ BIẾN MẤT vì thao tác khác (404 của form khác kéo theo tải lại): hộp thoại bị gỡ, body không còn inert hay overflow hidden, không onDeactivated', async () => {
    const { profile, container } = await renderList();
    // Form của Tuấn có chữ để gửi; form và hộp thoại của Bích
    openEdit(TUAN);
    openEdit(BICH);
    const dialog = openDialogOf(BICH);
    expect(container).toHaveAttribute('inert');
    // Máy chủ không còn hai hồ sơ này; PUT của Tuấn ra 404 ⇒ tải lại danh sách ⇒ thẻ Bích bị gỡ cùng hộp thoại của nó
    profile.relatives.items.splice(0, 2);
    profile.relatives.failNext('PUT', () => apiError(404, 'KHONG_TIM_THAY'));
    fireEvent.click(fieldsOf(editFormOf(TUAN)).submit);

    await waitFor(() => expect(namesInOrder()).toEqual([BA, DUNG]));
    expect(dialog).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(container).not.toHaveAttribute('inert');
    expect(inertChildren()).toHaveLength(0);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(posts(profile)).toHaveLength(0);
    expect(noticeOf()).toHaveTextContent(MISSING_MESSAGE);
  });
});

describe('riêng tư và giữ nguyên hành vi F6 (NT-23)', () => {
  it('DW-82 NT-23 luồng 200 và 409 không gọi console.*; họ tên, bác sĩ, mã lịch hẹn không lọt vào URL, lịch sử, kho trình duyệt hay thông báo', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const { profile, router } = await renderList();
    openEdit(BICH);
    profile.relatives.blocking['1'] = [LICH_1];
    const dialog = openDialogOf(BICH);
    fireEvent.click(confirmIn(dialog));
    await within(dialog).findByRole('list', { name: 'Lịch hẹn đang chặn' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    profile.relatives.blocking['1'] = [];
    fireEvent.click(confirmIn(openDialogOf(BICH)));
    await waitFor(() => expect(noticeOf()).not.toBeNull());

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(noticeOf()?.textContent).not.toMatch(SECRETS);
    const where = [
      window.location.href,
      document.title,
      JSON.stringify(window.history.state),
      JSON.stringify(router.state.location),
      JSON.stringify({ ...window.localStorage }),
      JSON.stringify({ ...window.sessionStorage }),
      ...profile.relatives.requests.map(
        (r) => `${r.path} ${JSON.stringify(r.body)}`,
      ),
    ].join('\n');
    expect(where).not.toMatch(SECRETS);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('DW-83 NT-22 F6 giữ nguyên: Hủy form sửa ⇒ focus nút "Chỉnh sửa"; Lưu ⇒ thông báo tông thành công (data-tone) và PUT một lần', async () => {
    const { profile } = await renderList();
    const fields = openEdit(BICH);
    fireEvent.click(fields.cancel);
    await waitFor(() => expect(editButtonOf(BICH)).toHaveFocus());

    openEdit(BICH);
    fill(editFormOf(BICH), { phone: VALID_INPUT.phone });
    fireEvent.click(fieldsOf(editFormOf(BICH)).submit);
    await waitFor(() => expect(noticeOf()).not.toBeNull());
    expect(noticeOf()).toHaveAttribute('data-tone', 'success');
    expect(puts(profile)).toHaveLength(1);
    expect(posts(profile)).toHaveLength(0);
  });

  it('DW-84 NT-21 form THÊM mở sẵn: ngừng một hồ sơ không đóng form thêm và không mất chữ đã nhập', async () => {
    const { profile } = await renderList();
    const add = openAddForm({ name: 'Người mới đang gõ' });
    openEdit(BICH);
    fireEvent.click(confirmIn(openDialogOf(BICH)));

    await waitFor(() =>
      expect(valueOf(cardOf(BICH), 'Trạng thái hồ sơ')).toBe('Ngừng sử dụng'),
    );
    expect(add.name).toBeInTheDocument();
    expect(add.name).toHaveValue('Người mới đang gõ');
    expect(profile.relatives.count('POST')).toBe(0);
  });

  it('DW-85 NT-23 409 không ảnh hưởng thẻ KHÁC: các thẻ còn lại giữ nguyên trạng thái', async () => {
    const { profile } = await renderList();
    openEdit(BICH);
    profile.relatives.failNext('DEACTIVATE', () =>
      json(409, {
        maLoi: 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN',
        thongBao: 'câu của API',
        chiTiet: [LICH_1],
      }),
    );
    const dialog = openDialogOf(BICH);
    fireEvent.click(confirmIn(dialog));
    await within(dialog).findByRole('list', { name: 'Lịch hẹn đang chặn' });

    expect(
      [TUAN, BA, DUNG].map((name) => valueOf(cardOf(name), 'Trạng thái hồ sơ')),
    ).toEqual(['Đang sử dụng', 'Đang sử dụng', 'Ngừng sử dụng']);
    expect(dialog.textContent).not.toContain('câu của API');
  });
});
