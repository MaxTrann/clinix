import { fireEvent, waitFor, within } from '@testing-library/react';
import { apiError } from '../../../test/fake-auth-api';
import {
  ADDED_MESSAGE,
  DEACTIVATED_MESSAGE,
  MISSING_MESSAGE,
  UPDATED_MESSAGE,
} from '../relatives/relative-errors';
import { SAMPLE_RELATIVES } from '../testing/fake-profile-api';
import { renderProfilePage } from '../testing/profile-page-harness';
import {
  editButtonOf,
  editFormOf,
  fieldsOf,
  fill,
  openAddForm,
  relativesRegion,
  waitForList,
} from '../testing/relatives-harness';

// patient F7 (TRACKING F7-H, F7-L): khoảng trống (c) của F6 — tông màu của thông báo. Câu 404 và 409 là LỖI, câu lưu xong là THÀNH CÔNG;
// trước F7 chỉ thấy được bằng class CSS. Thuộc tính `data-tone` trên thông báo (đúng một thuộc tính ở `relatives-section.tsx`, chữ không đổi)
// cho test kiểm được mà không dựa vào tên class. Mã ca DW-nn là [đề xuất].
const BICH = SAMPLE_RELATIVES[0].hoTen;

const notice = () =>
  within(relativesRegion()).getByRole('status').querySelector('[data-tone]');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openEdit() {
  const api = await renderProfilePage({ relatives: SAMPLE_RELATIVES });
  await waitForList();
  fireEvent.click(editButtonOf(BICH));
  return { ...api, fields: fieldsOf(editFormOf(BICH)) };
}

describe('tông màu của thông báo (khoảng trống (c) của F6)', () => {
  it('DW-86 NT-22 chưa có thông báo ⇒ vùng thông báo rỗng (không có phần tử mang tông)', async () => {
    await renderProfilePage({ relatives: SAMPLE_RELATIVES });
    await waitForList();
    expect(notice()).toBeNull();
  });

  it('DW-87 NT-22 PUT 404 ⇒ thông báo "không còn tồn tại" mang tông LỖI', async () => {
    const { profile, fields } = await openEdit();
    profile.relatives.failNext('PUT', () => apiError(404, 'KHONG_TIM_THAY'));
    fireEvent.click(fields.submit);

    await waitFor(() => expect(notice()).toHaveTextContent(MISSING_MESSAGE));
    expect(notice()).toHaveAttribute('data-tone', 'error');
  });

  it('DW-88 NT-22 PUT 409 HO_SO_NGUOI_THAN_DA_NGUNG ⇒ thông báo "đã ngừng sử dụng" mang tông LỖI', async () => {
    const { profile, fields } = await openEdit();
    profile.relatives.failNext('PUT', () => {
      profile.relatives.items[0].trangThaiHieuLuc = false;
      return apiError(409, 'HO_SO_NGUOI_THAN_DA_NGUNG');
    });
    fireEvent.click(fields.submit);

    await waitFor(() =>
      expect(notice()).toHaveTextContent(DEACTIVATED_MESSAGE),
    );
    expect(notice()).toHaveAttribute('data-tone', 'error');
  });

  it('DW-89 NT-22 PUT 200 ⇒ thông báo "Đã cập nhật" mang tông THÀNH CÔNG; chữ không đổi so với F6', async () => {
    const { fields } = await openEdit();
    fill(editFormOf(BICH), { phone: '0912345678' });
    fireEvent.click(fields.submit);

    await waitFor(() => expect(notice()).toHaveTextContent(UPDATED_MESSAGE));
    expect(notice()).toHaveAttribute('data-tone', 'success');
    expect(notice()?.textContent).toBe(UPDATED_MESSAGE);
  });

  it('DW-90 NT-21 POST 201 ⇒ thông báo "Đã thêm" mang tông THÀNH CÔNG', async () => {
    await renderProfilePage({ relatives: SAMPLE_RELATIVES });
    await waitForList();
    const add = openAddForm();
    fireEvent.click(add.submit);

    await waitFor(() => expect(notice()).toHaveTextContent(ADDED_MESSAGE));
    expect(notice()).toHaveAttribute('data-tone', 'success');
  });
});
