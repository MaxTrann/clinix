import { screen, within } from '@testing-library/react';
import {
  installFakeStaffApi,
  makeStaff,
  renderStaffPage,
} from './testing/staff-accounts-test-kit';

// admin F8, hợp đồng lớp giao diện của những lỗi chỉ lộ ở trình duyệt (mã NSF8-61 đến 63 là [đề xuất], TRACKING admin 9A.20 mục 3 và 4).
// vitest chạy với `css: false` và không có bố cục thật, nên các ca này khoá LỚP (class) và thuộc tính đã làm hết lỗi của F9 khi đo bằng trình duyệt thật
// (D1 đến D3); số đo thật (độ rộng cột, tràn ngang, chiều cao ô) nằm ở TRACKING admin 9A.20 mục 4, không ở đây.

const SEARCH = { name: 'Tìm theo tên, email hoặc số điện thoại' };
const tokens = (element: Element | null | undefined) =>
  (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NSF8-61 ô tìm không viền nằm trong khung field-frame, chiều rộng cơ sở chỉ từ màn sm', () => {
  it('NSF8-61 ô nhập `border-0` trong nhãn `field-frame`; khung có `sm:basis-60` mà KHÔNG có `basis-60` trần; hàng lọc xếp cột rồi xếp hàng từ sm', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await screen.findByRole('table');

    const input = screen.getByRole('searchbox', SEARCH);
    const frame = input.closest('.field-frame');
    expect(frame?.tagName).toBe('LABEL');
    expect(tokens(input)).toContain('border-0');
    expect(frame?.querySelectorAll('input')).toHaveLength(1);
    expect(tokens(frame)).toContain('sm:basis-60');
    expect(tokens(frame)).not.toContain('basis-60');
    expect(tokens(frame?.parentElement)).toEqual(
      expect.arrayContaining(['flex-col', 'sm:flex-row']),
    );
  });
});

describe('NSF8-62 bảng không đặt chiều rộng cột, nội dung không bị ép hẹp (F9 D3, TECH_DEBT 202 và 209)', () => {
  it('NSF8-62 sáu cột, không cột nào có `style.width`; họ tên và email co giãn được, vai trò, ngày và huy hiệu không xuống dòng; nút giữ chữ và có nhãn truy cập đầy đủ họ tên', async () => {
    installFakeStaffApi({
      accounts: [
        makeStaff(1),
        makeStaff(2, { trangThai: 'NgungHoatDong' }),
        makeStaff(3, { trangThai: 'ChoKichHoat' }),
      ],
    });
    renderStaffPage();
    const table = await screen.findByRole('table');

    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(6);
    for (const header of headers)
      expect(header.getAttribute('style')).toBeNull();

    const rows = within(table).getAllByRole('row');
    const cells = within(rows[2]).getAllByRole('cell'); // Nhân sự 2 (ngừng hoạt động)
    const [name, email, phone] = Array.from(cells[0].children);
    expect(tokens(name).some((t) => t.startsWith('min-w-'))).toBe(true);
    expect(tokens(name)).toContain('break-words');
    expect(tokens(email)).toContain('break-all');
    expect(tokens(phone)).toContain('whitespace-nowrap');
    expect(tokens(cells[1].firstElementChild)).toContain('whitespace-nowrap');
    // Cột Vai trò có chiều rộng tối thiểu để cột không hẹp dưới 80 px (T3: đo ở trình duyệt thật, chữ 38,24 px + đệm 30 px = 68,24 px khi để tự nhiên)
    expect(tokens(cells[1].firstElementChild)).toContain('min-w-[3.4rem]');
    expect(tokens(cells[4].firstElementChild)).toContain('whitespace-nowrap');
    expect(tokens(within(cells[3]).getByText('Ngừng hoạt động'))).toContain(
      'whitespace-nowrap',
    );
    const pending = within(rows[3]).getAllByRole('cell')[3];
    expect(tokens(within(pending).getByText('Chờ kích hoạt'))).toContain(
      'whitespace-nowrap',
    );
    const button = within(cells[5]).getByRole('button', {
      name: 'Xem chi tiết Nhân sự 2',
    });
    expect(button).toHaveTextContent('Xem chi tiết');
    expect(tokens(button)).toContain('whitespace-nowrap');
  });
});

describe('NSF8-63 trạng thái luôn kèm chữ và có màu theo token (ADR 0004)', () => {
  it('NSF8-63 ba huy hiệu dùng đúng cặp token: success, warning, xám; chữ "Đang hoạt động", "Chờ kích hoạt", "Ngừng hoạt động" luôn có', async () => {
    installFakeStaffApi({
      accounts: [
        makeStaff(1, { trangThai: 'DangHoatDong' }),
        makeStaff(2, { trangThai: 'ChoKichHoat' }),
        makeStaff(3, { trangThai: 'NgungHoatDong' }),
      ],
    });
    renderStaffPage();
    const table = await screen.findByRole('table');

    const badge = (text: string) => within(table).getByText(text);
    expect(tokens(badge('Đang hoạt động'))).toEqual(
      expect.arrayContaining(['bg-success-soft', 'text-success']),
    );
    expect(tokens(badge('Chờ kích hoạt'))).toEqual(
      expect.arrayContaining(['bg-warning-soft', 'text-warning']),
    );
    expect(tokens(badge('Ngừng hoạt động'))).toEqual(
      expect.arrayContaining(['bg-gray-100', 'text-gray-600']),
    );
  });
});
