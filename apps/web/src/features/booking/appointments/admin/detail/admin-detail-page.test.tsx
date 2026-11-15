import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_CODE,
  adminListQueries,
  cleanUpAdminAppointments,
  lastAdminListQuery,
  listLoaded,
  openAdminDetail,
  renderAdminAppointments,
} from '../../../../../router/admin-appointments-harness';
import {
  makeAdminAppointment,
  makeAdminDetail,
  makeHistoryEntry,
} from '../../../testing/fake-admin-api';
import { apiErrorResponse } from '../../../testing/fake-appointment-list-api';

// booking F10: trang chi tiết lịch hẹn của Quản trị viên (Figma `512:2`) và panel "Lịch sử trạng thái" với API giả và router thật. Mã AQD và AQH là [đề xuất] (PLAN booking mục 7.41). QT-02 = AQD-02,
// AQD-03, AQD-04 và AQH-01…AQH-04. Mức W: trang với API giả; jsdom không đo bố cục và tương phản thật nên phần đó là kiểm tay `M`.
afterEach(() => {
  vi.restoreAllMocks();
  cleanUpAdminAppointments();
});

const DETAIL_PATH = `/admin/lich-hen/${ADMIN_CODE}`;

// Giá trị của dòng có nhãn `label` trong thẻ có tiêu đề `card` (cặp <dt>, <dd>)
function factOf(card: string, label: string): string | null {
  const heading = screen.getByRole('heading', { level: 2, name: card });
  const section = heading.closest('section') as HTMLElement;
  const term = within(section).queryByText(label, { selector: 'dt' });
  return term?.nextElementSibling?.textContent ?? null;
}

