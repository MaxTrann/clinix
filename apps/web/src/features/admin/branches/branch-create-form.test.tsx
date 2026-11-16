import { fireEvent, render, screen, within } from '@testing-library/react';
import { AdminMeProvider } from '../admin-me-context';
import { BranchPage } from './branch-page';

// AF6-04 (panel "Áp dụng nhanh" trong form Thêm chi nhánh) và AF6-05 (lỗi hiện đúng một chỗ, focus ô lỗi đầu tiên); admin PR2 mục 6.2
// và 6.4. Logic thuần ở `quick-apply.test.ts` (AF6-03); panel riêng ở `quick-apply-panel.test.tsx`.

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openForm() {
  fetchMock
    .mockResolvedValueOnce(
      response({ items: [], total: 0, page: 1, pageSize: 20 }),
    )
    .mockResolvedValueOnce(
      response({ items: [], total: 0, page: 1, pageSize: 100 }),
    );
  render(
    <AdminMeProvider value={{ phamVi: 'ToanHeThong' }}>
      <BranchPage />
    </AdminMeProvider>,
  );
  await screen.findByText('Chưa có chi nhánh nào.');
  fireEvent.click(screen.getByRole('button', { name: 'Thêm chi nhánh' }));
  await screen.findByText(/Có thể tạo chi nhánh mà chưa gán dịch vụ/);
}

const nameInput = () => screen.getByRole('textbox', { name: /Tên chi nhánh/ });
const addressInput = () => screen.getByRole('textbox', { name: /Địa chỉ/ });
const latInput = () => screen.getByRole('textbox', { name: /Vĩ độ/ });
const lngInput = () => screen.getByRole('textbox', { name: /Kinh độ/ });
const saveButton = () => screen.getByRole('button', { name: 'Lưu chi nhánh' });
const time = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;
const alertTexts = () =>
  screen.queryAllByRole('alert').map((element) => element.textContent);

