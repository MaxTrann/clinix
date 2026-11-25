import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/errors';
import * as api from '../api/search-service';
import type { DoctorSlotsById, PublicSlot } from '../api/slot-types';
import { SlotPicker } from './slot-picker';
import { day, slot, slotsById } from './testing/slot-fixtures';

vi.mock('../api/search-service');

// reschedule F1, mã ca WDH-18 [đề xuất] (PLAN reschedule 7.11 WDH-02, WDH-08): bộ chọn khung giờ dùng chung = dải ngày + lưới của ĐÚNG MỘT bác sĩ, ô `ConTrong` là nút `onSelect`.
// Hôm nay giả là 18/11/2026 (giờ Việt Nam); đồng hồ giả chỉ cho `Date`, còn timer thật để `waitFor` chạy.
const TODAY = '2026-11-18';
const TOMORROW = '2026-11-19';

function deferred() {
  let resolve!: (value: DoctorSlotsById) => void;
  const promise = new Promise<DoctorSlotsById>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderPicker(onSelect = vi.fn(), bacSiId = '12') {
  const view = render(
    <MemoryRouter>
      <SlotPicker bacSiId={bacSiId} onSelect={onSelect} />
    </MemoryRouter>,
  );
  return { onSelect, ...view };
}

const tile = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
});
afterEach(() => vi.useRealTimers());

