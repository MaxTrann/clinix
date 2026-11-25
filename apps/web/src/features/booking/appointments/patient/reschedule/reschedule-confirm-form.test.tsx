import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RescheduleConfirmForm } from './reschedule-confirm-form';
import { REQUEST_REASON_LIMITS } from './reschedule-reason-rules';
import { RESCHEDULE_TEXT } from './reschedule-text';

// reschedule F2, mã ca WDH-33 [đề xuất] và WDH-04 (PLAN reschedule 7.11): thành phần "cũ → mới" và ô lý do DÙNG CHUNG (props; reschedule F3 dùng lại với 1 đến 255). Không biết vai trò, không gọi API:
// chỉ nhận props và gọi `onSubmit`. Ký tự đặc biệt dựng bằng `String.fromCodePoint`. Dữ liệu giả.
const ACUTE = String.fromCodePoint(0x301);
const NBSP = String.fromCodePoint(0xa0);
const EMOJI = String.fromCodePoint(0x1f600);

afterEach(cleanup);

type Props = ComponentProps<typeof RescheduleConfirmForm>;
const REASON = {
  label: RESCHEDULE_TEXT.reasonLabel,
  hint: RESCHEDULE_TEXT.reasonHint,
  ...REQUEST_REASON_LIMITS,
};

function setup(overrides: Partial<Props> = {}) {
  const onSubmit = vi.fn();
  const props: Props = {
    current: { thoiGian: '2026-11-30T02:30:00.000Z' },
    next: { thoiGian: '2026-12-02T03:00:00.000Z' },
    reason: REASON,
    submitLabel: RESCHEDULE_TEXT.requestButton,
    submittingLabel: RESCHEDULE_TEXT.sending,
    submitting: false,
    onSubmit,
    ...overrides,
  };
  const view = render(<RescheduleConfirmForm {...props} />);
  return { onSubmit, props, ...view };
}
const field = () =>
  screen.getByRole('textbox', { name: RESCHEDULE_TEXT.reasonLabel });
const type = (value: string) =>
  fireEvent.change(field(), { target: { value } });
const submit = (name: string = RESCHEDULE_TEXT.requestButton) =>
  fireEvent.click(screen.getByRole('button', { name }));
const rangeMessage = RESCHEDULE_TEXT.reasonRange(5, 500);

describe('cũ → mới (WDH-33)', () => {
  it('WDH-33 hai thẻ "Lịch hiện tại" và "Lịch mới" theo GIỜ VIỆT NAM (02:30Z ⇒ 09:30; 03:00Z ⇒ 10:00)', () => {
    setup({ reason: null, submitLabel: RESCHEDULE_TEXT.confirmButton });
    const current = screen
      .getByRole('heading', { name: RESCHEDULE_TEXT.currentTitle })
      .closest('section') as HTMLElement;
    const next = screen
      .getByRole('heading', { name: RESCHEDULE_TEXT.newTitle })
      .closest('section') as HTMLElement;
    expect(current).toHaveTextContent('09:30');
    expect(current).toHaveTextContent('30/11/2026');
    expect(next).toHaveTextContent('10:00');
    expect(next).toHaveTextContent('02/12/2026');
  });

  it('WDH-33 17:30Z đã là 00:30 NGÀY HÔM SAU ở Việt Nam (không dùng giờ máy)', () => {
    setup({
      reason: null,
      current: { thoiGian: '2026-11-30T17:30:00.000Z' },
      next: { thoiGian: '2026-12-01T17:30:00.000Z' },
    });
    const next = screen
      .getByRole('heading', { name: RESCHEDULE_TEXT.newTitle })
      .closest('section') as HTMLElement;
    expect(next).toHaveTextContent('00:30');
    expect(next).toHaveTextContent('02/12/2026');
    expect(next).not.toHaveTextContent('17:30');
  });

  it('WDH-33 dòng nhắc (`intro`) hiện khi có, không hiện khi vắng', () => {
    const first = setup({ intro: 'Dòng nhắc thử' });
    expect(screen.getByText('Dòng nhắc thử')).toBeInTheDocument();
    first.unmount();
    setup({});
    expect(screen.queryByText('Dòng nhắc thử')).toBeNull();
  });
});

