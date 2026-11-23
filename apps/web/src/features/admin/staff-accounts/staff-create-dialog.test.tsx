import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  BRANCH,
  SYSTEM,
  apiError,
  json,
  makeGate,
} from '../patient-accounts/testing/patient-accounts-test-kit';
import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import {
  EMAIL_IN_USE_MESSAGE,
  GENERAL_INVALID_MESSAGE,
  SERVER_CREATE_MESSAGE,
  UNKNOWN_CREATE_MESSAGE,
} from './staff-create-errors';
import { BLANK_MESSAGE, QTV_ONLY_SYSTEM_NOTE } from './staff-create-model';
import {
  installFakeStaffApi,
  makeStaff,
  renderStaffPage,
} from './testing/staff-accounts-test-kit';

// admin F8 PR2, hộp "Tạo tài khoản nhân sự" (mã NSF8-82 đến 100 là [đề xuất], TRACKING admin 9A.21 mục 3). Phủ NS-04 đến NS-09, NS-11, NS-13, NS-14, NS-18, NS-19, NS-26 và NS-45
// (phía giao diện). API giả có trạng thái ở mức hợp đồng B15 (thứ tự kiểm, khoá thân, email trùng); không dữ liệu thật, không email thật.

const TITLE = 'Tạo tài khoản nhân sự';
const SUCCESS_NOTE =
  'Trạng thái: Chờ kích hoạt. Tài khoản chuyển sang Đang hoạt động sau khi người dùng đặt mật khẩu.';
const MAIL_FAILED =
  'Tài khoản đã tạo nhưng gửi email kích hoạt thất bại. Hãy gửi lại liên kết.';

afterEach(() => {
  vi.unstubAllGlobals();
});

// Trang phía sau hộp vẫn có bộ lọc "Chi nhánh", "Vai trò"...: mọi truy vấn của biểu mẫu đi qua hộp tạo
const dialogOf = () => screen.getByRole('dialog', { name: TITLE });
const field = (name: string) =>
  within(dialogOf()).getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) =>
  fireEvent.change(field(name), { target: { value } });
const select = (name: string) =>
  within(dialogOf()).getByRole('combobox', { name }) as HTMLSelectElement;
const choose = (name: string, value: string) =>
  fireEvent.change(select(name), { target: { value } });
const radio = (name: string) => within(dialogOf()).getByRole('radio', { name });
const submit = () =>
  fireEvent.click(
    within(dialogOf()).getByRole('button', { name: 'Tạo tài khoản' }),
  );
const dialogs = () => screen.queryAllByRole('dialog');
// Danh sách phía sau cũng có `role="status"` khi tải lại: chờ màn thành công bằng chữ
const success = () => screen.findByText(/^Tạo tài khoản thành công\./);

async function openCreate() {
  const open = await screen.findByRole('button', { name: TITLE });
  open.focus(); // bấm thật chuyển focus vào nút; fireEvent.click thì không
  fireEvent.click(open);
  return screen.findByRole('dialog', { name: TITLE });
}

/** Mở hộp và chờ tuỳ chọn nạp xong (ô Chi nhánh có mặt). */
async function openReady() {
  const dialog = await openCreate();
  await within(dialogOf()).findByRole('combobox', { name: 'Chi nhánh' });
  return dialog;
}

function fillCommon(overrides: { email?: string } = {}) {
  type('Họ tên', 'Lê Văn An');
  type('Email', overrides.email ?? ' an@example.invalid ');
  type('Số điện thoại', '0912345678');
}

function fillDoctor() {
  fillCommon();
  choose('Chi nhánh', '5');
  choose('Chức danh', 'TS_BS');
  choose('Chuyên khoa', '1');
  choose('Dịch vụ khám chính', '11');
  type('Số năm kinh nghiệm', '12');
}

const posts = (api: ReturnType<typeof installFakeStaffApi>) =>
  api.calls('POST', '/admin/staff-accounts');

