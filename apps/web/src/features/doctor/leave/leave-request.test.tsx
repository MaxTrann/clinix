import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { fillDate } from '../../../test/fill-date';
import { DoctorSchedulePage } from '../schedule/doctor-schedule-page';
import type { LeaveRequest } from '../api/leave-api';
import { jsonResponse } from '../testing/fetch-routing';
import { SEND_UNCERTAIN_MESSAGE } from './leave-errors';
import { LEAVE_CREATED_MESSAGE } from './leave-toast';

// doctor F4: WN-01…WN-10 (PLAN doctor mục 7.12). Hôm nay = thứ Tư 14/10/2026 giờ VN (chỉ giả `Date`, timer thật).
const fetchMock = vi.fn<typeof fetch>();
let history: { items: LeaveRequest[]; total: number };
let createHandler: (
  body: Record<string, unknown>,
) => Response | Promise<Response>;

const EMPTY_SCHEDULE = { tuNgay: '', denNgay: '', ca: [], chiNhanhLoc: [] };

function leave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    yeuCauNghiPhepId: '1',
    trangThai: 'ChoDuyet',
    hinhThuc: 'TheoCa',
    tuNgay: '2026-10-26',
    denNgay: '2026-10-26',
    ca: 'CaSang',
    lyDo: 'Việc gia đình',
    thoiDiemTao: '2026-10-17T17:06:06Z',
    thoiDiemXuLy: null,
    ...overrides,
  };
}

function apiError(status: number, maLoi: string, extra: object = {}) {
  return jsonResponse({ maLoi, thongBao: 'x', ...extra }, status);
}

const CREATED = {
  yeuCauNghiPhepId: '1',
  trangThai: 'ChoDuyet',
  hinhThuc: 'TheoCa',
  tuNgay: '2026-10-26',
  denNgay: '2026-10-26',
  ca: 'CaSang',
  soCaBiAnhHuong: 1,
};

function calls(method: string, pathPart: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    return (
      String(input).includes(pathPart) && (init?.method ?? 'GET') === method
    );
  });
}

beforeEach(() => {
  history = { items: [], total: 0 };
  createHandler = () => jsonResponse(CREATED, 201);
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/doctor/schedule'))
      return Promise.resolve(jsonResponse(EMPTY_SCHEDULE));
    if (url.includes('/doctor/leave-requests') && method === 'POST') {
      return Promise.resolve(
        createHandler(
          JSON.parse(String(init?.body)) as Record<string, unknown>,
        ),
      );
    }
    const params = new URL(url, 'http://localhost').searchParams;
    return Promise.resolve(
      jsonResponse({
        ...history,
        page: Number(params.get('page') ?? 1),
        pageSize: 5,
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openDialog() {
  render(<DoctorSchedulePage />);
  await screen.findByText('Tuần này bạn chưa có ca làm việc nào.');
  fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu nghỉ' }));
  return screen.findByRole('dialog', { name: 'Yêu cầu nghỉ lịch làm việc' });
}

function fillReason(dialog: HTMLElement, text = 'Việc gia đình') {
  fireEvent.change(within(dialog).getByLabelText(/Lý do/), {
    target: { value: text },
  });
}

function fillAllDay(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
    target: { value: '2026-10-26' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Đến ngày/), {
    target: { value: '2026-10-28' },
  });
  fillReason(dialog);
}

function chooseShiftKind(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/Loại nghỉ/), {
    target: { value: 'TheoCa' },
  });
}

// UX7: "Theo ca" là khoảng ngày + MỘT ca. Mặc định Từ ngày = Đến ngày = 26/10 (một ngày); truyền `to` để chọn nhiều ngày.
function fillByShift(dialog: HTMLElement, to = '2026-10-26') {
  chooseShiftKind(dialog);
  fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
    target: { value: '2026-10-26' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Đến ngày/), {
    target: { value: to },
  });
  fireEvent.change(within(dialog).getByLabelText(/^Ca/), {
    target: { value: 'CaSang' },
  });
  fillReason(dialog);
}

const submit = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }));

