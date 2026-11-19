import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  installFakeApi,
  makePatient,
  renderPatientPage,
  rowButton,
} from './testing/patient-accounts-test-kit';

// admin F9, D4: trả focus về đúng nút hàng khi đóng panel sau một hành động (mã TKF9-37 là [đề xuất]; TRACKING admin 9A.12 mục 10.8, D4).
// Lỗi gốc đo ở trình duyệt thật: sau khi khoá, danh sách được tải lại và bảng được DỰNG LẠI, nút đã mở panel là phần tử cũ đã bị gỡ, nên
// `useAdminDialogFocus` (hook dùng chung của F1, không sửa) trả focus về phần tử đã gỡ và focus rơi về `BODY`. Cách sửa nằm ở trang: nhớ `id` đã mở,
// khi panel đóng và danh sách sẵn sàng mà focus đang ở `BODY` thì focus nút hàng cùng `id`; nút không còn thì focus ô tìm (điều khiển đầu tiên của vùng danh sách).

const LOCK_TITLE = 'Khoá tài khoản bệnh nhân?';
const SEARCH = { name: 'Tìm theo tên, email hoặc số điện thoại' };

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

describe('TKF9-37 trả focus sau khi đóng panel', () => {
  it('TKF9-37 sau khi khoá (bảng bị dựng lại), Esc đóng panel: focus về đúng nút "Xem chi tiết" mới của cùng bệnh nhân, không rơi về BODY', async () => {
    installFakeApi({ accounts: [makePatient(1), makePatient(2)] });
    renderPatientPage();
    const opener = await openFromKeyboardFocus('Bệnh nhân 1');
    await lockFromPanel('Bệnh nhân 1');
    // bảng đã được dựng lại: nút hàng bây giờ là PHẦN TỬ MỚI, nút cũ đã bị gỡ khỏi tài liệu
    await waitFor(() => expect(rowButton('Bệnh nhân 1')).not.toBe(opener));
    expect(opener.isConnected).toBe(false);
    await within(screen.getByRole('dialog')).findByText('Ngừng hoạt động');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(rowButton('Bệnh nhân 1')).toHaveFocus());
    // và không phải nút của hàng khác
    expect(rowButton('Bệnh nhân 2')).not.toHaveFocus();
  });

  it('TKF9-37 không có hành động (bảng không bị dựng lại): vẫn về đúng nút hàng (hook chung đã lo; ca này giữ cho khỏi hồi quy)', async () => {
    installFakeApi({ accounts: [makePatient(1), makePatient(2)] });
    renderPatientPage();
    await openFromKeyboardFocus('Bệnh nhân 2');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(rowButton('Bệnh nhân 2')).toHaveFocus();
  });

  it('TKF9-37 hàng không còn trong danh sách (đang lọc "Đang hoạt động", vừa khoá nên bị loại): focus về ô tìm, không về BODY', async () => {
    installFakeApi({ accounts: [makePatient(1), makePatient(2)] });
    renderPatientPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc trạng thái' }), {
      target: { value: 'DangHoatDong' },
    });
    await screen.findByText('2 bệnh nhân');
    await openFromKeyboardFocus('Bệnh nhân 1');
    await lockFromPanel('Bệnh nhân 1');
    await screen.findByText('1 bệnh nhân');
    expect(
      screen.queryByRole('button', { name: 'Xem chi tiết Bệnh nhân 1' }),
    ).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('searchbox', SEARCH)).toHaveFocus(),
    );
  });

  it('TKF9-37 404 (bệnh nhân đã biến mất): panel tự đóng, focus về ô tìm', async () => {
    const api = installFakeApi({ accounts: [makePatient(1), makePatient(2)] });
    renderPatientPage();
    await openFromKeyboardFocus('Bệnh nhân 1');
    api.accounts.splice(0, 1); // người khác vừa xoá: POST …/lock trả 404 và danh sách không còn dòng này
    const panel = screen.getByRole('dialog', { name: 'Bệnh nhân 1' });
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

  it('TKF9-37 KHÔNG giành focus: nếu focus đang ở một điều khiển khác (không phải BODY) khi panel đóng thì giữ nguyên', async () => {
    installFakeApi({ accounts: [makePatient(1), makePatient(2)] });
    renderPatientPage();
    const opener = await openFromKeyboardFocus('Bệnh nhân 1');
    await lockFromPanel('Bệnh nhân 1');
    await waitFor(() => expect(rowButton('Bệnh nhân 1')).not.toBe(opener));
    await within(screen.getByRole('dialog')).findByText('Ngừng hoạt động');

    // Panel hiện lại sau hộp xác nhận nên nhớ `previousFocus = document.body`; khi đóng, hook chung gọi `body.focus()`. Trình duyệt thật coi lời gọi
    // này là không làm gì (body không focus được: đo ở BR-8), còn happy-dom lại chuyển focus về body và làm ca này đỏ vô lý: vô hiệu riêng ở đây.
    vi.spyOn(document.body, 'focus').mockImplementation(() => undefined);
    const filter = screen.getByRole('combobox', { name: 'Lọc trạng thái' });
    filter.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(filter).toHaveFocus();
    expect(rowButton('Bệnh nhân 1')).not.toHaveFocus();
  });
});
