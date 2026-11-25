import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpDetailPage,
  DETAIL_CODE,
} from '../../../testing/appointment-detail-harness';
import {
  fakeDay,
  fakeSlot,
  makePreview,
} from '../../../testing/fake-reschedule-api';
import { renderReschedule } from '../../../testing/reschedule-harness';
import { RESCHEDULE_TEXT } from '../../common/reschedule-text';

// reschedule F1: trang chọn khung giờ mới. Mã WDH-02, WDH-03, WDH-22 (PLAN reschedule 7.11 và [đề xuất]); API giả theo PLAN 5.8 (backend B6 chưa có). Hôm nay giả là 25/11/2026 (giờ Việt Nam,
// thứ Tư); đồng hồ giả chỉ cho `Date` nên hẹn giờ thật vẫn chạy. Dữ liệu giả.
const TODAY = '2026-11-25';
const CONFIRM_BASE = `/benh-nhan/lich-hen-cua-toi/${DETAIL_CODE}/doi-lich/xac-nhan`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
});
afterEach(cleanUpDetailPage);

const url = () => screen.getByTestId('url').textContent;
const freeCell = (name: string) => screen.findByRole('button', { name });
// Thẻ "Lịch hiện tại" là phần tử section không có tên vùng (khung DetailCard dùng chung): tìm qua tiêu đề h2 của nó
const currentCard = () =>
  screen
    .getByRole('heading', { level: 2, name: RESCHEDULE_TEXT.currentTitle })
    .closest('section') as HTMLElement;

