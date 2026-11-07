import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { apiError } from '../../../test/fake-auth-api';
import { SAMPLE_RELATIVES } from '../testing/fake-profile-api';
import { setUpApi } from '../testing/profile-page-harness';
import {
  VALID_INPUT,
  addForm,
  editFormOf,
  fieldsOf,
  fill,
} from '../testing/relatives-harness';
import { DEACTIVATED_MESSAGE, MISSING_MESSAGE } from './relative-errors';
import { RelativeForm } from './relative-form';

// patient F6 (TRACKING F6-G, F6-H): RelativeForm đứng riêng, để kiểm onSaved và onReload KHÔNG bị gọi sau khi form đã gỡ
// (qua trang thì cha cũng bị gỡ, không thấy được; cùng cách F3 PW-55). Mã ca RW-nn là [đề xuất].
const BICH = SAMPLE_RELATIVES[0];
const sleep = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

function renderForm(relative: typeof BICH | null) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onReload = vi.fn();
  const view = render(
    <RelativeForm
      relative={relative}
      onSaved={onSaved}
      onCancel={onCancel}
      onReload={onReload}
    />,
  );
  const form = relative === null ? addForm() : editFormOf(relative.hoTen);
  return { onSaved, onCancel, onReload, view, form, fields: fieldsOf(form) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RelativeForm: onSaved, onReload, gỡ form', () => {
  it('RW-125 NT-21 form còn gắn: onSaved nhận hồ sơ ĐỌC LẠI từ máy chủ (SĐT chuẩn hoá), đúng một lần; không onReload, không onCancel', async () => {
    await setUpApi({}, SAMPLE_RELATIVES);
    const { onSaved, onCancel, onReload, form } = renderForm(null);
    fill(form, { ...VALID_INPUT, phone: '0912 345 678' });
    fireEvent.click(fieldsOf(form).submit);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        hoSoNguoiThanId: '3',
        hoTen: 'Trần Thị Cúc',
        soDienThoai: '0912345678',
        trangThaiHieuLuc: true,
      }),
    );
    expect(onReload).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('RW-126 NT-21 gỡ form giữa lúc POST: thành công hoặc lỗi mạng sau khi gỡ ⇒ KHÔNG onSaved, KHÔNG onReload, không console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    for (const outcome of ['ok', 'network'] as const) {
      const { profile } = await setUpApi({}, SAMPLE_RELATIVES);
      const { onSaved, onReload, view, form } = renderForm(null);
      fill(form, VALID_INPUT);
      const release = profile.relatives.hold('POST');
      fireEvent.click(fieldsOf(form).submit);
      await waitFor(() => expect(profile.relatives.count('POST')).toBe(1));

      view.unmount();
      if (outcome === 'ok') release(201, { ...BICH, hoSoNguoiThanId: '8' });
      else release(502, {});
      await sleep();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onReload).not.toHaveBeenCalled();
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('RW-127 NT-22 PUT 404 và 409 ⇒ onReload đúng một lần kèm câu thông báo, form KHÔNG tự hiện hộp lỗi và bật lại nút; không onSaved', async () => {
    const cases: [number, string, string][] = [
      [404, 'KHONG_TIM_THAY', MISSING_MESSAGE],
      [409, 'HO_SO_NGUOI_THAN_DA_NGUNG', DEACTIVATED_MESSAGE],
    ];
    for (const [status, maLoi, notice] of cases) {
      const { profile } = await setUpApi({}, SAMPLE_RELATIVES);
      const { onSaved, onReload, view, form, fields } = renderForm(BICH);
      profile.relatives.failNext('PUT', () => apiError(status, maLoi));
      fireEvent.click(fields.submit);

      await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
      expect(onReload).toHaveBeenCalledWith(notice);
      expect(onSaved).not.toHaveBeenCalled();
      expect(form.querySelector('[role="alert"]')).toBeNull();
      await waitFor(() => expect(fields.submit).toBeEnabled());
      view.unmount();
    }
  });

  it('RW-128 NT-22 gỡ form giữa lúc PUT rồi PUT trả 404 hoặc 409 ⇒ KHÔNG onReload', async () => {
    const { profile } = await setUpApi({}, SAMPLE_RELATIVES);
    const { onReload, view, fields } = renderForm(BICH);
    const release = profile.relatives.hold('PUT');
    fireEvent.click(fields.submit);
    await waitFor(() => expect(profile.relatives.count('PUT')).toBe(1));

    view.unmount();
    release(409, { maLoi: 'HO_SO_NGUOI_THAN_DA_NGUNG', thongBao: 'x' });
    await sleep();
    expect(onReload).not.toHaveBeenCalled();
  });

  it('RW-129 NT-21 POST không rõ kết quả: nút "Tải lại danh sách" gọi onReload KHÔNG kèm câu (chỉ tải lại, không thông báo)', async () => {
    const { profile } = await setUpApi({}, SAMPLE_RELATIVES);
    const { onReload, form, fields } = renderForm(null);
    fill(form, VALID_INPUT);
    profile.relatives.failNext('POST', () => {
      throw new TypeError('Failed to fetch');
    });
    fireEvent.click(fields.submit);

    const reload = await screen.findByRole('button', {
      name: 'Tải lại danh sách',
    });
    fireEvent.click(reload);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledWith();
  });
});
