import { fireEvent, render, screen, within } from '@testing-library/react';
import { QuickApplyPanel } from './quick-apply-panel';

// AF6-04 (admin PR2 mục 6.4, điều kiện D): panel "Áp dụng nhanh". Logic áp dụng ở `quick-apply.test.ts` (AF6-03); ở đây khoá
// truy cập (fieldset + legend, radio thật cùng name, nhãn từng ngày, một vùng aria-live, nút mờ có lý do đọc được) và luồng thao tác.

const HELP =
  'Nhập giờ hợp lệ (24 giờ), giờ kết thúc sau giờ bắt đầu và chọn ít nhất một ngày.';

function renderPanel(props: { disabled?: boolean } = {}) {
  const onApply = vi.fn();
  const view = render(<QuickApplyPanel onApply={onApply} {...props} />);
  return { ...view, onApply };
}

const startInput = () => screen.getByLabelText('Áp dụng nhanh giờ bắt đầu');
const endInput = () => screen.getByLabelText('Áp dụng nhanh giờ kết thúc');
const applyButton = () => screen.getByRole('button', { name: 'Áp dụng' });
const dayBox = (label: string) => screen.getByRole('checkbox', { name: label });

function fillTimes(start = '08:00', end = '11:30') {
  fireEvent.change(startInput(), { target: { value: start } });
  fireEvent.change(endInput(), { target: { value: end } });
}

const liveRegions = (container: HTMLElement) =>
  container.querySelectorAll('[aria-live="polite"]');

describe('QuickApplyPanel: cấu trúc truy cập (điều kiện D)', () => {
  it('AF6-04 là một fieldset có legend "Áp dụng nhanh"', () => {
    renderPanel();

    const group = screen.getByRole('group', { name: 'Áp dụng nhanh' });
    expect(group.tagName).toBe('FIELDSET');
    expect(within(group).getByText('Áp dụng nhanh').tagName).toBe('LEGEND');
  });

  it('AF6-04 chọn buổi bằng hai radio THẬT cùng name; mặc định Sáng', () => {
    renderPanel();

    const [morning, afternoon] = screen.getAllByRole(
      'radio',
    ) as HTMLInputElement[];
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(morning).toHaveAccessibleName('Sáng');
    expect(afternoon).toHaveAccessibleName('Chiều');
    expect(morning?.type).toBe('radio');
    expect(morning?.name).not.toBe('');
    expect(afternoon?.name).toBe(morning?.name);
    expect(morning).toBeChecked();
    expect(afternoon).not.toBeChecked();
  });

  it('AF6-04 mỗi ô tick ngày có nhãn truy cập riêng, đủ 7 ngày', () => {
    renderPanel();

    for (const label of [
      'Thứ 2',
      'Thứ 3',
      'Thứ 4',
      'Thứ 5',
      'Thứ 6',
      'Thứ 7',
      'CN',
    ])
      expect(dayBox(label)).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(7);
  });

  it('AF6-04 hai ô giờ là TimeInput24 có nhãn truy cập', () => {
    renderPanel();

    expect(startInput()).toHaveAttribute('placeholder', '08:00');
    expect(endInput()).toHaveAttribute('placeholder', '08:00');
    expect(startInput()).toHaveAttribute('type', 'text');
  });

  it('AF6-04 nút Áp dụng mờ lúc đầu và có lý do đọc được qua aria-describedby', () => {
    renderPanel();

    expect(applyButton()).toBeDisabled();
    expect(applyButton()).toHaveAccessibleDescription(HELP);
    expect(screen.getByText(HELP)).toBeInTheDocument();
  });

  it('AF6-04 có đúng MỘT vùng aria-live="polite", có sẵn trong DOM từ đầu và rỗng', () => {
    const { container } = renderPanel();

    expect(liveRegions(container)).toHaveLength(1);
    expect(liveRegions(container)[0]).toHaveTextContent('');
  });
});

describe('QuickApplyPanel: điều kiện bật nút Áp dụng', () => {
  it('AF6-04 đủ giờ hợp lệ và có ngày thì bật', () => {
    renderPanel();
    fillTimes();
    fireEvent.click(screen.getByRole('button', { name: 'T2–T6' }));

    expect(applyButton()).toBeEnabled();
  });

  it.each([
    ['thiếu giờ kết thúc', '08:00', '', true],
    ['giờ dở dang "8:0"', '8:0', '11:30', true],
    ['giờ không hợp lệ 24:00', '08:00', '24:00', true],
    ['giờ không hợp lệ 12:60', '08:00', '12:60', true],
    ['bắt đầu sau kết thúc', '12:00', '11:30', true],
    ['bắt đầu bằng kết thúc', '08:00', '08:00', true],
    ['không tick ngày nào', '08:00', '11:30', false],
  ])('AF6-04 %s ⇒ nút vẫn mờ', (_name, start, end, withDays) => {
    renderPanel();
    fillTimes(start, end);
    if (withDays)
      fireEvent.click(screen.getByRole('button', { name: 'T2–T6' }));

    expect(applyButton()).toBeDisabled();
  });

  it('AF6-04 bỏ tick hết rồi thì nút lại mờ', () => {
    renderPanel();
    fillTimes();
    fireEvent.click(dayBox('Thứ 2'));
    expect(applyButton()).toBeEnabled();

    fireEvent.click(dayBox('Thứ 2'));

    expect(applyButton()).toBeDisabled();
  });
});

