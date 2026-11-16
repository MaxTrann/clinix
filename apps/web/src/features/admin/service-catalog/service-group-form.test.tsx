import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ServiceGroupForm } from './service-group-form';
import type { FormFeedback } from './catalog-errors';

// AF3-11 (admin PR2 mục 6.2, 6.3): form nhóm dịch vụ. Lỗi dưới đúng ô, một vùng báo duy nhất, không gọi API khi còn lỗi, focus vào ô
// lỗi đầu tiên mà không cướp focus, nút Lưu chỉ mờ khi đang lưu (Đại chọn bỏ mờ khi tên trống, 16/11/2026).

function renderForm(
  props: Partial<ComponentProps<typeof ServiceGroupForm>> = {},
) {
  const onSubmit = vi.fn();
  const view = render(
    <ServiceGroupForm
      pending={false}
      feedback={null}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { ...view, onSubmit };
}

const nameInput = () => screen.getByLabelText(/Tên nhóm/);
const orderInput = () => screen.getByLabelText(/Thứ tự hiển thị/);
const saveButton = () =>
  screen.getByRole('button', { name: /Lưu nhóm|Đang lưu/ });

describe('ServiceGroupForm: lỗi phía form (AF3-11)', () => {
  it('AF3-11 nút Lưu KHÔNG mờ khi tên trống, để câu lỗi hiện được', () => {
    renderForm();

    expect(nameInput()).toHaveValue('');
    expect(saveButton()).toBeEnabled();
  });

  it('AF3-11 tên trống: lỗi dưới ô tên, không gọi onSubmit, focus vào ô tên, ô có aria-invalid và aria-describedby', () => {
    const { onSubmit } = renderForm();
    orderInput().focus();

    fireEvent.click(saveButton());

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Vui lòng nhập tên nhóm.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput()).toHaveAttribute('aria-describedby', alert.id);
    expect(nameInput()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AF3-11 tên toàn dấu cách cũng là tên trống', () => {
    const { onSubmit } = renderForm();

    fireEvent.change(nameInput(), { target: { value: '   ' } });
    fireEvent.click(saveButton());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Vui lòng nhập tên nhóm.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([[''], ['-1'], ['1.5'], ['1e2']])(
    'AF3-11 thứ tự %j: lỗi dưới ô thứ tự, focus vào ô thứ tự, không gọi onSubmit',
    (order) => {
      const { onSubmit } = renderForm();
      fireEvent.change(nameInput(), { target: { value: 'Nhóm mới' } });
      fireEvent.change(orderInput(), { target: { value: order } });

      fireEvent.click(saveButton());

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Thứ tự phải là số nguyên không âm.',
      );
      expect(orderInput()).toHaveAttribute('aria-invalid', 'true');
      expect(orderInput()).toHaveFocus();
      expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true');
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('AF3-11 hợp lệ: gọi onSubmit đúng một lần với dữ liệu đã đổi kiểu, không có lỗi nào', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(nameInput(), { target: { value: 'Tầm soát' } });
    fireEvent.change(orderInput(), { target: { value: '3' } });

    fireEvent.click(saveButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      ten: 'Tầm soát',
      thuTuHienThi: 3,
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AF3-11 sửa ô đang lỗi thì lỗi của ô đó biến mất', () => {
    renderForm();
    fireEvent.click(saveButton());
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(nameInput(), { target: { value: 'A' } });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('AF3-11 đang lưu: nút mờ và đổi chữ', () => {
    renderForm({ pending: true });

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent('Đang lưu…');
  });

  it('AF3-11 bấm đúp: onSubmit chạy một lần cho tới khi lần lưu xong', async () => {
    let finish: () => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = renderForm({ onSubmit });
    fireEvent.change(nameInput(), { target: { value: 'Nhóm' } });
    const form = container.querySelector('form') as HTMLFormElement;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    finish();
    await vi.waitFor(() => {
      fireEvent.submit(form);
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ServiceGroupForm: lỗi từ máy chủ (AF3-11)', () => {
  const duplicate: FormFeedback = {
    message: '',
    fields: { ten: 'Tên nhóm dịch vụ đã tồn tại.' },
  };

  it('AF3-11 lỗi gắn ô: đúng MỘT vùng báo, ở dưới ô tên, không banner', () => {
    renderForm({ feedback: duplicate });

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Tên nhóm dịch vụ đã tồn tại.');
    expect(nameInput()).toHaveAttribute('aria-describedby', alerts[0]?.id);
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('AF3-11 lỗi không gắn ô: banner là vùng báo duy nhất, không ô nào bị đánh dấu', () => {
    renderForm({
      feedback: {
        message: 'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
        fields: {},
      },
    });

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );
    expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true');
    expect(orderInput()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('AF3-11 feedback MỚI đến thì focus vào ô lỗi đầu tiên', () => {
    const { rerender, onSubmit } = renderForm();
    orderInput().focus();

    rerender(
      <ServiceGroupForm
        pending={false}
        feedback={duplicate}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(nameInput()).toHaveFocus();
  });

  it('AF3-11 điều kiện B: render lại với CÙNG feedback, hay gõ vào ô khác, không kéo focus về ô lỗi', () => {
    const { rerender, onSubmit } = renderForm({ feedback: duplicate });
    orderInput().focus();

    fireEvent.change(orderInput(), { target: { value: '5' } });
    rerender(
      <ServiceGroupForm
        pending={false}
        feedback={duplicate}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(orderInput()).toHaveFocus();
  });

  it('AF3-11 điều kiện B: sau lỗi phía form, gõ vào ô khác không kéo focus về ô lỗi', () => {
    renderForm();
    fireEvent.click(saveButton());
    expect(nameInput()).toHaveFocus();

    orderInput().focus();
    fireEvent.change(orderInput(), { target: { value: '4' } });

    expect(orderInput()).toHaveFocus();
  });
});
