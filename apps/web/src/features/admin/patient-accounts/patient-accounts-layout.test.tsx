import { screen, within } from '@testing-library/react';
import {
  BRANCH,
  installFakeApi,
  makePatient,
  renderPatientPage,
} from './testing/patient-accounts-test-kit';

// admin F9, hợp đồng lớp giao diện của ba lỗi chỉ lộ ở trình duyệt (mã TKF9-60 đến 62 là [đề xuất]; TRACKING admin 9A.12 mục 10.8, D1 đến D3).
// vitest chạy với `css: false` và không có bố cục thật, nên các ca này khoá LỚP (class) và thuộc tính đã làm hết lỗi khi đo bằng trình duyệt thật (BR-7);
// số đo thật (viền, chiều cao ô tìm, độ rộng cột, tràn ngang) nằm ở TRACKING 10.8, không ở đây.

const SEARCH = { name: 'Tìm theo tên, email hoặc số điện thoại' };
const tokens = (element: Element | null | undefined) =>
  (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TKF9-60 D1: ô tìm không viền nằm trong khung field-frame (không còn viền đôi)', () => {
  it('TKF9-60 ô nhập `border-0` trong nhãn `field-frame` bọc đúng một ô nhập và không bọc nút (mẫu của global-search và các ô tìm khác của Admin)', async () => {
    installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await screen.findByRole('table');

    const input = screen.getByRole('searchbox', SEARCH);
    const frame = input.closest('.field-frame');
    expect(frame).not.toBeNull();
    expect(frame?.tagName).toBe('LABEL');
    // viền do khung vẽ; ô nhập bên trong KHÔNG có viền riêng (hồi quy viền đôi: ô tự vẽ viền 0,8 px thứ hai)
    expect(tokens(input)).toContain('border-0');
    expect(frame?.querySelectorAll('input')).toHaveLength(1);
    expect(within(frame as HTMLElement).queryAllByRole('button')).toHaveLength(
      0,
    );
  });
});

describe('TKF9-61 D2: chiều rộng cơ sở của ô tìm chỉ áp từ màn sm trở lên', () => {
  it('TKF9-61 khung ô tìm có `sm:basis-60` và KHÔNG có `basis-60` trần (trong khung cột, flex-basis thành chiều cao: ô cao 225 px ở 375 px)', async () => {
    installFakeApi({ accounts: [makePatient(1)] });
    renderPatientPage();
    await screen.findByRole('table');

    const frame = screen.getByRole('searchbox', SEARCH).closest('.field-frame');
    expect(tokens(frame)).toContain('sm:basis-60');
    expect(tokens(frame)).not.toContain('basis-60');
    // hàng lọc xếp cột ở màn hẹp, hàng từ sm
    const bar = frame?.parentElement;
    expect(tokens(bar)).toEqual(
      expect.arrayContaining(['flex-col', 'sm:flex-row']),
    );
  });
});

describe('TKF9-62 D3: bảng không đặt chiều rộng cột, nội dung không bị ép hẹp', () => {
  it('TKF9-62 Toàn hệ thống: không cột nào có `style.width`; họ tên và email co giãn được, huy hiệu và nút không xuống dòng; nút giữ chữ "Xem chi tiết" và nhãn truy cập có họ tên', async () => {
    installFakeApi({
      accounts: [
        makePatient(1, { khoaDatLichDoNoShow: true, soLanNoShow: 3 }),
        makePatient(2, { trangThai: 'NgungHoatDong' }),
      ],
    });
    renderPatientPage();
    const table = await screen.findByRole('table');

    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(6);
    for (const header of headers)
      expect(header.getAttribute('style')).toBeNull();

    const row = within(table).getAllByRole('row')[2]; // Bệnh nhân 2 (ngừng hoạt động)
    const cells = within(row).getAllByRole('cell');
    // Họ tên: chiều rộng tối thiểu và cho phép ngắt chữ; Email: ngắt ở mọi ký tự (địa chỉ dài không đẩy bảng)
    expect(
      tokens(cells[0].firstElementChild).some((t) => t.startsWith('min-w-')),
    ).toBe(true);
    expect(tokens(cells[0].firstElementChild)).toContain('break-words');
    expect(tokens(cells[1].firstElementChild)).toContain('break-all');
    // Số điện thoại, huy hiệu trạng thái, huy hiệu đặt lịch: một dòng
    expect(tokens(cells[2].firstElementChild)).toContain('whitespace-nowrap');
    expect(tokens(within(cells[3]).getByText('Ngừng hoạt động'))).toContain(
      'whitespace-nowrap',
    );
    expect(tokens(within(cells[4]).getByText('Bình thường'))).toContain(
      'whitespace-nowrap',
    );
    // Nút: một dòng, chữ giữ nguyên, nhãn truy cập đầy đủ họ tên
    const button = within(cells[5]).getByRole('button', {
      name: 'Xem chi tiết Bệnh nhân 2',
    });
    expect(button).toHaveTextContent('Xem chi tiết');
    expect(tokens(button)).toContain('whitespace-nowrap');
  });

  it('TKF9-62 Chi nhánh: năm cột, cũng không đặt chiều rộng', async () => {
    installFakeApi({ scope: BRANCH, accounts: [makePatient(1)] });
    renderPatientPage({ scope: BRANCH });
    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(5);
    for (const header of headers)
      expect(header.getAttribute('style')).toBeNull();
  });
});
