import { render, screen } from '@testing-library/react';
import { ProfileSummaryCard } from './profile-summary-card';

// patient F4 (TRACKING F4-E, F4-H): thẻ đầu của trang "Thông tin cá nhân". Mã ca CB-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1.
describe('ProfileSummaryCard', () => {
  it('CB-10 HS-21 hiện tên, dòng phụ và nhãn trạng thái; avatar là chữ viết tắt aria-hidden (hai từ đầu, như F3), không phải nút', () => {
    render(
      <ProfileSummaryCard
        name="Lê Thị Lệ Ngân"
        subtitle="Lễ tân · CLINIX Chi nhánh Quận 3"
        statusLabel="Đang hoạt động"
      />,
    );

    expect(screen.getByText('Lê Thị Lệ Ngân')).toBeInTheDocument();
    expect(
      screen.getByText('Lễ tân · CLINIX Chi nhánh Quận 3'),
    ).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    const initials = screen.getByText('LT');
    expect(initials).toHaveAttribute('aria-hidden', 'true');
    expect(initials.closest('button')).toBeNull();
  });

  it('CB-11 HS-21 không truyền statusLabel ⇒ không có nhãn trạng thái', () => {
    render(<ProfileSummaryCard name="Nguyễn Văn A" subtitle="Lễ tân" />);

    expect(screen.getByText('Lễ tân')).toBeInTheDocument();
    expect(screen.queryByText('Đang hoạt động')).toBeNull();
    expect(document.querySelectorAll('span')).toHaveLength(1); // chỉ avatar
  });

  it('CB-12 HS-21 không nút và không biểu tượng máy ảnh (ảnh đại diện hoãn, Q4 = A)', () => {
    const { container } = render(
      <ProfileSummaryCard
        name="Nguyễn Văn A"
        subtitle="Lễ tân"
        statusLabel="Đang hoạt động"
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('CB-13 HS-17 tên 100 ký tự và dòng phụ dài hiện đủ, không bị cắt chữ', () => {
    const name = `Nguyễn ${'Văn '.repeat(23)}An`.slice(0, 100);
    const subtitle =
      `Lễ tân · CLINIX Chi nhánh ${'rất dài '.repeat(20)}`.trim();
    render(<ProfileSummaryCard name={name} subtitle={subtitle} />);

    expect(Array.from(name)).toHaveLength(100);
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText(subtitle)).toBeInTheDocument();
  });
});
