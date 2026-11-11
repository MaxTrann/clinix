import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  resetAuthForTest,
  restoreSession,
} from '../../../../auth/auth-session';
import type { AdminMe } from '../../../../admin';
import { createAppRoutes } from '../../../../../router/routes';
import { createFakeAuthApi } from '../../../../../test/fake-auth-api';
import type {
  ReceptionDoctor,
  ReceptionDoctorRow,
  ReceptionShift,
} from '../../../api/reception-api';
import { jsonResponse } from '../../../testing/fetch-routing';
import { ADMIN_SCHEDULE_PATH } from '../admin-schedule-paths';

// doctor F7: WA-02 (hộp Phân công), WA-03 (viPham[]), WA-04 (thành công), WA-05 (ô "+" điền sẵn), WA-06 (Gỡ ca), WA-15 (hộp thoại).
// Hôm nay = thứ Tư 14/10/2026 giờ VN (chỉ giả `Date`, timer thật để debounce "Xem trước" chạy).
const Q3 = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
const Q7 = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Quận 7' };
const TIM = { chuyenKhoaId: '5', ten: 'Tim mạch' };
const NHI = { chuyenKhoaId: '6', ten: 'Nhi khoa' };
const doctor = (
  id: string,
  hoTen: string,
  chuyenKhoa = TIM,
  chiNhanh = Q3,
  ngungHoatDong = false,
): ReceptionDoctor => ({
  bacSiId: id,
  hoTen,
  ngungHoatDong,
  chiNhanh,
  chuyenKhoa,
});
const A = doctor('11', 'ThS.BS. Nguyễn Minh Anh');
const B = doctor('12', 'BS. Lê Thảo Vy', NHI, Q7);
const C = doctor('13', 'BS. Nguyễn Văn Cường');
const INACTIVE = doctor('14', 'BS. Đã Nghỉ Việc', TIM, Q3, true);

const shift = (overrides: Partial<ReceptionShift>): ReceptionShift => ({
  lichLamViecId: '1',
  chiNhanh: Q3,
  ngay: '2026-10-14',
  ca: 'CaSang',
  batDau: '08:30',
  ketThuc: '11:30',
  gioCaKhongCon: false,
  nghiPhep: null,
  ...overrides,
});
const ROWS: ReceptionDoctorRow[] = [
  {
    ...A,
    ca: [
      shift({ lichLamViecId: '501', ngay: '2026-10-14', ca: 'CaSang' }),
      shift({ lichLamViecId: '500', ngay: '2026-10-12', ca: 'CaSang' }),
    ],
  },
  { ...B, ca: [] },
];

const fetchMock = vi.fn<typeof fetch>();
let api: ReturnType<typeof createFakeAuthApi>;
let scope: AdminMe;
let doctorList: ReceptionDoctor[];
let previewResponse: () => Response | Promise<Response>;
let assignResponse: (
  body: Record<string, unknown>,
) => Response | Promise<Response>;
let removeResponse: () => Response | Promise<Response>;

const PREVIEW_OK = { soCa: 2, soKhungGio: 12, tongSoViPham: 0, viPham: [] };
const ASSIGNED = {
  soCa: 2,
  soKhungGio: 12,
  theoBacSi: [{ bacSiId: '11', soCa: 2 }],
};