describe('trang chọn khung giờ (WDH-02)', () => {
  it('WDH-02 tiêu đề, thẻ "Lịch hiện tại" theo giờ Việt Nam, dải bảy ngày (hôm nay được chọn) và lưới khung giờ', async () => {
    renderReschedule();
    expect(
      screen.getByRole('heading', { level: 1, name: RESCHEDULE_TEXT.title }),
    ).toBeInTheDocument();
    await freeCell('08:00, còn trống');

    const card = currentCard();
    expect(within(card).getByText('Thứ 2, 30/11/2026')).toBeInTheDocument();
    expect(within(card).getByText('09:30')).toBeInTheDocument();

    const days = screen
      .getByRole('group', { name: 'Ngày khám' })
      .querySelectorAll('button');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: RESCHEDULE_TEXT.pickTitle,
      }),
    ).toBeInTheDocument();
  });

  it('WDH-02 lưới là của ĐÚNG bác sĩ của lịch: id lấy từ `lichCu.bacSiId` của preview, gọi MỘT lần, đúng ngày hôm nay', async () => {
    const { api } = renderReschedule();
    await freeCell('08:00, còn trống');
    expect(api.slotCalls).toEqual([{ bacSiIds: '12', ngay: TODAY }]);
    expect(api.previewCalls).toEqual([
      { maLichHen: DETAIL_CODE, khungGioId: null },
    ]);
  });

  it('WDH-02 id bác sĩ lớn hơn 2^53 đi NGUYÊN chuỗi tới lưới', async () => {
    const big = '9007199254740993';
    const { api } = renderReschedule({
      before: (fake) => {
        fake.preview = makePreview({
          lichCu: { thoiGian: '2026-11-30T02:30:00.000Z', bacSiId: big },
        });
      },
    });
    await freeCell('08:00, còn trống');
    expect(api.slotCalls[0].bacSiIds).toBe(big);
  });

  it('WDH-02 ô còn trống chọn được; ô đã đặt (khung giờ của chính lịch cũ), đang giữ và hết hạn KHÔNG bấm được', async () => {
    renderReschedule({
      before: (api) => {
        api.slotsFor = (bacSiId, ngay) =>
          fakeDay(bacSiId, [
            fakeSlot('1', ngay, '08:00'),
            fakeSlot('2', ngay, '08:30', 'DaDat'),
            fakeSlot('3', ngay, '09:00', 'DangGiuCho'),
            fakeSlot('4', ngay, '09:30', 'HetHan'),
            fakeSlot('5', ngay, '10:00'),
          ]);
      },
    });
    await freeCell('08:00, còn trống');
    expect(
      screen
        .getAllByRole('button', { name: /còn trống/ })
        .map((cell) => cell.getAttribute('aria-label')),
    ).toEqual(['08:00, còn trống', '10:00, còn trống']);
    for (const name of [
      '08:30, đã đặt',
      '09:00, đang giữ chỗ',
      '09:30, hết hạn',
    ]) {
      const cell = screen.getByRole('img', { name });
      expect(cell.closest('a, button')).toBeNull();
    }
    // không có liên kết sang Bước 4 đặt lịch mới (đổi lịch không đi vào luồng đặt lịch)
    expect(
      document.querySelector('a[href^="/dat-lich"]'),
    ).not.toBeInTheDocument();
  });

  it('WDH-02 đổi ngày ⇒ lưới của ngày đó (một lời gọi mới, KHÔNG gọi lại preview); đúng bác sĩ', async () => {
    const { api } = renderReschedule();
    await freeCell('08:00, còn trống');
    fireEvent.click(screen.getByRole('button', { name: 'Thứ Năm 26/11' }));
    await freeCell('08:00, còn trống');
    expect(api.slotCalls.map((call) => call.ngay)).toEqual([
      TODAY,
      '2026-11-26',
    ]);
    expect(api.slotCalls.every((call) => call.bacSiIds === '12')).toBe(true);
    expect(api.previewCalls).toHaveLength(1);
  });

  it('WDH-02 ngày bác sĩ không có lịch ⇒ câu nguyên văn, không ô để chọn; trang vẫn dùng được', async () => {
    renderReschedule({
      before: (api) => {
        api.slotsFor = (bacSiId) => ({
          bacSiId,
          trangThaiNgay: 'KhongCoLich',
          khungGio: [],
        });
      },
    });
    expect(
      await screen.findByText('Bác sĩ không có lịch làm việc ngày này'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /còn trống/ })).toBeNull();
    expect(
      screen.getByRole('group', { name: 'Ngày khám' }),
    ).toBeInTheDocument();
  });

  it('WDH-02 `loai = TuDoi` ⇒ dòng "đã tự đổi n trên m lần" lấy NGUYÊN số của máy chủ, không dòng nhắc yêu cầu', async () => {
    renderReschedule({
      before: (api) => {
        api.preview = makePreview({ soLanDaDoi: 1, soLanToiDa: 3 });
      },
    });
    await freeCell('08:00, còn trống');
    expect(screen.getByText('Bạn đã tự đổi 1 trên 3 lần.')).toBeInTheDocument();
    expect(screen.queryByText(RESCHEDULE_TEXT.requestNotice)).toBeNull();
  });

  it('WDH-02 `loai = GuiYeuCau` ⇒ dòng nhắc "gửi yêu cầu cho Lễ tân duyệt, lịch giữ nguyên", lưới vẫn chọn được', async () => {
    renderReschedule({
      before: (api) => {
        api.preview = makePreview({
          loai: 'GuiYeuCau',
          soLanDaDoi: 2,
          soLanToiDa: 2,
        });
      },
    });
    await freeCell('08:00, còn trống');
    expect(screen.getByText(RESCHEDULE_TEXT.requestNotice)).toBeInTheDocument();
    expect(screen.queryByText(/Bạn đã tự đổi/)).toBeNull();
  });
});

describe('choPhepDoi = false (WDH-02, WDH-07)', () => {
  it('WDH-02 không đổi được ⇒ câu theo `lyDoKhongDoi`, KHÔNG vẽ lưới hay dải ngày, KHÔNG gọi lưới, có liên kết về chi tiết', async () => {
    const { api } = renderReschedule({
      before: (fake) => {
        fake.preview = makePreview({
          choPhepDoi: false,
          lyDoKhongDoi: 'LICH_HEN_DA_QUA_GIO',
        });
      },
    });
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Đã quá giờ hẹn nên không thể đổi lịch.');
    expect(
      within(notice).getByRole('link', {
        name: RESCHEDULE_TEXT.backToDetailLink,
      }),
    ).toHaveAttribute('href', `/benh-nhan/lich-hen-cua-toi/${DETAIL_CODE}`);
    expect(screen.queryByRole('group', { name: 'Ngày khám' })).toBeNull();
    expect(screen.queryByRole('button', { name: /còn trống/ })).toBeNull();
    expect(api.slotCalls).toHaveLength(0);
  });

  it.each([[undefined], ['MA_LA_CHUA_BIET'], ['constructor']])(
    'WDH-02 `lyDoKhongDoi` = %s ⇒ câu chung, không lộ mã',
    async (lyDoKhongDoi) => {
      renderReschedule({
        before: (api) => {
          api.preview = makePreview({ choPhepDoi: false, lyDoKhongDoi });
        },
      });
      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent('Lịch hẹn này hiện không thể đổi.');
      expect(notice.textContent).not.toMatch(/MA_LA_CHUA_BIET|constructor/);
    },
  );
});