describe('NSF8-82 mở hộp, tải tuỳ chọn (NS-13)', () => {
  it('NSF8-82 nút ở đầu trang mở hộp có tên, mô tả; focus vào trong hộp; một lần tải mỗi lần mở', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    expect(dialogs()).toHaveLength(0);
    // Bộ lọc chi nhánh của trang cũng gọi /admin/branches khi mở trang: đếm phần tăng thêm do hộp
    await screen.findByRole('table', { name: 'Danh sách nhân sự' });
    const pageBranchCalls = api.calls('GET', '/admin/branches').length;

    const dialog = await openReady();

    expect(dialog).toHaveAccessibleDescription(
      'Người dùng sẽ nhận email kích hoạt để thiết lập mật khẩu.',
    );
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(api.calls('GET', '/admin/branches')).toHaveLength(
      pageBranchCalls + 1,
    );
    expect(api.calls('GET', '/admin/options/specialties')).toHaveLength(1);
    expect(api.calls('GET', '/admin/services')).toHaveLength(0);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    await openReady();
    expect(api.calls('GET', '/admin/branches')).toHaveLength(
      pageBranchCalls + 2,
    );
  });

  it('NSF8-82 đang tải tuỳ chọn: hiện trạng thái đang tải, các ô chung vẫn gõ được, nút Tạo tài khoản tắt', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    const gate = makeGate();
    renderStaffPage();
    await screen.findByRole('table', { name: 'Danh sách nhân sự' });
    api.override(
      (r) => r.path === '/admin/branches',
      async () => {
        await gate.promise;
        return json({ items: [], total: 0, page: 1, pageSize: 100 });
      },
    );
    try {
      await openCreate();
      expect(
        screen.getByText('Đang tải chi nhánh và chuyên khoa…'),
      ).toBeInTheDocument();
      type('Họ tên', 'Lê Văn An');
      expect(field('Họ tên').value).toBe('Lê Văn An');
      expect(
        screen.getByRole('button', { name: 'Tạo tài khoản' }),
      ).toBeDisabled();
    } finally {
      gate.open();
    }
    await within(dialogOf()).findByRole('combobox', { name: 'Chi nhánh' });
    expect(field('Họ tên').value).toBe('Lê Văn An');
    expect(screen.getByRole('button', { name: 'Tạo tài khoản' })).toBeEnabled();
  });

  it('NSF8-82 tải tuỳ chọn lỗi: có "Thử lại", bấm thì tải lại và hiện ô chọn; dữ liệu đã gõ được giữ', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await screen.findByRole('table', { name: 'Danh sách nhân sự' });
    const pageBranchCalls = api.calls('GET', '/admin/branches').length;
    api.override(
      (r) => r.path === '/admin/branches',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    await openCreate();
    type('Họ tên', 'Lê Văn An');
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    await within(dialogOf()).findByRole('combobox', { name: 'Chi nhánh' });
    expect(field('Họ tên').value).toBe('Lê Văn An');
    expect(api.calls('GET', '/admin/branches')).toHaveLength(
      pageBranchCalls + 2,
    );
  });
});

describe('NSF8-83 vai trò theo phạm vi (NS-07, NS-08)', () => {
  it('NSF8-83 Toàn hệ thống: ba vai trò đều chọn được, mặc định Bác sĩ', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage({ scope: SYSTEM });
    await openReady();

    const group = screen.getByRole('radiogroup', { name: 'Vai trò' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => [
          (r as HTMLInputElement).value,
          (r as HTMLInputElement).disabled,
        ]),
    ).toEqual([
      ['BacSi', false],
      ['LeTan', false],
      ['QuanTriVien', false],
    ]);
    expect(radio('Bác sĩ')).toBeChecked();
    expect(screen.queryByText(QTV_ONLY_SYSTEM_NOTE)).not.toBeInTheDocument();
  });

  it('NSF8-83 Chi nhánh: Quản trị viên HIỆN nhưng vô hiệu, kèm chú thích gắn bằng aria-describedby; bấm không đổi vai trò', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage({ scope: BRANCH });
    await openCreate();

    const admin = radio('Quản trị viên');
    expect(admin).toBeDisabled();
    expect(admin).toHaveAccessibleDescription(QTV_ONLY_SYSTEM_NOTE);
    expect(radio('Bác sĩ')).toBeEnabled();
    expect(radio('Lễ tân')).toBeEnabled();
    fireEvent.click(admin);
    expect(radio('Bác sĩ')).toBeChecked();
  });
});

describe('NSF8-84 ô theo vai trò (NS-04, NS-18)', () => {
  it('NSF8-84 Bác sĩ có đủ chín ô, KHÔNG có ô mật khẩu; khối ghi chú nói mật khẩu do người dùng tự đặt', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    const dialog = await openReady();

    for (const name of [
      'Họ tên',
      'Email',
      'Số điện thoại',
      'Số năm kinh nghiệm',
    ])
      expect(field(name)).toBeInTheDocument();
    for (const name of [
      'Chi nhánh',
      'Chức danh',
      'Học vị',
      'Chuyên khoa',
      'Dịch vụ khám chính',
    ])
      expect(select(name)).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(/mật khẩu/i),
    ).not.toBeInTheDocument();
    expect(dialog.querySelector('input[type="password"]')).toBeNull();
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'Mật khẩu do người dùng tự đặt qua liên kết trong email. Admin không nhập hay xem mật khẩu của người khác.',
    );
  });

  it('NSF8-84 Lễ tân: chỉ họ tên, email, SĐT và chi nhánh; đổi vai trò giữ họ tên, email, SĐT và bỏ ô của Bác sĩ', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fillDoctor();

    fireEvent.click(radio('Lễ tân'));

    for (const name of [
      'Chức danh',
      'Học vị',
      'Chuyên khoa',
      'Dịch vụ khám chính',
    ])
      expect(screen.queryByRole('combobox', { name })).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Số năm kinh nghiệm'),
    ).not.toBeInTheDocument();
    expect(field('Họ tên').value).toBe('Lê Văn An');
    expect(field('Email').value).toBe(' an@example.invalid ');
    expect(field('Số điện thoại').value).toBe('0912345678');
    expect(
      (
        within(dialogOf()).getByRole('combobox', {
          name: 'Chi nhánh',
        }) as HTMLSelectElement
      ).value,
    ).toBe('5');
    // về lại Bác sĩ: các ô của Bác sĩ trống (không nhớ giá trị cũ)
    fireEvent.click(radio('Bác sĩ'));
    expect(
      (
        within(dialogOf()).getByRole('combobox', {
          name: 'Chức danh',
        }) as HTMLSelectElement
      ).value,
    ).toBe('');
    expect(field('Số năm kinh nghiệm').value).toBe('');
  });

  it('NSF8-84 Quản trị viên: có nhóm Phạm vi hai lựa chọn (mặc định chưa chọn); chỉ phạm vi Chi nhánh mới hiện ô chi nhánh (NS-04)', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();

    fireEvent.click(radio('Quản trị viên'));
    expect(
      within(dialogOf()).queryByRole('combobox', { name: 'Chi nhánh' }),
    ).not.toBeInTheDocument();
    const scopes = screen.getByRole('radiogroup', { name: 'Phạm vi' });
    const options = within(scopes).getAllByRole('radio');
    expect(options.map((r) => (r as HTMLInputElement).value)).toEqual([
      'ToanHeThong',
      'ChiNhanh',
    ]);
    expect(options.every((r) => !(r as HTMLInputElement).checked)).toBe(true);

    fireEvent.click(within(scopes).getByRole('radio', { name: 'Chi nhánh' }));
    expect(
      within(dialogOf()).getByRole('combobox', { name: 'Chi nhánh' }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(scopes).getByRole('radio', { name: 'Toàn hệ thống' }),
    );
    expect(
      within(dialogOf()).queryByRole('combobox', { name: 'Chi nhánh' }),
    ).not.toBeInTheDocument();
  });
});