function callsTo(method: string, pathPart: string) {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      String(input).includes(pathPart) && (init?.method ?? 'GET') === method,
  );
}
const bodyOf = (call: Parameters<typeof fetch>) =>
  JSON.parse(String(call[1]?.body)) as Record<string, unknown>;

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi({
    vaiTro: 'QuanTriVien',
    hoTen: 'Admin CLINIX',
    daXacMinhEmail: true,
  });
  scope = { phamVi: 'ToanHeThong' };
  doctorList = [A, B, C, INACTIVE];
  previewResponse = () => jsonResponse(PREVIEW_OK);
  assignResponse = () => jsonResponse(ASSIGNED, 201);
  removeResponse = () => new Response(null, { status: 204 });
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    if (path.endsWith('/admin/me')) return Promise.resolve(jsonResponse(scope));
    if (path.endsWith('/admin/doctor-shifts/doctors'))
      return Promise.resolve(
        jsonResponse({
          items: doctorList,
          total: doctorList.length,
          page: 1,
          pageSize: 100,
        }),
      );
    if (path.endsWith('/admin/doctor-shifts/preview') && method === 'POST')
      return Promise.resolve(previewResponse());
    if (path.endsWith('/admin/doctor-shifts') && method === 'POST')
      return Promise.resolve(
        assignResponse(
          JSON.parse(String(init?.body)) as Record<string, unknown>,
        ),
      );
    if (/\/admin\/doctor-shifts\/\d+$/.test(path) && method === 'DELETE')
      return Promise.resolve(removeResponse());
    if (path.endsWith('/admin/doctor-shifts'))
      return Promise.resolve(
        jsonResponse({
          tuNgay: '',
          denNgay: '',
          items: ROWS,
          total: ROWS.length,
          page: 1,
          pageSize: 50,
        }),
      );
    return api.fetch(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderAdmin(adminScope: AdminMe = { phamVi: 'ToanHeThong' }) {
  scope = adminScope;
  api.startSession();
  await restoreSession();
  render(
    <RouterProvider
      router={createMemoryRouter(createAppRoutes(), {
        initialEntries: [ADMIN_SCHEDULE_PATH],
      })}
    />,
  );
  await screen.findByRole('table');
}

async function openDialog() {
  await renderAdmin();
  const button = await screen.findByRole('button', { name: 'Phân công ca' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  return screen.findByRole('dialog', { name: 'Phân công ca làm việc' });
}

// Số bác sĩ ở cột phải (tránh nhầm với "N bác sĩ" ở tiêu đề từng chuyên khoa bên trái)
const countBadge = (dialog: HTMLElement) =>
  within(dialog).getByText(/^\d+ bác sĩ$/, { selector: 'span.rounded-full' });
const pickDoctor = (dialog: HTMLElement, name: string) =>
  fireEvent.click(within(dialog).getByRole('checkbox', { name }));
const submitButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: /^Phân công$|Đang phân công/ });

function fillRule(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
    target: { value: '2026-10-20' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Đến ngày/), {
    target: { value: '2026-10-26' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'T2' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'T4' }));
  pickDoctor(dialog, 'ThS.BS. Nguyễn Minh Anh');
}

const waitForPreview = () =>
  vi.waitFor(
    () =>
      expect(
        callsTo('POST', '/admin/doctor-shifts/preview').length,
      ).toBeGreaterThan(0),
    { timeout: 3000 },
  );

