import { fireEvent, screen, within } from '@testing-library/react';
import { typeInto } from './profile-page-harness';

// Trợ giúp chung cho ba file test khối Người thân (patient F6): tìm theo vai trò và tên, không theo class.
export const ADD_FORM_NAME = 'Thêm người thân mới';

export const relativesRegion = () =>
  screen.getByRole('region', { name: 'Người thân' });
export const addButton = () =>
  within(relativesRegion()).getByRole<HTMLButtonElement>('button', {
    name: 'Thêm người thân',
  });
export const addForm = () => screen.getByRole('form', { name: ADD_FORM_NAME });
export const editButtonOf = (name: string) =>
  within(relativesRegion()).getByRole<HTMLButtonElement>('button', {
    name: `Chỉnh sửa hồ sơ ${name}`,
  });
export const editFormOf = (name: string) =>
  screen.getByRole('form', { name: `Chỉnh sửa hồ sơ ${name}` });

// Các thẻ hồ sơ theo thứ tự hiển thị; tên là thẻ `p` đầu của thẻ (ProfileCard)
export const cards = () =>
  within(relativesRegion()).getAllByRole<HTMLElement>('listitem');
export const namesInOrder = () =>
  cards().map((card) => card.querySelector('p')?.textContent);
export function cardOf(name: string): HTMLElement {
  const found = cards().find(
    (card) => card.querySelector('p')?.textContent === name,
  );
  if (!found) throw new Error(`Không có thẻ của ${name}`);
  return found;
}
// Giá trị của một ô xem (`dd` ngay sau `dt`) trong một thẻ
export const valueOf = (card: HTMLElement, label: string) =>
  within(card).getByText(label, { selector: 'dt' }).nextElementSibling
    ?.textContent;
// Các nhãn ô xem theo thứ tự
export const labelsOf = (card: HTMLElement) =>
  Array.from(card.querySelectorAll('dt')).map((term) => term.textContent);

// Các ô và nút của MỘT form người thân (tìm trong chính form đó: trang có thể mở nhiều form một lúc)
export function fieldsOf(form: HTMLElement) {
  return {
    name: within(form).getByRole<HTMLInputElement>('textbox', {
      name: /Họ và tên/,
    }),
    relationship: within(form).getByRole<HTMLSelectElement>('combobox', {
      name: /Quan hệ/,
    }),
    gender: within(form).getByRole<HTMLSelectElement>('combobox', {
      name: /Giới tính/,
    }),
    birth: within(form).getByRole<HTMLInputElement>('textbox', {
      name: /Ngày sinh/,
    }),
    phone: within(form).getByRole<HTMLInputElement>('textbox', {
      name: /Số điện thoại/,
    }),
    submit: within(form).getByRole<HTMLButtonElement>('button', {
      name: /Thêm hồ sơ|Lưu thay đổi|Đang/,
    }),
    cancel: within(form).getByRole<HTMLButtonElement>('button', {
      name: 'Hủy',
    }),
  };
}

export interface RelativeInput {
  name: string;
  relationship: string;
  gender: string;
  birth: string;
  phone: string;
}

export const VALID_INPUT: RelativeInput = {
  name: 'Trần Thị Cúc',
  relationship: 'Vo',
  gender: 'Nu',
  birth: '12/04/1992',
  phone: '0912345678',
};

// Điền các ô của một form (giá trị ô chọn là mã); chỉ các khoá có trong `input`
export function fill(form: HTMLElement, input: Partial<RelativeInput>) {
  const fields = fieldsOf(form);
  if (input.name !== undefined) typeInto(fields.name, input.name);
  if (input.relationship !== undefined) {
    fireEvent.change(fields.relationship, {
      target: { value: input.relationship },
    });
  }
  if (input.gender !== undefined) {
    fireEvent.change(fields.gender, { target: { value: input.gender } });
  }
  if (input.birth !== undefined) typeInto(fields.birth, input.birth);
  if (input.phone !== undefined) typeInto(fields.phone, input.phone);
  return fields;
}

// Mở form thêm và điền (mặc định hợp lệ)
export function openAddForm(input: Partial<RelativeInput> = VALID_INPUT) {
  fireEvent.click(addButton());
  return fill(addForm(), input);
}

// Đợi danh sách tải xong (dòng đếm chỉ hiện khi đã tải)
export const waitForList = () => screen.findByText(/hồ sơ người thân ·/);