describe('không có ô lý do (nhánh tự đổi)', () => {
  it('WDH-33 `reason = null` ⇒ KHÔNG có ô nhập; bấm nút gọi `onSubmit(null)` đúng một lần', () => {
    const { onSubmit } = setup({
      reason: null,
      submitLabel: RESCHEDULE_TEXT.confirmButton,
    });
    expect(screen.queryByRole('textbox')).toBeNull();
    submit(RESCHEDULE_TEXT.confirmButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(null);
  });
});

describe('ô lý do bắt buộc 5 đến 500 (WDH-04, WDH-33)', () => {
  it('WDH-04 ô có nhãn, bắt buộc, gợi ý và bộ đếm "0/500 ký tự"; chưa có lỗi', () => {
    setup();
    expect(field()).toHaveAttribute('aria-required', 'true');
    expect(field()).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText(RESCHEDULE_TEXT.reasonHint)).toBeInTheDocument();
    expect(screen.getByText('0/500 ký tự')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WDH-04 bộ đếm theo ĐIỂM MÃ của chữ đã chuẩn hoá: 2 emoji là 2; khoảng trắng hai đầu không tính', () => {
    setup();
    type(`  ${EMOJI}${EMOJI}  `);
    expect(screen.getByText('2/500 ký tự')).toBeInTheDocument();
    type(`e${ACUTE}e${ACUTE}e${ACUTE}`);
    expect(screen.getByText('3/500 ký tự')).toBeInTheDocument();
  });

  it('WDH-04 bấm gửi khi ô trống ⇒ KHÔNG gọi `onSubmit`, lỗi cạnh ô, tiêu điểm vào ô', () => {
    const { onSubmit } = setup();
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(rangeMessage);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription(new RegExp(rangeMessage));
    expect(document.activeElement).toBe(field());
  });

  it.each([
    ['4 ký tự', 'abcd', false],
    ['5 ký tự', 'abcde', true],
    ['chỉ khoảng trắng', '          ', false],
    ['4 emoji (8 đơn vị UTF-16)', EMOJI.repeat(4), false],
    ['5 emoji', EMOJI.repeat(5), true],
    ['3 chữ có dấu rời (NFC còn 3)', `e${ACUTE}`.repeat(3), false],
    ['500 ký tự', 'a'.repeat(500), true],
    ['501 ký tự', 'a'.repeat(501), false],
    ['500 emoji', EMOJI.repeat(500), true],
    ['501 emoji', EMOJI.repeat(501), false],
    ['251 chữ có dấu rời (NFC 251, thô 502)', `e${ACUTE}`.repeat(251), true],
    ['chứa Tab', 'abc\tdef', false],
  ])('WDH-33 %s ⇒ %s', (_name, text, accepted) => {
    const { onSubmit } = setup();
    type(text);
    submit();
    if (accepted) {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alert')).toBeNull();
    } else {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    }
  });

  it('WDH-33 chữ gửi đi là chữ ĐÃ chuẩn hoá (NFC, cắt khoảng trắng ASCII); U+00A0 hai đầu giữ nguyên', () => {
    const { onSubmit } = setup();
    type(`  \n${'e' + ACUTE}${'e' + ACUTE}abc \t`);
    submit();
    expect(onSubmit).toHaveBeenLastCalledWith(
      `${String.fromCodePoint(0xe9).repeat(2)}abc`,
    );
    onSubmit.mockClear();
    type(`${NBSP}abc${NBSP}`);
    submit();
    expect(onSubmit).toHaveBeenLastCalledWith(`${NBSP}abc${NBSP}`);
  });

  it('WDH-33 quá dài hay có Tab hiện lỗi NGAY khi gõ (trước khi bấm gửi); quá ngắn thì chưa báo cho tới khi bấm gửi', () => {
    setup();
    type('abc');
    expect(screen.queryByRole('alert')).toBeNull();
    type('a'.repeat(501));
    expect(screen.getByRole('alert')).toHaveTextContent(rangeMessage);
    type('a'.repeat(500));
    expect(screen.queryByRole('alert')).toBeNull();
    type('abc\tdef');
    expect(screen.getByRole('alert')).toHaveTextContent(
      RESCHEDULE_TEXT.reasonControl,
    );
  });

  it('WDH-33 sau lần bấm gửi lỗi, lỗi theo dõi chữ đang gõ: gõ đủ thì hết lỗi, rồi gửi được', () => {
    const { onSubmit } = setup();
    type('ab');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(rangeMessage);
    type('abcde');
    expect(screen.queryByRole('alert')).toBeNull();
    submit();
    expect(onSubmit).toHaveBeenCalledWith('abcde');
  });

  it('WDH-04 GIỮ nội dung khi lỗi cạnh ô: lỗi từ máy chủ (`reasonError`) hiện cạnh ô và chữ đã gõ còn nguyên', () => {
    const { rerender, props } = setup();
    type('Cần đổi vì có việc');
    rerender(
      <RescheduleConfirmForm {...props} reasonError="Lỗi của máy chủ" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Lỗi của máy chủ');
    expect(field()).toHaveValue('Cần đổi vì có việc');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });

  it('WDH-33 lỗi cục bộ đứng TRƯỚC lỗi của máy chủ (một lời báo mỗi lần)', () => {
    const { rerender, props } = setup();
    type('a'.repeat(501));
    rerender(
      <RescheduleConfirmForm {...props} reasonError="Lỗi của máy chủ" />,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(rangeMessage);
  });

  it('WDH-33 đang gửi ⇒ nút khoá và đổi chữ, ô chỉ đọc (vẫn nhận Tab, chữ còn), bấm không gọi `onSubmit`', () => {
    const { onSubmit } = setup({ submitting: true });
    expect(field()).toHaveAttribute('readonly');
    const button = screen.getByRole('button', {
      name: RESCHEDULE_TEXT.sending,
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('WDH-33 `focusReasonKey` đổi ⇒ tiêu điểm vào ô lý do; không đổi thì không giành tiêu điểm', () => {
    const { rerender, props } = setup({ focusReasonKey: 0 });
    expect(document.activeElement).not.toBe(field());
    rerender(<RescheduleConfirmForm {...props} focusReasonKey={1} />);
    expect(document.activeElement).toBe(field());
  });

  it('WDH-33 giới hạn là tham số: 1 đến 255 (Lễ tân đổi hộ) ⇒ nhãn, bộ đếm và luật theo tham số', () => {
    const { onSubmit } = setup({
      reason: {
        label: 'Lý do đổi hộ',
        hint: 'Bệnh nhân sẽ đọc lý do này.',
        min: 1,
        max: 255,
      },
      submitLabel: 'Đổi lịch hộ',
    });
    expect(
      screen.getByRole('textbox', { name: 'Lý do đổi hộ' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Bệnh nhân sẽ đọc lý do này.')).toBeInTheDocument();
    expect(screen.getByText('0/255 ký tự')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });
    submit('Đổi lịch hộ');
    expect(onSubmit).toHaveBeenCalledWith('a');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'a'.repeat(256) },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      RESCHEDULE_TEXT.reasonRange(1, 255),
    );
  });

  it('WDH-33 `renderNotice` nhận hàm gửi lại: bấm "Thử lại" gửi CHÍNH chữ đang có (đã chuẩn hoá); chữ chưa hợp lệ thì báo lỗi ở ô', () => {
    const { onSubmit } = setup({
      renderNotice: (submitNow) => (
        <button type="button" onClick={submitNow}>
          Thử lại
        </button>
      ),
    });
    type('  Lý do hợp lệ  ');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onSubmit).toHaveBeenCalledWith('Lý do hợp lệ');
    onSubmit.mockClear();
    type('ab');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(rangeMessage);
  });

  it('WDH-33 ô nhập tắt gợi ý của trình duyệt (lý do là thông tin cá nhân) và không `maxLength` (không cắt thầm đoạn dán dài)', () => {
    setup();
    expect(field()).toHaveAttribute('autocomplete', 'off');
    expect(field()).not.toHaveAttribute('maxlength');
  });
});
