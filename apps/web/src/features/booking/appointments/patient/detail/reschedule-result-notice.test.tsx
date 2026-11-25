import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanUpDetailPage } from '../../../testing/appointment-detail-harness';
import { makeDetail } from '../../../testing/fake-appointment-detail-api';
import { NEW_APPOINTMENT_CODE } from '../../../testing/fake-reschedule-api';
import {
  GRID_PATH,
  NEW_DETAIL_PATH,
  OLD_DETAIL_PATH,
  renderConfirm,
  TEXT,
} from '../../../testing/reschedule-confirm-helpers';
import { renderReschedule } from '../../../testing/reschedule-harness';
import {
  noticeState,
  readNotice,
  slotNoticeFor,
  useOneShotNotice,
  type RescheduleNotice,
} from '../../common/reschedule-notice-state';
import { DETAIL_TEXT } from './detail-messages';

// reschedule F2: thông báo MỘT LẦN giữa các trang đổi lịch. Mã WDH-41 (`location.state` đọc nghiêm, đọc một lần, tải lại không hiện lại), WDH-42 (404 của chi tiết: lịch cũ sau khi đổi), WDH-43 (thông báo
// "khung giờ không còn" ở trang chọn) [đề xuất]. Dữ liệu giả.
afterEach(() => {
  cleanup();
  cleanUpDetailPage();
});

const SLOT_TAKEN = 'KHUNG_GIO_DA_DAT';

describe('readNotice, noticeState, slotNoticeFor (WDH-41)', () => {
  it('WDH-41 vòng đi về: `noticeState(x)` đọc lại đúng `x` cho mọi giá trị được phép', () => {
    for (const notice of [
      'DaDoi',
      'DaGuiYeuCau',
      'KHUNG_GIO_DA_DAT',
      'KHUNG_GIO_DANG_GIU',
      'KHUNG_GIO_DA_QUA',
      'KHUNG_GIO_KHONG_TON_TAI',
    ] as const) {
      expect(readNotice(noticeState(notice))).toBe(notice);
    }
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['chuỗi', 'DaDoi'],
    ['số', 1],
    ['mảng', ['DaDoi']],
    ['đối tượng rỗng', {}],
    ['khoá sai tên', { notice: 'DaDoi' }],
    ['giá trị lạ', { rescheduleNotice: 'DaHuy' }],
    ['giá trị là số', { rescheduleNotice: 1 }],
    ['giá trị là đối tượng', { rescheduleNotice: { x: 1 } }],
    ['giá trị trùng khoá nguyên mẫu', { rescheduleNotice: 'constructor' }],
    ['sai chữ hoa', { rescheduleNotice: 'dadoi' }],
  ])(
    'WDH-41 state %s ⇒ bỏ qua (không bao giờ in ra màn hình)',
    (_name, state) => {
      expect(readNotice(state)).toBeNull();
    },
  );

  it('WDH-41 `slotNoticeFor` chỉ nhận đúng bốn mã khung giờ', () => {
    for (const code of [
      'KHUNG_GIO_DA_DAT',
      'KHUNG_GIO_DANG_GIU',
      'KHUNG_GIO_DA_QUA',
      'KHUNG_GIO_KHONG_TON_TAI',
    ]) {
      expect(slotNoticeFor(code)).toBe(code);
    }
    for (const code of ['CHI_NHANH_NGHI', 'DaDoi', 'constructor', '']) {
      expect(slotNoticeFor(code)).toBeNull();
    }
  });
});