describe('thẻ "Lịch hiện tại" theo giờ Việt Nam (WDH-22)', () => {
  it('WDH-22 17:30Z đã là 00:30 NGÀY HÔM SAU ở Việt Nam: không cắt chuỗi, không theo múi giờ máy', async () => {
    renderReschedule({
      before: (api) => {
        api.preview = makePreview({
          lichCu: { thoiGian: '2026-11-30T17:30:00.000Z', bacSiId: '12' },
        });
      },
    });
    await freeCell('08:00, còn trống');
    const card = currentCard();
    expect(within(card).getByText('Thứ 3, 01/12/2026')).toBeInTheDocument();
    expect(within(card).getByText('00:30')).toBeInTheDocument();
  });

  it('WDH-22 máy ở múi giờ khác (Los Angeles) vẫn ra giờ Việt Nam', async () => {
    // `vi.stubEnv` đặt `process.env.TZ` (Node đổi múi giờ của `Date` ngay); `unstubAllEnvs` ở `finally` trả lại
    vi.stubEnv('TZ', 'America/Los_Angeles');
    try {
      // Bảo đảm múi giờ máy ĐÃ đổi (nếu không thì ca này không chứng minh gì)
      expect(new Date('2026-11-30T17:30:00.000Z').getHours()).toBe(9);
      renderReschedule({
        before: (api) => {
          api.preview = makePreview({
            lichCu: { thoiGian: '2026-11-30T17:30:00.000Z', bacSiId: '12' },
          });
        },
      });
      await freeCell('08:00, còn trống');
      const card = currentCard();
      expect(within(card).getByText('00:30')).toBeInTheDocument();
      expect(within(card).getByText('Thứ 3, 01/12/2026')).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('chọn ô (WDH-03)', () => {
  it('WDH-03 chọn ô ⇒ sang màn xác nhận với `khungGioId` trên query', async () => {
    renderReschedule();
    fireEvent.click(await freeCell('09:00, còn trống'));
    expect(url()).toBe(`${CONFIRM_BASE}?khungGioId=1253`);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: RESCHEDULE_TEXT.confirmTitle,
      }),
    ).toBeInTheDocument();
  });

  it('WDH-03 id khung giờ lớn hơn 2^53 giữ NGUYÊN chuỗi trên URL', async () => {
    const big = '9223372036854775807';
    renderReschedule({
      before: (api) => {
        api.slotsFor = (bacSiId, ngay) =>
          fakeDay(bacSiId, [fakeSlot(big, ngay, '08:00')]);
      },
    });
    fireEvent.click(await freeCell('08:00, còn trống'));
    expect(url()).toBe(`${CONFIRM_BASE}?khungGioId=${big}`);
  });

  it('WDH-03 chọn ô KHÔNG gọi API ghi: trang chọn chỉ điều hướng; lời gọi preview thứ hai là của MÀN XÁC NHẬN (reschedule F2, chỉ đọc, có `khungGioId`)', async () => {
    const { api } = renderReschedule();
    fireEvent.click(await freeCell('08:00, còn trống'));
    await screen.findByRole('heading', { name: RESCHEDULE_TEXT.confirmTitle });
    await screen.findByRole('heading', {
      level: 2,
      name: RESCHEDULE_TEXT.newTitle,
    });
    expect(api.detail.writes()).toEqual([]);
    expect(api.submitCalls).toEqual([]);
    expect(api.previewCalls).toHaveLength(2);
    expect(api.previewCalls[0].khungGioId).toBeNull();
    expect(api.previewCalls[1].khungGioId).toMatch(/^1\d{2}1$/);
  });
});