function type(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

function panelApply({
  period,
  start,
  end,
  days,
}: {
  period: 'Sáng' | 'Chiều';
  start: string;
  end: string;
  days: 'Tất cả' | 'T2–T6';
}) {
  fireEvent.click(screen.getByRole('radio', { name: period }));
  type(screen.getByLabelText('Áp dụng nhanh giờ bắt đầu'), start);
  type(screen.getByLabelText('Áp dụng nhanh giờ kết thúc'), end);
  fireEvent.click(screen.getByRole('button', { name: days }));
  fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
}

// Lịch hợp lệ chỉ bằng panel: sáng cả 7 ngày, chiều T2–T6 (chiều Thứ 7 và CN mặc định tắt)
function fillValidSchedule() {
  panelApply({ period: 'Sáng', start: '08:00', end: '11:30', days: 'Tất cả' });
  panelApply({ period: 'Chiều', start: '13:30', end: '17:00', days: 'T2–T6' });
}

describe('Form Thêm chi nhánh: panel Áp dụng nhanh (AF6-04)', () => {
  it('AF6-04 panel nằm trong fieldset lịch, phía TRÊN các hàng ngày; không còn ô type="time"', async () => {
    await openForm();

    const schedule = screen.getByRole('group', {
      name: /Lịch hoạt động theo tuần/,
    });
    const panel = within(schedule).getByRole('group', {
      name: 'Áp dụng nhanh',
    });
    const firstDay = within(schedule).getByText('Thứ 2', {
      selector: 'strong',
    });
    expect(
      panel.compareDocumentPosition(firstDay) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelectorAll('input[type="time"]')).toHaveLength(0);
    expect(time('Thứ 2 buổi sáng bắt đầu')).toHaveAttribute('type', 'text');
  });

  it('AF6-04 Áp dụng T2–T6 buổi sáng ghi vào ô giờ sáng của đúng 5 ngày, không đụng Thứ 7 và buổi chiều', async () => {
    await openForm();

    panelApply({
      period: 'Sáng',
      start: '08:00',
      end: '11:30',
      days: 'T2–T6',
    });

    for (const day of ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6']) {
      expect(time(`${day} buổi sáng bắt đầu`)).toHaveValue('08:00');
      expect(time(`${day} buổi sáng kết thúc`)).toHaveValue('11:30');
      expect(time(`${day} buổi chiều bắt đầu`)).toHaveValue('');
    }
    expect(time('Thứ 7 buổi sáng bắt đầu')).toHaveValue('');
    expect(screen.getByText('Đã áp dụng cho Thứ 2–Thứ 6')).toBeInTheDocument();
  });

  it('AF6-04 chọn Chiều chỉ ghi buổi chiều', async () => {
    await openForm();

    panelApply({
      period: 'Chiều',
      start: '13:30',
      end: '17:00',
      days: 'T2–T6',
    });

    expect(time('Thứ 2 buổi chiều bắt đầu')).toHaveValue('13:30');
    expect(time('Thứ 6 buổi chiều kết thúc')).toHaveValue('17:00');
    expect(time('Thứ 2 buổi sáng bắt đầu')).toHaveValue('');
  });

  it('AF6-04 ngày đang Nghỉ (CN) được tick thì tự chuyển Hoạt động và hiện giờ buổi đã chọn', async () => {
    await openForm();
    expect(screen.queryByLabelText('CN buổi sáng bắt đầu')).toBeNull();

    panelApply({
      period: 'Sáng',
      start: '07:30',
      end: '11:00',
      days: 'Tất cả',
    });

    expect(time('CN buổi sáng bắt đầu')).toHaveValue('07:30');
    expect(time('CN buổi sáng kết thúc')).toHaveValue('11:00');
    // Buổi chiều của CN KHÔNG bị bật theo (chỉ buổi đã chọn được bật): không có ô giờ chiều của CN
    expect(screen.queryByLabelText('CN buổi chiều bắt đầu')).toBeNull();
  });

  it('AF6-04 áp dụng hai lần: lần sau ghi đè; sửa tay từng ngày sau đó vẫn được', async () => {
    await openForm();
    panelApply({
      period: 'Sáng',
      start: '08:00',
      end: '11:30',
      days: 'T2–T6',
    });

    panelApply({
      period: 'Sáng',
      start: '07:00',
      end: '12:00',
      days: 'T2–T6',
    });
    type(time('Thứ 3 buổi sáng bắt đầu'), '09:15');

    expect(time('Thứ 2 buổi sáng bắt đầu')).toHaveValue('07:00');
    expect(time('Thứ 3 buổi sáng bắt đầu')).toHaveValue('09:15');
    expect(time('Thứ 3 buổi sáng kết thúc')).toHaveValue('12:00');
  });

  it('AF6-04 sáng kết thúc sau chiều bắt đầu: vẫn ghi, và báo lỗi theo ngày lúc Lưu, không gọi API', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    panelApply({
      period: 'Sáng',
      start: '08:00',
      end: '14:00',
      days: 'T2–T6',
    });
    panelApply({
      period: 'Chiều',
      start: '13:30',
      end: '17:00',
      days: 'T2–T6',
    });

    fireEvent.click(saveButton());

    expect(
      (
        await screen.findAllByText(
          /Thứ 2: Buổi sáng phải kết thúc trước hoặc đúng giờ bắt đầu buổi chiều\./,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('AF6-04 POST sau khi dùng panel vẫn đúng 7 ngày như cũ, không có trường lạ', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    fillValidSchedule();
    fetchMock.mockResolvedValueOnce(response({ chiNhanhId: '1' }, 201));
    fetchMock.mockResolvedValue(
      response({ items: [], total: 0, page: 1, pageSize: 20 }),
    );

    fireEvent.click(saveButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã thêm chi nhánh.',
    );
    const body = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as {
      lichHoatDong: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'diaChi',
      'dichVuKhamIds',
      'lichHoatDong',
      'ten',
    ]);
    expect(body.lichHoatDong).toHaveLength(7);
    expect(body.lichHoatDong[0]).toEqual({
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '08:00', ketThuc: '11:30' },
      chieu: { batDau: '13:30', ketThuc: '17:00' },
    });
    expect(body.lichHoatDong[6]).toEqual({
      thuTrongTuan: 7,
      hoatDong: true,
      sang: { batDau: '08:00', ketThuc: '11:30' },
    });
  });
});

describe('Form Thêm chi nhánh: lỗi hiện đúng một chỗ (AF6-05)', () => {
  it('AF6-05 chỉ KINH ĐỘ sai: lỗi hiện dưới ô kinh độ (trước đây không hiện đâu cả), ô vĩ độ không bị đánh dấu', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    fillValidSchedule();
    type(latInput(), '10.7769');
    type(lngInput(), '200');

    fireEvent.click(saveButton());

    const message = await screen.findByText(
      'Giá trị phải nằm trong khoảng -180 đến 180.',
    );
    expect(alertTexts()).toEqual([message.textContent]);
    expect(lngInput()).toHaveAttribute('aria-invalid', 'true');
    expect(lngInput()).toHaveAccessibleDescription(message.textContent ?? '');
    expect(latInput()).not.toHaveAttribute('aria-invalid', 'true');
    expect(lngInput()).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('AF6-05 cả hai tọa độ sai: mỗi ô một lỗi của riêng nó', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    fillValidSchedule();
    type(latInput(), '95');
    type(lngInput(), '200');

    fireEvent.click(saveButton());

    expect(
      await screen.findByText('Giá trị phải nằm trong khoảng -90 đến 90.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Giá trị phải nằm trong khoảng -180 đến 180.'),
    ).toBeInTheDocument();
    expect(latInput()).toHaveFocus();
  });

  it('AF6-05 chỉ nhập một nửa cặp: một thông báo "nhập đồng thời" (không lặp ở hai ô), hai ô cùng được đánh dấu', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    fillValidSchedule();
    type(latInput(), '10.7769');

    fireEvent.click(saveButton());

    const messages = await screen.findAllByText(
      'Nhập đồng thời vĩ độ và kinh độ.',
    );
    expect(messages).toHaveLength(1);
    expect(latInput()).toHaveAttribute('aria-invalid', 'true');
    expect(lngInput()).toHaveAttribute('aria-invalid', 'true');
    expect(lngInput()).toHaveAccessibleDescription(
      'Nhập đồng thời vĩ độ và kinh độ.',
    );
  });

  it('AF6-05 focus vào ô lỗi đầu tiên: tên, rồi địa chỉ', async () => {
    await openForm();
    latInput().focus();

    fireEvent.click(saveButton());
    expect(nameInput()).toHaveFocus();

    type(nameInput(), 'Chi nhánh mới');
    fireEvent.click(saveButton());
    expect(addressInput()).toHaveFocus();
  });

  it('AF6-05 điều kiện B: sau lỗi phía form, gõ vào ô khác không kéo focus về ô lỗi', async () => {
    await openForm();
    fireEvent.click(saveButton());
    expect(nameInput()).toHaveFocus();

    addressInput().focus();
    type(addressInput(), '1 Đường Mẫu');

    expect(addressInput()).toHaveFocus();
  });

  it('AF6-05 lỗi tên từ máy chủ: một vùng báo dưới ô tên, không banner "Một số thông tin…", focus vào ô tên', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    fillValidSchedule();
    addressInput().focus();
    fetchMock.mockResolvedValueOnce(
      response(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'ten', ma: 'TEN_CHI_NHANH_KHONG_HOP_LE' }],
        },
        400,
      ),
    );

    fireEvent.click(saveButton());

    expect(
      await screen.findByText('Tên chi nhánh phải có từ 1 đến 100 ký tự.'),
    ).toBeInTheDocument();
    expect(alertTexts()).toEqual(['Tên chi nhánh phải có từ 1 đến 100 ký tự.']);
    expect(nameInput()).toHaveFocus();
  });

  it('AF6-05 lỗi kinh độ từ máy chủ: chỉ ô kinh độ bị đánh dấu (không đánh dấu lây sang vĩ độ)', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    fillValidSchedule();
    type(latInput(), '10.7769');
    type(lngInput(), '106.6920');
    fetchMock.mockResolvedValueOnce(
      response(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'toaDoLng', ma: 'TOA_DO_KHONG_HOP_LE' }],
        },
        400,
      ),
    );

    fireEvent.click(saveButton());

    expect(await screen.findByText('Tọa độ không hợp lệ.')).toBeInTheDocument();
    expect(alertTexts()).toEqual(['Tọa độ không hợp lệ.']);
    expect(lngInput()).toHaveAttribute('aria-invalid', 'true');
    expect(latInput()).not.toHaveAttribute('aria-invalid', 'true');
    expect(lngInput()).toHaveFocus();
  });

  it('AF6-05 lịch lỗi nhưng máy chủ không chỉ ra ngày nào: banner chung (trước đây im lặng)', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    fillValidSchedule();
    fetchMock.mockResolvedValueOnce(
      response({ maLoi: 'LICH_HOAT_DONG_KHONG_HOP_LE', thongBao: 'x' }, 400),
    );

    fireEvent.click(saveButton());

    expect(
      await screen.findByText(
        'Lịch hoạt động chưa hợp lệ. Vui lòng kiểm tra lại các ngày.',
      ),
    ).toBeInTheDocument();
    expect(alertTexts()).toHaveLength(1);
  });

  it('AF6-05 lịch lỗi có chỉ ra ngày: vẫn báo theo ngày, KHÔNG thêm banner chung', async () => {
    await openForm();
    type(nameInput(), 'Chi nhánh mới');
    type(addressInput(), '1 Đường Mẫu, TP.HCM');
    fillValidSchedule();
    fetchMock.mockResolvedValueOnce(
      response(
        {
          maLoi: 'LICH_HOAT_DONG_KHONG_HOP_LE',
          thongBao: 'x',
          chiTiet: [{ thu: 2, maLoi: 'KHOANG_GIO_CHONG_NHAU' }],
        },
        400,
      ),
    );

    fireEvent.click(saveButton());

    expect(
      await screen.findByText(/Thứ 3: Buổi sáng phải kết thúc trước/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Vui lòng kiểm tra lại các ngày/)).toBeNull();
  });
});