describe('SlotPicker', () => {
  it('WDH-18 gọi ĐÚNG MỘT lần cho đúng bác sĩ và hôm nay; dải bảy ngày (hôm nay được chọn), lưới của bác sĩ đó', async () => {
    vi.mocked(api.getDoctorSlots).mockResolvedValue(
      slotsById([day('12', [slot('5', '08:00'), slot('6', '08:30', 'DaDat')])]),
    );
    renderPicker();
    expect(
      await screen.findByRole('button', { name: '08:00, còn trống' }),
    ).toBeInTheDocument();
    expect(api.getDoctorSlots).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.getDoctorSlots).mock.calls[0][0]).toEqual({
      bacSiIds: ['12'],
      ngay: TODAY,
    });
    const group = screen.getByRole('group', { name: 'Ngày khám' });
    const days = group.querySelectorAll('button');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveAttribute('aria-pressed', 'true');
    expect(days[1]).toHaveAttribute('aria-pressed', 'false');
    // ô đã đặt không phải nút
    expect(
      screen.getByRole('img', { name: '08:30, đã đặt' }),
    ).toBeInTheDocument();
  });

  it('WDH-18 bấm ô còn trống ⇒ `onSelect` nhận nguyên ô (id chuỗi lớn hơn 2^53)', async () => {
    const big = '9007199254740993';
    vi.mocked(api.getDoctorSlots).mockResolvedValue(
      slotsById([day('12', [slot(big, '09:00')])]),
    );
    const { onSelect } = renderPicker();
    fireEvent.click(
      await screen.findByRole('button', { name: '09:00, còn trống' }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0][0] as PublicSlot).khungGioId).toBe(big);
  });

  it('WDH-18 đổi ngày ⇒ MỘT lời gọi mới với ngày mới, tiêu điểm Ở LẠI thẻ ngày vừa bấm, dòng trạng thái nêu ngày đang xem', async () => {
    vi.mocked(api.getDoctorSlots)
      .mockResolvedValueOnce(slotsById([day('12', [slot('1', '08:00')])]))
      .mockResolvedValueOnce(
        slotsById([
          day('12', [slot('2', '10:00', 'ConTrong', 'CaSang', TOMORROW)]),
        ]),
      );
    renderPicker();
    await screen.findByRole('button', { name: '08:00, còn trống' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang xem Hôm nay, Thứ Tư 18/11.',
    );

    const next = tile('Thứ Năm 19/11');
    next.focus();
    fireEvent.click(next);
    expect(api.getDoctorSlots).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.getDoctorSlots).mock.calls[1][0]).toEqual({
      bacSiIds: ['12'],
      ngay: TOMORROW,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang xem Thứ Năm 19/11.',
    );
    expect(
      await screen.findByRole('button', { name: '10:00, còn trống' }),
    ).toBeInTheDocument();
    // sau khi lưới thay nội dung tiêu điểm vẫn ở thẻ ngày (không rơi về body)
    expect(document.activeElement).toBe(next);
    expect(next).toHaveAttribute('aria-pressed', 'true');
  });

  it('WDH-18 đổi ngày giữa chừng: yêu cầu cũ bị huỷ và phản hồi muộn của ngày cũ KHÔNG ghi đè lưới ngày mới', async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(api.getDoctorSlots)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderPicker();
    const firstSignal = vi.mocked(api.getDoctorSlots).mock.calls[0][1];
    fireEvent.click(tile('Thứ Năm 19/11'));
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => {
      second.resolve(
        slotsById([
          day('12', [slot('2', '10:00', 'ConTrong', 'CaSang', TOMORROW)]),
        ]),
      );
    });
    await act(async () => {
      first.resolve(slotsById([day('12', [slot('1', '08:00')])]));
    });
    expect(
      screen.getByRole('button', { name: '10:00, còn trống' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '08:00, còn trống' }),
    ).not.toBeInTheDocument();
  });

  it('WDH-18 đang tải: có chữ cho trình đọc màn hình và KHÔNG có ô nào để chọn', () => {
    vi.mocked(api.getDoctorSlots).mockReturnValue(deferred().promise);
    renderPicker();
    expect(screen.getByText('Đang tải khung giờ…')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /còn trống/ }),
    ).not.toBeInTheDocument();
  });

  it('WDH-18 lỗi lưới hiện riêng kèm "Thử lại" gọi lại đúng một lần; dải ngày vẫn dùng được', async () => {
    vi.mocked(api.getDoctorSlots)
      .mockRejectedValueOnce(new Error('mất mạng'))
      .mockResolvedValueOnce(slotsById([day('12', [slot('1', '08:00')])]));
    renderPicker();
    expect(
      await screen.findByText('Không tải được khung giờ.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Ngày khám' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('button', { name: '08:00, còn trống' }),
    ).toBeInTheDocument();
    expect(api.getDoctorSlots).toHaveBeenCalledTimes(2);
  });

  it('WDH-18 400 ở trường `ngay` ⇒ "Ngày đã chọn không còn hợp lệ." và nút "Xem lịch hôm nay" tải lại hôm nay', async () => {
    // Lần 1: hôm nay ổn. Lần 2: ngày kế bị 400 (đồng hồ máy lệch hay trang mở qua nửa đêm). Lần 3: "Xem lịch hôm nay" quay về hôm nay.
    vi.mocked(api.getDoctorSlots)
      .mockResolvedValueOnce(slotsById([day('12', [slot('1', '08:00')])]))
      .mockRejectedValueOnce(
        new ApiError(400, {
          maLoi: 'BO_LOC_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' }],
        }),
      )
      .mockResolvedValueOnce(slotsById([day('12', [slot('3', '09:00')])]));
    renderPicker();
    await screen.findByRole('button', { name: '08:00, còn trống' });
    fireEvent.click(tile('Thứ Năm 19/11'));
    expect(
      await screen.findByText('Ngày đã chọn không còn hợp lệ.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Thử lại' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xem lịch hôm nay' }));
    expect(
      await screen.findByRole('button', { name: '09:00, còn trống' }),
    ).toBeInTheDocument();
    expect(vi.mocked(api.getDoctorSlots).mock.calls[2][0]).toEqual({
      bacSiIds: ['12'],
      ngay: TODAY,
    });
  });

  it('WDH-18 ngày bác sĩ không có lịch ⇒ câu nguyên văn, không nút chọn', async () => {
    vi.mocked(api.getDoctorSlots).mockResolvedValue(
      slotsById([day('12', [], 'KhongCoLich')]),
    );
    renderPicker();
    expect(
      await screen.findByText('Bác sĩ không có lịch làm việc ngày này'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /còn trống/ }),
    ).not.toBeInTheDocument();
  });

  it('WDH-18 đổi `bacSiId` ⇒ gọi lại cho bác sĩ mới (lưới không giữ ô của bác sĩ trước)', async () => {
    vi.mocked(api.getDoctorSlots).mockImplementation(async ({ bacSiIds }) =>
      slotsById([day(bacSiIds[0], [slot(`s${bacSiIds[0]}`, '08:00')])]),
    );
    const onSelect = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <SlotPicker bacSiId="12" onSelect={onSelect} />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: '08:00, còn trống' });
    rerender(
      <MemoryRouter>
        <SlotPicker bacSiId="34" onSelect={onSelect} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(api.getDoctorSlots).toHaveBeenLastCalledWith(
        { bacSiIds: ['34'], ngay: TODAY },
        expect.anything(),
      ),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '08:00, còn trống' }),
    );
    expect((onSelect.mock.calls[0][0] as PublicSlot).khungGioId).toBe('s34');
  });
});
