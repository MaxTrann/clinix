import { render, screen, within } from '@testing-library/react';
import {
  InfoRows,
  NOT_UPDATED_LABEL,
  ProfileRowsCard,
} from './profile-rows-card';

// patient F4 (TRACKING F4-E, F4-H): thẻ thông tin và xem dạng hàng. Mã ca CB-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1.
describe('ProfileRowsCard', () => {
  it('CB-15 HS-17 là vùng (section) tên theo tiêu đề h2; có action thì hiện ở đầu thẻ, thân là children', () => {
    render(
      <ProfileRowsCard title="Thông tin cá nhân" action={<button>Sửa</button>}>
        <p>Thân thẻ</p>
      </ProfileRowsCard>,
    );

    const card = screen.getByRole('region', { name: 'Thông tin cá nhân' });
    expect(
      within(card).getByRole('heading', {
        level: 2,
        name: 'Thông tin cá nhân',
      }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Sửa' }),
    ).toBeInTheDocument();
    expect(within(card).getByText('Thân thẻ')).toBeInTheDocument();
  });

  it('CB-15 HS-17 không có action ⇒ không có nút nào', () => {
    render(
      <ProfileRowsCard title="Thông tin cá nhân">
        <p>Thân thẻ</p>
      </ProfileRowsCard>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CB-16 HS-17 hai thẻ cùng trang: mỗi vùng trỏ đúng tiêu đề của mình (id không trùng)', () => {
    render(
      <>
        <ProfileRowsCard title="Thẻ một">
          <p>a</p>
        </ProfileRowsCard>
        <ProfileRowsCard title="Thẻ hai">
          <p>b</p>
        </ProfileRowsCard>
      </>,
    );

    expect(
      within(screen.getByRole('region', { name: 'Thẻ một' })).getByText('a'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Thẻ hai' })).getByText('b'),
    ).toBeInTheDocument();
  });
});

describe('InfoRows', () => {
  it('CB-17 HS-17 danh sách định nghĩa: mỗi hàng một dt (nhãn) rồi một dd (giá trị), đúng thứ tự', () => {
    const { container } = render(
      <InfoRows
        rows={[
          { label: 'Họ và tên', value: 'Lê Thị Lệ Ngân' },
          { label: 'Email', value: 'letan@example.invalid' },
          { label: 'Chi nhánh công tác', value: 'CLINIX Chi nhánh Quận 3' },
        ]}
      />,
    );

    expect(container.querySelector('dl')).not.toBeNull();
    const terms = Array.from(container.querySelectorAll('dt'));
    expect(terms.map((term) => term.textContent)).toEqual([
      'Họ và tên',
      'Email',
      'Chi nhánh công tác',
    ]);
    expect(terms.map((term) => term.nextElementSibling?.tagName)).toEqual([
      'DD',
      'DD',
      'DD',
    ]);
    expect(terms.map((term) => term.nextElementSibling?.textContent)).toEqual([
      'Lê Thị Lệ Ngân',
      'letan@example.invalid',
      'CLINIX Chi nhánh Quận 3',
    ]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('CB-18 HS-17 giá trị %s ⇒ "Chưa cập nhật"', (_label, value) => {
    render(<InfoRows rows={[{ label: 'Địa chỉ', value }]} />);
    expect(screen.getByText('Địa chỉ').nextElementSibling).toHaveTextContent(
      NOT_UPDATED_LABEL,
    );
    expect(NOT_UPDATED_LABEL).toBe('Chưa cập nhật');
  });

  it('CB-19 HS-17 giá trị là phần tử React vẫn hiện nguyên (không bị thay bằng "Chưa cập nhật")', () => {
    render(
      <InfoRows
        rows={[{ label: 'Liên kết', value: <a href="/x">Mở trang</a> }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Mở trang' })).toBeInTheDocument();
    expect(screen.queryByText(NOT_UPDATED_LABEL)).toBeNull();
  });

  it('CB-19 HS-17 giá trị dài (địa chỉ 255 ký tự, tên chi nhánh rất dài) hiện đủ, không cắt chữ', () => {
    const address = `${'a'.repeat(254)}b`; // một từ dài 255 ký tự: phải xuống dòng, không cắt
    render(<InfoRows rows={[{ label: 'Địa chỉ', value: address }]} />);
    expect(Array.from(address)).toHaveLength(255);
    expect(screen.getByText(address)).toBeInTheDocument();
  });
});
