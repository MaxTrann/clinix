import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  installFakeStaffApi,
  makeStaff,
  renderStaffPage,
} from './testing/staff-accounts-test-kit';

// admin F8, trả focus khi đóng panel và khi đóng hộp xác nhận (mã NSF8-64 là [đề xuất], TRACKING admin 9A.20 mục 3). Cùng bài học F9 D4: sau một hành động ghi
// danh sách tải lại và BẢNG ĐƯỢC DỰNG LẠI, nút đã mở panel là phần tử cũ đã bị gỡ; trang phải tự trả focus về nút hàng mới cùng mã (hoặc ô tìm nếu hàng biến mất).

const LOCK_TITLE = 'Khoá tài khoản?';
const SEARCH = { name: 'Tìm theo tên, email hoặc số điện thoại' };
const rowButton = (name: string) =>
  screen.getByRole('button', { name: `Xem chi tiết ${name}` });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openFromKeyboardFocus(name: string) {
  await screen.findByRole('table');
  const opener = rowButton(name);
  opener.focus();
  fireEvent.click(opener);
  await screen.findByRole('dialog', { name });
  return opener;
}

async function lockFromPanel(name: string) {
  const panel = screen.getByRole('dialog', { name });
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Khoá tài khoản' }),
  );
  const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
  );
  await screen.findByText('Đã khoá tài khoản.');
}

describe('NSF8-64 trả focus', () => {
  it('NSF8-64 sau khi khoá (bảng bị dựng lại), Esc đóng panel: focus về đúng nút "Xem chi tiết" MỚI của cùng nhân sự, không rơi về BODY', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1), makeStaff(2)] });
    renderStaffPage();
    const opener = await openFromKeyboardFocus('Nhân sự 1');
    await lockFromPanel('Nhân sự 1');
    await waitFor(() => expect(rowButton('Nhân sự 1')).not.toBe(opener));
    expect(opener.isConnected).toBe(false);
    await within(screen.getByRole('dialog')).findByText('Ngừng hoạt động');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(rowButton('Nhân sự 1')).toHaveFocus());
    expect(rowButton('Nhân sự 2')).not.toHaveFocus();
  });

  it('NSF8-64 không có hành động: nút Đóng trả focus về đúng nút hàng đã mở', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1), makeStaff(2)] });
    renderStaffPage();
    await openFromKeyboardFocus('Nhân sự 2');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(rowButton('Nhân sự 2')).toHaveFocus();
  });

  it('NSF8-64 hàng không còn trong danh sách (đang lọc "Đang hoạt động", vừa khoá nên bị loại): focus về ô tìm, không về BODY', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1), makeStaff(2)] });
    renderStaffPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc trạng thái' }), {
      target: { value: 'DangHoatDong' },
    });
    await screen.findByText('2 nhân sự');
    await openFromKeyboardFocus('Nhân sự 1');
    await lockFromPanel('Nhân sự 1');
    await screen.findByText('1 nhân sự');
    expect(
      screen.queryByRole('button', { name: 'Xem chi tiết Nhân sự 1' }),
    ).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('searchbox', SEARCH)).toHaveFocus(),
    );
  });

  it('NSF8-64 404 (nhân sự đã biến mất): panel tự đóng, focus về ô tìm', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1), makeStaff(2)],
    });
    renderStaffPage();
    await openFromKeyboardFocus('Nhân sự 1');
    api.accounts.splice(0, 1); // người khác vừa xoá: POST …/lock trả 404 và danh sách không còn dòng này
    const panel = screen.getByRole('dialog', { name: 'Nhân sự 1' });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    const dialog = await screen.findByRole('dialog', { name: LOCK_TITLE });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Khoá tài khoản' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy dữ liệu.',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('searchbox', SEARCH)).toHaveFocus(),
    );
  });

  it('NSF8-64 KHÔNG giành focus: nếu focus đang ở một điều khiển khác (không phải BODY) khi panel đóng thì giữ nguyên', async () => {
    installFakeStaffApi({ accounts: [makeStaff(1), makeStaff(2)] });
    renderStaffPage();
    const opener = await openFromKeyboardFocus('Nhân sự 1');
    await lockFromPanel('Nhân sự 1');
    await waitFor(() => expect(rowButton('Nhân sự 1')).not.toBe(opener));
    await within(screen.getByRole('dialog')).findByText('Ngừng hoạt động');

    // Cùng lý do với TKF9-37: happy-dom chuyển focus về body khi hook chung gọi `body.focus()`, trình duyệt thật coi đó là không làm gì
    vi.spyOn(document.body, 'focus').mockImplementation(() => undefined);
    const filter = screen.getByRole('combobox', { name: 'Lọc trạng thái' });
    filter.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(filter).toHaveFocus();
    expect(rowButton('Nhân sự 1')).not.toHaveFocus();
  });

  it('NSF8-64 Esc trong hộp xác nhận chỉ đóng hộp, KHÔNG gọi API; panel hiện lại', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    renderStaffPage();
    await openFromKeyboardFocus('Nhân sự 1');
    fireEvent.click(screen.getByRole('button', { name: 'Khoá tài khoản' }));
    await screen.findByRole('dialog', { name: LOCK_TITLE });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: LOCK_TITLE })).toBeNull(),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Nhân sự 1' }),
    ).toBeInTheDocument();
    expect(api.posts()).toHaveLength(0);
  });
});
