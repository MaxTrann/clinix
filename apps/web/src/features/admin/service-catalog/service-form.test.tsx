import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError, NetworkError } from '../../../shared/api/errors';
import { feedbackFor } from './catalog-errors';
import { ServiceForm } from './service-form';
import type { ServiceCatalogItem, ServiceGroup } from './service-catalog-types';

// AF3-12 (dịch vụ khám: lỗi dưới ô, một chỗ, không gọi API khi còn lỗi), AF3-13 (ô giá trong form) và AF3-14 (form sửa nạp giá);
// admin PR2 mục 6.2 và 6.3.

const groups: ServiceGroup[] = [
  { nhomDichVuId: '1', ten: 'Khám tổng quát', thuTuHienThi: 1 },
  { nhomDichVuId: '2', ten: 'Xét nghiệm', thuTuHienThi: 2 },
];

function renderForm(props: Partial<ComponentProps<typeof ServiceForm>> = {}) {
  const onSubmit = vi.fn();
  const view = render(
    <ServiceForm
      groups={groups}
      pending={false}
      feedback={null}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { ...view, onSubmit };
}

const nameInput = () => screen.getByLabelText(/Tên dịch vụ/);
const groupSelect = () =>
  screen.getByRole('combobox', { name: /Nhóm dịch vụ/ });
const durationInput = () => screen.getByLabelText(/Thời lượng/);
const priceInput = () =>
  screen.getByLabelText(/Giá mặc định/) as HTMLInputElement;
const saveButton = () =>
  screen.getByRole('button', { name: /Lưu dịch vụ|Đang lưu/ });

function type(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

function fillValid() {
  type(nameInput(), 'Khám tim mạch');
  type(groupSelect(), '2');
  type(durationInput(), '30');
  type(priceInput(), '150000');
}

const alertTexts = () =>
  screen.queryAllByRole('alert').map((element) => element.textContent);

describe('ServiceForm: lỗi phía form (AF3-12)', () => {
  it('AF3-12 nút Lưu KHÔNG mờ khi tên trống; mờ khi đang lưu hoặc chưa có nhóm nào để chọn', () => {
    const { unmount } = renderForm();
    expect(saveButton()).toBeEnabled();
    unmount();

    const pending = renderForm({ pending: true });
    expect(saveButton()).toBeDisabled();
    pending.unmount();

    renderForm({ groups: [] });
    expect(saveButton()).toBeDisabled();
  });

  it('AF3-12 form trống: bốn lỗi, mỗi lỗi dưới đúng ô của nó, không gọi onSubmit, focus vào ô tên', () => {
    const { onSubmit } = renderForm();

    fireEvent.click(saveButton());

    expect(alertTexts()).toEqual([
      'Vui lòng nhập tên dịch vụ.',
      'Vui lòng chọn nhóm dịch vụ.',
      'Thời lượng phải là số nguyên dương.',
      'Vui lòng nhập giá.',
    ]);
    for (const [field, message] of [
      [nameInput(), 'Vui lòng nhập tên dịch vụ.'],
      [groupSelect(), 'Vui lòng chọn nhóm dịch vụ.'],
      [durationInput(), 'Thời lượng phải là số nguyên dương.'],
      [priceInput(), 'Vui lòng nhập giá.'],
    ] as const) {
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(
        expect.stringContaining(message),
      );
    }
    expect(nameInput()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['chọn nhóm', () => type(nameInput(), 'Khám'), () => groupSelect()],
    [
      'thời lượng',
      () => {
        type(nameInput(), 'Khám');
        type(groupSelect(), '1');
      },
      () => durationInput(),
    ],
    [
      'giá',
      () => {
        type(nameInput(), 'Khám');
        type(groupSelect(), '1');
        type(durationInput(), '30');
      },
      () => priceInput(),
    ],
  ])(
    'AF3-12 focus vào ô lỗi ĐẦU TIÊN theo thứ tự trên form: %s',
    (_name, fill, expected) => {
      renderForm();
      fill();

      fireEvent.click(saveButton());

      expect(expected()).toHaveFocus();
    },
  );

  it('AF3-12 giá 0: "Giá phải lớn hơn 0."', () => {
    renderForm();
    fillValid();
    type(priceInput(), '0');

    fireEvent.click(saveButton());

    expect(alertTexts()).toEqual(['Giá phải lớn hơn 0.']);
    expect(priceInput()).toHaveFocus();
  });

  it.each([['0'], ['-3'], ['1.5'], ['1e2'], ['2147483648']])(
    'AF3-12 thời lượng %j: lỗi dưới ô thời lượng, không gọi onSubmit',
    (duration) => {
      const { onSubmit } = renderForm();
      fillValid();
      type(durationInput(), duration);

      fireEvent.click(saveButton());

      expect(alertTexts()).toEqual(['Thời lượng phải là số nguyên dương.']);
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('AF3-12 hợp lệ: gọi onSubmit đúng một lần, giá là CHUỖI CHỮ SỐ thuần', () => {
    const { onSubmit } = renderForm();
    fillValid();

    fireEvent.click(saveButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      nhomDichVuId: '2',
      ten: 'Khám tim mạch',
      thoiLuong: 30,
      giaMacDinh: '150000',
    });
    expect(alertTexts()).toEqual([]);
  });

  it('AF3-12 bấm đúp: onSubmit chạy một lần cho tới khi lần lưu xong', async () => {
    let finish: () => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = renderForm({ onSubmit });
    fillValid();
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

  it('AF3-12 điều kiện B: sau lỗi phía form, gõ vào ô khác không kéo focus về ô lỗi', () => {
    renderForm();
    fireEvent.click(saveButton());
    expect(nameInput()).toHaveFocus();

    durationInput().focus();
    type(durationInput(), '45');

    expect(durationInput()).toHaveFocus();
  });

  it('AF3-12 sửa ô đang lỗi thì lỗi của ô đó biến mất, lỗi ô khác còn', () => {
    renderForm();
    fireEvent.click(saveButton());

    type(nameInput(), 'Khám');

    expect(alertTexts()).not.toContain('Vui lòng nhập tên dịch vụ.');
    expect(alertTexts()).toContain('Vui lòng chọn nhóm dịch vụ.');
  });
});

describe('ServiceForm: lỗi từ máy chủ chỉ hiện MỘT chỗ (AF3-12)', () => {
  it.each([
    ['TEN_DICH_VU_TRUNG', nameInput, 'Tên dịch vụ đã tồn tại trong nhóm này.'],
    [
      'THOI_LUONG_DANG_DUNG',
      durationInput,
      'Không thể đổi thời lượng vì dịch vụ đang được lịch hẹn hoặc khung giờ sử dụng.',
    ],
    [
      'NHOM_DICH_VU_KHONG_TON_TAI',
      groupSelect,
      'Nhóm dịch vụ không còn tồn tại. Hãy chọn nhóm khác.',
    ],
  ])(
    'AF3-12 %s: đúng một vùng báo, dưới đúng ô, không banner',
    (maLoi, field, text) => {
      renderForm({
        feedback: feedbackFor(new ApiError(409, { maLoi, thongBao: 'x' })),
      });

      expect(alertTexts()).toEqual([text]);
      expect(field()).toHaveAttribute('aria-invalid', 'true');
      expect(field()).toHaveAccessibleDescription(
        expect.stringContaining(text),
      );
    },
  );

  it('AF3-12 DU_LIEU_KHONG_HOP_LE có ô: chỉ các ô, KHÔNG có câu "Vui lòng kiểm tra lại…" hay banner', () => {
    renderForm({
      feedback: feedbackFor(
        new ApiError(400, {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [
            { truong: 'ten', ma: 'TEN_DICH_VU_KHONG_HOP_LE' },
            { truong: 'giaMacDinh', ma: 'GIA_MAC_DINH_KHONG_HOP_LE' },
          ],
        }),
      ),
    });

    expect(alertTexts()).toEqual([
      'Tên dịch vụ cần có từ 1 đến 100 ký tự.',
      'Giá phải là số nguyên đồng lớn hơn 0.',
    ]);
    expect(screen.queryByText(/Vui lòng kiểm tra lại/)).toBeNull();
  });

  it.each([
    [
      new ApiError(403, { maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' }),
      'Bạn không có quyền thực hiện thao tác này.',
    ],
    [
      new ApiError(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
      'Dữ liệu không còn tồn tại. Hãy tải lại danh sách.',
    ],
    [
      new NetworkError(),
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    ],
  ])(
    'AF3-12 lỗi không gắn ô (%#): banner là vùng báo duy nhất, không ô nào bị đánh dấu',
    (error, text) => {
      renderForm({ feedback: feedbackFor(error) });

      expect(alertTexts()).toEqual([text]);
      for (const field of [
        nameInput(),
        groupSelect(),
        durationInput(),
        priceInput(),
      ])
        expect(field).not.toHaveAttribute('aria-invalid', 'true');
    },
  );

  it('AF3-12 feedback MỚI đến thì focus vào ô lỗi đầu tiên; render lại cùng feedback thì không', () => {
    const feedback = feedbackFor(
      new ApiError(409, { maLoi: 'TEN_DICH_VU_TRUNG', thongBao: 'x' }),
    );
    const { rerender, onSubmit } = renderForm();
    durationInput().focus();

    rerender(
      <ServiceForm
        groups={groups}
        pending={false}
        feedback={feedback}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(nameInput()).toHaveFocus();

    durationInput().focus();
    rerender(
      <ServiceForm
        groups={groups}
        pending={false}
        feedback={feedback}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(durationInput()).toHaveFocus();
  });
});

describe('ServiceForm: ô giá (AF3-13)', () => {
  it('AF3-13 gõ tự ngăn nghìn; gửi đi là chuỗi chữ số thuần', () => {
    const { onSubmit } = renderForm();
    fillValid();

    type(priceInput(), '3.000.0000');

    expect(priceInput()).toHaveValue('30.000.000');
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ giaMacDinh: '30000000' }),
    );
  });

  it('AF3-13 gợi ý mới thay câu dấu chấm thập phân cũ, đứng trong mô tả của ô', () => {
    renderForm();

    expect(
      screen.getByText('Chỉ nhập số, đơn vị đồng. Ví dụ 150.000'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/thập phân/)).toBeNull();
    expect(priceInput()).toHaveAccessibleDescription(
      'Chỉ nhập số, đơn vị đồng. Ví dụ 150.000',
    );
    expect(priceInput()).toHaveAttribute('inputmode', 'numeric');
  });

  it('AF3-13 dán quá 10 chữ số: lỗi dưới ô giá, bỏ lần dán; gõ giá hợp lệ thì lỗi biến mất', () => {
    renderForm();
    fillValid();

    fireEvent.paste(priceInput(), {
      clipboardData: { getData: () => '12345678901' },
    });

    expect(alertTexts()).toEqual(['Giá tối đa 10 chữ số.']);
    expect(priceInput()).toHaveValue('150.000');

    type(priceInput(), '2000');
    expect(alertTexts()).toEqual([]);
  });
});

describe('ServiceForm: form sửa (AF3-14)', () => {
  const service: ServiceCatalogItem = {
    dichVuKhamId: '9',
    nhomDichVuId: '1',
    tenNhom: 'Khám tổng quát',
    ten: 'Khám nội tổng quát',
    thoiLuong: 30,
    giaMacDinh: '150000.00',
  };

  it('AF3-14 giá chẵn "150000.00" nạp đã định dạng "150.000", không có dòng gợi ý giá lẻ', () => {
    renderForm({ service });

    expect(priceInput()).toHaveValue('150.000');
    expect(screen.queryByText(/có phần lẻ/)).toBeNull();
  });

  it('AF3-14 lưu không đổi gì gửi chuỗi số nguyên', () => {
    const { onSubmit } = renderForm({ service });

    fireEvent.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith({
      nhomDichVuId: '1',
      ten: 'Khám nội tổng quát',
      thoiLuong: 30,
      giaMacDinh: '150000',
    });
  });

  it('AF3-14 giá cũ có phần lẻ "350000.50": nạp phần nguyên và báo rõ lưu sẽ bỏ phần lẻ', () => {
    const { onSubmit } = renderForm({
      service: { ...service, giaMacDinh: '350000.50' },
    });

    expect(priceInput()).toHaveValue('350.000');
    const hint = 'Giá cũ 350.000,50đ có phần lẻ; lưu sẽ lưu thành 350.000đ.';
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(priceInput()).toHaveAccessibleDescription(
      expect.stringContaining(hint),
    );

    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ giaMacDinh: '350000' }),
    );
  });

  it('AF3-14 người dùng sửa giá thì dòng gợi ý giá cũ biến mất', () => {
    renderForm({ service: { ...service, giaMacDinh: '350000.50' } });

    type(priceInput(), '400000');

    expect(screen.queryByText(/có phần lẻ/)).toBeNull();
  });
});