describe('useOneShotNotice (WDH-41)', () => {
  function Probe({ accept }: { accept: readonly RescheduleNotice[] }) {
    const notice = useOneShotNotice(accept);
    const location = useLocation();
    return (
      <>
        <output data-testid="notice">{notice ?? 'không'}</output>
        <output data-testid="state">{JSON.stringify(location.state)}</output>
        <output data-testid="url">{`${location.pathname}${location.search}`}</output>
      </>
    );
  }
  function mount(
    state: unknown,
    accept: readonly RescheduleNotice[],
    search = '',
  ) {
    return render(
      <MemoryRouter initialEntries={[{ pathname: '/x', search, state }]}>
        <Routes>
          <Route path="/x" element={<Probe accept={accept} />} />
        </Routes>
      </MemoryRouter>,
    );
  }
  const notice = () => screen.getByTestId('notice').textContent;
  const state = () => screen.getByTestId('state').textContent;

  it('WDH-41 có thông báo: trang nhận nó, giữ nó khi vẽ lại, và `location.state` bị XOÁ (replace) nên tải lại không hiện lại', () => {
    const view = mount(noticeState('DaDoi'), ['DaDoi', 'DaGuiYeuCau']);
    expect(notice()).toBe('DaDoi');
    expect(state()).toBe('null');
    view.rerender(
      <MemoryRouter initialEntries={[{ pathname: '/x', state: null }]}>
        <Routes>
          <Route path="/x" element={<Probe accept={['DaDoi']} />} />
        </Routes>
      </MemoryRouter>,
    );
    // dựng lại với state đã xoá (tải lại) ⇒ không có thông báo
    cleanup();
    mount(null, ['DaDoi', 'DaGuiYeuCau']);
    expect(notice()).toBe('không');
  });

  it('WDH-41 xoá `state` mà GIỮ nguyên đường dẫn và query', () => {
    mount(noticeState('DaGuiYeuCau'), ['DaGuiYeuCau'], '?a=1&b=2');
    expect(screen.getByTestId('url')).toHaveTextContent('/x?a=1&b=2');
    expect(state()).toBe('null');
  });

  it('WDH-41 loại thông báo trang này không nhận ⇒ không hiện, nhưng vẫn bị xoá khỏi lịch sử', () => {
    mount(noticeState('DaDoi'), ['KHUNG_GIO_DA_DAT']);
    expect(notice()).toBe('không');
    expect(state()).toBe('null');
  });

  it('WDH-41 `state` KHÔNG phải của đổi lịch (khoá khác) thì để nguyên, không xoá và không hiện', () => {
    mount({ nguoiKhac: 1 }, ['DaDoi']);
    expect(notice()).toBe('không');
    expect(state()).toBe('{"nguoiKhac":1}');
  });

  it('WDH-41 giá trị lạ trong khoá của mình ⇒ không hiện, không xoá (không đụng thứ không hiểu)', () => {
    mount({ rescheduleNotice: 'DaHuy' }, ['DaDoi']);
    expect(notice()).toBe('không');
    expect(state()).toBe('{"rescheduleNotice":"DaHuy"}');
  });
});

describe('thông báo ở chi tiết lịch (WDH-41, WDH-05)', () => {
  it('WDH-41 vào chi tiết với `DaDoi` ⇒ "Đã đổi lịch hẹn thành công…", không banner; vào lại cùng URL (tải lại) ⇒ không còn thông báo', async () => {
    const first = renderReschedule({
      path: NEW_DETAIL_PATH,
      state: noticeState('DaDoi'),
      before: (api) => {
        api.detail.detail = makeDetail({ maLichHen: NEW_APPOINTMENT_CODE });
      },
    });
    expect(await screen.findByText(NEW_APPOINTMENT_CODE)).toBeInTheDocument();
    expect(screen.getByText(TEXT.doneNotice)).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('region', { name: TEXT.bannerTitle })).toBeNull();
    first.unmount();
    cleanUpDetailPage();
    renderReschedule({
      path: NEW_DETAIL_PATH,
      before: (api) => {
        api.detail.detail = makeDetail({ maLichHen: NEW_APPOINTMENT_CODE });
      },
    });
    expect(await screen.findByText(NEW_APPOINTMENT_CODE)).toBeInTheDocument();
    expect(screen.queryByText(TEXT.doneNotice)).toBeNull();
  });

  it('WDH-41 `DaGuiYeuCau` ⇒ thông báo MỘT lần và banner "Đang chờ duyệt" THƯỜNG TRỰC (còn sau khi thông báo đã xoá)', async () => {
    renderReschedule({
      path: OLD_DETAIL_PATH,
      state: noticeState('DaGuiYeuCau'),
      before: (api) => {
        api.detail.detail = makeDetail({
          choPhepDoiLich: false,
          yeuCauDoiLich: {
            trangThai: 'ChoDuyet',
            thoiGianMongMuon: '2026-12-02T03:00:00.000Z',
            ghiChuXuLy: null,
            thoiDiemTao: '2026-11-25T03:05:00.000Z',
          },
        });
      },
    });
    expect(
      await screen.findByRole('region', { name: TEXT.bannerTitle }),
    ).toHaveTextContent(TEXT.bannerPending);
    expect(screen.getByText(TEXT.requestSentNotice)).toBeInTheDocument();
  });

  it('WDH-41 state lạ ở chi tiết ⇒ không thông báo nào, không in giá trị lạ', async () => {
    renderReschedule({
      path: OLD_DETAIL_PATH,
      state: { rescheduleNotice: 'KẾT QUẢ LẠ' },
    });
    expect(await screen.findByText('CP20261020001')).toBeInTheDocument();
    expect(screen.queryByText(/KẾT QUẢ LẠ/)).toBeNull();
    expect(screen.queryByText(TEXT.doneNotice)).toBeNull();
    expect(screen.queryByText(TEXT.requestSentNotice)).toBeNull();
  });
});