describe('hộp Phân công (F7)', () => {
  it('WA-02 hộp mở trống: đủ trường theo Figma 516:2, "Sáng" mặc định, không có Ghi chú, "Xem trước" nhắc điền, nút Phân công vô hiệu', async () => {
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(
        'Chọn điều kiện và bác sĩ — hệ thống tạo quy tắc cho từng người.',
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText('Chi nhánh')).toHaveValue('all');
    expect(within(dialog).getByLabelText('Chuyên khoa')).toHaveValue('all');
    for (const label of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) {
      expect(
        within(dialog).getByRole('button', { name: label }),
      ).toHaveAttribute('aria-pressed', 'false');
    }
    expect(
      within(dialog).getByRole('button', { name: 'Sáng' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(dialog).getByRole('button', { name: 'Chiều' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(dialog).getByRole('button', { name: 'Cả ngày' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).queryByLabelText(/Ghi chú/)).toBeNull();
    expect(within(dialog).getByText('Chưa chọn bác sĩ nào')).toBeVisible();
    expect(countBadge(dialog)).toHaveTextContent('0 bác sĩ');
    expect(
      within(dialog).getByText('Điền đủ điều kiện và chọn ít nhất 1 bác sĩ'),
    ).toBeVisible();
    expect(submitButton(dialog)).toBeDisabled();
    // Bác sĩ ngừng hoạt động không có trong danh sách chọn (Q11)
    expect(
      within(dialog).queryByRole('checkbox', { name: 'BS. Đã Nghỉ Việc' }),
    ).toBeNull();
    // Danh sách theo chuyên khoa
    expect(
      within(dialog).getByRole('region', { name: 'Tim mạch' }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('region', { name: 'Nhi khoa' }),
    ).toBeVisible();
  });

  it('WA-02 chọn bác sĩ: cột phải đếm và liệt kê, bỏ được bằng ×; chưa đủ điều kiện thì không gọi "Xem trước"', async () => {
    const dialog = await openDialog();
    pickDoctor(dialog, 'ThS.BS. Nguyễn Minh Anh');
    pickDoctor(dialog, 'BS. Lê Thảo Vy');
    expect(countBadge(dialog)).toHaveTextContent('2 bác sĩ');
    const chosen = within(
      within(dialog).getByRole('list', { name: 'Bác sĩ đã chọn' }),
    );
    expect(chosen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Bỏ BS. Lê Thảo Vy' }),
    );
    expect(countBadge(dialog)).toHaveTextContent('1 bác sĩ');
    expect(
      within(dialog).getByRole('checkbox', { name: 'BS. Lê Thảo Vy' }),
    ).not.toBeChecked();
    expect(submitButton(dialog)).toBeDisabled();
    expect(callsTo('POST', '/preview')).toHaveLength(0);
  });

  it('WA-02 tìm không dấu: "nguyen" ra cả hai bác sĩ họ Nguyễn; lọc chuyên khoa thu hẹp; bác sĩ đã chọn không biến mất khỏi cột phải', async () => {
    const dialog = await openDialog();
    pickDoctor(dialog, 'BS. Lê Thảo Vy');
    fireEvent.change(
      within(dialog).getByRole('searchbox', { name: 'Tìm tên bác sĩ' }),
      { target: { value: 'nguyen' } },
    );
    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .map(
          (c) =>
            c.getAttribute('aria-label') ?? c.closest('label')?.textContent,
        ),
    ).toEqual(['ThS.BS. Nguyễn Minh Anh', 'BS. Nguyễn Văn Cường']);
    fireEvent.change(
      within(dialog).getByRole('searchbox', { name: 'Tìm tên bác sĩ' }),
      { target: { value: '' } },
    );
    fireEvent.change(within(dialog).getByLabelText('Chuyên khoa'), {
      target: { value: '5' },
    });
    expect(
      within(dialog).queryByRole('checkbox', { name: 'BS. Lê Thảo Vy' }),
    ).toBeNull();
    expect(countBadge(dialog)).toHaveTextContent('1 bác sĩ');
    expect(
      within(
        within(dialog).getByRole('list', { name: 'Bác sĩ đã chọn' }),
      ).getByText('BS. Lê Thảo Vy'),
    ).toBeVisible();
    // Lọc theo chi nhánh (Toàn hệ thống)
    fireEvent.change(within(dialog).getByLabelText('Chuyên khoa'), {
      target: { value: 'all' },
    });
    fireEvent.change(within(dialog).getByLabelText('Chi nhánh'), {
      target: { value: '2' },
    });
    expect(
      within(dialog).queryByRole('checkbox', {
        name: 'ThS.BS. Nguyễn Minh Anh',
      }),
    ).toBeNull();
    expect(
      within(dialog).getByRole('checkbox', { name: 'BS. Lê Thảo Vy' }),
    ).toBeInTheDocument();
  });

  it('WA-02 tối đa 20 bác sĩ: đủ 20 thì các ô còn lại bị khoá và có câu giải thích', async () => {
    doctorList = Array.from({ length: 22 }, (_, i) =>
      doctor(String(100 + i), `BS. Số ${String(i + 1).padStart(2, '0')}`),
    );
    const dialog = await openDialog();
    for (let i = 1; i <= 20; i += 1)
      pickDoctor(dialog, `BS. Số ${String(i).padStart(2, '0')}`);
    expect(countBadge(dialog)).toHaveTextContent('20 bác sĩ');
    expect(
      within(dialog).getByRole('checkbox', { name: 'BS. Số 21' }),
    ).toBeDisabled();
    expect(within(dialog).getByText('Tối đa 20 bác sĩ mỗi lần.')).toBeVisible();
    pickDoctor(dialog, 'BS. Số 20'); // bỏ một người ⇒ chọn lại được
    expect(
      within(dialog).getByRole('checkbox', { name: 'BS. Số 21' }),
    ).toBeEnabled();
  });

  it('WA-02 ngày: quá khứ, đảo ngày, quá 92 ngày báo dưới đúng ô và nút Phân công vô hiệu', async () => {
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
      target: { value: '2026-10-13' },
    });
    expect(
      within(dialog).getByText('Không thể phân công vào ngày đã qua.'),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
      target: { value: '2026-10-20' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Đến ngày/), {
      target: { value: '2026-10-19' },
    });
    expect(
      within(dialog).getByText(
        'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
      ),
    ).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText(/Đến ngày/), {
      target: { value: '2027-02-01' },
    });
    expect(
      within(dialog).getByText('Khoảng ngày tối đa 92 ngày.'),
    ).toBeVisible();
    expect(submitButton(dialog)).toBeDisabled();
  });

  it('WA-02 đủ điều kiện: gọi "Xem trước" sau khi ngừng thao tác, thân đúng; hiện "Sẽ tạo N ca (M khung giờ)"; nút Phân công bật', async () => {
    const dialog = await openDialog();
    fillRule(dialog);
    await waitForPreview();
    expect(
      bodyOf(callsTo('POST', '/preview')[0] as Parameters<typeof fetch>),
    ).toEqual({
      bacSiIds: ['11'],
      tuNgay: '2026-10-20',
      denNgay: '2026-10-26',
      thuTrongTuan: [1, 3],
      cas: ['CaSang'],
    });
    expect(await within(dialog).findByText(/Sẽ tạo/)).toHaveTextContent(
      'Sẽ tạo 2 ca (12 khung giờ) cho 1 bác sĩ.',
    );
    expect(submitButton(dialog)).toBeEnabled();
    // Đổi ca sang "Cả ngày" ⇒ gọi lại với hai ca
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cả ngày' }));
    await vi.waitFor(
      () =>
        expect(
          bodyOf(callsTo('POST', '/preview').at(-1) as Parameters<typeof fetch>)
            .cas,
        ).toEqual(['CaSang', 'CaChieu']),
      { timeout: 3000 },
    );
  });

  it('WA-03 "Xem trước" có vi phạm: liệt kê theo bác sĩ/ngày/ca với câu theo mã, nút Phân công vô hiệu', async () => {
    previewResponse = () =>
      jsonResponse({
        soCa: 4,
        soKhungGio: 12,
        tongSoViPham: 2,
        viPham: [
          {
            bacSiId: '11',
            ngay: '2026-10-20',
            ca: 'CaSang',
            maLoi: 'CA_DA_PHAN_CONG',
            chiTiet: { thuTrongTuan: 2 },
          },
          {
            bacSiId: '11',
            ngay: '2026-10-25',
            ca: 'CaChieu',
            maLoi: 'CHI_NHANH_NGHI',
            chiTiet: { thuTrongTuan: 7 },
          },
        ],
      });
    const dialog = await openDialog();
    fillRule(dialog);
    const list = await within(dialog).findByRole(
      'list',
      { name: 'Ca không phân công được' },
      { timeout: 3000 },
    );
    const items = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual([
      'ThS.BS. Nguyễn Minh Anh · Thứ 3, 20/10/2026 · Ca sáng: Bác sĩ đã có ca này trong ngày đó.',
      'ThS.BS. Nguyễn Minh Anh · Chủ nhật, 25/10/2026 · Ca chiều: Chi nhánh nghỉ vào Chủ nhật.',
    ]);
    expect(within(dialog).getByText(/Sẽ tạo/)).toHaveTextContent(
      'Sẽ tạo 2 ca (12 khung giờ)',
    );
    expect(submitButton(dialog)).toBeDisabled();
  });

  it('WA-04 phân công thành công: gửi đúng thân, đóng hộp, toast, tải lại lưới, focus về nút "Phân công ca"', async () => {
    const dialog = await openDialog();
    fillRule(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cả ngày' }));
    await within(dialog).findByText(/Sẽ tạo/, undefined, { timeout: 3000 });
    const gridCallsBefore = callsTo('GET', '/admin/doctor-shifts').filter(
      ([input]) => !String(input).includes('/doctors'),
    ).length;
    await waitFor(() => expect(submitButton(dialog)).toBeEnabled());
    fireEvent.click(submitButton(dialog));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      bodyOf(
        callsTo('POST', '/admin/doctor-shifts').filter(
          ([input]) => !String(input).includes('/preview'),
        )[0] as Parameters<typeof fetch>,
      ),
    ).toEqual({
      bacSiIds: ['11'],
      tuNgay: '2026-10-20',
      denNgay: '2026-10-26',
      thuTrongTuan: [1, 3],
      cas: ['CaSang', 'CaChieu'],
    });
    expect(
      await screen.findByText('Đã phân công 2 ca làm việc.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        callsTo('GET', '/admin/doctor-shifts').filter(
          ([input]) => !String(input).includes('/doctors'),
        ).length,
      ).toBeGreaterThan(gridCallsBefore),
    );
    expect(screen.getByRole('button', { name: 'Phân công ca' })).toHaveFocus();
  });

  it('WA-03 phân công bị 409 kèm viPham[]: giữ hộp và dữ liệu, báo "chưa ca nào được ghi", liệt kê vi phạm, "… và N ca khác"', async () => {
    assignResponse = () =>
      jsonResponse(
        {
          maLoi: 'CA_KHONG_TON_TAI',
          thongBao: 'thân thô',
          chiTiet: {
            tongSoViPham: 52,
            viPham: [
              {
                bacSiId: '11',
                ngay: '2026-10-24',
                ca: 'CaSang',
                maLoi: 'CA_KHONG_TON_TAI',
                chiTiet: {
                  thuTrongTuan: 6,
                  khoang: { sang: { tu: '08:00', den: '12:00' }, chieu: null },
                },
              },
              {
                bacSiId: '11',
                ngay: '2026-10-12',
                ca: 'CaSang',
                maLoi: 'NGAY_PHAN_CONG_DA_QUA',
                chiTiet: { thuTrongTuan: 1 },
              },
            ],
          },
        },
        409,
      );
    const dialog = await openDialog();
    fillRule(dialog);
    await within(dialog).findByText(/Sẽ tạo/, undefined, { timeout: 3000 });
    fireEvent.click(submitButton(dialog));

    const alert = await within(dialog).findByRole(
      'alert',
      {},
      { timeout: 3000 },
    );
    expect(alert).toHaveTextContent('chưa ca nào được ghi');
    const items = within(
      within(alert).getByRole('list', { name: 'Ca không phân công được' }),
    )
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toBe(
      'ThS.BS. Nguyễn Minh Anh · Thứ 7, 24/10/2026 · Ca sáng: Chi nhánh không nhận khám ca này vào Thứ 7 (giờ nhận khám: sáng 08:00–12:00).',
    );
    expect(items[1]).toContain('Không thể phân công vào ngày đã qua.');
    expect(alert).toHaveTextContent('… và 50 ca khác.');
    expect(alert.textContent).not.toContain('thân thô');
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue('2026-10-20');
    expect(
      within(dialog).getByRole('checkbox', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    ).toBeChecked();
    expect(screen.getByRole('dialog')).toBeVisible();
    // Sửa quy tắc thì lỗi cũ biến mất
    fireEvent.click(within(dialog).getByRole('button', { name: 'T5' }));
    expect(within(dialog).queryByText(/chưa ca nào được ghi/)).toBeNull();
  });

  it.each([
    ['QUA_NHIEU_CA', 400, 'Quá nhiều ca'],
    [
      'BAC_SI_KHONG_PHAN_CONG_DUOC',
      409,
      'Tài khoản bác sĩ đang ngừng hoạt động.',
    ],
    ['KHONG_TIM_THAY', 404, 'ngoài phạm vi'],
    ['LOI_HE_THONG', 500, 'Đã có lỗi xảy ra'],
  ])('WA-03 lỗi %s: câu theo mã, hộp vẫn mở', async (maLoi, status, text) => {
    assignResponse = () => jsonResponse({ maLoi, thongBao: 'x' }, status);
    const dialog = await openDialog();
    fillRule(dialog);
    await within(dialog).findByText(/Sẽ tạo/, undefined, { timeout: 3000 });
    fireEvent.click(submitButton(dialog));
    expect(
      await within(dialog).findByRole('alert', {}, { timeout: 3000 }),
    ).toHaveTextContent(text);
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('mất mạng khi phân công: câu "chưa rõ đã ghi chưa", giữ dữ liệu', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) =>
      String(input).endsWith('/admin/doctor-shifts') && init?.method === 'POST'
        ? Promise.reject(new TypeError('x'))
        : original(input, init),
    );
    const dialog = await openDialog();
    fillRule(dialog);
    await within(dialog).findByText(/Sẽ tạo/, undefined, { timeout: 3000 });
    fireEvent.click(submitButton(dialog));
    expect(
      await within(dialog).findByRole('alert', {}, { timeout: 3000 }),
    ).toHaveTextContent('Chưa rõ việc phân công đã được ghi chưa');
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue('2026-10-20');
  });

  it('WA-04 bấm Phân công đúp: chỉ MỘT yêu cầu; đang gửi thì Esc không đóng hộp', async () => {
    let release: (value: Response) => void = () => undefined;
    assignResponse = () =>
      new Promise<Response>((resolve) => (release = resolve));
    const dialog = await openDialog();
    fillRule(dialog);
    await within(dialog).findByText(/Sẽ tạo/, undefined, { timeout: 3000 });
    fireEvent.click(submitButton(dialog));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Đang phân công…' }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(
      callsTo('POST', '/admin/doctor-shifts').filter(
        ([input]) => !String(input).includes('/preview'),
      ),
    ).toHaveLength(1);
    release(jsonResponse(ASSIGNED, 201));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('WA-05 bấm ô "+": hộp mở điền sẵn bác sĩ, đúng ngày, đúng thứ và ca của ô; "Xem trước" chạy; Hủy trả focus về ô', async () => {
    await renderAdmin();
    const plus = await screen.findByRole('button', {
      name: /Phân công ca: BS\. Lê Thảo Vy, Ca chiều, Thứ 3, 13\/10\/2026/,
    });
    expect(plus).toHaveTextContent('+');
    plus.focus();
    fireEvent.click(plus);
    const dialog = await screen.findByRole('dialog', {
      name: 'Phân công ca làm việc',
    });
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue('2026-10-13');
    expect(within(dialog).getByLabelText(/Đến ngày/)).toHaveValue('2026-10-13');
    expect(within(dialog).getByRole('button', { name: 'T3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByRole('button', { name: 'T2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Chiều' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(dialog).getByRole('checkbox', { name: 'BS. Lê Thảo Vy' }),
    ).toBeChecked();
    // Ngày 13/10 đã qua so với hôm nay 14/10 ⇒ lỗi dưới ô, nút Phân công vô hiệu (server cũng chặn)
    expect(
      within(dialog).getByText('Không thể phân công vào ngày đã qua.'),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(plus).toHaveFocus();
  });

  it('WA-05 ô "+" của ngày hợp lệ điền sẵn đủ và gọi "Xem trước" ngay', async () => {
    await renderAdmin();
    const plus = await screen.findByRole('button', {
      name: /Phân công ca: BS\. Lê Thảo Vy, Ca sáng, Thứ 4, 14\/10\/2026/,
    });
    fireEvent.click(plus);
    const dialog = await screen.findByRole('dialog', {
      name: 'Phân công ca làm việc',
    });
    await waitForPreview();
    expect(
      bodyOf(callsTo('POST', '/preview')[0] as Parameters<typeof fetch>),
    ).toEqual({
      bacSiIds: ['12'],
      tuNgay: '2026-10-14',
      denNgay: '2026-10-14',
      thuTrongTuan: [3],
      cas: ['CaSang'],
    });
    expect(await within(dialog).findByText(/Sẽ tạo/)).toBeVisible();
  });

  it('WA-15 hộp thoại: có tên truy cập, aria-modal, focus vào "Từ ngày" khi mở, Esc đóng và trả focus, nền inert', async () => {
    const dialog = await openDialog();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveFocus();
    expect(
      screen
        .getByRole('complementary', { name: 'Điều hướng Admin' })
        .closest('[inert]'),
    ).not.toBeNull();
    for (const button of within(dialog).getAllByRole('button'))
      expect(button).toHaveAccessibleName();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Phân công ca' })).toHaveFocus();
  });

  it('Admin Chi nhánh: ô Chi nhánh cố định (vô hiệu) ghi chi nhánh của mình', async () => {
    await renderAdmin({
      phamVi: 'ChiNhanh',
      chiNhanh: { id: '1', ten: 'CLINIX Chi nhánh Quận 3' },
    });
    const button = await screen.findByRole('button', { name: 'Phân công ca' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', {
      name: 'Phân công ca làm việc',
    });
    const select = within(dialog).getByLabelText('Chi nhánh');
    expect(select).toBeDisabled();
    expect(select).toHaveDisplayValue('CLINIX Chi nhánh Quận 3');
  });
});

describe('Gỡ ca (F7, WA-06)', () => {
  async function openShift() {
    await renderAdmin();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /ThS\.BS\. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026, Làm việc/,
      }),
    );
    return screen.findByRole('dialog', { name: 'ThS.BS. Nguyễn Minh Anh' });
  }

  it('WA-06 Gỡ ca: hỏi xác nhận, DELETE đúng id, đóng ngăn kéo, toast, tải lại lưới', async () => {
    const drawer = await openShift();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Gỡ ca' }));
    const confirm = within(drawer).getByRole('group', {
      name: 'Xác nhận gỡ ca',
    });
    expect(confirm).toHaveTextContent('Thao tác không thể hoàn tác');
    expect(callsTo('DELETE', '/admin/doctor-shifts/')).toHaveLength(0);
    const before = callsTo('GET', '/admin/doctor-shifts').filter(
      ([input]) => !String(input).includes('/doctors'),
    ).length;
    fireEvent.click(within(confirm).getByRole('button', { name: 'Gỡ ca' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(callsTo('DELETE', '/admin/doctor-shifts/501')).toHaveLength(1);
    expect(await screen.findByText('Đã gỡ ca làm việc.')).toBeVisible();
    await waitFor(() =>
      expect(
        callsTo('GET', '/admin/doctor-shifts').filter(
          ([input]) => !String(input).includes('/doctors'),
        ).length,
      ).toBeGreaterThan(before),
    );
  });

  it('WA-06 "Hủy" ở bước xác nhận: không gọi DELETE, về nút "Gỡ ca"', async () => {
    const drawer = await openShift();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Gỡ ca' }));
    fireEvent.click(
      within(
        within(drawer).getByRole('group', { name: 'Xác nhận gỡ ca' }),
      ).getByRole('button', { name: 'Hủy' }),
    );
    expect(
      within(drawer).queryByRole('group', { name: 'Xác nhận gỡ ca' }),
    ).toBeNull();
    expect(within(drawer).getByRole('button', { name: 'Gỡ ca' })).toBeVisible();
    expect(callsTo('DELETE', '/admin/doctor-shifts/')).toHaveLength(0);
  });

  it('WA-06 CA_DANG_CO_LICH_HEN: giải thích ngay trong ngăn kéo, ngăn kéo vẫn mở, ca còn đó', async () => {
    removeResponse = () =>
      jsonResponse({ maLoi: 'CA_DANG_CO_LICH_HEN', thongBao: 'thân thô' }, 409);
    const drawer = await openShift();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Gỡ ca' }));
    fireEvent.click(
      within(
        within(drawer).getByRole('group', { name: 'Xác nhận gỡ ca' }),
      ).getByRole('button', { name: 'Gỡ ca' }),
    );
    const alert = await within(drawer).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Ca đã có khung giờ được đặt hoặc từng có lịch hẹn nên không gỡ được.',
    );
    expect(alert.textContent).not.toContain('thân thô');
    expect(
      screen.getByRole('dialog', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    ).toBeVisible();
    expect(screen.queryByText('Đã gỡ ca làm việc.')).toBeNull();
  });

  it('WA-06 ca đã không còn (404): đóng ngăn kéo và tải lại lưới, không báo lỗi', async () => {
    removeResponse = () =>
      jsonResponse({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404);
    const drawer = await openShift();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Gỡ ca' }));
    fireEvent.click(
      within(
        within(drawer).getByRole('group', { name: 'Xác nhận gỡ ca' }),
      ).getByRole('button', { name: 'Gỡ ca' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Đã gỡ ca làm việc.')).toBeNull();
  });

  it('WA-06 ca đã qua (12/10): không có nút "Gỡ ca" (server cũng chặn CA_DA_QUA)', async () => {
    await renderAdmin();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /ThS\.BS\. Nguyễn Minh Anh, Ca sáng, Thứ 2, 12\/10\/2026, Làm việc/,
      }),
    );
    const drawer = await screen.findByRole('dialog', {
      name: 'ThS.BS. Nguyễn Minh Anh',
    });
    expect(within(drawer).queryByRole('button', { name: 'Gỡ ca' })).toBeNull();
  });
});
