import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import { apiError, createFakeAuthApi } from '../../../test/fake-auth-api';
import {
  BOOKING_BLOCKED_MESSAGE,
  FORBIDDEN_MESSAGE,
  NOT_CONFIGURED_MESSAGE,
  NO_SHOW_LOCK_MESSAGE,
} from '../api/booking-errors';
import {
  ELIGIBLE,
  LOCKED,
  createFakeBookingApi,
} from '../testing/fake-booking-api';
import { EligibilityGate } from './eligibility-gate';

// booking F3. WZ-01 (PLAN booking 7.15); BWZ-04, BWZ-05 là [đề xuất] (mục 7.27). Câu 403, 409, lỗi lạ là [đề xuất] (PLAN 5.14 không có).
const BODY = 'Thân Bước 4';
const ELIGIBILITY = '/booking/eligibility';

let auth: ReturnType<typeof createFakeAuthApi>;
let booking: ReturnType<typeof createFakeBookingApi>;

function renderGate() {
  render(
    <EligibilityGate>
      <p>{BODY}</p>
    </EligibilityGate>,
  );
}
const retryButton = () => screen.getByRole('button', { name: 'Thử lại' });
const fail = (status: number, maLoi: string) =>
  booking.failNext(() => apiError(status, maLoi));

beforeEach(() => {
  auth = createFakeAuthApi();
  booking = createFakeBookingApi(auth.fetch);
  vi.stubGlobal('fetch', vi.fn(booking.fetch));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('booking F3 — cổng A4 (GET /booking/eligibility)', () => {
  it('WZ-01 bị khoá no-show ⇒ thông báo A4, KHÔNG có thân Bước 4, không gọi API nào khác', async () => {
    booking.eligibility = LOCKED;
    renderGate();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(NO_SHOW_LOCK_MESSAGE);
    expect(screen.queryByText(BODY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    // Chỉ một lời gọi, và là GET tới cổng
    expect(booking.requests).toEqual([{ method: 'GET', path: ELIGIBILITY }]);
  });

  it('BWZ-04 được phép (choPhepDatLich = true) ⇒ hiện thân Bước 4, không thông báo', async () => {
    booking.eligibility = ELIGIBLE;
    renderGate();
    expect(await screen.findByText(BODY)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('BWZ-04 mất mạng ⇒ câu mất mạng + "Thử lại"; bấm thử lại gọi lại và vào được', async () => {
    booking.failNext(() => Promise.reject(new TypeError('Failed to fetch')));
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      NETWORK_ERROR_MESSAGE,
    );
    expect(screen.queryByText(BODY)).toBeNull();

    fireEvent.click(retryButton());
    // Trong lúc chờ lần hai: quay lại "Đang tải", câu lỗi biến mất
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await screen.findByText(BODY)).toBeInTheDocument();
    expect(booking.count('GET', ELIGIBILITY)).toBe(2);
  });

  it('BWZ-04 quá giờ (15 giây) ⇒ câu quá giờ + "Thử lại", không vào Bước 4', async () => {
    vi.useFakeTimers();
    booking.failNext((init) => auth.hang(init));
    renderGate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(TIMEOUT_ERROR_MESSAGE);
    expect(retryButton()).toBeVisible();
    expect(screen.queryByText(BODY)).toBeNull();
  });

  it('BWZ-04 403 KHONG_DU_QUYEN ⇒ câu quyền, KHÔNG có "Thử lại"', async () => {
    fail(403, 'KHONG_DU_QUYEN');
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      FORBIDDEN_MESSAGE,
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.queryByText(BODY)).toBeNull();
  });

  it('BWZ-04 409 HE_THONG_CHUA_CAU_HINH ⇒ câu chưa sẵn sàng + "Thử lại" (thử lại được vào)', async () => {
    fail(409, 'HE_THONG_CHUA_CAU_HINH');
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      NOT_CONFIGURED_MESSAGE,
    );
    fireEvent.click(retryButton());
    expect(await screen.findByText(BODY)).toBeInTheDocument();
  });

  it('BWZ-04 5xx, 401 còn sót, thân không phải JSON ⇒ câu chung + "Thử lại"; không bao giờ vào Bước 4', async () => {
    const cases: (() => Response)[] = [
      () => apiError(500, 'LOI_HE_THONG'),
      () => apiError(503, 'HE_THONG_DANG_BAN'),
      () => apiError(401, 'PHIEN_HET_HIEU_LUC'),
      () => new Response('<html>502</html>', { status: 502 }),
    ];
    for (const makeResponse of cases) {
      booking.failNext(() => makeResponse());
      renderGate();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(retryButton()).toBeVisible();
      expect(screen.queryByText(BODY)).toBeNull();
      cleanup();
    }
  });

  it('BWZ-04 choPhepDatLich không phải đúng `true` (thiếu, chuỗi, null, thân null) ⇒ CHẶN, đóng khi lỗi', async () => {
    const bodies: unknown[] = [
      { soLichHenToiDaMoiHoSo: 3 },
      { choPhepDatLich: 'true', soLichHenToiDaMoiHoSo: 3 },
      { choPhepDatLich: 1, soLichHenToiDaMoiHoSo: 3 },
      { choPhepDatLich: null },
      null,
      [],
    ];
    for (const body of bodies) {
      booking.eligibility = body;
      renderGate();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        BOOKING_BLOCKED_MESSAGE,
      );
      expect(screen.queryByText(BODY)).toBeNull();
      cleanup();
    }
  });

  it('BWZ-04 choPhepDatLich = false với lyDo lạ hay vắng ⇒ chặn bằng câu chung, không nói là bị khoá no-show', async () => {
    for (const lyDo of ['LY_DO_LA', undefined]) {
      booking.eligibility = { ...LOCKED, lyDo };
      renderGate();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(BOOKING_BLOCKED_MESSAGE);
      expect(alert).not.toHaveTextContent(NO_SHOW_LOCK_MESSAGE);
      cleanup();
    }
  });

  // Hở ở phiên kiểm độc lập cuối: không test nào giữ lời "huỷ request khi gỡ" (đột biến `return () => undefined` sống sót)
  it('BWZ-04 gỡ cổng (unmount) khi request còn đang chờ ⇒ request bị huỷ (AbortSignal đã aborted), không cập nhật state sau khi gỡ', async () => {
    let seen: AbortSignal | null | undefined;
    // Treo request tới khi bị huỷ và ghi lại tín hiệu mà lớp API client đưa xuống `fetch`
    booking.failNext((init) => {
      seen = init?.signal;
      return auth.hang(init);
    });
    const { unmount } = render(
      <EligibilityGate>
        <p>{BODY}</p>
      </EligibilityGate>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    // Request đã đi và chưa bị huỷ khi cổng còn gắn
    expect(booking.count('GET', ELIGIBILITY)).toBe(1);
    expect(seen).toBeDefined();
    expect(seen?.aborted).toBe(false);

    unmount();
    // `request()` nối tín hiệu của nơi gọi vào tín hiệu của `fetch`: gỡ cổng phải huỷ request đang bay
    expect(seen?.aborted).toBe(true);
    // Lỗi huỷ sau khi gỡ không được biến thành thông báo hay lần thử lại nào
    await act(async () => {});
    expect(booking.count('GET', ELIGIBILITY)).toBe(1);
  });

  // BWZ-05: câu chọn theo `maLoi`, không theo mã HTTP (CODING_CONVENTION)
  it('BWZ-05 cùng mã HTTP, khác maLoi ⇒ khác câu; maLoi đã biết ở mã HTTP khác vẫn ra câu của nó', async () => {
    // 403 nhưng maLoi lạ: KHÔNG ra câu quyền
    fail(403, 'MA_LA_KHAC');
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    cleanup();

    // 409 nhưng maLoi là KHONG_DU_QUYEN: ra câu quyền, không ra câu "chưa cấu hình"
    fail(409, 'KHONG_DU_QUYEN');
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      FORBIDDEN_MESSAGE,
    );
    cleanup();

    // Mã lỗi của A4 ở lỗi HTTP (mã khác 200): vẫn ra câu A4
    fail(403, 'DAT_LICH_BI_KHOA_NO_SHOW');
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      NO_SHOW_LOCK_MESSAGE,
    );
    cleanup();

    // `maLoi` trùng tên khoá của nguyên mẫu đối tượng không được trúng
    fail(409, 'constructor');
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
  });
});