describe('NSF8-85 học vị điền sẵn và dịch vụ lọc theo chi nhánh (NS-13, NS-14)', () => {
  it.each([
    ['BS', 'BS'],
    ['BS_CKI', 'BS'],
    ['BS_CKII', 'BS'],
    ['ThS_BS', 'ThS'],
    ['TS_BS', 'TS'],
    ['PGS_TS_BS', 'PGS'],
    ['GS_TS_BS', 'GS'],
  ])(
    'NSF8-85 chức danh %s điền sẵn học vị %s và sửa lại được',
    async (title, degree) => {
      installFakeStaffApi({ accounts: [makeStaff(1)] });
      renderStaffPage();
      await openReady();
      expect(
        (
          within(dialogOf()).getByRole('combobox', {
            name: 'Học vị',
          }) as HTMLSelectElement
        ).value,
      ).toBe('');

      choose('Chức danh', title);
      const degreeSelect = within(dialogOf()).getByRole('combobox', {
        name: 'Học vị',
      }) as HTMLSelectElement;
      expect(degreeSelect.value).toBe(degree);
      choose('Học vị', 'GS');
      expect(degreeSelect.value).toBe('GS');
    },
  );

  it('NSF8-85 dịch vụ vô hiệu và nói "Chọn chi nhánh trước" khi chưa có chi nhánh; chọn chi nhánh thì chỉ hiện dịch vụ có ở chi nhánh đó', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    const services = within(dialogOf()).getByRole('combobox', {
      name: 'Dịch vụ khám chính',
    });
    expect(services).toBeDisabled();
    expect(services).toHaveAccessibleDescription('Chọn chi nhánh trước.');

    choose('Chi nhánh', '5');
    expect(services).toBeEnabled();
    expect(
      within(services)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chọn dịch vụ khám chính', 'Khám tổng quát', 'Khám tim mạch']);

    choose('Chi nhánh', '6');
    expect(
      within(services)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chọn dịch vụ khám chính', 'Khám tim mạch']);
  });

  it('NSF8-85 đổi chi nhánh bỏ dịch vụ không còn ở chi nhánh mới, giữ dịch vụ còn', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    const services = within(dialogOf()).getByRole('combobox', {
      name: 'Dịch vụ khám chính',
    }) as HTMLSelectElement;

    choose('Chi nhánh', '5');
    choose('Dịch vụ khám chính', '11');
    choose('Chi nhánh', '6');
    expect(services.value).toBe('');

    choose('Dịch vụ khám chính', '12');
    choose('Chi nhánh', '5');
    expect(services.value).toBe('12');
  });

  it('NSF8-85 chuyên khoa lấy từ danh sách đang hoạt động của API', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    expect(
      within(within(dialogOf()).getByRole('combobox', { name: 'Chuyên khoa' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chọn chuyên khoa', 'Tim mạch', 'Nhi khoa']);
  });
});

describe('NSF8-86 Admin Chi nhánh: chi nhánh cố định (NS-05, NS-06)', () => {
  it('NSF8-86 chi nhánh là chữ chỉ đọc, KHÔNG có ô chọn chi nhánh; chỉ dịch vụ của chi nhánh mình; thân gửi có chiNhanhId của họ', async () => {
    const api = installFakeStaffApi({
      scope: BRANCH,
      accounts: [makeStaff(1)],
    });
    renderStaffPage({ scope: BRANCH });
    await openCreate();
    await within(dialogOf()).findByRole('combobox', { name: 'Chức danh' });

    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(
      within(dialogOf()).queryByRole('combobox', { name: 'Chi nhánh' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText('Chi nhánh Quận 1')).toBeInTheDocument();
    expect(
      within(
        within(dialogOf()).getByRole('combobox', {
          name: 'Dịch vụ khám chính',
        }),
      )
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chọn dịch vụ khám chính', 'Khám tổng quát', 'Khám tim mạch']);

    fillCommon();
    choose('Chức danh', 'TS_BS');
    choose('Chuyên khoa', '1');
    choose('Dịch vụ khám chính', '11');
    type('Số năm kinh nghiệm', '12');
    submit();
    await success();

    expect(api.created).toHaveLength(1);
    expect(api.created[0]).toMatchObject({
      vaiTro: 'BacSi',
      chiNhanhId: '5',
    });
  });

  it('NSF8-86 Admin Chi nhánh tạo Lễ tân: không cần chọn chi nhánh, tạo được ngay', async () => {
    const api = installFakeStaffApi({
      scope: BRANCH,
      accounts: [makeStaff(1)],
    });
    renderStaffPage({ scope: BRANCH });
    await openCreate();
    fireEvent.click(radio('Lễ tân'));
    fillCommon();
    submit();
    await success();
    expect(api.created).toEqual([
      {
        vaiTro: 'LeTan',
        hoTen: 'Lê Văn An',
        email: 'an@example.invalid',
        soDienThoai: '0912345678',
        chiNhanhId: '5',
      },
    ]);
  });
});

describe('NSF8-87 bỏ trống ra đúng lỗi, không gọi API (NS-11, NS-26)', () => {
  it('NSF8-87 Bác sĩ để trống hết: chín lỗi "Bắt buộc" đúng ô, KHÔNG gọi API, ô lỗi đầu tiên được focus (Figma 524:2)', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();

    submit();

    await waitFor(() => expect(field('Họ tên')).toHaveFocus());
    expect(screen.getAllByText(BLANK_MESSAGE)).toHaveLength(9);
    for (const name of [
      'Họ tên',
      'Email',
      'Số điện thoại',
      'Số năm kinh nghiệm',
    ])
      expect(field(name)).toHaveAttribute('aria-invalid', 'true');
    for (const name of [
      'Chi nhánh',
      'Chức danh',
      'Học vị',
      'Chuyên khoa',
      'Dịch vụ khám chính',
    ])
      expect(select(name)).toHaveAttribute('aria-invalid', 'true');
    expect(posts(api)).toHaveLength(0);
  });

  it('NSF8-87 Lễ tân để trống hết: bốn lỗi, KHÔNG hỏi ô của Bác sĩ (Figma 525:2)', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fireEvent.click(radio('Lễ tân'));
    submit();
    expect(screen.getAllByText(BLANK_MESSAGE)).toHaveLength(4);
    expect(posts(api)).toHaveLength(0);
  });

  it('NSF8-87 Quản trị viên chưa chọn phạm vi: lỗi ở nhóm Phạm vi; phạm vi Chi nhánh thiếu chi nhánh: lỗi ở chi nhánh (NS-04)', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fireEvent.click(radio('Quản trị viên'));
    fillCommon();
    submit();
    expect(screen.getAllByText(BLANK_MESSAGE)).toHaveLength(1);
    expect(screen.getByRole('radiogroup', { name: 'Phạm vi' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    fireEvent.click(radio('Chi nhánh'));
    submit();
    expect(screen.getAllByText(BLANK_MESSAGE)).toHaveLength(1);
    expect(
      within(dialogOf()).getByRole('combobox', { name: 'Chi nhánh' }),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(posts(api)).toHaveLength(0);
  });

  it('NSF8-87 sai định dạng: chữ của luật đăng ký ở đúng ô; dữ liệu đã gõ được giữ; sửa ô thì lỗi ô đó mất, ô khác còn', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fillDoctor();
    type('Email', 'sai-email');
    type('Số điện thoại', '123');

    submit();

    expect(screen.getByText('Email không hợp lệ.')).toBeInTheDocument();
    expect(
      screen.getByText('Số điện thoại phải 10 số, bắt đầu bằng 0.'),
    ).toBeInTheDocument();
    expect(field('Email').value).toBe('sai-email');
    expect(field('Họ tên').value).toBe('Lê Văn An');
    type('Email', 'dung@example.invalid');
    expect(screen.queryByText('Email không hợp lệ.')).not.toBeInTheDocument();
    expect(
      screen.getByText('Số điện thoại phải 10 số, bắt đầu bằng 0.'),
    ).toBeInTheDocument();
  });

  it('NSF8-87 số năm kinh nghiệm ngoài 0 đến 60 hay không phải số nguyên bị chặn trước khi gửi', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fillDoctor();
    type('Số năm kinh nghiệm', '61');
    submit();
    expect(
      screen.getByText('Số năm kinh nghiệm phải là số nguyên từ 0 đến 60.'),
    ).toBeInTheDocument();
    type('Số năm kinh nghiệm', '1.5');
    submit();
    expect(
      screen.getByText('Số năm kinh nghiệm phải là số nguyên từ 0 đến 60.'),
    ).toBeInTheDocument();
    expect(posts(api)).toHaveLength(0);
  });
});

describe('NSF8-88 tạo thành công, thư đã gửi (NS-18, NS-19)', () => {
  it('NSF8-88 Bác sĩ: MỘT POST đúng thân (đã trim, số năm là số, tập khoá chính xác); màn thành công có đúng chữ; danh sách tải lại và có dòng mới', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fillDoctor();
    const listsBefore = api.lists().length;

    submit();

    const status = await success();
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent(
      'Tạo tài khoản thành công. Đã gửi email kích hoạt tới an@example.invalid.',
    );
    expect(screen.getByText(SUCCESS_NOTE)).toBeInTheDocument();
    expect(posts(api)).toHaveLength(1);
    expect(api.created).toEqual([
      {
        vaiTro: 'BacSi',
        hoTen: 'Lê Văn An',
        email: 'an@example.invalid',
        soDienThoai: '0912345678',
        chiNhanhId: '5',
        chuyenKhoaId: '1',
        dichVuKhamId: '11',
        chucDanh: 'TS_BS',
        hocVi: 'TS',
        soNamKinhNghiem: 12,
      },
    ]);
    await waitFor(() =>
      expect(api.lists().length).toBeGreaterThan(listsBefore),
    );
    expect(
      await screen.findByRole('button', { name: 'Xem chi tiết Lê Văn An' }),
    ).toBeInTheDocument();
  });

  it('NSF8-88 màn thành công KHÔNG có liên kết kích hoạt hay token và có đúng ba nút; không còn ô nào của biểu mẫu', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    const dialog = await openReady();
    fillDoctor();
    submit();
    await success();

    expect(dialog.textContent).not.toMatch(/token|https?:|kich-hoat/i);
    expect(dialog.querySelector('a[href]')).toBeNull();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(
      expect.arrayContaining(['Xem chi tiết', 'Tạo tài khoản khác', 'Đóng']),
    );
    expect(within(dialog).queryByLabelText('Họ tên')).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Tạo tài khoản' }),
    ).not.toBeInTheDocument();
  });

  it('NSF8-88 Toàn hệ thống tạo Quản trị viên phạm vi Toàn hệ thống: thân KHÔNG có chiNhanhId; phạm vi Chi nhánh: có chiNhanhId', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fireEvent.click(radio('Quản trị viên'));
    fireEvent.click(radio('Toàn hệ thống'));
    fillCommon();
    submit();
    await success();
    expect(api.created[0]).toEqual({
      vaiTro: 'QuanTriVien',
      hoTen: 'Lê Văn An',
      email: 'an@example.invalid',
      soDienThoai: '0912345678',
      phamVi: 'ToanHeThong',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản khác' }));
    fireEvent.click(radio('Chi nhánh'));
    type('Họ tên', 'Trần Thị Bình');
    type('Email', 'binh@example.invalid');
    type('Số điện thoại', '0987654321');
    choose('Chi nhánh', '6');
    submit();
    await waitFor(() => expect(api.created).toHaveLength(2));
    expect(api.created[1]).toMatchObject({
      vaiTro: 'QuanTriVien',
      phamVi: 'ChiNhanh',
      chiNhanhId: '6',
    });
  });
});

describe('NSF8-89 tạo xong nhưng gửi thư lỗi (NS-19, NS-26)', () => {
  it('NSF8-89 HTTP 201 mà thư lỗi: cảnh báo đúng chữ PLAN, KHÔNG nói "đã gửi", có "Xem chi tiết và gửi lại"; danh sách vẫn tải lại', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1)],
      mail: 'ThatBai',
    });
    renderStaffPage();
    const dialog = await openReady();
    fillDoctor();
    const listsBefore = api.lists().length;

    submit();

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(MAIL_FAILED);
    expect(dialog.textContent).not.toMatch(/Đã gửi email|thành công/i);
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Xem chi tiết và gửi lại' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Tạo tài khoản khác' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.lists().length).toBeGreaterThan(listsBefore),
    );
  });

  it('NSF8-89 "Xem chi tiết và gửi lại": đóng hộp RỒI mở panel đúng tài khoản (không bao giờ hai hộp cùng mở); gửi lại ngay nhận 429 và hiện số giây (NS-45)', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1)],
      mail: 'ThatBai',
    });
    renderStaffPage();
    await openReady();
    fillDoctor();
    submit();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem chi tiết và gửi lại' }),
    );

    const panel = await screen.findByRole('dialog', { name: 'Lê Văn An' });
    expect(dialogs()).toHaveLength(1);
    expect(
      screen.queryByRole('dialog', { name: TITLE }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: 'Gửi lại email kích hoạt',
      }),
    );
    expect(
      await within(panel).findByText('Vui lòng thử lại sau 45 giây.'),
    ).toBeInTheDocument();
    expect(api.calls('POST', /resend-activation$/)).toHaveLength(1);
  });

  it('NSF8-89 "Xem chi tiết" ở màn thành công mở đúng panel của tài khoản mới', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fillDoctor();
    submit();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem chi tiết' }),
    );
    const panel = await screen.findByRole('dialog', { name: 'Lê Văn An' });
    expect(
      await within(panel).findByText('an@example.invalid'),
    ).toBeInTheDocument();
    expect(dialogs()).toHaveLength(1);
  });
});

