import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECEPTION_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { LIST_MARK } from '../../../testing/appointment-detail-harness';
import { cleanUpReceptionPage } from '../../../testing/reception-harness';
import { fakeDay, fakeSlot } from '../../../testing/fake-reschedule-api';
import { makeReceptionPreview } from '../../../testing/fake-reception-reschedule-api';
import { renderReceptionReschedule } from '../../../testing/reception-reschedule-harness';
import {
  apiError,
  CONFIRM_PATH,
  currentUrl,
  OLD_DETAIL_PATH,
  RECEPTION_CODE,
  RTEXT,
  TEXT,
  noLeak,
} from '../../../testing/reception-reschedule-helpers';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { noticeState } from '../../common/reschedule-notice-state';
import { rescheduleMessageForCode } from '../../common/reschedule-errors';

// reschedule F3, mã ca WDO-02 (PLAN reschedule 7.11 "hộp chọn"): trang chọn khung giờ mới của Lễ tân đổi hộ (route con `…/doi-lich`). API giả theo hợp đồng THẬT của B7. Hôm nay giả là 25/11/2026 (giờ Việt Nam,
// thứ Tư); đồng hồ giả chỉ cho `Date` nên hẹn giờ thật vẫn chạy. Dữ liệu giả.
const TODAY = '2026-11-25';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
});
afterEach(cleanUpReceptionPage);

const freeCell = (name: string) => screen.findByRole('button', { name });
// Thẻ "Lịch hiện tại" là phần tử section không có tên vùng (khung DetailCard dùng chung): tìm qua tiêu đề h2 của nó
const currentCard = () =>
  screen
    .getByRole('heading', { level: 2, name: TEXT.currentTitle })
    .closest('section') as HTMLElement;