describe('trang chi tiết: tải, nội dung theo Figma 512:2', () => {
  it('AQD-01 mở trang: h1 và mã lịch hiện ngay; MỘT GET chi tiết đúng mã (có token); không POST; `Quay lại danh sách` trỏ về danh sách', async () => {
    const { api } = await openAdminDetail();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chi tiết lịch hẹn' }),
    ).toBeVisible();
    expect(screen.getByText(ADMIN_CODE)).toBeInTheDocument();
    const calls = api.callsTo(`/admin/appointments/${ADMIN_CODE}`);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].hasToken).toBe(true);
    expect(api.writes()).toEqual([]);
    expect(
      screen.getByRole('link', { name: 'Quay lại danh sách' }),
    ).toHaveAttribute('href', '/admin/lich-hen');
  });

  it('AQD-03 nội dung: ba thẻ + panel (F12: thêm `Chi phí & Thanh toán`); đúng nhãn và giá trị (giờ Việt Nam, tiền từ CHUỖI); KHÔNG Email, Giới tính, Ngày sinh, Kênh đặt, thẻ `Thanh toán`', async () => {
    await openAdminDetail();
    const info = 'Thông tin lịch hẹn';
    expect(factOf(info, 'Ngày khám')).toBe('18/10/2026');
    expect(factOf(info, 'Giờ khám')).toBe('08:00');
    expect(factOf(info, 'Bác sĩ')).toBe('Nguyễn Minh Anh');
    expect(factOf(info, 'Chuyên khoa')).toBe('Tim mạch');
    expect(factOf(info, 'Dịch vụ')).toBe('Khám tim mạch');
    expect(factOf(info, 'Chi nhánh')).toBe('CLINIX Quận 1');
    // F12: tiền nằm ở thẻ `Chi phí & Thanh toán` (như trang Bệnh nhân), không còn ở `Thông tin lịch hẹn`
    const cost = 'Chi phí & Thanh toán';
    expect(factOf(cost, 'Giá khám')).toBe('300.000đ');
    expect(factOf(cost, 'Tiền cọc')).toBe('100.000đ');
    expect(factOf(cost, 'Còn phải thu')).toBe('300.000đ');
    expect(factOf(info, 'Giá khám')).toBeNull();
    const patient = 'Thông tin bệnh nhân';
    expect(factOf(patient, 'Họ tên')).toContain('Nguyễn Văn A');
    expect(factOf(patient, 'Họ tên')).toContain('Bản thân');
    expect(factOf(patient, 'Số điện thoại')).toBe('0901234567');
    expect(factOf(patient, 'Lý do khám')).toBe(
      'Đau ngực nhẹ, theo dõi huyết áp',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Lịch sử trạng thái' }),
    ).toBeVisible();
    // Dữ liệu Figma mà B4 không trả (Q32) và thẻ `Thanh toán`
    for (const label of ['Email', 'Giới tính', 'Ngày sinh', 'Kênh đặt']) {
      expect(screen.queryByText(label), label).toBeNull();
    }
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Thanh toán' }),
    ).toBeNull();
  });

  it('AQD-02 bộ đọc chỉ lấy đúng các khoá cần: khoá thừa của máy chủ (`email`, `thanhToan`, `gioiTinh`, `lichHenId`) không lọt ra màn hình', async () => {
    await openAdminDetail({
      email: 'lo.ra@example.com',
      gioiTinh: 'Nam',
      ngaySinh: '1990-05-15',
      kenhDat: 'Trực tuyến',
      thanhToan: { daThanhToan: '0.00' },
      lichHenId: '4242',
    } as never);
    expect(screen.queryByText('lo.ra@example.com')).toBeNull();
    expect(screen.queryByText('Nam')).toBeNull();
    expect(screen.queryByText('1990-05-15')).toBeNull();
    expect(screen.queryByText('Trực tuyến')).toBeNull();
    expect(screen.queryByText('4242')).toBeNull();
  });

  it('AQD-04 theo trạng thái: `Chờ thanh toán` hiện hạn thanh toán (giờ Việt Nam) và KHÔNG `Còn phải thu` khi `conPhaiThu` là null; `Đã hủy` hiện lý do hủy; `Đã xác nhận` không hiện hạn hay lý do hủy', async () => {
    const first = await openAdminDetail({
      trangThai: 'ChoThanhToan',
      hanThanhToan: '2026-10-18T07:15:00.000Z',
      conPhaiThu: null,
      chuyenDuoc: [],
    });
    const info = 'Thông tin lịch hẹn';
    const cost = 'Chi phí & Thanh toán';
    expect(factOf(cost, 'Hạn thanh toán')).toBe('18/10/2026 · 14:15');
    expect(factOf(cost, 'Còn phải thu')).toBeNull();
    expect(factOf(info, 'Lý do hủy')).toBeNull();
    expect(screen.getByText('Chờ thanh toán')).toBeInTheDocument();

    first.unmount();
    cleanUpAdminAppointments();
    await openAdminDetail({
      trangThai: 'DaHuy',
      lyDoHuy: 'Bệnh nhân báo bận',
      conPhaiThu: null,
      chuyenDuoc: [],
    });
    expect(factOf(info, 'Lý do hủy')).toBe('Bệnh nhân báo bận');
    expect(factOf(cost, 'Hạn thanh toán')).toBeNull();
  });

  it('AQD-04 người khám khác người đặt: dòng `Người đặt` và chú thích `Người thân`, `Của người đặt`; SĐT là của người đặt', async () => {
    await openAdminDetail({
      nguoiKham: { hoTen: 'Trần Thị Con', laBanThan: false },
      nguoiDat: { hoTen: 'Trần Văn Cha', soDienThoai: '0911111111' },
    });
    const patient = 'Thông tin bệnh nhân';
    expect(factOf(patient, 'Họ tên')).toContain('Trần Thị Con');
    expect(factOf(patient, 'Họ tên')).toContain('Người thân');
    expect(factOf(patient, 'Người đặt')).toBe('Trần Văn Cha');
    expect(factOf(patient, 'Số điện thoại')).toContain('0911111111');
    expect(factOf(patient, 'Số điện thoại')).toContain('Của người đặt');
  });

  it('AQD-04 số tiền lớn hơn 2^53 hiện đủ chữ số (định dạng từ CHUỖI, không qua `Number`)', async () => {
    await openAdminDetail({
      giaSnapshot: '9007199254740993.00',
      conPhaiThu: '9007199254740993.00',
    });
    const cost = 'Chi phí & Thanh toán';
    expect(factOf(cost, 'Giá khám')).toBe('9.007.199.254.740.993đ');
    expect(factOf(cost, 'Còn phải thu')).toBe('9.007.199.254.740.993đ');
  });
});

