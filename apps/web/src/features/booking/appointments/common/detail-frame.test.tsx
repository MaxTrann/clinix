import { fireEvent, render, screen, within } from '@testing-library/react';
import { Calendar, User } from 'lucide-react';
import { createRef } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { DetailColumns, DetailHero, DetailPageFrame } from './detail-frame';

// booking F12 (UI-12, UI-11): khung trang chi tiết dùng chung cho bốn vai trò. Mã UIF là [đề xuất] (PLAN booking mục 7.48). jsdom không đo bố cục: các ca là bằng chứng CẤU TRÚC; số đo thật ở TRACKING 3.42.
const renderFrame = (
  props: Partial<Parameters<typeof DetailPageFrame>[0]> = {},
) =>
  render(
    <MemoryRouter>
      <DetailPageFrame
        backTo="/danh-sach?trang=2"
        backLabel="Quay lại danh sách"
        title="Chi tiết lịch hẹn"
        {...props}
      >
        <p>Nội dung trang</p>
      </DetailPageFrame>
    </MemoryRouter>,
  );

describe('DetailPageFrame', () => {
  it('UIF-12 khung căn giữa `max-w-[64rem]`: liên kết quay lại đúng đích, h1 đúng chữ, nội dung nằm trong khung', () => {
    renderFrame();
    const link = screen.getByRole('link', { name: 'Quay lại danh sách' });
    expect(link).toHaveAttribute('href', '/danh-sach?trang=2');
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Chi tiết lịch hẹn',
    });
    const frame = heading.closest('section') as HTMLElement;
    expect(frame).toHaveClass('mx-auto', 'max-w-[64rem]');
    expect(frame).toContainElement(link);
    expect(frame).toContainElement(screen.getByText('Nội dung trang'));
    // Không `aria-busy` thì không có thuộc tính; có thì phản ánh đúng
    expect(frame).not.toHaveAttribute('aria-busy');
  });

  it.each([
    [true, 'true'],
    [false, 'false'],
  ])('UIF-12 `busy` = %s ⇒ `aria-busy` của khung = %s', (busy, expected) => {
    renderFrame({ busy });
    expect(
      screen.getByRole('heading', { level: 1 }).closest('section'),
    ).toHaveAttribute('aria-busy', expected);
  });

  it('UIF-12 `headingRef` ⇒ h1 nhận tiêu điểm bằng mã (`tabIndex` -1) và ref trỏ đúng h1; không có ref thì h1 KHÔNG nhận tiêu điểm', () => {
    const headingRef = createRef<HTMLHeadingElement>();
    const first = renderFrame({ headingRef });
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(headingRef.current).toBe(heading);
    first.unmount();
    renderFrame();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute(
      'tabindex',
    );
  });

  it('UIF-12 quay lại: `backRef` trỏ đúng liên kết; `backDisabled` đặt `aria-disabled`; `onBackClick` chặn được việc rời trang (Admin đang gửi)', () => {
    const backRef = createRef<HTMLAnchorElement>();
    const onBackClick = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    renderFrame({ backRef, backDisabled: true, onBackClick });
    const link = screen.getByRole('link', { name: 'Quay lại danh sách' });
    expect(backRef.current).toBe(link);
    expect(link).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(link);
    expect(onBackClick).toHaveBeenCalledTimes(1);
  });

  it('UIF-12 `headerAside` hiện cùng hàng với h1 (chỗ cắm nút của module `doctor`); không có thì không có gì thêm', () => {
    const first = renderFrame({
      headerAside: <button type="button">Hoàn thành ca khám</button>,
    });
    const button = screen.getByRole('button', { name: 'Hoàn thành ca khám' });
    expect(button.parentElement).toBe(
      screen.getByRole('heading', { level: 1 }).parentElement,
    );
    first.unmount();
    renderFrame();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('DetailHero', () => {
  const cells = [
    {
      icon: User,
      label: 'Người khám',
      value: 'Nguyễn Văn A',
      note: 'Bản thân',
    },
    { icon: Calendar, label: 'Ngày khám', value: 'Chủ nhật, 18/10/2026' },
  ];

  it('UIF-12 thẻ đầu: vùng có tên, mã chữ đơn cách, chip trạng thái bằng CHỮ, tiêu đề h2, mỗi ô có nhãn nhỏ rồi giá trị; dòng phụ chỉ khi có', () => {
    render(
      <DetailHero
        ariaLabel="Tóm tắt lịch hẹn"
        code="CP20261018001"
        status="DaXacNhan"
        title="Tim mạch"
        cells={cells}
      />,
    );
    const hero = screen.getByRole('region', { name: 'Tóm tắt lịch hẹn' });
    expect(within(hero).getByText('CP20261018001')).toHaveClass('font-mono');
    expect(within(hero).getByText('Đã xác nhận')).toBeVisible();
    expect(
      within(hero).getByRole('heading', { level: 2, name: 'Tim mạch' }),
    ).toBeInTheDocument();
    // Ô có dòng phụ
    const person = within(hero).getByText('Người khám').parentElement;
    expect(person).toHaveTextContent('Người khám');
    expect(person).toHaveTextContent('Nguyễn Văn A');
    expect(person).toHaveTextContent('Bản thân');
    // Ô không có dòng phụ: đúng hai đoạn (nhãn, giá trị)
    const date = within(hero).getByText('Ngày khám').parentElement;
    expect(date?.querySelectorAll('p')).toHaveLength(2);
    expect(person?.querySelectorAll('p')).toHaveLength(3);
  });

  it('UIF-12 chữ có thể rất dài vẫn là CHỮ (React thoát chuỗi): không dựng phần tử nào từ giá trị', () => {
    render(
      <DetailHero
        ariaLabel="Tóm tắt"
        code="CP1"
        status="DaXacNhan"
        title="<b>in đậm</b>"
        cells={[
          {
            icon: User,
            label: 'Người khám',
            value: '<img src=x onerror=alert(1)>',
          },
        ]}
      />,
    );
    const hero = screen.getByRole('region', { name: 'Tóm tắt' });
    expect(hero.querySelector('b, img')).toBeNull();
    expect(within(hero).getByText('<b>in đậm</b>')).toBeInTheDocument();
  });
});

describe('DetailColumns', () => {
  it('UIF-12 hai cột trong MỘT lưới, `main` đứng trước `side`', () => {
    render(<DetailColumns main={<p>Cột chính</p>} side={<p>Cột phụ</p>} />);
    const main = screen.getByText('Cột chính').parentElement as HTMLElement;
    const side = screen.getByText('Cột phụ').parentElement as HTMLElement;
    expect(main).not.toBe(side);
    expect(main.parentElement).toBe(side.parentElement);
    expect(main.parentElement).toHaveClass('grid');
    expect(
      main.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