describe('NSF8-90 email trùng (NS-09)', () => {
  it('NSF8-90 409: câu PLAN ở ô email, focus ô email, GIỮ dữ liệu, không có tài khoản mới; sửa email rồi tạo được', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1, { email: 'an@example.invalid' })],
    });
    renderStaffPage();
    await openReady();
    fillDoctor();

    submit();

    expect(await screen.findByText(EMAIL_IN_USE_MESSAGE)).toBeInTheDocument();
    await waitFor(() => expect(field('Email')).toHaveFocus());
    expect(field('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Họ tên').value).toBe('Lê Văn An');
    expect(field('Số năm kinh nghiệm').value).toBe('12');
    expect(api.created).toHaveLength(0);
    expect(
      screen.queryByText(/Tạo tài khoản thành công/),
    ).not.toBeInTheDocument();

    type('Email', 'khac@example.invalid');
    expect(screen.queryByText(EMAIL_IN_USE_MESSAGE)).not.toBeInTheDocument();
    submit();
    await success();
    expect(api.created).toHaveLength(1);
  });

  it('NSF8-90 email trùng khác hoa thường vẫn bị chặn (tên miền chữ thường là việc của máy chủ)', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1, { email: 'an@example.invalid' })],
    });
    renderStaffPage();
    await openReady();
    fillDoctor();
    type('Email', 'AN@example.invalid');
    submit();
    expect(await screen.findByText(EMAIL_IN_USE_MESSAGE)).toBeInTheDocument();
    expect(api.created).toHaveLength(0);
  });
});

