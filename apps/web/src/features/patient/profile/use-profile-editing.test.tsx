import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Profile } from './profile-types';
import { useProfileEditing } from './use-profile-editing';

// patient F4 (TRACKING F4-C, F4-H): máy trạng thái xem, sửa, lưu, focus rút từ trang Bản thân. Mã ca CB-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1.
const SAVED: Profile = {
  hoTen: 'Nguyễn Văn A',
  email: 'nguyenvana@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: null,
};

// Nút "Chỉnh sửa" chỉ có khi không sửa (như hai trang thật): bị gỡ khi đang sửa, dựng lại sau khi lưu hoặc hủy
function Probe({ replace }: { replace: (profile: Profile) => void }) {
  // Destructure như hai trang thật (luật react-hooks/refs không cho đọc thuộc tính của đối tượng chứa ref khi render)
  const {
    editing,
    saved,
    editButton,
    startEditing,
    handleSaved,
    handleCancel,
  } = useProfileEditing(replace);
  return (
    <div>
      <p data-testid="state">{`editing=${editing} saved=${saved}`}</p>
      {!editing && (
        <button ref={editButton} onClick={startEditing}>
          Chỉnh sửa
        </button>
      )}
      <button onClick={() => handleSaved(SAVED)}>Lưu</button>
      <button onClick={handleCancel}>Hủy</button>
      <button onClick={startEditing}>Bắt đầu</button>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent;
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('useProfileEditing', () => {
  it('CB-40 HS-19 ban đầu không sửa, chưa lưu, và không giành focus', () => {
    render(<Probe replace={vi.fn()} />);
    expect(state()).toBe('editing=false saved=false');
    expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).not.toHaveFocus();
  });

  it('CB-41 HS-18 startEditing ⇒ đang sửa; nút "Chỉnh sửa" được gỡ', () => {
    render(<Probe replace={vi.fn()} />);
    click('Chỉnh sửa');
    expect(state()).toBe('editing=true saved=false');
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();
  });

  it('CB-42 HS-19 handleSaved ⇒ replace nhận ĐÚNG hồ sơ một lần, về chế độ xem, saved, focus về "Chỉnh sửa"', () => {
    const replace = vi.fn();
    render(<Probe replace={replace} />);
    click('Chỉnh sửa');

    click('Lưu');

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(SAVED);
    expect(state()).toBe('editing=false saved=true');
    expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toHaveFocus();
  });

  it('CB-43 HS-20 handleCancel ⇒ về chế độ xem, KHÔNG replace, không đổi saved, focus về "Chỉnh sửa"', () => {
    const replace = vi.fn();
    render(<Probe replace={replace} />);
    click('Chỉnh sửa');

    click('Hủy');

    expect(replace).not.toHaveBeenCalled();
    expect(state()).toBe('editing=false saved=false');
    expect(screen.getByRole('button', { name: 'Chỉnh sửa' })).toHaveFocus();
  });

  it('CB-44 HS-19 sau khi lưu, sửa lại ⇒ saved về false (thông báo mất); hủy sau đó không làm saved=true', () => {
    render(<Probe replace={vi.fn()} />);
    click('Chỉnh sửa');
    click('Lưu');
    expect(state()).toBe('editing=false saved=true');

    click('Chỉnh sửa');
    expect(state()).toBe('editing=true saved=false');

    click('Hủy');
    expect(state()).toBe('editing=false saved=false');
  });

  it('CB-45 HS-20 focus chỉ trả MỘT lần: người dùng chuyển focus đi rồi trang render lại thì không bị giành lại', () => {
    const replace = vi.fn();
    const { rerender } = render(<Probe replace={replace} />);
    click('Chỉnh sửa');
    click('Hủy');
    const edit = screen.getByRole('button', { name: 'Chỉnh sửa' });
    expect(edit).toHaveFocus();

    screen.getByRole('button', { name: 'Lưu' }).focus();
    rerender(<Probe replace={replace} />);
    act(() => undefined);

    expect(edit).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Lưu' })).toHaveFocus();
  });

  it('CB-46 HS-19 replace mới ở lần render sau được dùng ở lần lưu sau (không giữ bản cũ)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe replace={first} />);
    rerender(<Probe replace={second} />);

    click('Chỉnh sửa');
    click('Lưu');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(SAVED);
  });
});
