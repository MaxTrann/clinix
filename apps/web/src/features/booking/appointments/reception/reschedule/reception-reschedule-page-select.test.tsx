import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanUpReceptionPage } from '../../../testing/reception-harness';
import { fakeDay, fakeSlot } from '../../../testing/fake-reschedule-api';
import type { createFakeReceptionRescheduleApi } from '../../../testing/fake-reception-reschedule-api';
import { renderReceptionReschedule } from '../../../testing/reception-reschedule-harness';

// `useNavigate` được thay bằng hàm giả CHỈ ở file này để đếm số lần điều hướng: với router thật, ô chọn xong là rời trang nên một bấm đúp "trông như" chỉ điều hướng một lần dù không có chốt.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigateMock,
}));

// reschedule F3, mã ca WDO-02 (chốt chọn ô một lần) và WDO-14 (id khung giờ chỉ đi trên URL, không kho trình duyệt): nếp WDH-19, WDH-20 của Bệnh nhân. Hôm nay giả là 25/11/2026. Dữ liệu giả.
const TODAY = '2026-11-25';
type FakeApi = ReturnType<typeof createFakeReceptionRescheduleApi>;
const BIG = '9007199254740993';
const CONFIRM = '/le-tan/quan-ly-lich-hen/CP20261018001/doi-lich/xac-nhan';

beforeEach(() => {
  navigateMock.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanUpReceptionPage();
});

const withSlots = {
  before: (api: FakeApi) => {
    api.slots.slotsFor = (bacSiId, ngay) =>
      fakeDay(bacSiId, [
        fakeSlot(BIG, ngay, '08:00'),
        fakeSlot('2', ngay, '08:30'),
        fakeSlot('3', ngay, '09:00', 'DaDat'),
      ]);
  },
};
const cell = (name: string) => screen.findByRole('button', { name });

describe('chọn ô chỉ một lần (WDO-02)', () => {
  it('WDO-02 bấm đúp một ô ⇒ điều hướng ĐÚNG MỘT lần, tới màn xác nhận của Lễ tân với id nguyên chuỗi', async () => {
    renderReceptionReschedule(withSlots);
    const target = await cell('08:00, còn trống');
    fireEvent.click(target);
    fireEvent.click(target);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(`${CONFIRM}?khungGioId=${BIG}`);
  });

  it('WDO-02 bấm ô này rồi ô khác khi trang còn đó (route đích nạp chậm) ⇒ vẫn chỉ MỘT lần điều hướng, ô đầu thắng', async () => {
    renderReceptionReschedule(withSlots);
    fireEvent.click(await cell('08:00, còn trống'));
    fireEvent.click(await cell('08:30, còn trống'));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock.mock.calls[0][0]).toContain(`khungGioId=${BIG}`);
  });

  it('WDO-02 chưa bấm thì không điều hướng; bấm ô đã đặt không điều hướng', async () => {
    renderReceptionReschedule(withSlots);
    await cell('08:00, còn trống');
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('img', { name: '09:00, đã đặt' }));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('không dùng kho trình duyệt (WDO-02)', () => {
  it('WDO-02 từ lúc tải tới lúc chọn ô: không `setItem` ở `localStorage` và `sessionStorage`, không ghi cookie, kho vẫn rỗng; id chỉ đi trên URL', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(document, 'cookie', 'set');
    renderReceptionReschedule(withSlots);
    fireEvent.click(await cell('08:00, còn trống'));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(navigateMock.mock.calls[0][0]).toContain(BIG);
  });
});
