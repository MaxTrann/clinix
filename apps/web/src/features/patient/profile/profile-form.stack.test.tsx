import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { FIELD_MESSAGES } from './profile-errors';
import { ReadOnlyField } from './profile-field';
import { ProfileForm } from './profile-form';
import type { Profile } from './profile-types';

// patient F4 (TRACKING F4-C, F4-F, F4-H): ba prop tuỳ chọn của ProfileForm (`layout`, `emailNote`, `extraReadOnly`). Mã ca CB-nn là [đề xuất];
// mỗi ca ghi mã HS của PLAN mục 7.1. Bản gốc của `main` đã so từng byte ở bước kiểm chứng (một lần, file tạm); ở đây chốt "không truyền prop = layout 'grid'".
const PROFILE: Profile = {
  hoTen: 'Lê Thị Lệ Ngân',
  email: 'letan@example.invalid',
  soDienThoai: '0965432109',
  gioiTinh: null,
  ngaySinh: null,
  diaChi: null,
};
const F3_EMAIL_NOTE = 'Email dùng để đăng nhập, không thể thay đổi.';
const noop = () => undefined;
const BRANCH_NOTE =
  'Chi nhánh do quản trị viên phân công, không thể tự thay đổi.';
const branchField = (
  <ReadOnlyField
    label="Chi nhánh công tác"
    value="CLINIX Chi nhánh Quận 3"
    note={BRANCH_NOTE}
  />
);

// `useId` đánh số theo thứ tự render: bỏ giá trị id để so hai lần dựng
const normalized = (html: string) =>
  html.replace(
    /(\s(?:id|for|aria-describedby|aria-labelledby)=")[^"]*"/g,
    '$1"',
  );
function htmlOf(element: ReactElement): string {
  const view = render(element);
  const html = normalized(view.container.innerHTML);
  view.unmount();
  return html;
}

const label = (text: string) =>
  screen.getByText(text, { selector: 'label, p' });
// a đứng trước b trong DOM
const before = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const orderOf = (...nodes: HTMLElement[]) =>
  nodes.every((node, index) => index === 0 || before(nodes[index - 1], node));
const fields = () => ({
  name: screen.getByRole('textbox', { name: /Họ và tên/ }),
  phone: screen.getByRole('textbox', { name: /Số điện thoại/ }),
  gender: screen.getByRole('combobox', { name: /Giới tính/ }),
  birth: screen.getByRole('textbox', { name: /Ngày sinh/ }),
  address: screen.getByRole('textbox', { name: /Địa chỉ/ }),
  email: label('Email'),
  cancel: screen.getByRole('button', { name: 'Hủy' }),
  save: screen.getByRole('button', { name: 'Lưu thay đổi' }),
});

describe('ProfileForm mặc định (lưới của F3)', () => {
  it('CB-21 HS-17 không truyền prop ⇒ DOM giống từng byte khi truyền layout="grid" và emailNote của F3', () => {
    const plain = htmlOf(
      <ProfileForm profile={PROFILE} onSaved={noop} onCancel={noop} />,
    );
    const explicit = htmlOf(
      <ProfileForm
        profile={PROFILE}
        onSaved={noop}
        onCancel={noop}
        layout="grid"
        emailNote={F3_EMAIL_NOTE}
      />,
    );
    expect(explicit).toBe(plain);
    expect(plain).toContain('grid grid-cols-1');
    expect(plain).not.toContain('flex-1');
  });

  it('CB-22 HS-17 thứ tự ô theo F3: họ tên, email, SĐT, giới tính, ngày sinh, địa chỉ, rồi hai nút; câu email "không thể thay đổi"; không có ô chi nhánh', () => {
    render(<ProfileForm profile={PROFILE} onSaved={noop} onCancel={noop} />);
    const f = fields();

    expect(
      orderOf(
        f.name,
        f.email,
        f.phone,
        f.gender,
        f.birth,
        f.address,
        f.cancel,
        f.save,
      ),
    ).toBe(true);
    expect(screen.getByText(F3_EMAIL_NOTE)).toBeInTheDocument();
    expect(screen.queryByText('Chi nhánh công tác')).toBeNull();
  });

  it('CB-23 HS-21 grid + extraReadOnly: ô thêm đứng NGAY SAU email (trước SĐT)', () => {
    render(
      <ProfileForm
        profile={PROFILE}
        onSaved={noop}
        onCancel={noop}
        extraReadOnly={branchField}
      />,
    );
    const f = fields();
    expect(orderOf(f.name, f.email, label('Chi nhánh công tác'), f.phone)).toBe(
      true,
    );
  });
});