describe('NSF8-91 lỗi 400 từ máy chủ vào đúng ô (NS-13)', () => {
  it('NSF8-91 DU_LIEU_KHONG_HOP_LE nhiều trường: mỗi lỗi ở đúng ô, focus ô đầu tiên trong DOM, giữ dữ liệu', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'chuyenKhoaId', ma: 'CHUYEN_KHOA_KHONG_HOP_LE' },
          { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
        ]),
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    submit();

    expect(
      await screen.findByText('Số điện thoại phải 10 số, bắt đầu bằng 0.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chuyên khoa không hợp lệ hoặc đã ngừng hoạt động.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(field('Số điện thoại')).toHaveFocus());
    expect(field('Họ tên').value).toBe('Lê Văn An');
  });

  it('NSF8-91 trường lạ trong lỗi: câu chung, không in tên trường thô', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'matKhau', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        ]),
    );
    renderStaffPage();
    const dialog = await openReady();
    fillDoctor();
    submit();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      GENERAL_INVALID_MESSAGE,
    );
    expect(dialog.textContent).not.toContain('matKhau');
  });

  it('NSF8-91 hai mã nghiệp vụ 400 của PLAN: học vị không tương thích ở ô học vị, dịch vụ không ở chi nhánh ở ô dịch vụ', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => apiError(400, 'CHUC_DANH_HOC_VI_KHONG_TUONG_THICH'),
    );
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => apiError(400, 'DICH_VU_KHONG_O_CHI_NHANH'),
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    submit();
    expect(
      await screen.findByText('Chức danh và học vị không tương thích.'),
    ).toBeInTheDocument();
    expect(
      within(dialogOf()).getByRole('combobox', { name: 'Học vị' }),
    ).toHaveAttribute('aria-invalid', 'true');
    submit();
    expect(
      await screen.findByText(
        'Dịch vụ khám chính không được cung cấp tại chi nhánh đã chọn.',
      ),
    ).toBeInTheDocument();
  });

  it('NSF8-91 403 (Admin Chi nhánh bị từ chối ở máy chủ): lỗi chung, giữ dữ liệu, không tạo gì', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => apiError(403, 'KHONG_DU_QUYEN'),
    );
    renderStaffPage();
    const dialog = await openReady();
    fillDoctor();
    submit();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(field('Họ tên').value).toBe('Lê Văn An');
    expect(api.created).toHaveLength(0);
  });

  it('NSF8-91 500: câu nói CHƯA có tài khoản nào được tạo, giữ dữ liệu, bấm lại được', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    renderStaffPage();
    const dialog = await openReady();
    fillDoctor();
    submit();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      SERVER_CREATE_MESSAGE,
    );
    expect(screen.getByRole('button', { name: 'Tạo tài khoản' })).toBeEnabled();
    submit();
    await success();
    expect(api.created).toHaveLength(1);
  });
});

