import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamListItem } from '../api/patient-exam-types';
import { RecordList } from './record-list';
import { RecordRow } from './record-row';

// doctor-exam F5: hàng ca và thẻ danh sách tháng (Figma `414:275`, `443:272`). WXH-02 (cột ngày giờ VN, thứ tự máy chủ, "N ca" từ `total`), WXH-05 (nhãn theo `coHoSoKham`, không theo `daDanhGia`), WXH-17 [đề xuất] (khoá TÊN LỚP, `aria-current`).
// MỖI lớp một khẳng định `toHaveClass` hay `.not.toHaveClass` (AI-BUG-052). Dữ liệu giả.
function item(overrides: Partial<ExamListItem> = {}): ExamListItem {
  return {
    maLichHen: 'CLX-20261018-001',
    thoiGian: '2026-10-18T07:00:00.000Z',
    chuyenKhoa: 'Nhi khoa',
    bacSi: { hoTen: 'Lê Thảo Vy', chucDanh: 'BS' },
    nguoiKham: { hoTen: 'Bùi Minh Khoa', quanHe: 'Con' },
    coHoSoKham: false,
    daDanhGia: false,
    ...overrides,
  };
}

function renderRow(row: ExamListItem, selected = false) {
  const onSelect = vi.fn();
  render(
    <ul>
      <RecordRow item={row} selected={selected} onSelect={onSelect} />
    </ul>,
  );
  return onSelect;
}
const button = () => screen.getByRole('button');

