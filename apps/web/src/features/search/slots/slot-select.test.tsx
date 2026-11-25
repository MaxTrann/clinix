import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DoctorDaySlots, PublicSlot } from '../api/slot-types';
import { DoctorSlotGrid } from './doctor-slot-grid';
import { DoctorSlotPanel } from './doctor-slot-panel';
import { SlotCell } from './slot-cell';
import { day, slot, slotsById } from './testing/slot-fixtures';

// reschedule F1, mã ca WDH-17 [đề xuất] (PLAN reschedule 7.11): prop TUỲ CHỌN `onSelect` của `SlotCell`, `DoctorSlotGrid`, `DoctorSlotPanel`. Vắng ⇒ y như K2 (liên kết sang Bước 4);
// có ⇒ chỉ ô `ConTrong` là NÚT chọn, ô khác vẫn không bấm được. Trạng thái do MÁY CHỦ tính: máy khách không tự quyết ô nào chọn được.
afterEach(() => vi.useRealTimers());

const BIG = '9223372036854775807';
const MIXED = [
  slot('901', '08:00'),
  slot(BIG, '08:30'),
  slot('903', '09:00', 'DaDat'),
  slot('904', '09:30', 'DangGiuCho'),
  slot('905', '10:00', 'HetHan'),
];

function renderGrid(
  value: DoctorDaySlots,
  onSelect?: (picked: PublicSlot) => void,
) {
  return render(
    <MemoryRouter>
      <DoctorSlotGrid day={value} onSelect={onSelect} />
    </MemoryRouter>,
  );
}

describe('onSelect ở DoctorSlotGrid và SlotCell', () => {
  it('WDH-17 vắng `onSelect` ⇒ y như K2: ô `ConTrong` là liên kết sang Bước 4, không có nút', () => {
    renderGrid(day('12', MIXED));
    expect(
      screen.getByRole('link', { name: '08:00, còn trống' }),
    ).toHaveAttribute('href', '/dat-lich/thong-tin?khungGioId=901');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('WDH-17 có `onSelect` ⇒ ô `ConTrong` là NÚT (không liên kết), cùng tên truy cập, `type="button"` để không gửi form', () => {
    renderGrid(day('12', MIXED), vi.fn());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '08:00, còn trống',
      '08:30, còn trống',
    ]);
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button');
      expect(button).not.toHaveAttribute('href');
      expect(button).not.toBeDisabled();
    }
  });

  it('WDH-17 bấm ô ⇒ `onSelect` được gọi ĐÚNG MỘT lần với nguyên ô của máy chủ; id lớn hơn 2^53 giữ chuỗi', () => {
    const onSelect = vi.fn();
    renderGrid(day('12', MIXED), onSelect);
    fireEvent.click(screen.getByRole('button', { name: '08:30, còn trống' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const picked = onSelect.mock.calls[0][0] as PublicSlot;
    expect(picked.khungGioId).toBe(BIG);
    expect(typeof picked.khungGioId).toBe('string');
    expect(picked).toEqual(MIXED[1]);
  });

  it('WDH-17 ô `DangGiuCho`, `DaDat`, `HetHan` KHÔNG bấm được: không nút, không liên kết, không tabindex; bấm vào không gọi `onSelect`', () => {
    const onSelect = vi.fn();
    renderGrid(day('12', MIXED), onSelect);
    for (const name of [
      '09:00, đã đặt',
      '09:30, đang giữ chỗ',
      '10:00, hết hạn',
    ]) {
      const cell = screen.getByRole('img', { name });
      expect(cell).not.toHaveAttribute('tabindex');
      expect(cell.closest('a, button')).toBeNull();
      fireEvent.click(cell);
    }
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('WDH-17 máy khách KHÔNG tự hết hạn: ô `ConTrong` có giờ đã qua theo đồng hồ máy vẫn là nút và bấm được (trạng thái do máy chủ quyết)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
    const onSelect = vi.fn();
    renderGrid(day('12', [slot('1', '09:30')]), onSelect);
    fireEvent.click(screen.getByRole('button', { name: '09:30, còn trống' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('WDH-17 nút nhận tiêu điểm bằng bàn phím (không `tabindex` âm) và thứ tự Tab theo thứ tự đọc: theo giờ trong buổi', () => {
    renderGrid(day('12', [slot('2', '09:00'), slot('1', '08:00')]), vi.fn());
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '08:00, còn trống',
      '09:00, còn trống',
    ]);
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);
    for (const button of buttons) {
      expect(
        Number(button.getAttribute('tabindex') ?? 0),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('WDH-17 ngày không có khung giờ (`KhongCoLich`, `ChiNhanhNghi`) và hết ô trống ⇒ không có nút nào, `onSelect` không bao giờ gọi', () => {
    const onSelect = vi.fn();
    const { unmount } = renderGrid(
      day('12', [slot('1', '08:00')], 'KhongCoLich'),
      onSelect,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    renderGrid(day('12', [slot('1', '08:00', 'DaDat')]), onSelect);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByText('Không còn khung giờ trống trong ngày này'),
    ).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('WDH-17 SlotCell đứng riêng: `onSelect` vắng ⇒ liên kết; có ⇒ nút', () => {
    const free = slot('7', '08:00');
    const { rerender } = render(
      <MemoryRouter>
        <ul>
          <SlotCell slot={free} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ul>
          <SlotCell slot={free} onSelect={vi.fn()} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});

describe('onSelect ở DoctorSlotPanel', () => {
  const retry = vi.fn();
  const slotDate = {
    date: '2026-11-18',
    today: '2026-11-18',
    resetToToday: vi.fn(),
  };

  it('WDH-17 panel chuyển `onSelect` xuống lưới: chọn ô ở trạng thái `ready` gọi `onSelect`; vắng thì vẫn là liên kết', () => {
    const onSelect = vi.fn();
    const data = slotsById([
      day('12', [slot('5', '08:00'), slot('6', '08:30', 'DaDat')]),
    ]);
    const { unmount } = render(
      <MemoryRouter>
        <DoctorSlotPanel
          bacSiId="12"
          slots={{ status: 'ready', data }}
          retry={retry}
          slotDate={slotDate}
          variant="booking"
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '08:00, còn trống' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0][0] as PublicSlot).khungGioId).toBe('5');
    unmount();

    render(
      <MemoryRouter>
        <DoctorSlotPanel
          bacSiId="12"
          slots={{ status: 'ready', data }}
          retry={retry}
          slotDate={slotDate}
          variant="booking"
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: '08:00, còn trống' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('WDH-17 panel đang tải hay lỗi: không có ô nào để chọn, "Thử lại" vẫn chạy như K2', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <DoctorSlotPanel
          bacSiId="12"
          slots={{ status: 'loading' }}
          retry={retry}
          slotDate={slotDate}
          variant="booking"
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <DoctorSlotPanel
          bacSiId="12"
          slots={{ status: 'error', error: new Error('x') }}
          retry={retry}
          slotDate={slotDate}
          variant="booking"
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