describe('NSF8-92 mất mạng, hết hạn chờ: chưa rõ (NS-45)', () => {
  it('NSF8-92 mất mạng: Ở LẠI biểu mẫu, giữ dữ liệu, cảnh báo "chưa rõ" kèm "Kiểm tra danh sách", KHÔNG có "Tạo tài khoản khác", KHÔNG tự gửi lại', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    renderStaffPage();
    const dialog = await openReady();
    fillDoctor();

    submit();

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      UNKNOWN_CREATE_MESSAGE,
    );
    expect(field('Họ tên').value).toBe('Lê Văn An');
    expect(
      within(dialog).getByRole('button', { name: 'Kiểm tra danh sách' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Tạo tài khoản khác' }),
    ).not.toBeInTheDocument();
    expect(posts(api)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Tạo tài khoản' })).toBeEnabled();
  });

  it('NSF8-92 "Kiểm tra danh sách" đóng hộp và tải lại danh sách; trả focus về nút mở hộp', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    submit();
    const listsBefore = api.lists().length;

    fireEvent.click(
      await screen.findByRole('button', { name: 'Kiểm tra danh sách' }),
    );

    await waitFor(() => expect(dialogs()).toHaveLength(0));
    await waitFor(() =>
      expect(api.lists().length).toBeGreaterThan(listsBefore),
    );
    expect(screen.getByRole('button', { name: TITLE })).toHaveFocus();
  });

  it('NSF8-92 sau "chưa rõ", bấm Tạo tài khoản lại khi máy chủ ĐÃ tạo: 409 email trùng (an toàn, không tạo hai)', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    // Máy chủ đã xử lý rồi mới mất kết nối: mô phỏng bằng việc thêm tài khoản vào API giả
    api.accounts.push(makeStaff(9, { email: 'an@example.invalid' }));
    submit();
    await screen.findByText(UNKNOWN_CREATE_MESSAGE);
    submit();
    expect(await screen.findByText(EMAIL_IN_USE_MESSAGE)).toBeInTheDocument();
    expect(api.created).toHaveLength(0);
  });

  // Phát hiện khi đo trình duyệt (23/11/2026): proxy cắt kết nối lúc tạo cho 502 không phải JSON; máy chủ có thể đã tạo tài khoản
  it('NSF8-92 proxy trả 502 không phải JSON (cắt kết nối giữa lúc tạo): "chưa rõ" kèm "Kiểm tra danh sách", giữ dữ liệu, không nói lỗi chung', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () =>
        new Response('<html>Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
    );
    renderStaffPage();
    const dialog = await openReady();
    fillDoctor();
    submit();

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      UNKNOWN_CREATE_MESSAGE,
    );
    expect(
      within(dialog).getByRole('button', { name: 'Kiểm tra danh sách' }),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toContain(GENERIC_ERROR_MESSAGE);
    expect(field('Họ tên').value).toBe('Lê Văn An');
    expect(posts(api)).toHaveLength(1);
  });

  it('NSF8-92 phản hồi 201 sai hình dạng: màn "chưa rõ" chỉ có "Kiểm tra danh sách" và "Đóng" (không "Xem chi tiết", không "Tạo tài khoản khác")', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => json({ ketQua: 'ok' }, 201),
    );
    renderStaffPage();
    const dialog = await openReady();
    fillDoctor();
    submit();

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      UNKNOWN_CREATE_MESSAGE,
    );
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent)
        .filter((text) => text !== '×' && text !== ''),
    ).toEqual(expect.arrayContaining(['Kiểm tra danh sách', 'Đóng']));
    for (const name of ['Xem chi tiết', 'Tạo tài khoản khác'])
      expect(
        within(dialog).queryByRole('button', { name }),
      ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('NSF8-93 bấm hai lần chỉ một lần tạo (NS-09)', () => {
  it('NSF8-93 hai lần bấm khi chờ phản hồi: MỘT POST, MỘT tài khoản; nút đổi chữ và tắt', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    const gate = makeGate();
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      async () => {
        await gate.promise;
        return json({ taiKhoanId: '99', guiEmail: { ketQua: 'DaGui' } }, 201);
      },
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    try {
      const button = within(dialogOf()).getByRole('button', {
        name: 'Tạo tài khoản',
      });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(
        await screen.findByRole('button', { name: 'Đang tạo…' }),
      ).toBeDisabled();
    } finally {
      gate.open();
    }
    await success();
    expect(posts(api)).toHaveLength(1);
  });

  it('NSF8-93 đang gửi: Esc, Huỷ và nút đóng không đóng hộp (tránh mất kết quả); xong thì đóng được', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    const gate = makeGate();
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      async () => {
        await gate.promise;
        return json({ taiKhoanId: '99', guiEmail: { ketQua: 'DaGui' } }, 201);
      },
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    try {
      submit();
      await screen.findByRole('button', { name: 'Đang tạo…' });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Đóng hộp thoại' }),
      ).toBeDisabled();
      expect(dialogs()).toHaveLength(1);
    } finally {
      gate.open();
    }
    await success();
  });
});