describe('doctor-exam F5 — hàng ca của danh sách tháng', () => {
  it('WXH-02 nội dung hàng (Figma 414:283): ngày "18", thứ "CN", giờ "14:00" theo giờ VN, chuyên khoa, "Bùi Minh Khoa · Con", "BS Lê Thảo Vy"', () => {
    renderRow(item());
    expect(button()).toHaveTextContent('18');
    expect(button()).toHaveTextContent('CN');
    expect(button()).toHaveTextContent('14:00');
    expect(button()).toHaveTextContent('Nhi khoa');
    expect(button()).toHaveTextContent('Bùi Minh Khoa');
    expect(button()).toHaveTextContent('Con');
    expect(button()).toHaveTextContent('BS Lê Thảo Vy');
  });

  it('WXH-02 người khám là bản thân ⇒ "Bản thân"; chức danh ThS_BS ⇒ "ThS.BS …"; ngày một chữ số KHÔNG đệm 0 và thứ "Thứ 6"', () => {
    renderRow(
      item({
        thoiGian: '2026-06-05T01:30:00.000Z',
        nguoiKham: { hoTen: 'Nguyễn Văn A', quanHe: null },
        bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
      }),
    );
    expect(button()).toHaveTextContent('Bản thân');
    expect(button()).toHaveTextContent('ThS.BS Nguyễn Minh Anh');
    expect(button()).toHaveTextContent('Thứ 6');
    expect(button()).toHaveTextContent('08:30');
    expect(button().textContent).toMatch(/^5Thứ 6/);
  });

  it('WXH-05 nhãn theo `coHoSoKham`: false ⇒ "Chưa có hồ sơ", true ⇒ "Đã có hồ sơ"', () => {
    const { unmount } = render(
      <ul>
        <RecordRow
          item={item({ coHoSoKham: false })}
          selected={false}
          onSelect={vi.fn()}
        />
      </ul>,
    );
    expect(button()).toHaveTextContent('Chưa có hồ sơ');
    expect(button()).not.toHaveTextContent('Đã có hồ sơ');
    unmount();
    renderRow(item({ coHoSoKham: true }));
    expect(button()).toHaveTextContent('Đã có hồ sơ');
    expect(button()).not.toHaveTextContent('Chưa có hồ sơ');
  });

  it('WXH-05 nhãn KHÔNG theo `daDanhGia` (Q19: đã đánh giá không có nghĩa đã có hồ sơ)', () => {
    renderRow(item({ coHoSoKham: false, daDanhGia: true }));
    expect(button()).toHaveTextContent('Chưa có hồ sơ');
  });

  it('WXH-17 nhãn "Đã có hồ sơ": `text-success`, `bg-success-soft`, `border-success-line`, không xám', () => {
    renderRow(item({ coHoSoKham: true }));
    const badge = screen.getByText('Đã có hồ sơ');
    expect(badge).toHaveClass('text-success');
    expect(badge).toHaveClass('bg-success-soft');
    expect(badge).toHaveClass('border-success-line');
    expect(badge).not.toHaveClass('text-gray-600');
    expect(badge).not.toHaveClass('bg-gray-100');
    expect(badge).not.toHaveClass('border-gray-200');
  });

  it('WXH-17 nhãn "Chưa có hồ sơ": chữ `gray-600` (≥ 4,5:1 trên `gray-100`; `gray-500` chỉ 4,39:1, đo Chromium), nền `gray-100`, viền `gray-200`, không xanh', () => {
    renderRow(item({ coHoSoKham: false }));
    const badge = screen.getByText('Chưa có hồ sơ');
    expect(badge).toHaveClass('text-gray-600');
    expect(badge).not.toHaveClass('text-gray-500');
    expect(badge).toHaveClass('bg-gray-100');
    expect(badge).toHaveClass('border-gray-200');
    expect(badge).not.toHaveClass('text-success');
    expect(badge).not.toHaveClass('bg-success-soft');
    expect(badge).not.toHaveClass('border-success-line');
    expect(badge).toHaveClass('rounded-full');
    expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('WXH-02 bấm hàng ⇒ onSelect đúng mã lịch hẹn (một lần)', () => {
    const onSelect = renderRow(item({ maLichHen: 'CLX-9' }));
    fireEvent.click(button());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('CLX-9');
  });

  it('WXH-17 hàng đang chọn: `aria-current="true"` và nền `brand-soft`; hàng khác không có cả hai', () => {
    const { unmount } = render(
      <ul>
        <RecordRow item={item()} selected onSelect={vi.fn()} />
      </ul>,
    );
    expect(button()).toHaveAttribute('aria-current', 'true');
    expect(button()).toHaveClass('bg-brand-soft');
    expect(button()).not.toHaveClass('hover:bg-gray-50');
    unmount();
    renderRow(item(), false);
    expect(button()).not.toHaveAttribute('aria-current');
    expect(button()).not.toHaveClass('bg-brand-soft');
    expect(button()).toHaveClass('hover:bg-gray-50');
  });

  it('WXH-17 chữ dài bị cắt `truncate` (không đẩy nhãn ra ngoài), cột ngày rộng cố định 45 px', () => {
    renderRow(item({ chuyenKhoa: 'Chuyên khoa rất dài '.repeat(10) }));
    expect(button().querySelector('.truncate')).not.toBeNull();
    expect(button().firstElementChild).toHaveClass('w-[45px]');
    expect(button().firstElementChild).toHaveClass('shrink-0');
  });

  it('WXH-04 chữ do React vẽ: tên có HTML không thành phần tử', () => {
    renderRow(
      item({
        chuyenKhoa: '<img src=x onerror=alert(1)>',
        nguoiKham: { hoTen: '<script>x</script>', quanHe: null },
      }),
    );
    expect(button().querySelector('img')).toBeNull();
    expect(button().querySelector('script')).toBeNull();
    expect(button()).toHaveTextContent('<img src=x onerror=alert(1)>');
  });
});

describe('doctor-exam F5 — thẻ danh sách của một tháng', () => {
  const ROWS = [
    item({ maLichHen: 'A', thoiGian: '2026-10-18T07:00:00.000Z' }),
    item({
      maLichHen: 'B',
      thoiGian: '2026-10-18T02:30:00.000Z',
      chuyenKhoa: 'Tiêu hóa',
    }),
  ];

  function renderList(total: number, selectedCase: string | null = null) {
    const onSelect = vi.fn();
    render(
      <RecordList
        title="Tháng 10 2026"
        total={total}
        items={ROWS}
        selectedCase={selectedCase}
        onSelect={onSelect}
      />,
    );
    return onSelect;
  }
  const card = () => screen.getByRole('region', { name: 'Tháng 10 2026' });

  it('WXH-02 đầu thẻ "Tháng 10 2026" và "2 ca" (Figma 414:276), hàng THEO THỨ TỰ máy chủ (không sắp lại)', () => {
    renderList(2);
    expect(
      within(card()).getByRole('heading', { name: 'Tháng 10 2026' }),
    ).toBeInTheDocument();
    expect(within(card()).getByText('2 ca')).toBeInTheDocument();
    const rows = within(card()).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Nhi khoa');
    expect(rows[1]).toHaveTextContent('Tiêu hóa');
    expect(within(card()).queryByText(/Hiển thị/)).toBeNull();
  });

  it('WXH-02 "N ca" lấy từ `total` của máy chủ, không từ số hàng; tháng hơn 50 ca có ghi chú "Hiển thị 2 trên 51 ca…"', () => {
    renderList(51);
    expect(within(card()).getByText('51 ca')).toBeInTheDocument();
    expect(within(card()).queryByText('2 ca')).toBeNull();
    expect(
      within(card()).getByText(
        'Hiển thị 2 trên 51 ca. Hãy chọn người khám để thu hẹp.',
      ),
    ).toBeInTheDocument();
  });

  it('WXH-02 chọn hàng: onSelect đúng mã; hàng trùng `selectedCase` có `aria-current`, hàng khác không', () => {
    const onSelect = renderList(2, 'B');
    const rows = within(card()).getAllByRole('button');
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(rows[0]).not.toHaveAttribute('aria-current');
    fireEvent.click(rows[0]);
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('WXH-17 thẻ bo, viền `gray-200`, cắt nội dung thừa; đầu thẻ chữ `gray-500`', () => {
    renderList(2);
    expect(card()).toHaveClass('rounded-2xl');
    expect(card()).toHaveClass('border-gray-200');
    expect(card()).toHaveClass('overflow-hidden');
    expect(within(card()).getByText('2 ca').parentElement).toHaveClass(
      'text-gray-500',
    );
  });
});
