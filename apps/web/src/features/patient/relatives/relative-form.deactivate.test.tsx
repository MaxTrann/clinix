import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { BIRTH_DATE_AFTER_TODAY_MESSAGE } from '../profile/profile-errors';
import { SAMPLE_RELATIVES } from '../testing/fake-profile-api';
import { setUpApi } from '../testing/profile-page-harness';
import {
  VALID_INPUT,
  addForm,
  editFormOf,
  fieldsOf,
  fill,
} from '../testing/relatives-harness';
import { RelativeForm } from './relative-form';

// patient F7 (TRACKING F7-C, F7-H): RelativeForm đứng riêng. (1) `leadingAction`: nút phụ hiện trong form sửa mà không làm form gửi hay huỷ;
// (2) khoảng trống (b) của F6: ngày sinh kiểm theo GIỜ VIỆT NAM, không theo ngày UTC. Mã ca DW-nn là [đề xuất].
const BICH = SAMPLE_RELATIVES[0];
const sleep = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

function renderForm(
  relative: typeof BICH | null,
  leadingAction?: React.ReactNode,
) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onReload = vi.fn();
  render(
    <RelativeForm
      relative={relative}
      onSaved={onSaved}
      onCancel={onCancel}
      onReload={onReload}
      leadingAction={leadingAction}
    />,
  );
  const form = relative === null ? addForm() : editFormOf(relative.hoTen);
  return { onSaved, onCancel, onReload, form, fields: fieldsOf(form) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RelativeForm có leadingAction (NT-23)', () => {
  it('DW-62 NT-23 nút phụ nằm TRONG form, đứng đầu hàng nút cuối (trước "Hủy"); bấm nó không gửi, không huỷ, không đổi ô nhập', async () => {
    const { profile } = await setUpApi({}, SAMPLE_RELATIVES);
    const onPress = vi.fn();
    const { form, fields, onSaved, onCancel } = renderForm(
      BICH,
      <button type="button" onClick={onPress}>
        Nút phụ
      </button>,
    );
    fill(form, { name: 'Tên đã gõ dở' });
    const extra = within(form).getByRole('button', { name: 'Nút phụ' });
    expect(
      within(form)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Nút phụ', 'Hủy', 'Lưu thay đổi']);

    fireEvent.click(extra);
    await sleep();

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      profile.relatives.requests.filter((r) => r.method === 'PUT'),
    ).toHaveLength(0);
    expect(fields.name).toHaveValue('Tên đã gõ dở');
  });

  it('DW-63 NT-23 không truyền leadingAction ⇒ chỉ hai nút "Hủy" và "Lưu thay đổi" (form thêm cũng vậy)', () => {
    const { form } = renderForm(null);
    expect(
      within(form)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Hủy', 'Thêm hồ sơ']);
  });
});

describe('ngày sinh theo GIỜ VIỆT NAM, không theo ngày UTC (khoảng trống (b) của F6)', () => {
  // 01:30 ngày 07/11/2026 giờ Việt Nam vẫn là 18:30 ngày 06/11 theo UTC: bản dùng ngày UTC sẽ chặn nhầm 07/11 hợp lệ
  it.each([
    ['2026-11-06T18:30:00Z', '07/11/2026', '08/11/2026'],
    // 23:59:59 ngày 07/11 giờ Việt Nam
    ['2026-11-07T16:59:59Z', '07/11/2026', '08/11/2026'],
    // 00:00:00 ngày 08/11 giờ Việt Nam: 08/11 trở thành hôm nay
    ['2026-11-07T17:00:00Z', '08/11/2026', '09/11/2026'],
  ])(
    'DW-64 NT-21 giờ giả %s: ngày sinh %s hợp lệ, %s bị chặn "không được sau hôm nay"',
    async (now, valid, tomorrow) => {
      await setUpApi({}, SAMPLE_RELATIVES);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      const { form, fields, onSaved } = renderForm(null);

      fill(form, { ...VALID_INPUT, birth: tomorrow });
      fireEvent.click(fields.submit);
      await sleep();
      expect(
        within(form).getByText(BIRTH_DATE_AFTER_TODAY_MESSAGE),
      ).toBeVisible();
      expect(onSaved).not.toHaveBeenCalled();

      fill(form, { birth: valid });
      fireEvent.click(fields.submit);
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(
        within(form).queryByText(BIRTH_DATE_AFTER_TODAY_MESSAGE),
      ).toBeNull();
    },
  );

  it('DW-65 NT-22 cùng ranh giới ở form SỬA: ngày sinh bằng hôm nay (giờ Việt Nam) hợp lệ', async () => {
    await setUpApi({}, SAMPLE_RELATIVES);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T18:30:00Z'));
    const { form, fields, onSaved } = renderForm(BICH);

    fill(form, { birth: '07/11/2026' });
    fireEvent.click(fields.submit);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(BIRTH_DATE_AFTER_TODAY_MESSAGE)).toBeNull();
  });
});