describe('NSF8-94 "Tạo tài khoản khác", đóng hộp, focus', () => {
  it('NSF8-94 "Tạo tài khoản khác": biểu mẫu trống, giữ vai trò, không còn màn kết quả', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    fireEvent.click(radio('Lễ tân'));
    fillCommon();
    choose('Chi nhánh', '5');
    submit();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Tạo tài khoản khác' }),
    );

    expect(
      screen.queryByText(/Tạo tài khoản thành công/),
    ).not.toBeInTheDocument();
    expect(radio('Lễ tân')).toBeChecked();
    expect(field('Họ tên').value).toBe('');
    expect(field('Email').value).toBe('');
    expect(
      (
        within(dialogOf()).getByRole('combobox', {
          name: 'Chi nhánh',
        }) as HTMLSelectElement
      ).value,
    ).toBe('');
  });

  it('NSF8-94 Esc đóng hộp không hỏi lại và trả focus về nút mở; "Huỷ" cũng vậy', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    const open = await screen.findByRole('button', { name: TITLE });
    open.focus();
    await openReady();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(open).toHaveFocus();

    await openReady();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(open).toHaveFocus();
  });

  it('NSF8-94 bấm nền KHÔNG đóng hộp (tránh mất dữ liệu đã nhập)', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    const dialog = await openReady();
    type('Họ tên', 'Lê Văn An');
    fireEvent.click(dialog.parentElement as HTMLElement);
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(dialogs()).toHaveLength(1);
    expect(field('Họ tên').value).toBe('Lê Văn An');
  });

  it('NSF8-94 mở lại hộp sau khi đóng là biểu mẫu trống (không lưu nháp)', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openReady();
    type('Họ tên', 'Lê Văn An');
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    await openReady();
    expect(field('Họ tên').value).toBe('');
  });

  it('NSF8-94 Tab không rời khỏi hộp (khoá focus của hộp chung)', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    const dialog = await openReady();
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
      ),
    );
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
  });
});