describe('lỗi tải chi tiết, quay lại, dữ liệu cá nhân', () => {
  it('AQD-05 lỗi theo `maLoi`: 404 MỘT câu (không `Thử lại`); 403 câu riêng; `maLoi` lạ cùng 500 ⇒ câu chung kèm `Thử lại` và bấm tải lại được; phản hồi thiếu khoá ⇒ không dùng được', async () => {
    const notFound = renderAdminAppointments(`/admin/lich-hen/CP00000000000`);
    expect(
      await screen.findByText('Không tìm thấy lịch hẹn này.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chi tiết lịch hẹn' }),
    ).toBeVisible();
    notFound.unmount();
    cleanUpAdminAppointments();

    const forbidden = renderAdminAppointments(DETAIL_PATH, {
      before: (fake) => {
        fake.failNext('detail', () => apiErrorResponse(403, 'KHONG_DU_QUYEN'));
      },
    });
    expect(
      await screen.findByText('Bạn không có quyền xem lịch hẹn này.'),
    ).toBeInTheDocument();
    forbidden.unmount();
    cleanUpAdminAppointments();

    const generic = renderAdminAppointments(DETAIL_PATH, {
      before: (fake) => {
        fake.appointments = [makeAdminAppointment()];
        fake.failNext('detail', () => apiErrorResponse(500, 'MA_LA_XYZ'));
      },
    });
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    fireEvent.click(retry);
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Thông tin lịch hẹn',
      }),
    ).toBeVisible();
    expect(
      generic.api.callsTo(`/admin/appointments/${ADMIN_CODE}`),
    ).toHaveLength(2);
    generic.unmount();
    cleanUpAdminAppointments();

    const { chuyenDuoc: _omitted, ...missing } = makeAdminDetail();
    void _omitted;
    renderAdminAppointments(DETAIL_PATH, {
      before: (fake) => {
        fake.details[ADMIN_CODE] = missing;
      },
    });
    expect(
      await screen.findByRole('button', { name: 'Thử lại' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Thông tin lịch hẹn' }),
    ).toBeNull();
  });

  it('AQD-06 từ danh sách có bộ lọc bấm `Chi tiết`: `Quay lại danh sách` khôi phục ĐÚNG bộ lọc (từ URL); vào thẳng chi tiết thì về danh sách trơn', async () => {
    const { api, router } = renderAdminAppointments(
      '/admin/lich-hen?trangThai=DaXacNhan&bacSiId=12',
    );
    await listLoaded();
    fireEvent.click(
      screen.getByRole('link', { name: `Chi tiết lịch hẹn ${ADMIN_CODE}` }),
    );
    const back = await screen.findByRole('link', {
      name: 'Quay lại danh sách',
    });
    expect(router.state.location.pathname).toBe(
      `/admin/lich-hen/${ADMIN_CODE}`,
    );
    expect(back).toHaveAttribute(
      'href',
      '/admin/lich-hen?trangThai=DaXacNhan&bacSiId=12',
    );
    fireEvent.click(back);
    await listLoaded();
    expect(lastAdminListQuery(api)).toEqual({
      page: '1',
      trangThai: 'DaXacNhan',
      bacSiId: '12',
    });
    expect(adminListQueries(api).length).toBeGreaterThanOrEqual(2);
  });

  it('AQD-07 dữ liệu cá nhân: mở, xem, quay lại ⇒ `localStorage.length`, `sessionStorage.length` bằng 0, không cookie, không `console`', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    await openAdminDetail();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  // booking F12 (UI-11, UI-12; Đại 14/11/2026). Mã UIF là [đề xuất] (PLAN booking mục 7.48). jsdom không đo bố cục: đây là bằng chứng CẤU TRÚC; bề rộng thật đo bằng trình duyệt ở TRACKING 3.42.
  it('UIF-11 khung chung như trang Bệnh nhân: căn giữa `max-w-[64rem]` (không còn 52,5rem lệch trái), thẻ đầu (mã MỘT lần, chip, chuyên khoa, bốn ô), lưới hai cột: Thông tin lịch hẹn và Thông tin bệnh nhân bên trái; Chi phí, Lịch sử, Thao tác bên phải', async () => {
    await openAdminDetail();
    const page = screen
      .getByRole('heading', { level: 1, name: 'Chi tiết lịch hẹn' })
      .closest('section') as HTMLElement;
    expect(page).toHaveClass('mx-auto', 'max-w-[64rem]');
    expect(page).not.toHaveClass('max-w-[52.5rem]');

    const hero = screen.getByRole('region', { name: 'Tóm tắt lịch hẹn' });
    expect(screen.getAllByText(ADMIN_CODE)).toHaveLength(1);
    expect(within(hero).getByText(ADMIN_CODE)).toBeInTheDocument();
    expect(within(hero).getByText('Đã xác nhận')).toBeVisible();
    expect(
      within(hero).getByRole('heading', { level: 2, name: 'Tim mạch' }),
    ).toBeInTheDocument();
    for (const label of ['Bác sĩ', 'Ngày khám', 'Chi nhánh', 'Người khám']) {
      expect(within(hero).getByText(label), label).toBeInTheDocument();
    }
    expect(within(hero).getByText('Chủ nhật, 18/10/2026')).toBeInTheDocument();
    expect(within(hero).getByText('08:00')).toBeInTheDocument();
    expect(within(hero).getByText('Bản thân')).toBeInTheDocument();

    const card = (name: string) =>
      screen
        .getByRole('heading', { level: 2, name })
        .closest('section') as HTMLElement;
    const left = card('Thông tin lịch hẹn').parentElement as HTMLElement;
    const right = card('Chi phí & Thanh toán').parentElement as HTMLElement;
    expect(left).not.toBe(right);
    expect(left.parentElement).toBe(right.parentElement);
    expect(left).toContainElement(card('Thông tin bệnh nhân'));
    expect(right).toContainElement(card('Lịch sử trạng thái'));
    expect(right).toContainElement(card('Thao tác'));
  });

  it('AQD-08 trợ năng: h1, ba tiêu đề h2 của thẻ, chip trạng thái bằng CHỮ, `aria-busy` tắt khi đã tải xong', async () => {
    await openAdminDetail();
    const h2 = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(h2).toEqual(
      expect.arrayContaining([
        'Thông tin lịch hẹn',
        'Thông tin bệnh nhân',
        'Lịch sử trạng thái',
      ]),
    );
    expect(screen.getByText('Đã xác nhận')).toBeVisible();
    const page = screen
      .getByRole('heading', { level: 1, name: 'Chi tiết lịch hẹn' })
      .closest('section') as HTMLElement;
    expect(page).toHaveAttribute('aria-busy', 'false');
  });
});