describe('QuickApplyPanel: chọn ngày nhanh', () => {
  it('AF6-04 "Tất cả" tick cả 7 ngày', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));

    for (const box of screen.getAllByRole('checkbox'))
      expect(box).toBeChecked();
  });

  it('AF6-04 "T2–T6" tick đúng Thứ 2 đến Thứ 6 và BỎ tick Thứ 7, CN', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));

    fireEvent.click(screen.getByRole('button', { name: 'T2–T6' }));

    for (const label of ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'])
      expect(dayBox(label)).toBeChecked();
    expect(dayBox('Thứ 7')).not.toBeChecked();
    expect(dayBox('CN')).not.toBeChecked();
  });

  it('AF6-04 chỉ có hai nút chọn nhanh (Đại chốt 16/11/2026)', () => {
    renderPanel();

    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.textContent)
        .sort(),
    ).toEqual(['T2–T6', 'Tất cả', 'Áp dụng'].sort());
  });
});

describe('QuickApplyPanel: áp dụng', () => {
  it('AF6-04 Áp dụng gọi onApply với buổi, giờ và ngày đã chọn, rồi báo một lần', () => {
    const { onApply, container } = renderPanel();
    fillTimes('08:00', '11:30');
    fireEvent.click(screen.getByRole('button', { name: 'T2–T6' }));

    fireEvent.click(applyButton());

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      period: 'morning',
      start: '08:00',
      end: '11:30',
      days: [1, 2, 3, 4, 5],
    });
    expect(liveRegions(container)).toHaveLength(1);
    expect(liveRegions(container)[0]).toHaveTextContent(
      'Đã áp dụng cho Thứ 2–Thứ 6',
    );
  });

  it('AF6-04 chọn Chiều thì gửi period afternoon; ngày rời nhau mô tả "Thứ 2, Thứ 4, CN"', () => {
    const { onApply, container } = renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: 'Chiều' }));
    fillTimes('13:30', '17:00');
    for (const label of ['Thứ 2', 'Thứ 4', 'CN'])
      fireEvent.click(dayBox(label));

    fireEvent.click(applyButton());

    expect(onApply).toHaveBeenCalledWith({
      period: 'afternoon',
      start: '13:30',
      end: '17:00',
      days: [1, 3, 7],
    });
    expect(liveRegions(container)[0]).toHaveTextContent(
      'Đã áp dụng cho Thứ 2, Thứ 4, CN',
    );
  });

  it('AF6-04 render lại không nhân đôi hay lặp thông báo; vẫn đúng MỘT vùng aria-live', () => {
    const { container, rerender, onApply } = renderPanel();
    fillTimes();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    fireEvent.click(applyButton());

    rerender(<QuickApplyPanel onApply={onApply} />);
    rerender(<QuickApplyPanel onApply={onApply} />);

    expect(liveRegions(container)).toHaveLength(1);
    expect(screen.getAllByText('Đã áp dụng cho Thứ 2–CN')).toHaveLength(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('AF6-04 áp dụng hai lần liên tiếp gọi onApply hai lần', () => {
    const { onApply } = renderPanel();
    fillTimes();
    fireEvent.click(screen.getByRole('button', { name: 'T2–T6' }));

    fireEvent.click(applyButton());
    fireEvent.click(applyButton());

    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('AF6-04 sửa lại panel thì thông báo cũ biến mất (không báo sai trạng thái)', () => {
    const { container } = renderPanel();
    fillTimes();
    fireEvent.click(screen.getByRole('button', { name: 'T2–T6' }));
    fireEvent.click(applyButton());
    expect(liveRegions(container)[0]).toHaveTextContent('Đã áp dụng');

    fireEvent.change(endInput(), { target: { value: '12:00' } });

    expect(liveRegions(container)[0]).toHaveTextContent('');
  });

  it('AF6-04 giờ chuẩn hóa khi rời ô (8:00 ⇒ 08:00) nên Áp dụng nhận được giờ đúng dạng', () => {
    const { onApply } = renderPanel();
    fireEvent.change(startInput(), { target: { value: '8:00' } });
    fireEvent.blur(startInput());
    fireEvent.change(endInput(), { target: { value: '11:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'T2–T6' }));

    fireEvent.click(applyButton());

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ start: '08:00', end: '11:30' }),
    );
  });
});

describe('QuickApplyPanel: đang lưu', () => {
  it('AF6-04 disabled tạm dừng mọi điều khiển của panel', () => {
    renderPanel({ disabled: true });

    for (const control of [
      ...screen.getAllByRole('radio'),
      ...screen.getAllByRole('checkbox'),
      ...screen.getAllByRole('button'),
      startInput(),
      endInput(),
    ])
      expect(control).toBeDisabled();
  });
});