describe('NSF8-95 sau lỗi mạng hay hết hạn chờ, hộp được mở khoá lại ngay (phiên kiểm 23/11/2026)', () => {
  // Hộp chỉ khoá (Esc, Huỷ, X, nút gửi) trong lúc CHỜ phản hồi. Lời gọi có hạn chờ của `request()` (45 giây, `LONG_TIMEOUT_MS`) nên không khoá mãi:
  // hết hạn ⇒ TimeoutError (service NSF8-79) ⇒ `pending` về false (hook NSF8-104) ⇒ ca này đo đúng điều đó ở mức giao diện.
  const expectUnlocked = () => {
    expect(
      within(dialogOf()).getByRole('button', { name: 'Huỷ' }),
    ).toBeEnabled();
    expect(
      within(dialogOf()).getByRole('button', { name: 'Đóng hộp thoại' }),
    ).toBeEnabled();
    expect(
      within(dialogOf()).getByRole('button', { name: 'Tạo tài khoản' }),
    ).toBeEnabled();
  };

  it('NSF8-95 mất mạng: nút gửi, Huỷ và X dùng lại được ngay; Esc đóng được; dữ liệu còn', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    submit();
    await within(dialogOf()).findByText(UNKNOWN_CREATE_MESSAGE);

    expectUnlocked();
    expect(field('Họ tên').value).toBe('Lê Văn An');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialogs()).toHaveLength(0));
  });

  // Phát hiện khi đo trình duyệt (23/11/2026): nút gửi bị tắt lúc chờ nên mất focus, sau lỗi không gắn với ô nào (mạng, 403, 500) focus rơi ra ngoài hộp
  it('NSF8-95 sau lỗi mạng hay lỗi chung không gắn với ô nào, focus trở về nút "Tạo tài khoản" (không rơi ra ngoài hộp)', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    api.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    submit();
    await within(dialogOf()).findByText(UNKNOWN_CREATE_MESSAGE);
    const button = within(dialogOf()).getByRole('button', {
      name: 'Tạo tài khoản',
    });
    expect(button).toHaveFocus();

    // lần hai: 500 cũng vậy
    (document.activeElement as HTMLElement).blur();
    submit();
    await within(dialogOf()).findByText(SERVER_CREATE_MESSAGE);
    expect(
      within(dialogOf()).getByRole('button', { name: 'Tạo tài khoản' }),
    ).toHaveFocus();
  });

  it('NSF8-95 hết hạn chờ 45 giây: còn khoá ở giây 44, MỞ KHOÁ ở giây 46 với cảnh báo "chưa rõ"; Huỷ đóng được', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    const inner = api.fetch;
    // POST không bao giờ trả lời: chỉ kết thúc khi `request()` tự ngắt bằng AbortSignal
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        (init?.method ?? 'GET') === 'POST' &&
        String(input).endsWith('/admin/staff-accounts')
          ? new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Đã huỷ', 'AbortError')),
              );
            })
          : inner(input, init),
      ),
    );
    renderStaffPage();
    await openReady();
    fillDoctor();
    // Chỉ giả đồng hồ hẹn giờ; đồng hồ chạy theo giờ thật để findBy và React vẫn chạy
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    });
    try {
      submit();
      await screen.findByRole('button', { name: 'Đang tạo…' });
      await vi.advanceTimersByTimeAsync(44_000);
      expect(screen.getByRole('button', { name: 'Đang tạo…' })).toBeDisabled();
      expect(
        within(dialogOf()).getByRole('button', { name: 'Huỷ' }),
      ).toBeDisabled();

      await vi.advanceTimersByTimeAsync(2_000);
      expect(
        await within(dialogOf()).findByText(UNKNOWN_CREATE_MESSAGE),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
    expectUnlocked();
    fireEvent.click(within(dialogOf()).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
  });
});