describe('panel "Lịch sử trạng thái" (QT-02)', () => {
  const panel = () =>
    screen
      .getByRole('heading', { level: 2, name: 'Lịch sử trạng thái' })
      .closest('section') as HTMLElement;

  it('AQH-01 ba loại mục theo ĐÚNG thứ tự máy chủ trả (web không sắp lại): tạo lịch, hủy kèm lý do, đổi trạng thái kèm từ → đến và lý do', async () => {
    await openAdminDetail({
      lichSuTrangThai: [
        makeHistoryEntry({
          thoiDiem: '2026-10-18T05:00:00.000Z',
          loai: 'OverrideLichHen',
          tuTrangThai: 'DaXacNhan',
          denTrangThai: 'VangMat',
          lyDo: 'Bệnh nhân không đến',
        }),
        makeHistoryEntry({
          thoiDiem: '2026-10-17T03:00:00.000Z',
          loai: 'TaoLich',
        }),
        makeHistoryEntry({
          thoiDiem: '2026-10-19T03:00:00.000Z',
          loai: 'HuyLich',
          denTrangThai: 'DaHuy',
          lyDo: 'Phòng khám nghỉ',
        }),
      ],
    });
    const items = within(panel()).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    // Thứ tự đúng như máy chủ gửi, dù mốc giờ không tăng dần
    expect(items[0]).toHaveTextContent(
      'Đổi trạng thái: Đã xác nhận → Vắng mặt',
    );
    expect(items[0]).toHaveTextContent('Lý do: Bệnh nhân không đến');
    expect(items[1]).toHaveTextContent('Tạo lịch hẹn');
    expect(items[1]).not.toHaveTextContent('Lý do');
    expect(items[2]).toHaveTextContent('Hủy lịch hẹn');
    expect(items[2]).toHaveTextContent('Lý do: Phòng khám nghỉ');
  });

  it('AQH-02 giờ theo GIỜ VIỆT NAM, không theo múi giờ máy: 16:59:59Z còn ngày 17/10 (23:59), 17:00:00Z đã sang 18/10 (00:00)', async () => {
    await openAdminDetail({
      lichSuTrangThai: [
        makeHistoryEntry({ thoiDiem: '2026-10-17T16:59:59.000Z' }),
        makeHistoryEntry({
          thoiDiem: '2026-10-17T17:00:00.000Z',
          loai: 'HuyLich',
          denTrangThai: 'DaHuy',
        }),
      ],
    });
    const items = within(panel()).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('17/10/2026 · 23:59');
    expect(items[1]).toHaveTextContent('18/10/2026 · 00:00');
  });

  it('AQH-03 `lyDo` là chữ tự do: hiện đúng như văn bản (thẻ HTML, nháy, gạch chéo ngược, tiếng Việt, biểu tượng), KHÔNG dựng phần tử nào từ nó', async () => {
    const nasty =
      '<script>window.hacked=1</script><img src="x" onerror="window.hacked=2"> "nháy" \'đơn\' \\ gạch 😀 &amp;';
    const { container } = await openAdminDetail({
      lichSuTrangThai: [
        makeHistoryEntry({
          thoiDiem: '2026-10-18T05:00:00.000Z',
          loai: 'OverrideLichHen',
          tuTrangThai: 'DaXacNhan',
          denTrangThai: 'DaHuy',
          lyDo: nasty,
        }),
      ],
    });
    expect(within(panel()).getByText(`Lý do: ${nasty}`)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
  });

  it('AQH-04 KHÔNG hiện người thực hiện: khoá thừa của mục (`nguoiThucHien`, `taiKhoanId`) không lọt ra màn hình', async () => {
    await openAdminDetail({
      lichSuTrangThai: [
        {
          ...makeHistoryEntry({
            loai: 'OverrideLichHen',
            tuTrangThai: 'DaXacNhan',
            denTrangThai: 'VangMat',
            lyDo: 'Ghi chú',
          }),
          nguoiThucHien: 'Quản trị viên Bí Mật',
          taiKhoanId: '777',
        } as never,
      ],
    });
    expect(screen.queryByText(/Bí Mật/)).toBeNull();
    expect(screen.queryByText('777')).toBeNull();
  });

  it('AQH-05 ghi chú cuối panel nói thẳng chỉ ghi nhận tạo lịch, hủy và đổi trạng thái thủ công (không có mốc tiếp đón, Vắng mặt, thanh toán)', async () => {
    await openAdminDetail();
    expect(
      within(panel()).getByText(
        'Chỉ ghi nhận tạo lịch, hủy và đổi trạng thái thủ công của Quản trị viên.',
      ),
    ).toBeInTheDocument();
  });

  it('AQH-06 mảng rỗng (không xảy ra bình thường) ⇒ câu của Figma "Chưa có lịch sử trạng thái được ghi nhận"; mục `HuyLich` có `lyDo` null ⇒ không dòng lý do', async () => {
    const first = await openAdminDetail({ lichSuTrangThai: [] });
    expect(
      within(panel()).getByText('Chưa có lịch sử trạng thái được ghi nhận'),
    ).toBeInTheDocument();
    expect(within(panel()).queryAllByRole('listitem')).toEqual([]);

    first.unmount();
    cleanUpAdminAppointments();
    await openAdminDetail({
      lichSuTrangThai: [
        makeHistoryEntry({
          loai: 'HuyLich',
          denTrangThai: 'DaHuy',
          lyDo: null,
        }),
      ],
    });
    const item = within(panel()).getByRole('listitem');
    expect(item).toHaveTextContent('Hủy lịch hẹn');
    expect(item).not.toHaveTextContent('Lý do');
  });

  it('AQH-08 mục có `loai` lạ (khoá cộng thêm của máy chủ mới hơn) bị bỏ, các mục khác vẫn hiện, không lộ mã thô', async () => {
    await openAdminDetail({
      lichSuTrangThai: [
        makeHistoryEntry(),
        { ...makeHistoryEntry(), loai: 'LoaiMoiCuaMayChu' } as never,
      ],
    });
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText(/LoaiMoiCuaMayChu/)).toBeNull();
  });
});