describe('ProfileForm layout="stack" (một cột, frame 504:2)', () => {
  const renderStack = (
    extra: Partial<Parameters<typeof ProfileForm>[0]> = {},
  ) =>
    render(
      <ProfileForm
        profile={PROFILE}
        onSaved={noop}
        onCancel={noop}
        layout="stack"
        emailNote="Email dùng để đăng nhập, không thể chỉnh sửa."
        extraReadOnly={branchField}
        {...extra}
      />,
    );

  it('CB-24 HS-21 thứ tự: họ tên, SĐT, giới tính, ngày sinh, địa chỉ, email, chi nhánh công tác, rồi Hủy, Lưu thay đổi', () => {
    renderStack();
    const f = fields();
    expect(
      orderOf(
        f.name,
        f.phone,
        f.gender,
        f.birth,
        f.address,
        f.email,
        label('Chi nhánh công tác'),
        f.cancel,
        f.save,
      ),
    ).toBe(true);
  });

  it('CB-25 HS-21 câu chỉ đọc: email theo emailNote truyền vào (không phải câu F3), chi nhánh theo câu của Figma', () => {
    renderStack();
    expect(
      screen.getByText('Email dùng để đăng nhập, không thể chỉnh sửa.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(F3_EMAIL_NOTE)).toBeNull();
    expect(screen.getByText(BRANCH_NOTE)).toBeInTheDocument();
    expect(screen.getByText('CLINIX Chi nhánh Quận 3')).toBeInTheDocument();
    expect(screen.getByText('letan@example.invalid')).toBeInTheDocument();
  });

  it('CB-26 HS-21 chỉ bốn ô văn bản và một ô chọn: email và chi nhánh KHÔNG có ô sửa', () => {
    renderStack();
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: /Email/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Chi nhánh/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Chi nhánh/ })).toBeNull();
    // Khối chi nhánh không chứa phần tử nhập nào
    const group = screen.getByRole('group', { name: 'Chi nhánh công tác' });
    expect(group.querySelector('input, select, textarea')).toBeNull();
  });

  it('CB-27 HS-20 hai nút chia đôi hàng (cùng flex-1), Hủy ở trái; ở lưới mặc định không có flex-1', () => {
    renderStack();
    const { cancel, save } = fields();
    expect(cancel.className).toContain('flex-1');
    expect(save.className).toContain('flex-1');
    expect(cancel.parentElement).toBe(save.parentElement);
    expect(before(cancel, save)).toBe(true);
  });

  it('CB-28 HS-18 vẫn kiểm trước khi gửi: SĐT trống ⇒ câu lỗi dưới ô SĐT, focus ô đó, không gọi onSaved', () => {
    const onSaved = vi.fn();
    renderStack({ onSaved });
    const { phone } = fields();
    fireEvent.change(phone, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const describedBy = phone.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)).toHaveTextContent(
      FIELD_MESSAGES.SDT_KHONG_HOP_LE,
    );
    expect(phone).toHaveFocus();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('CB-29 HS-18 vào form thì focus ô Họ và tên; "Hủy" gọi onCancel đúng một lần', () => {
    const onCancel = vi.fn();
    renderStack({ onCancel });
    expect(fields().name).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('CB-30 HS-17 không truyền extraReadOnly ở bố cục một cột ⇒ chỉ có ô email chỉ đọc, không ô chỉ đọc nào khác', () => {
    renderStack({ extraReadOnly: undefined });
    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(
      within(screen.getByRole('group', { name: 'Email' })).getByText(
        'letan@example.invalid',
      ),
    ).toBeInTheDocument();
  });
});