describe('chi tiết của lịch đã đổi: 404 thân thiện (WDH-42, WDH-09)', () => {
  it('WDH-42 mở mã lịch cũ (404 `KHONG_TIM_THAY`) ⇒ dòng "Không tìm thấy lịch hẹn này." GIỮ NGUYÊN cộng dòng "không còn hoặc đã được đổi sang lịch mới" và liên kết "Lịch hẹn của tôi"', async () => {
    renderReschedule({
      path: OLD_DETAIL_PATH,
      before: (api) => {
        api.detail.detail = null;
      },
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(DETAIL_TEXT.notFound);
    expect(alert).toHaveTextContent(TEXT.replacedHint);
    expect(
      within(alert).getByRole('link', { name: DETAIL_TEXT.backToList }),
    ).toHaveAttribute('href', '/benh-nhan/lich-hen-cua-toi');
    expect(screen.queryByRole('button', { name: TEXT.retry })).toBeNull();
  });

  it('WDH-42 CÙNG DOM cho mọi lý do 404 (không lộ lịch có tồn tại hay không): thân 404 khác nhau ⇒ cùng HTML', async () => {
    const html: string[] = [];
    for (const extra of [
      {},
      { chiTiet: { daDoi: true } },
      { thongBao: 'Đã đổi lịch' },
    ]) {
      const view = renderReschedule({
        path: OLD_DETAIL_PATH,
        before: (api) =>
          api.detail.failNext('detail', () =>
            Response.json(
              {
                maLoi: 'KHONG_TIM_THAY',
                thongBao: 'Không tìm thấy.',
                ...extra,
              },
              { status: 404 },
            ),
          ),
      });
      html.push((await screen.findByRole('alert')).innerHTML);
      view.unmount();
      cleanUpDetailPage();
    }
    expect(html[1]).toBe(html[0]);
    expect(html[2]).toBe(html[0]);
  });

  it('WDH-42 dòng gợi ý chỉ ở 404 của trang chi tiết: lỗi khác (500) vẫn là câu chung kèm "Thử lại", không nói "đã được đổi"', async () => {
    renderReschedule({
      path: OLD_DETAIL_PATH,
      before: (api) =>
        api.detail.failNext('detail', () =>
          Response.json(
            { maLoi: 'LOI_HE_THONG', thongBao: 'x' },
            { status: 500 },
          ),
        ),
    });
    await screen.findByRole('button', { name: TEXT.retry });
    expect(screen.queryByText(TEXT.replacedHint)).toBeNull();
  });
});

describe('thông báo "khung giờ không còn" ở trang chọn (WDH-43)', () => {
  it.each([
    [
      SLOT_TAKEN,
      'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
    ],
    ['KHUNG_GIO_DANG_GIU', 'Khung giờ này đang được người khác giữ chỗ.'],
    ['KHUNG_GIO_DA_QUA', 'Khung giờ này đã qua. Vui lòng chọn khung giờ khác.'],
    ['KHUNG_GIO_KHONG_TON_TAI', 'Không tìm thấy khung giờ này.'],
  ] as const)(
    'WDH-43 vào trang chọn kèm %s ⇒ câu của mã đó, lưới vẫn vẽ; vào lại (tải lại) ⇒ không còn',
    async (code, sentence) => {
      const first = renderReschedule({
        path: GRID_PATH,
        state: noticeState(code),
      });
      expect(
        await screen.findByRole('button', { name: '08:00, còn trống' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(sentence);
      expect(first.api.slotCalls.length).toBeGreaterThan(0);
      first.unmount();
      cleanUpDetailPage();
      renderReschedule({ path: GRID_PATH });
      expect(
        await screen.findByRole('button', { name: '08:00, còn trống' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('WDH-43 `DaDoi` hay `DaGuiYeuCau` không hiện ở trang chọn (trang này chỉ nhận mã khung giờ)', async () => {
    renderReschedule({ path: GRID_PATH, state: noticeState('DaDoi') });
    await screen.findByRole('button', { name: '08:00, còn trống' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(TEXT.doneNotice)).toBeNull();
  });
});

// Đối chứng hạ tầng: màn xác nhận dùng cùng harness nên dùng được `state`
describe('harness (WDH-41)', () => {
  it('WDH-41 `renderConfirm` vẫn dựng được màn xác nhận khi không có `state`', async () => {
    renderConfirm();
    expect(
      await screen.findByRole('heading', { level: 2, name: TEXT.newTitle }),
    ).toBeInTheDocument();
  });
});