describe('trang chọn khung giờ (WDO-02)', () => {
  it('WDO-02 tiêu đề của Lễ tân, thẻ "Lịch hiện tại" theo giờ Việt Nam, dải bảy ngày (hôm nay được chọn) và lưới khung giờ; KHÔNG dòng "tự đổi n lần"', async () => {
    renderReceptionReschedule();
    expect(
      screen.getByRole('heading', { level: 1, name: RTEXT.title }),
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
      screen.getByRole('heading', { level: 2, name: TEXT.pickTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tự đổi/)).toBeNull();
    expect(screen.queryByText(TEXT.requestNotice)).toBeNull();
  });

  it('WDO-02 liên kết quay lại về CHI TIẾT lịch của Lễ tân (không phải của Bệnh nhân)', async () => {
    renderReceptionReschedule();
    await freeCell('08:00, còn trống');
    expect(
      screen.getByRole('link', { name: TEXT.backToDetail }),
    ).toHaveAttribute('href', OLD_DETAIL_PATH);
  });

  it('WDO-02 lưới là của ĐÚNG bác sĩ của lịch: id lấy từ `lichCu.bacSiId` của preview, gọi MỘT lần, đúng ngày hôm nay; trang chỉ gọi preview (không chi tiết, không ghi)', async () => {
    const { api } = renderReceptionReschedule();
    await freeCell('08:00, còn trống');
    expect(api.slots.slotCalls).toEqual([{ bacSiIds: '12', ngay: TODAY }]);
    expect(api.previewCalls).toEqual([
      { maLichHen: RECEPTION_CODE, khungGioId: null },
    ]);
    expect(api.submitCalls).toEqual([]);
    expect(api.reception.requests).toEqual([]);
  });

  it('WDO-02 id bác sĩ lớn hơn 2^53 đi NGUYÊN chuỗi tới lưới', async () => {
    const big = '9007199254740993';
    const { api } = renderReceptionReschedule({
      before: (fake) => {
        fake.preview = makeReceptionPreview({
          lichCu: { thoiGian: '2026-11-30T02:30:00.000Z', bacSiId: big },
        });
      },
    });
    await freeCell('08:00, còn trống');
    expect(api.slots.slotCalls[0].bacSiIds).toBe(big);
  });

  it('WDO-02 ô còn trống chọn được; ô đã đặt (khung giờ của chính lịch cũ), đang giữ và hết hạn KHÔNG bấm được; không có liên kết sang luồng đặt lịch', async () => {
    renderReceptionReschedule({
      before: (api) => {
        api.slots.slotsFor = (bacSiId, ngay) =>
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
      expect(screen.getByRole('img', { name }).closest('a, button')).toBeNull();
    }
    expect(document.querySelector('a[href^="/dat-lich"]')).toBeNull();
  });

  it('WDO-02 đổi ngày ⇒ lưới của ngày đó (một lời gọi mới, KHÔNG gọi lại preview); đúng bác sĩ', async () => {
    const { api } = renderReceptionReschedule();
    await freeCell('08:00, còn trống');
    fireEvent.click(screen.getByRole('button', { name: 'Thứ Năm 26/11' }));
    await freeCell('08:00, còn trống');
    expect(api.slots.slotCalls.map((call) => call.ngay)).toEqual([
      TODAY,
      '2026-11-26',
    ]);
    expect(api.slots.slotCalls.every((call) => call.bacSiIds === '12')).toBe(
      true,
    );
    expect(api.previewCalls).toHaveLength(1);
  });

  it('WDO-02 17:30Z đã là 00:30 NGÀY HÔM SAU ở Việt Nam: không cắt chuỗi, không theo múi giờ máy', async () => {
    renderReceptionReschedule({
      before: (api) => {
        api.preview = makeReceptionPreview({
          lichCu: { thoiGian: '2026-11-30T17:30:00.000Z', bacSiId: '12' },
        });
      },
    });
    await freeCell('08:00, còn trống');
    const card = currentCard();
    expect(within(card).getByText('Thứ 3, 01/12/2026')).toBeInTheDocument();
    expect(within(card).getByText('00:30')).toBeInTheDocument();
  });

  it('WDO-02 tiêu điểm vào tiêu đề trang khi vào (không rơi về `body`)', async () => {
    renderReceptionReschedule();
    await freeCell('08:00, còn trống');
    expect(
      screen.getByRole('heading', { level: 1, name: RTEXT.title }),
    ).toHaveFocus();
  });
});

describe('chọn ô (WDO-02)', () => {
  it('WDO-02 chọn ô ⇒ sang màn xác nhận của Lễ tân với `khungGioId` trên query; chọn ô KHÔNG gọi API ghi (lời gọi preview thứ hai là của màn xác nhận, chỉ đọc)', async () => {
    const { api } = renderReceptionReschedule();
    fireEvent.click(await freeCell('09:00, còn trống'));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: RTEXT.confirmTitle,
      }),
    ).toBeInTheDocument();
    await screen.findByRole('heading', { level: 2, name: TEXT.newTitle });
    expect(currentUrl()).toMatch(
      /^\/le-tan\/quan-ly-lich-hen\/CP20261018001\/doi-lich\/xac-nhan\?khungGioId=1253$/,
    );
    expect(api.submitCalls).toEqual([]);
    expect(api.reception.writes()).toEqual([]);
    expect(api.previewCalls).toHaveLength(2);
    expect(api.previewCalls[0].khungGioId).toBeNull();
    expect(api.previewCalls[1].khungGioId).toBe('1253');
  });

  it('WDO-02 id khung giờ lớn hơn 2^53 giữ NGUYÊN chuỗi trên URL (không qua Number)', async () => {
    const big = '9223372036854775807';
    renderReceptionReschedule({
      before: (api) => {
        api.slots.slotsFor = (bacSiId, ngay) =>
          fakeDay(bacSiId, [fakeSlot(big, ngay, '08:00')]);
      },
    });
    fireEvent.click(await freeCell('08:00, còn trống'));
    await screen.findByRole('heading', { name: RTEXT.confirmTitle });
    expect(currentUrl()).toBe(CONFIRM_PATH.replace('9007199254740993', big));
  });

  it('WDO-02 không ghi `localStorage` và `sessionStorage` từ lúc tải tới lúc chọn ô (id chỉ đi trên URL)', async () => {
    renderReceptionReschedule();
    fireEvent.click(await freeCell('08:00, còn trống'));
    await screen.findByRole('heading', { name: RTEXT.confirmTitle });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('không đổi được và các trạng thái (WDO-02)', () => {
  it.each([
    [
      'LICH_HEN_KHONG_CHO_DOI',
      'Lịch hẹn này hiện không thể đổi. Chỉ lịch đã xác nhận mới đổi được.',
    ],
    ['LICH_HEN_DA_QUA_GIO', 'Đã quá giờ hẹn nên không thể đổi lịch.'],
    [
      'CHUOI_DOI_LICH_QUA_DAI',
      'Lịch hẹn này đã đổi quá nhiều lần. Vui lòng huỷ và đặt lịch mới.',
    ],
  ])(
    'WDO-02 `choPhepDoi = false` với `lyDoKhongDoi` = %s ⇒ câu theo mã, KHÔNG lưới, KHÔNG dải ngày, KHÔNG gọi lưới, liên kết về chi tiết',
    async (code, sentence) => {
      const { api, container } = renderReceptionReschedule({
        before: (fake) => {
          fake.preview = makeReceptionPreview({
            choPhepDoi: false,
            lyDoKhongDoi: code,
          });
        },
      });
      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent(sentence);
      expect(
        within(notice).getByRole('link', { name: TEXT.backToDetailLink }),
      ).toHaveAttribute('href', OLD_DETAIL_PATH);
      expect(screen.queryByRole('group', { name: 'Ngày khám' })).toBeNull();
      expect(screen.queryByRole('button', { name: /còn trống/ })).toBeNull();
      expect(api.slots.slotCalls).toHaveLength(0);
      noLeak(container);
    },
  );

  it('WDO-02 lịch hồ sơ người thân đã ngừng ⇒ câu của booking theo mã, vẫn có đường về chi tiết', async () => {
    renderReceptionReschedule({
      before: (fake) => {
        fake.preview = makeReceptionPreview({
          choPhepDoi: false,
          lyDoKhongDoi: 'HO_SO_NGUOI_THAN_DA_NGUNG',
        });
      },
    });
    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toBe(
      `${rescheduleMessageForCode('HO_SO_NGUOI_THAN_DA_NGUNG')?.message}${TEXT.backToDetailLink}`,
    );
  });

  it.each([[undefined], ['MA_LA_CHUA_BIET'], ['constructor']])(
    'WDO-02 `lyDoKhongDoi` = %s ⇒ câu chung, không lộ mã',
    async (lyDoKhongDoi) => {
      renderReceptionReschedule({
        before: (api) => {
          api.preview = makeReceptionPreview({
            choPhepDoi: false,
            lyDoKhongDoi,
          });
        },
      });
      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent('Lịch hẹn này hiện không thể đổi.');
      expect(notice.textContent).not.toMatch(/MA_LA_CHUA_BIET|constructor/);
    },
  );

  it('WDO-02 `coYeuCauChoDuyet = true` KHÔNG chặn: vẫn có lưới để chọn (KDL-19)', async () => {
    renderReceptionReschedule({
      before: (api) => {
        api.preview = makeReceptionPreview({ coYeuCauChoDuyet: true });
      },
    });
    await freeCell('08:00, còn trống');
  });

  it('WDO-02 đang tải preview ⇒ chữ đang tải, chưa có lưới', async () => {
    let release: (() => void) | null = null;
    renderReceptionReschedule({
      before: (api) =>
        api.failNext(
          'preview',
          () =>
            new Promise<Response>((resolve) => {
              release = () => resolve(Response.json(makeReceptionPreview()));
            }),
        ),
    });
    expect(screen.getByText(TEXT.loading)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ngày khám' })).toBeNull();
    await vi.waitFor(() => expect(release).not.toBeNull());
    (release as unknown as () => void)();
    await freeCell('08:00, còn trống');
    expect(screen.queryByText(TEXT.loading)).toBeNull();
  });

  it.each([
    [404, 'KHONG_TIM_THAY'],
    [403, 'KHONG_DU_QUYEN'],
  ])(
    'WDO-02 %i %s (kể cả lịch NGOÀI chi nhánh) ⇒ MỘT thẻ chung "không tìm thấy" kèm liên kết về danh sách; không lộ mã',
    async (status, maLoi) => {
      const { container } = renderReceptionReschedule({
        before: (api) => api.failNext('preview', () => apiError(status, maLoi)),
      });
      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent(DETAIL_TEXT.notFound);
      expect(
        within(notice).getByRole('link', { name: DETAIL_TEXT.back }),
      ).toHaveAttribute('href', RECEPTION_APPOINTMENTS_PATH);
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
      noLeak(container);
    },
  );

  it('WDO-02 404 NGOÀI chi nhánh và 404 không có CÙNG một thẻ (cùng DOM, không lộ lịch có tồn tại hay không)', async () => {
    const first = renderReceptionReschedule({
      before: (api) =>
        api.failNext('preview', () =>
          apiError(404, 'KHONG_TIM_THAY', { thongBao: 'NGOAI_CHI_NHANH' }),
        ),
    });
    const a = (await screen.findByRole('alert')).outerHTML;
    first.unmount();
    cleanUpReceptionPage();
    beforeEachDates();
    renderReceptionReschedule({
      before: (api) => {
        api.preview = null;
      },
    });
    const b = (await screen.findByRole('alert')).outerHTML;
    expect(a).toBe(b);
  });

  it('WDO-02 401 ⇒ câu phiên hết hạn, không "Thử lại"', async () => {
    renderReceptionReschedule({
      before: (api) =>
        api.failNext('preview', () => apiError(401, 'CHUA_DANG_NHAP')),
    });
    expect(
      await screen.findByText(/Phiên đăng nhập đã hết hạn/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it.each([
    [503, 'HE_THONG_DANG_BAN'],
    [409, 'HE_THONG_CHUA_CAU_HINH'],
  ])(
    'WDO-02 %i %s ⇒ câu theo mã kèm "Thử lại"; bấm "Thử lại" gọi lại preview và vẽ lưới',
    async (status, maLoi) => {
      const { api } = renderReceptionReschedule({
        before: (fake) =>
          fake.failNext('preview', () => apiError(status, maLoi)),
      });
      const retry = await screen.findByRole('button', { name: 'Thử lại' });
      fireEvent.click(retry);
      await freeCell('08:00, còn trống');
      expect(api.previewCalls).toHaveLength(2);
    },
  );

  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      '502 không phải JSON',
      () => new Response('<html>502</html>', { status: 502 }),
    ],
    ['thân sai hình dạng', () => Response.json({ choPhepDoi: true })],
  ])(
    'WDO-02 %s ⇒ câu chung kèm "Thử lại", không lộ gì của máy chủ; thử lại được',
    async (_name, override) => {
      const { container } = renderReceptionReschedule({
        before: (api) => api.failNext('preview', override),
      });
      const retry = await screen.findByRole('button', { name: 'Thử lại' });
      noLeak(container);
      fireEvent.click(retry);
      await freeCell('08:00, còn trống');
    },
  );
});

describe('thông báo một lần khi về từ màn xác nhận (WDO-02)', () => {
  it('WDO-02 về vì khung giờ vừa có người đặt ⇒ câu theo mã `KHUNG_GIO_DA_DAT`, MỘT lần; giá trị lạ trong `state` không bao giờ hiện', async () => {
    renderReceptionReschedule({ state: noticeState('KHUNG_GIO_DA_DAT') });
    await freeCell('08:00, còn trống');
    expect(
      screen.getByText(
        rescheduleMessageForCode('KHUNG_GIO_DA_DAT')?.message ?? '??',
      ),
    ).toBeInTheDocument();
  });

  it('WDO-02 `state` lạ hoặc không phải của đổi lịch ⇒ không có thông báo', async () => {
    renderReceptionReschedule({
      state: { rescheduleNotice: 'CHU_CUA_MAY_CHU', other: 'x' },
    });
    await freeCell('08:00, còn trống');
    expect(screen.queryByText(/CHU_CUA_MAY_CHU/)).toBeNull();
    expect(screen.queryByText(LIST_MARK)).toBeNull();
  });
});

// Đặt lại đồng hồ giả sau `cleanUpReceptionPage` (hàm đó trả đồng hồ thật) khi một ca dựng trang hai lần
function beforeEachDates() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
}