describe('gửi yêu cầu nghỉ (F4)', () => {
  it('WN-01 "Cả ngày": gửi đúng thân (không có ca), đóng hộp, toast, tải lại lịch sử và lịch', async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByLabelText(/Loại nghỉ/)).toHaveValue('CaNgay');
    fillAllDay(dialog);
    submit(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('POST', '/doctor/leave-requests')).toHaveLength(1);
    const body = JSON.parse(
      String(calls('POST', '/doctor/leave-requests')[0][1]?.body),
    );
    expect(body).toEqual({
      hinhThuc: 'CaNgay',
      tuNgay: '2026-10-26',
      denNgay: '2026-10-28',
      lyDo: 'Việc gia đình',
    });
    expect(screen.getByRole('status')).toHaveTextContent(LEAVE_CREATED_MESSAGE);
    // Lịch sử và lịch đều được tải lại (lần mở trang + lần sau khi gửi)
    await waitFor(() =>
      expect(calls('GET', '/doctor/leave-requests')).toHaveLength(2),
    );
    expect(calls('GET', '/doctor/schedule')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Yêu cầu nghỉ' })).toHaveFocus();
  });

  // UX7 (đổi WN-02): trước đây test này khẳng định "Theo ca": một ngày + ca, KHÔNG có ô "Đến ngày", thân có denNgay = tuNgay; nay có cả Từ ngày, Đến ngày và Ca.
  it('DUX7-38 WN-02 (đổi) "Theo ca" một ngày: Từ ngày = Đến ngày, thân có denNgay = tuNgay và ca', async () => {
    const dialog = await openDialog();
    chooseShiftKind(dialog);
    expect(within(dialog).getByLabelText(/Đến ngày/)).toBeVisible();
    fillByShift(dialog);
    submit(dialog);

    await waitFor(() =>
      expect(calls('POST', '/doctor/leave-requests')).toHaveLength(1),
    );
    const body = JSON.parse(
      String(calls('POST', '/doctor/leave-requests')[0][1]?.body),
    );
    expect(body).toEqual({
      hinhThuc: 'TheoCa',
      tuNgay: '2026-10-26',
      denNgay: '2026-10-26',
      ca: 'CaSang',
      lyDo: 'Việc gia đình',
    });
  });

  it('WN-02 đổi từ "Theo ca" về "Cả ngày": ca đã chọn bị bỏ, không gửi nhầm', async () => {
    const dialog = await openDialog();
    fillByShift(dialog);
    fireEvent.change(within(dialog).getByLabelText(/Loại nghỉ/), {
      target: { value: 'CaNgay' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
      target: { value: '2026-10-26' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Đến ngày/), {
      target: { value: '2026-10-27' },
    });
    submit(dialog);

    await waitFor(() =>
      expect(calls('POST', '/doctor/leave-requests')).toHaveLength(1),
    );
    const body = JSON.parse(
      String(calls('POST', '/doctor/leave-requests')[0][1]?.body),
    );
    expect(body).not.toHaveProperty('ca');
    expect(body.hinhThuc).toBe('CaNgay');
  });

  it('WN-03 kiểm ở máy: thiếu ngày/ca/lý do, ngày quá khứ, đảo ngày ⇒ lỗi dưới đúng ô, KHÔNG gọi API', async () => {
    const dialog = await openDialog();
    submit(dialog);
    expect(within(dialog).getAllByText('Vui lòng chọn ngày.')).toHaveLength(2);
    expect(
      within(dialog).getByText('Vui lòng nhập lý do (từ 2 đến 500 ký tự).'),
    ).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
      target: { value: '2026-10-13' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Đến ngày/), {
      target: { value: '2026-10-12' },
    });
    fillReason(dialog, ' x ');
    submit(dialog);
    expect(
      within(dialog).getByText('Không thể xin nghỉ cho ngày đã qua.'),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    chooseShiftKind(dialog);
    submit(dialog);
    expect(within(dialog).getByText('Vui lòng chọn ca.')).toBeVisible();
    expect(calls('POST', '/doctor/leave-requests')).toHaveLength(0);
  });

  it('WN-01 UX1-77 gõ ngày bằng bàn phím dd/mm/yyyy ("24112026" ra "24/11/2026"): thân gửi lên vẫn là ISO `YYYY-MM-DD`', async () => {
    const dialog = await openDialog();
    fillDate(within(dialog).getByLabelText(/Từ ngày/), '24112026');
    fillDate(within(dialog).getByLabelText(/Đến ngày/), '25112026');
    fillReason(dialog);

    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue('24/11/2026');
    expect(within(dialog).getByLabelText(/Đến ngày/)).toHaveValue('25/11/2026');
    submit(dialog);

    await waitFor(() =>
      expect(calls('POST', '/doctor/leave-requests')).toHaveLength(1),
    );
    const body = JSON.parse(
      String(calls('POST', '/doctor/leave-requests')[0][1]?.body),
    );
    expect(body).toMatchObject({
      hinhThuc: 'CaNgay',
      tuNgay: '2026-11-24',
      denNgay: '2026-11-25',
    });
  });

  it('WN-03 UX1-78 ngày không tồn tại (31/02/2026): ô báo "Ngày không tồn tại." và form báo "Vui lòng chọn ngày.", KHÔNG gọi API', async () => {
    const dialog = await openDialog();
    fillDate(within(dialog).getByLabelText(/Từ ngày/), '31022026');
    fillDate(within(dialog).getByLabelText(/Đến ngày/), '25112026');
    fillReason(dialog);

    expect(within(dialog).getByText('Ngày không tồn tại.')).toBeVisible();
    submit(dialog);

    expect(within(dialog).getByText('Vui lòng chọn ngày.')).toBeVisible();
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(calls('POST', '/doctor/leave-requests')).toHaveLength(0);
  });

  it('WN-03 lỗi 400 `loi[]` của server: hiện dưới đúng ô, giữ dữ liệu, hộp vẫn mở', async () => {
    createHandler = () =>
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [
          { truong: 'lyDo', ma: 'LY_DO_KHONG_HOP_LE' },
          { truong: 'denNgay', ma: 'KHOANG_NGAY_KHONG_HOP_LE' },
        ],
      });
    const dialog = await openDialog();
    fillAllDay(dialog);
    submit(dialog);

    expect(
      await within(dialog).findByText(
        'Vui lòng nhập lý do (từ 2 đến 500 ký tự).',
      ),
    ).toBeVisible();
    // UX7 (đổi): trước đây "Nghỉ theo ca chỉ chọn một ngày." (mã NGHI_THEO_CA_CHI_MOT_NGAY đã bỏ)
    expect(
      within(dialog).getByText(
        'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(/Lý do/)).toHaveValue('Việc gia đình');
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue('26/10/2026');
  });

  it('WN-04 thành công: dòng lịch sử "26/10 Theo ca · Ca sáng", lý do và chip "Chờ duyệt"', async () => {
    createHandler = () => {
      history = { items: [leave()], total: 1 };
      return jsonResponse(CREATED, 201);
    };
    const dialog = await openDialog();
    fillByShift(dialog);
    submit(dialog);

    const row = await screen.findByRole('button', {
      name: /26\/10.*Theo ca/,
    });
    expect(row).toHaveTextContent('26/10');
    expect(row).toHaveTextContent('Theo ca · Ca sáng');
    expect(row).toHaveTextContent('Việc gia đình');
    expect(row).toHaveTextContent('Chờ duyệt');
    expect(screen.getByText('1 yêu cầu')).toBeVisible();
  });

  it('WN-05 bấm gửi đúp khi đang chờ: chỉ MỘT yêu cầu, nút khoá và báo "Đang gửi…"', async () => {
    let release: (value: Response) => void = () => undefined;
    createHandler = () =>
      new Promise<Response>((resolve) => (release = resolve));
    const dialog = await openDialog();
    fillAllDay(dialog);
    const button = within(dialog).getByRole('button', { name: 'Gửi yêu cầu' });
    fireEvent.click(button);
    fireEvent.submit(
      within(dialog)
        .getByRole('button', { name: 'Đang gửi…' })
        .closest('form')!,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đang gửi…' }));

    expect(calls('POST', '/doctor/leave-requests')).toHaveLength(1);
    expect(
      within(dialog).getByRole('button', { name: 'Đang gửi…' }),
    ).toBeDisabled();
    // Đang gửi thì Esc không đóng hộp
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeVisible();
    release(jsonResponse(CREATED, 201));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('POST', '/doctor/leave-requests')).toHaveLength(1);
  });

  it.each([
    ['YEU_CAU_NGHI_TRUNG', 'Bạn đã có yêu cầu nghỉ trùng thời gian này.'],
    [
      'NGHI_NGOAI_LICH_LAM_VIEC',
      'Ngày/ca xin nghỉ không có trong lịch làm việc đã phân công của bạn.',
    ],
    ['NGAY_NGHI_DA_QUA', 'Không thể xin nghỉ cho ngày đã qua.'],
    ['QUA_NHIEU_YEU_CAU_CHO_DUYET', 'Bạn đang có quá nhiều yêu cầu chờ duyệt.'],
    ['KHOANG_NGHI_QUA_DAI', 'Khoảng nghỉ tối đa 31 ngày.'],
    ['NGHI_QUA_XA', 'Chỉ xin nghỉ trong 90 ngày tới.'],
    ['CA_DA_KET_THUC', 'Ca này đã kết thúc trong hôm nay.'],
  ])(
    'WN-06 409 %s: dải cảnh báo đúng câu, dữ liệu được giữ, gửi lại được',
    async (maLoi, message) => {
      createHandler = () => apiError(409, maLoi);
      const dialog = await openDialog();
      fillAllDay(dialog);
      submit(dialog);

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        message,
      );
      expect(within(dialog).getByLabelText(/Lý do/)).toHaveValue(
        'Việc gia đình',
      );
      expect(
        within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }),
      ).toBeEnabled();
      // Không lộ thân thô của server
      expect(dialog.textContent).not.toMatch(/\bx\b.*\bx\b/);
    },
  );

  it('WN-06 lỗi 500 lạ: câu chung, không lộ chi tiết', async () => {
    createHandler = () => apiError(500, 'LOI_HE_THONG');
    const dialog = await openDialog();
    fillAllDay(dialog);
    submit(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra',
    );
  });

  it('WN-10 mất mạng khi gửi: giữ dữ liệu form, báo chưa rõ đã gửi chưa và nhắc xem lịch sử; sau đó gửi lại được', async () => {
    let first = true;
    createHandler = () => jsonResponse(CREATED, 201);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => {
      if (first && (init?.method ?? 'GET') === 'POST') {
        first = false;
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return original(input, init);
    });
    const dialog = await openDialog();
    fillAllDay(dialog);
    submit(dialog);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      SEND_UNCERTAIN_MESSAGE,
    );
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue('26/10/2026');
    expect(within(dialog).getByLabelText(/Đến ngày/)).toHaveValue('28/10/2026');
    expect(within(dialog).getByLabelText(/Lý do/)).toHaveValue('Việc gia đình');

    submit(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Hủy và nút × đóng hộp không gửi gì; focus về nút "Yêu cầu nghỉ"', async () => {
    const dialog = await openDialog();
    fillAllDay(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls('POST', '/doctor/leave-requests')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Yêu cầu nghỉ' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu nghỉ' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Đóng hộp thoại' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// Doctor UX7 (issue #582): "Theo ca" cho khoảng nhiều ngày + MỘT ca; Admin duyệt một lần.
describe('"Theo ca" nhiều ngày (UX7)', () => {
  it('DUX7-39 nhãn "Theo ca (một hoặc nhiều ngày)" thay "Theo ca (một ngày)"; hai ô ngày và ô Ca cùng hiện, "Ca" ở hàng riêng bên dưới', async () => {
    const dialog = await openDialog();
    const kind = within(dialog).getByLabelText(/Loại nghỉ/);
    expect(
      within(kind).getByRole('option', {
        name: 'Theo ca (một hoặc nhiều ngày)',
      }),
    ).toBeVisible();
    expect(
      within(kind).queryByRole('option', { name: /một ngày\)/ }),
    ).toBeNull();
    expect(
      within(kind).getByRole('option', {
        name: 'Cả ngày (có thể nhiều ngày)',
      }),
    ).toBeVisible();
    // "Cả ngày" không có ô Ca; "Theo ca" có
    expect(within(dialog).queryByLabelText(/^Ca/)).toBeNull();
    chooseShiftKind(dialog);
    const from = within(dialog).getByLabelText(/Từ ngày/);
    const to = within(dialog).getByLabelText(/Đến ngày/);
    const shift = within(dialog).getByLabelText(/^Ca/);
    // Thứ tự tài liệu (và thứ tự Tab): Loại, Từ ngày, Đến ngày, Ca, Lý do
    const order = [
      within(dialog).getByLabelText(/Loại nghỉ/),
      from,
      to,
      shift,
      within(dialog).getByLabelText(/Lý do/),
    ];
    for (let i = 1; i < order.length; i += 1)
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });

  it('DUX7-41 gõ tay Từ ngày và Đến ngày (dd/mm/yyyy) ở "Theo ca": thân gửi lên là ISO, khoảng nhiều ngày kèm ca', async () => {
    const dialog = await openDialog();
    chooseShiftKind(dialog);
    fillDate(within(dialog).getByLabelText(/Từ ngày/), '24112026');
    fillDate(within(dialog).getByLabelText(/Đến ngày/), '28112026');
    fireEvent.change(within(dialog).getByLabelText(/^Ca/), {
      target: { value: 'CaChieu' },
    });
    fillReason(dialog);
    submit(dialog);

    await waitFor(() =>
      expect(calls('POST', '/doctor/leave-requests')).toHaveLength(1),
    );
    expect(
      JSON.parse(String(calls('POST', '/doctor/leave-requests')[0][1]?.body)),
    ).toEqual({
      hinhThuc: 'TheoCa',
      tuNgay: '2026-11-24',
      denNgay: '2026-11-28',
      ca: 'CaChieu',
      lyDo: 'Việc gia đình',
    });
  });

  it('DUX7-42 kiểm ở máy: thiếu Đến ngày, đảo ngày, thiếu ca, thiếu lý do ⇒ lỗi dưới đúng ô, KHÔNG gọi API', async () => {
    const dialog = await openDialog();
    chooseShiftKind(dialog);
    fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
      target: { value: '2026-10-26' },
    });
    submit(dialog);
    expect(within(dialog).getByText('Vui lòng chọn ngày.')).toBeVisible(); // đúng MỘT chỗ: dưới Đến ngày
    expect(within(dialog).getByLabelText(/Đến ngày/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(within(dialog).getByText('Vui lòng chọn ca.')).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText(/Đến ngày/), {
      target: { value: '2026-10-25' },
    });
    submit(dialog);
    expect(
      within(dialog).getByText(
        'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
      ),
    ).toBeVisible();
    expect(calls('POST', '/doctor/leave-requests')).toHaveLength(0);
  });

  it('DUX7-43 đổi loại nghỉ giữ nguyên Từ ngày và Đến ngày đã nhập; sang "Cả ngày" thì bỏ ca; về "Theo ca" ô ca trống lại', async () => {
    const dialog = await openDialog();
    fillByShift(dialog, '2026-10-30');
    fireEvent.change(within(dialog).getByLabelText(/Loại nghỉ/), {
      target: { value: 'CaNgay' },
    });
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue('26/10/2026');
    expect(within(dialog).getByLabelText(/Đến ngày/)).toHaveValue('30/10/2026');
    expect(within(dialog).queryByLabelText(/^Ca/)).toBeNull();
    chooseShiftKind(dialog);
    expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue('26/10/2026');
    expect(within(dialog).getByLabelText(/Đến ngày/)).toHaveValue('30/10/2026');
    expect(within(dialog).getByLabelText(/^Ca/)).toHaveValue('');
  });

  // Đột biến W12 sống ở lần đầu: bộ chọn ngày gốc (`{id}-picker`) mang `min`; happy-dom không ép `min` nhưng đọc được thuộc tính.
  it('DUX7-57 bộ chọn ngày của "Đến ngày" có min = Từ ngày (hôm nay khi chưa chọn); của "Từ ngày" luôn min = hôm nay', async () => {
    const dialog = await openDialog();
    chooseShiftKind(dialog);
    const fromPicker = document.getElementById('leave-from-picker');
    const toPicker = document.getElementById('leave-to-picker');
    expect(toPicker).toHaveAttribute('min', '2026-10-14');
    fireEvent.change(within(dialog).getByLabelText(/Từ ngày/), {
      target: { value: '2026-10-26' },
    });
    expect(toPicker).toHaveAttribute('min', '2026-10-26');
    expect(fromPicker).toHaveAttribute('min', '2026-10-14');
  });

  it.each([
    [
      'NGHI_NGOAI_LICH_LAM_VIEC',
      'Ngày/ca xin nghỉ không có trong lịch làm việc',
    ],
    ['YEU_CAU_NGHI_TRUNG', 'Bạn đã có yêu cầu nghỉ trùng thời gian này.'],
    ['CA_DA_KET_THUC', 'Ca này đã kết thúc trong hôm nay.'],
    ['KHOANG_NGHI_QUA_DAI', 'Khoảng nghỉ tối đa 31 ngày.'],
  ])(
    'DUX7-44 lỗi 409 %s với khoảng nhiều ngày: dải lỗi chung, giữ nguyên Từ ngày, Đến ngày, ca và lý do',
    async (maLoi, text) => {
      createHandler = () => apiError(409, maLoi);
      const dialog = await openDialog();
      fillByShift(dialog, '2026-10-30');
      submit(dialog);

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(within(dialog).getByLabelText(/Từ ngày/)).toHaveValue(
        '26/10/2026',
      );
      expect(within(dialog).getByLabelText(/Đến ngày/)).toHaveValue(
        '30/10/2026',
      );
      expect(within(dialog).getByLabelText(/^Ca/)).toHaveValue('CaSang');
      expect(within(dialog).getByLabelText(/Lý do/)).toHaveValue(
        'Việc gia đình',
      );
    },
  );
});

describe('lịch sử và chi tiết (F4)', () => {
  it('WN-07 rỗng: "Chưa có yêu cầu nghỉ nào."; lọc ra rỗng: câu riêng', async () => {
    render(<DoctorSchedulePage />);
    expect(await screen.findByText('Chưa có yêu cầu nghỉ nào.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Lọc yêu cầu theo trạng thái'), {
      target: { value: 'TuChoi' },
    });
    expect(
      await screen.findByText('Không có yêu cầu nào ở trạng thái này.'),
    ).toBeVisible();
    await waitFor(() => {
      const last = String(calls('GET', '/doctor/leave-requests').at(-1)![0]);
      expect(
        new URL(last, 'http://localhost').searchParams.get('trangThai'),
      ).toBe('TuChoi');
    });
  });

  it('WN-07 lỗi tải lịch sử: hộp lỗi + "Thử lại" tải lại được', async () => {
    const original = fetchMock.getMockImplementation()!;
    let failed = false;
    fetchMock.mockImplementation((input, init) => {
      if (!failed && String(input).includes('/doctor/leave-requests')) {
        failed = true;
        return Promise.resolve(apiError(500, 'LOI_HE_THONG'));
      }
      return original(input, init);
    });
    history = { items: [leave()], total: 1 };
    render(<DoctorSchedulePage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Việc gia đình')).toBeVisible();
  });

  it('WN-07 phân trang: 7 yêu cầu ⇒ 2 trang, "Trang sau" gọi page=2, nút trước khoá ở trang 1', async () => {
    history = { items: [leave()], total: 7 };
    render(<DoctorSchedulePage />);
    expect(await screen.findByText('Trang 1/2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 2/2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    const last = String(calls('GET', '/doctor/leave-requests').at(-1)![0]);
    expect(new URL(last, 'http://localhost').searchParams.get('page')).toBe(
      '2',
    );
  });

  it('WN-08 chi tiết: loại, ngày, ca, lý do, gửi lúc theo giờ VN; xử lý lúc chỉ hiện khi đã xử lý; Esc trả focus về dòng', async () => {
    history = {
      items: [
        leave({ trangThai: 'DaDuyet', thoiDiemXuLy: '2026-10-18T03:00:00Z' }),
      ],
      total: 1,
    };
    render(<DoctorSchedulePage />);
    const row = await screen.findByRole('button', { name: /26\/10.*Theo ca/ });
    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết yêu cầu nghỉ',
    });
    expect(within(dialog).getByText('Đã duyệt')).toBeVisible();
    expect(within(dialog).getByText('Theo ca')).toBeVisible();
    expect(within(dialog).getByText('26/10/2026')).toBeVisible();
    expect(within(dialog).getByText('Ca sáng')).toBeVisible();
    expect(within(dialog).getByText('Việc gia đình')).toBeVisible();
    // 17:06:06 UTC ngày 17/10 = 00:06:06 ngày 18/10 giờ VN
    expect(within(dialog).getByText('00:06:06 18/10/2026')).toBeVisible();
    expect(within(dialog).getByText('10:00:00 18/10/2026')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(row).toHaveFocus();
  });

  it('WN-08 yêu cầu nhiều ngày, đang chờ: khoảng ngày, không có ca, không có "Xử lý lúc"', async () => {
    history = {
      items: [
        leave({
          hinhThuc: 'CaNgay',
          ca: null,
          tuNgay: '2026-10-26',
          denNgay: '2026-10-28',
        }),
      ],
      total: 1,
    };
    render(<DoctorSchedulePage />);
    const row = await screen.findByRole('button', {
      name: /26\/10 – 28\/10.*Cả ngày/,
    });
    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết yêu cầu nghỉ',
    });
    expect(within(dialog).getByText('26/10/2026 – 28/10/2026')).toBeVisible();
    expect(within(dialog).queryByText('Ca')).toBeNull();
    expect(within(dialog).queryByText('Xử lý lúc')).toBeNull();
  });

  it('DUX7-45 yêu cầu "Theo ca" nhiều ngày: dòng lịch sử "24/11 – 28/11" kèm "Theo ca · Ca sáng"; hộp chi tiết có Loại, Ngày (khoảng) và Ca', async () => {
    history = {
      items: [
        leave({
          hinhThuc: 'TheoCa',
          ca: 'CaSang',
          tuNgay: '2026-11-24',
          denNgay: '2026-11-28',
        }),
      ],
      total: 1,
    };
    render(<DoctorSchedulePage />);
    const row = await screen.findByRole('button', {
      name: /24\/11 – 28\/11.*Theo ca/,
    });
    expect(row).toHaveTextContent('24/11 – 28/11');
    expect(row).toHaveTextContent('Theo ca · Ca sáng');
    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết yêu cầu nghỉ',
    });
    expect(within(dialog).getByText('Theo ca')).toBeVisible();
    expect(within(dialog).getByText('24/11/2026 – 28/11/2026')).toBeVisible();
    expect(within(dialog).getByText('Ca sáng')).toBeVisible();
  });

  it('WN-09 không có nút "Hủy yêu cầu" ở đâu cả (Q23), kể cả trong hộp chi tiết', async () => {
    history = { items: [leave()], total: 1 };
    render(<DoctorSchedulePage />);
    fireEvent.click(
      await screen.findByRole('button', { name: /26\/10.*Theo ca/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết yêu cầu nghỉ',
    });
    expect(
      within(dialog).queryByRole('button', { name: /Hủy yêu cầu/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Hủy yêu cầu/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeVisible();
    // Mở hộp chi tiết không phát sinh lời gọi ghi nào
    expect(calls('POST', '/doctor/leave-requests')).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ['PUT', 'PATCH', 'DELETE'].includes(init?.method ?? ''),
      ),
    ).toHaveLength(0);
  });
});
