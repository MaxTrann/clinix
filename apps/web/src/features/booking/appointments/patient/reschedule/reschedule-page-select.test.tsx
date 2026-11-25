import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpDetailPage,
  DETAIL_CODE,
} from '../../../testing/appointment-detail-harness';
import {
  fakeDay,
  fakeSlot,
  type createFakeRescheduleApi,
} from '../../../testing/fake-reschedule-api';
import { renderReschedule } from '../../../testing/reschedule-harness';

// `useNavigate` được thay bằng hàm giả CHỈ ở file này để đếm số lần điều hướng: với router thật, ô chọn xong là rời trang nên một bấm đúp "trông như" chỉ điều hướng một lần dù không có chốt.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigateMock,
}));

// reschedule F1: WDH-19 (bấm đúp một ô ⇒ điều hướng đúng một lần) và WDH-20 (không ghi kho trình duyệt; id khung giờ chỉ đi trên URL). Mã [đề xuất] (PLAN reschedule 7.11). Hôm nay giả là 25/11/2026.
const TODAY = '2026-11-25';
type FakeApi = ReturnType<typeof createFakeRescheduleApi>;
const BIG = '9007199254740993';
const CONFIRM = `/benh-nhan/lich-hen-cua-toi/${DETAIL_CODE}/doi-lich/xac-nhan`;

beforeEach(() => {
  navigateMock.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanUpDetailPage();
});

const withSlots = {
  before: (api: FakeApi) => {
    api.slotsFor = (bacSiId, ngay) =>
      fakeDay(bacSiId, [
        fakeSlot(BIG, ngay, '08:00'),
        fakeSlot('2', ngay, '08:30'),
        fakeSlot('3', ngay, '09:00', 'DaDat'),
      ]);
  },
};
const cell = (name: string) => screen.findByRole('button', { name });

describe('chọn ô chỉ một lần (WDH-19)', () => {
  it('WDH-19 bấm đúp một ô ⇒ điều hướng ĐÚNG MỘT lần, tới màn xác nhận với id nguyên chuỗi', async () => {
    renderReschedule(withSlots);
    const target = await cell('08:00, còn trống');
    fireEvent.click(target);
    fireEvent.click(target);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(`${CONFIRM}?khungGioId=${BIG}`);
  });

  it('WDH-19 bấm ô này rồi ô khác khi trang còn đó (route đích nạp chậm) ⇒ vẫn chỉ MỘT lần điều hướng, ô đầu thắng', async () => {
    renderReschedule(withSlots);
    fireEvent.click(await cell('08:00, còn trống'));
    fireEvent.click(await cell('08:30, còn trống'));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock.mock.calls[0][0]).toContain(`khungGioId=${BIG}`);
  });

  it('WDH-19 chưa bấm thì không điều hướng; bấm ô đã đặt không điều hướng', async () => {
    renderReschedule(withSlots);
    await cell('08:00, còn trống');
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('img', { name: '09:00, đã đặt' }));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('không dùng kho trình duyệt (WDH-20)', () => {
  it('WDH-20 từ lúc tải tới lúc chọn ô: không `setItem` ở `localStorage` và `sessionStorage`, kho vẫn rỗng, id chỉ đi trên URL', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(document, 'cookie', 'set');
    renderReschedule(withSlots);
    fireEvent.click(await cell('08:00, còn trống'));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(navigateMock.mock.calls[0][0]).toContain(BIG);
  });
});
