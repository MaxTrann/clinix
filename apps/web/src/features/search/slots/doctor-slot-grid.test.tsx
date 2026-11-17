import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DoctorDaySlots } from '../api/slot-types';
import { DoctorSlotGrid } from './doctor-slot-grid';
import { day, slot } from './testing/slot-fixtures';

// search PR-C2, mã ca SLT-50 đến SLT-62: lưới khung giờ của MỘT bác sĩ trong MỘT ngày (Figma 446:248). Mọi trạng thái do máy chủ tính; ở đây chỉ chọn cách hiển thị.
afterEach(() => vi.useRealTimers());

function renderDay(value: DoctorDaySlots) {
  return render(
    <MemoryRouter>
      <DoctorSlotGrid day={value} />
    </MemoryRouter>,
  );
}

const itemsOf = (section: HTMLElement) =>
  within(section)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('nhóm buổi và thứ tự (SLT-50 đến SLT-53)', () => {
  const mixed = day('12', [
    slot('3', '13:30', 'ConTrong', 'CaChieu'),
    slot('2', '11:30', 'ConTrong', 'CaChieu'),
    slot('5', '09:00', 'ConTrong', 'CaSang'),
    slot('4', '08:00', 'ConTrong', 'CaSang'),
    slot('1', '08:30', 'DaDat', 'CaSang'),
  ]);

  it('SLT-50 nhóm theo `ca` của máy chủ, KHÔNG theo giờ: ô 11:30 của ca chiều nằm ở "Buổi chiều"', () => {
    renderDay(mixed);
    const morning = screen.getByRole('region', { name: 'Buổi sáng' });
    const afternoon = screen.getByRole('region', { name: 'Buổi chiều' });
    expect(within(morning).queryByText('11:30')).not.toBeInTheDocument();
    expect(within(afternoon).getByText('11:30')).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Buổi sáng', 'Buổi chiều']);
  });

  it('SLT-51 trong nhóm sắp theo giờ bắt đầu dù dữ liệu đảo thứ tự', () => {
    renderDay(mixed);
    expect(itemsOf(screen.getByRole('region', { name: 'Buổi sáng' }))).toEqual([
      '08:00Còn trống',
      '08:30Đã đặt',
      '09:00Còn trống',
    ]);
    expect(itemsOf(screen.getByRole('region', { name: 'Buổi chiều' }))).toEqual(
      ['11:30Còn trống', '13:30Còn trống'],
    );
  });

  it('SLT-52 nhóm rỗng bị ẩn (chỉ ca sáng ⇒ không có "Buổi chiều")', () => {
    renderDay(day('12', [slot('1', '08:00')]));
    expect(
      screen.getByRole('region', { name: 'Buổi sáng' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Buổi chiều')).not.toBeInTheDocument();
    expect(screen.queryByText('Buổi tối')).not.toBeInTheDocument();
  });

  it('SLT-53 `CaToi` hiện nhóm "Buổi tối" sau buổi chiều (`[đề xuất]`, dữ liệu thật hiện chưa có)', () => {
    renderDay(
      day('12', [
        slot('3', '18:00', 'ConTrong', 'CaToi'),
        slot('2', '14:00', 'ConTrong', 'CaChieu'),
      ]),
    );
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Buổi chiều', 'Buổi tối']);
  });
});

describe('giờ và liên kết (SLT-54 đến SLT-56)', () => {
  it('SLT-54 giờ theo GIỜ VIỆT NAM từ ISO UTC (02:30Z là 09:30), kể cả khi múi giờ máy khác', () => {
    renderDay(
      day('12', [
        { ...slot('1', '09:30'), batDau: '2026-11-18T02:30:00.000Z' },
      ]),
    );
    expect(
      screen.getByRole('link', { name: '09:30, còn trống' }),
    ).toBeInTheDocument();
  });

  it('SLT-55 ô `ConTrong` là liên kết sang Bước 4 với `?khungGioId=` (id lớn hơn 2^53 nguyên vẹn); số liên kết = số ô còn trống', () => {
    const big = '9223372036854775807';
    renderDay(
      day('12', [
        slot('901', '08:00'),
        slot(big, '08:30'),
        slot('903', '09:00', 'DaDat'),
        slot('904', '09:30', 'DangGiuCho'),
        slot('905', '10:00', 'HetHan'),
      ]),
    );
    expect(
      screen.getByRole('link', { name: '08:00, còn trống' }),
    ).toHaveAttribute('href', '/dat-lich/thong-tin?khungGioId=901');
    expect(
      screen.getByRole('link', { name: '08:30, còn trống' }),
    ).toHaveAttribute('href', `/dat-lich/thong-tin?khungGioId=${big}`);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('SLT-55 máy khách KHÔNG tự hết hạn: ô `ConTrong` có giờ bắt đầu đã qua theo đồng hồ máy vẫn là liên kết (trạng thái do máy chủ tính)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
    renderDay(day('12', [slot('1', '09:30')]));
    expect(
      screen.getByRole('link', { name: '09:30, còn trống' }),
    ).toBeInTheDocument();
  });

  it('SLT-56 `DangGiuCho`, `DaDat`, `HetHan` KHÔNG bấm được (không liên kết, không nút, không tabindex) và có tên truy cập rõ', () => {
    renderDay(
      day('12', [
        slot('1', '08:00', 'DangGiuCho'),
        slot('2', '08:30', 'DaDat'),
        slot('3', '09:00', 'HetHan'),
        slot('4', '09:30'),
      ]),
    );
    for (const name of [
      '08:00, đang giữ chỗ',
      '08:30, đã đặt',
      '09:00, hết hạn',
    ]) {
      const cell = screen.getByRole('img', { name });
      expect(cell).not.toHaveAttribute('href');
      expect(cell).not.toHaveAttribute('tabindex');
      expect(cell.closest('a, button')).toBeNull();
    }
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ngày không có khung giờ để chọn (SLT-57 đến SLT-60)', () => {
  it('SLT-57 `ChiNhanhNghi` + `thuNghi` 1 đến 7 ⇒ "Chi nhánh nghỉ vào Thứ …", không lưới, không chú giải', () => {
    const names = [
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
      'Chủ nhật',
    ];
    names.forEach((name, index) => {
      const { unmount } = renderDay(day('12', [], 'ChiNhanhNghi', index + 1));
      expect(
        screen.getByText(`Chi nhánh nghỉ vào ${name}`),
      ).toBeInTheDocument();
      expect(screen.getByText('Vui lòng chọn ngày khác')).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByText(/khung giờ còn trống/)).not.toBeInTheDocument();
      unmount();
    });
  });

  it('SLT-58 `KhongCoLich` ⇒ câu nguyên văn Figma, không lưới, không chú giải; trạng thái ngày thắng cả khi có ô', () => {
    renderDay(day('12', [slot('1', '08:00')], 'KhongCoLich'));
    expect(
      screen.getByText('Bác sĩ không có lịch làm việc ngày này'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vui lòng chọn ngày khác')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('SLT-59 dòng đếm chỉ đếm ô `ConTrong`: "3 khung giờ còn trống"', () => {
    renderDay(
      day('12', [
        slot('1', '08:00'),
        slot('2', '08:30', 'DaDat'),
        slot('3', '09:00'),
        slot('4', '09:30', 'HetHan'),
        slot('5', '10:00'),
        slot('6', '10:30', 'DangGiuCho'),
      ]),
    );
    const count = screen.getByText('3').closest('p') as HTMLElement;
    expect(count).toHaveTextContent('3 khung giờ còn trống');
    expect(screen.getByText('3').tagName).toBe('STRONG');
  });

  it('SLT-60 `CoLich` mà `khungGio` rỗng, hoặc hết ô trống ⇒ "Không còn khung giờ trống trong ngày này"; hết trống vẫn hiện các ô và chú giải', () => {
    const { unmount } = renderDay(day('12', []));
    expect(
      screen.getByText('Không còn khung giờ trống trong ngày này'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    unmount();
    renderDay(
      day('12', [slot('1', '08:00', 'DaDat'), slot('2', '08:30', 'HetHan')]),
    );
    expect(
      screen.getByText('Không còn khung giờ trống trong ngày này'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/khung giờ còn trống/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(
      screen.getByRole('list', { name: 'Chú giải trạng thái khung giờ' }),
    ).toBeInTheDocument();
  });
});

describe('chú giải (SLT-61, SLT-62)', () => {
  it('SLT-61 đủ bốn mục theo thứ tự Còn trống, Đang giữ chỗ, Đã đặt, Hết hạn', () => {
    renderDay(day('12', [slot('1', '08:00')]));
    const legend = screen.getByRole('list', {
      name: 'Chú giải trạng thái khung giờ',
    });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Còn trống', 'Đang giữ chỗ', 'Đã đặt', 'Hết hạn']);
  });

  it('SLT-62 chỉ ô "Hết hạn" gạch ngang giờ (Make `PublicSlotGrid.tsx`), ô còn trống thì không', () => {
    renderDay(day('12', [slot('1', '08:00', 'HetHan'), slot('2', '08:30')]));
    expect(screen.getByText('08:00')).toHaveClass('line-through');
    expect(screen.getByText('08:30')).not.toHaveClass('line-through');
  });
});
