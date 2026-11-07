import { render, screen } from '@testing-library/react';
import { SAMPLE_PROFILE } from '../testing/fake-profile-api';
import { FormActions } from './profile-field';
import { ProfileForm } from './profile-form';
import type { Profile } from './profile-types';

// patient F7 (TRACKING F7-C): `FormActions` thêm một prop tuỳ chọn `leadingAction` mà DOM của hàng nút cũ (ProfileForm của F3) KHÔNG đổi một ký tự.
// Ba chuỗi HTML gốc dưới đây được chụp từ mã `main` (179b5b8) TRƯỚC khi sửa `FormActions`. Mã ca DW-nn là [đề xuất].
const BASELINE_IDLE =
  '<div class="mt-[1.2rem] flex flex-wrap justify-end gap-2.5"><button type="button" class="min-h-[2.6667rem] rounded-lg border border-gray-200 bg-white px-[1.2rem] text-sm leading-normal font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50">Hủy</button><button type="submit" class="min-h-[2.6667rem] rounded-lg border border-transparent bg-brand-strong px-[1.2rem] text-sm leading-normal font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong">Lưu thay đổi</button></div>';
const BASELINE_PENDING =
  '<div class="mt-[1.2rem] flex flex-wrap justify-end gap-2.5"><button type="button" disabled="" class="min-h-[2.6667rem] rounded-lg border border-gray-200 bg-white px-[1.2rem] text-sm leading-normal font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50">Hủy</button><button type="submit" disabled="" class="min-h-[2.6667rem] rounded-lg border border-transparent bg-brand-strong px-[1.2rem] text-sm leading-normal font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong">Đang lưu…</button></div>';
// Hàng nút của ProfileForm chụp riêng từ chính ProfileForm: trùng với BASELINE_IDLE vì ProfileForm không truyền gì thêm
const BASELINE_PROFILE_ROW = BASELINE_IDLE;

const noop = () => undefined;
const baseProps = {
  submitLabel: 'Lưu thay đổi',
  pendingLabel: 'Đang lưu…',
  onCancel: noop,
};

describe('FormActions không có leadingAction: DOM y hệt trước F7', () => {
  it('DW-28 HS-17 hàng nút lúc rảnh trùng từng ký tự với bản gốc của main', () => {
    const { container } = render(
      <FormActions pending={false} {...baseProps} />,
    );
    expect(container.innerHTML).toBe(BASELINE_IDLE);
  });

  it('DW-29 HS-20 hàng nút lúc đang lưu trùng từng ký tự với bản gốc của main', () => {
    const { container } = render(<FormActions pending {...baseProps} />);
    expect(container.innerHTML).toBe(BASELINE_PENDING);
  });

  it('DW-30 HS-17 ProfileForm (F3): hàng nút cuối trùng từng ký tự với bản gốc của main, chỉ hai nút, nút đầu là "Hủy"', () => {
    render(
      <ProfileForm
        profile={SAMPLE_PROFILE as Profile}
        onSaved={noop}
        onCancel={noop}
      />,
    );
    const row = screen.getByRole('form').lastElementChild as HTMLElement;
    expect(row.outerHTML).toBe(BASELINE_PROFILE_ROW);
    expect(row.childElementCount).toBe(2);
    expect(row.firstElementChild).toHaveTextContent('Hủy');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['false', false],
  ])('DW-31 HS-17 leadingAction %s không thêm phần tử nào', (_label, value) => {
    const { container } = render(
      <FormActions pending={false} {...baseProps} leadingAction={value} />,
    );
    expect(container.innerHTML).toBe(BASELINE_IDLE);
  });
});

describe('FormActions có leadingAction (NT-23; Q10)', () => {
  it('DW-32 NT-23 nút phụ nằm ĐẦU hàng, trong khối dồn về mép trái; sau đó mới tới Hủy và nút gửi (thứ tự DOM = thứ tự thị giác = thứ tự Tab)', () => {
    const { container } = render(
      <FormActions
        pending={false}
        {...baseProps}
        leadingAction={<button type="button">Phụ</button>}
      />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.childElementCount).toBe(3);
    expect(row.children[0]).toHaveClass('mr-auto');
    expect(row.children[0]).toContainElement(
      screen.getByRole('button', { name: 'Phụ' }),
    );
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Phụ', 'Hủy', 'Lưu thay đổi']);
  });
});
