import { fireEvent, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpDetailPage,
  currentUrl,
  flush,
} from '../../../testing/appointment-detail-harness';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import {
  makeRequestResult,
  NEW_APPOINTMENT_CODE,
} from '../../../testing/fake-reschedule-api';
import {
  apiError,
  becomeNewAppointment,
  becomePendingRequest,
  CONFIRM_PATH,
  confirmButton,
  formLoaded,
  GRID_PATH,
  noLeak,
  NEW_DETAIL_PATH,
  OLD_DETAIL_PATH,
  reasonField,
  renderConfirm,
  requestButton,
  SLOT_ID,
  TEXT,
  typeReason,
} from '../../../testing/reschedule-confirm-helpers';
import { GENERIC_ERROR_MESSAGE } from '../../../../../shared/api/error-message';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { LIST_TEXT } from '../list-messages';
import {
  RESCHEDULE_ERROR_CODES as OWN,
  rescheduleMessageForCode,
} from '../../common/reschedule-errors';

// reschedule F2: lỗi khi GỬI đổi lịch. Mã WDH-38 [đề xuất] (từng mã 409, 404, 400, 503 ⇒ câu và hành động), WDH-06 (`KHUNG_GIO_DA_DAT` về lưới và tải lại; câu tiếng Việt theo `maLoi`), WDH-39 [đề xuất] (mất mạng,
// hết 15 giây, phản hồi lạ ⇒ "chưa rõ"; "Thử lại" gửi lại đúng một lần), WDH-46 và WDH-47 [đề xuất] (sau "chưa rõ", lần gửi lại ra 404 hay 409 yêu cầu đang chờ ⇒ thêm gợi ý). Chọn câu theo `maLoi`, KHÔNG theo
// `thongBao` hay mã HTTP. Dữ liệu giả; hôm nay giả là 25/11/2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
});
afterEach(cleanUpDetailPage);

const REQUEST = { loai: 'GuiYeuCau', soLanDaDoi: 2, soLanToiDa: 2 } as const;
const alertOf = async () => screen.findByRole('alert');
const expectNoSubmitButton = () => {
  expect(screen.queryByRole('button', { name: TEXT.confirmButton })).toBeNull();
  expect(screen.queryByRole('button', { name: TEXT.requestButton })).toBeNull();
};

// Dựng nhánh tự đổi, bấm xác nhận khi máy chủ trả `response`, và chờ biểu mẫu (hoặc thẻ) phản ứng
async function submitWith(response: () => Response | Promise<Response>) {
  const view = renderConfirm({
    before: (api) => api.failNext('submit', response),
  });
  await formLoaded();
  fireEvent.click(confirmButton());
  return view;
}

describe('lỗi mà làm lại cũng không hết: thẻ kèm đường đi, không còn nút gửi (WDH-38)', () => {
  it.each([
    [OWN.SAME_AS_CURRENT_SLOT, 409],
    [OWN.OTHER_DOCTOR, 409],
    ['BAC_SI_NGHI_PHEP', 409],
    ['NGOAI_GIO_HOAT_DONG', 409],
    ['LICH_HEN_TRUNG_THOI_GIAN', 409],
    ['KHUNG_GIO_KHONG_HOP_LE', 409],
  ])(
    'WDH-38 %s (HTTP %i) ⇒ câu theo mã kèm liên kết "Chọn khung giờ khác"; ở lại trang; không nút gửi',
    async (code, status) => {
      const { container, api } = await submitWith(() => apiError(status, code));
      const alert = await alertOf();
      expect(alert).toHaveTextContent(
        rescheduleMessageForCode(code)?.message as string,
      );
      expect(
        within(alert).getByRole('link', { name: TEXT.pickAnother }),
      ).toHaveAttribute('href', GRID_PATH);
      expectNoSubmitButton();
      expect(currentUrl()).toBe(CONFIRM_PATH);
      expect(api.submitCalls).toHaveLength(1);
      noLeak(container);
    },
  );

  it.each([
    [OWN.NOT_RESCHEDULABLE],
    [OWN.TOO_LATE],
    [OWN.CHAIN_TOO_LONG],
    [OWN.SERVICE_CHANGED],
    [OWN.BRANCH_CHANGED],
    [OWN.REQUEST_PENDING],
    ['VUOT_SO_LICH_HEN_TOI_DA'],
    ['HO_SO_NGUOI_THAN_DA_NGUNG'],
  ])(
    'WDH-38 %s ⇒ câu 5.13 hay booking kèm liên kết "Quay lại chi tiết lịch hẹn"; không "Thử lại", không nút gửi',
    async (code) => {
      const { container } = await submitWith(() => apiError(409, code));
      const alert = await alertOf();
      expect(alert).toHaveTextContent(
        rescheduleMessageForCode(code)?.message as string,
      );
      expect(
        within(alert).getByRole('link', { name: TEXT.backToDetailLink }),
      ).toHaveAttribute('href', OLD_DETAIL_PATH);
      expect(screen.queryByRole('button', { name: TEXT.retry })).toBeNull();
      expectNoSubmitButton();
      noLeak(container);
    },
  );

  it('WDH-38 404 `KHONG_TIM_THAY` và 403 `KHONG_DU_QUYEN` là MỘT thẻ chung (cùng DOM) kèm liên kết "Lịch hẹn của tôi"', async () => {
    const html: string[] = [];
    for (const [status, code] of [
      [404, 'KHONG_TIM_THAY'],
      [403, 'KHONG_DU_QUYEN'],
    ] as const) {
      const view = await submitWith(() => apiError(status, code));
      const alert = await alertOf();
      expect(alert).toHaveTextContent(DETAIL_TEXT.notFound);
      expect(alert).not.toHaveTextContent(TEXT.afterUncertainHint);
      expect(
        within(alert).getByRole('link', { name: DETAIL_TEXT.backToList }),
      ).toBeInTheDocument();
      expectNoSubmitButton();
      noLeak(view.container);
      html.push(alert.innerHTML);
      view.unmount();
      cleanUpDetailPage();
      vi.useFakeTimers({ toFake: ['Date'] });
    }
    expect(html[0]).toBe(html[1]);
  });

  it('WDH-38 401 ⇒ câu phiên hết hạn, không "Thử lại", không nút gửi', async () => {
    await submitWith(() => apiError(401, 'CHUA_DANG_NHAP'));
    expect(await alertOf()).toHaveTextContent(LIST_TEXT.sessionExpired);
    expect(screen.queryByRole('button', { name: TEXT.retry })).toBeNull();
    expectNoSubmitButton();
  });

  it('WDH-38 `thongBao` lừa và mã HTTP khác không đổi kết quả: `maLoi` quyết định', async () => {
    await submitWith(() =>
      apiError(404, OWN.TOO_LATE, { thongBao: 'Không tìm thấy lịch hẹn này.' }),
    );
    expect(await alertOf()).toHaveTextContent(
      rescheduleMessageForCode(OWN.TOO_LATE)?.message as string,
    );
  });
});

describe('khung giờ vừa không còn chọn được ⇒ về lưới và tải lại (WDH-06)', () => {
  it.each([
    [
      'KHUNG_GIO_DA_DAT',
      'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
    ],
    ['KHUNG_GIO_DANG_GIU', 'Khung giờ này đang được người khác giữ chỗ.'],
    ['KHUNG_GIO_DA_QUA', 'Khung giờ này đã qua. Vui lòng chọn khung giờ khác.'],
    ['KHUNG_GIO_KHONG_TON_TAI', 'Không tìm thấy khung giờ này.'],
  ])(
    'WDH-06 %s ⇒ về trang chọn khung giờ (đổi URL), preview và lưới được GET LẠI, thông báo câu của mã đó',
    async (code, sentence) => {
      const { api } = await submitWith(() => apiError(409, code));
      expect(
        await screen.findByRole('button', { name: '08:00, còn trống' }),
      ).toBeInTheDocument();
      expect(currentUrl()).toBe(GRID_PATH);
      expect(screen.getByRole('alert')).toHaveTextContent(sentence);
      expect(api.submitCalls).toHaveLength(1);
      // preview của màn xác nhận (có khungGioId) rồi preview của trang chọn (không khungGioId); lưới được tải
      expect(api.previewCalls.map((call) => call.khungGioId)).toEqual([
        SLOT_ID,
        null,
      ]);
      expect(api.slotCalls.length).toBeGreaterThanOrEqual(1);
    },
  );

  it('WDH-06 từ lưới chọn khung giờ KHÁC rồi gửi lại được (luồng A1: quay lại bước 4); thông báo mất khi tải lại', async () => {
    const { api } = await submitWith(() => apiError(409, 'KHUNG_GIO_DA_DAT'));
    fireEvent.click(
      await screen.findByRole('button', { name: '09:00, còn trống' }),
    );
    await formLoaded();
    expect(currentUrl()).toContain('khungGioId=1253');
    becomeNewAppointment(api);
    fireEvent.click(confirmButton());
    expect(await screen.findByText(NEW_APPOINTMENT_CODE)).toBeInTheDocument();
    expect(currentUrl()).toBe(NEW_DETAIL_PATH);
    expect(api.submitCalls.map((call) => call.body)).toStrictEqual([
      { khungGioId: SLOT_ID },
      { khungGioId: '1253' },
    ]);
  });

  it('WDH-06 cùng bốn mã khi TẢI màn xác nhận (URL cũ mở lại) ⇒ chỉ hiện câu kèm liên kết, KHÔNG tự chuyển trang', async () => {
    renderConfirm({
      before: (api) =>
        api.failNext('preview', () => apiError(409, 'KHUNG_GIO_DA_DAT')),
    });
    const alert = await alertOf();
    expect(alert).toHaveTextContent('Khung giờ này vừa có người đặt.');
    expect(currentUrl()).toBe(CONFIRM_PATH);
    expect(
      within(alert).getByRole('link', { name: TEXT.pickAnother }),
    ).toHaveAttribute('href', GRID_PATH);
  });
});

describe('hết lần tự đổi giữa lúc xem trước và lúc gửi (WDH-38)', () => {
  it('WDH-38 `VUOT_SO_LAN_TU_DOI` ⇒ KHÔNG điều hướng: hiện ô lý do tại chỗ với câu 5.13 nguyên văn (không số), tiêu điểm vào ô, nút đổi thành "Gửi yêu cầu đổi lịch", không GET lại preview', async () => {
    const { api, container } = await submitWith(() =>
      apiError(409, OWN.OVER_SELF_LIMIT, {
        chiTiet: { soLanDaDoi: 2, toiDa: 2 },
      }),
    );
    expect(await screen.findByRole('textbox', { name: TEXT.reasonLabel })).toBe(
      document.activeElement,
    );
    expect(currentUrl()).toBe(CONFIRM_PATH);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Bạn đã dùng hết số lần tự đổi. Hãy nhập lý do để gửi yêu cầu cho lễ tân.',
    );
    expect(alert.textContent).not.toMatch(/\d/);
    expect(screen.getByText(TEXT.requestConfirmNotice)).toBeInTheDocument();
    expect(requestButton()).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: TEXT.confirmButton }),
    ).toBeNull();
    expect(api.previewCalls).toHaveLength(1);
    noLeak(container);
  });

  it('WDH-38 nhập lý do rồi gửi lại ⇒ POST thứ hai CÓ `lyDoYeuCau` (thân thứ nhất không có); xong về chi tiết lịch cũ kèm banner', async () => {
    const { api } = renderConfirm({
      before: (fake) => {
        fake.failNext('submit', () => apiError(409, OWN.OVER_SELF_LIMIT));
        fake.submitResult = makeRequestResult();
        fake.onSubmit = () => becomePendingRequest(fake);
      },
    });
    await formLoaded();
    fireEvent.click(confirmButton());
    await screen.findByRole('textbox', { name: TEXT.reasonLabel });
    // chưa nhập lý do mà bấm ⇒ chặn tại chỗ, không POST thứ hai
    fireEvent.click(requestButton());
    expect(api.submitCalls).toHaveLength(1);
    typeReason('  Có việc đột xuất  ');
    fireEvent.click(requestButton());

    expect(
      await screen.findByRole('region', { name: TEXT.bannerTitle }),
    ).toHaveTextContent(TEXT.bannerPending);
    expect(currentUrl()).toBe(OLD_DETAIL_PATH);
    expect(api.submitCalls.map((call) => call.body)).toStrictEqual([
      { khungGioId: SLOT_ID },
      { khungGioId: SLOT_ID, lyDoYeuCau: 'Có việc đột xuất' },
    ]);
  });
});

describe('400 ở trường lý do và 400 khác (WDH-38)', () => {
  it('WDH-38 400 `lyDoYeuCau` ⇒ lỗi CẠNH Ô, chữ đã gõ GIỮ NGUYÊN, tiêu điểm vào ô, ở lại trang; sửa rồi gửi lại được', async () => {
    const { api } = renderConfirm({
      preview: REQUEST,
      before: (fake) => {
        fake.failNext('submit', () =>
          apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
            loi: [{ truong: 'lyDoYeuCau', ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE' }],
          }),
        );
        fake.submitResult = makeRequestResult();
        fake.onSubmit = () => becomePendingRequest(fake);
      },
    });
    await formLoaded();
    typeReason('Lý do hợp lệ ở web');
    fireEvent.click(requestButton());

    const alert = await alertOf();
    expect(alert).toHaveTextContent(TEXT.reasonRange(5, 500));
    expect(reasonField()).toHaveValue('Lý do hợp lệ ở web');
    expect(reasonField()).toHaveAttribute('aria-invalid', 'true');
    expect(reasonField()).toBe(document.activeElement);
    expect(currentUrl()).toBe(CONFIRM_PATH);

    fireEvent.click(requestButton());
    await screen.findByRole('region', { name: TEXT.bannerTitle });
    expect(api.submitCalls).toHaveLength(2);
  });

  it.each([
    ['khungGioId', 'IS_BIGINT_ID'],
    ['benhNhanId', 'TRUONG_KHONG_DUOC_PHEP'],
  ])(
    'WDH-38 400 ở trường %s ⇒ câu chung kèm "Thử lại" (không phải lỗi của ô lý do); "Thử lại" gửi lại đúng một lần',
    async (truong, ma) => {
      const { api, container } = await submitWith(() =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', { loi: [{ truong, ma }] }),
      );
      const alert = await alertOf();
      expect(alert).toHaveTextContent(GENERIC_ERROR_MESSAGE);
      noLeak(container);
      expect(api.submitCalls).toHaveLength(1);
      fireEvent.click(within(alert).getByRole('button', { name: TEXT.retry }));
      await flush();
      expect(api.submitCalls).toHaveLength(2);
    },
  );
});

describe('hệ thống bận hay chưa cấu hình: "Thử lại" (WDH-38, WDH-39)', () => {
  it.each([
    ['409 HE_THONG_CHUA_CAU_HINH', 409, 'HE_THONG_CHUA_CAU_HINH'],
    ['503 HE_THONG_DANG_BAN', 503, 'HE_THONG_DANG_BAN'],
  ])(
    'WDH-39 %s ⇒ câu theo mã kèm "Thử lại" nhận tiêu điểm; bấm gửi lại ĐÚNG một lần cùng thân; xong sang chi tiết',
    async (_name, status, code) => {
      const { api, container } = renderConfirm({
        before: (fake) => {
          fake.failNext('submit', () => apiError(status, code));
          fake.onSubmit = () => becomeNewAppointment(fake);
        },
      });
      await formLoaded();
      fireEvent.click(confirmButton());
      const alert = await alertOf();
      expect(alert).toHaveTextContent(
        rescheduleMessageForCode(code)?.message as string,
      );
      expect(alert).toBe(document.activeElement);
      noLeak(container);
      expect(confirmButton()).toBeEnabled();

      fireEvent.click(within(alert).getByRole('button', { name: TEXT.retry }));
      expect(await screen.findByText(NEW_APPOINTMENT_CODE)).toBeInTheDocument();
      expect(api.submitCalls).toHaveLength(2);
      expect(api.submitCalls[1].body).toStrictEqual(api.submitCalls[0].body);
    },
  );

  it('WDH-39 "Thử lại" ở nhánh yêu cầu gửi lại CHÍNH lý do đã gõ (đã chuẩn hoá); lý do giữ nguyên trong lúc lỗi', async () => {
    const { api } = renderConfirm({
      preview: REQUEST,
      before: (fake) => {
        fake.failNext('submit', () => apiError(503, 'HE_THONG_DANG_BAN'));
        fake.submitResult = makeRequestResult();
        fake.onSubmit = () => becomePendingRequest(fake);
      },
    });
    await formLoaded();
    typeReason('  Cần đổi gấp  ');
    fireEvent.click(requestButton());
    const alert = await alertOf();
    expect(reasonField()).toHaveValue('  Cần đổi gấp  ');
    fireEvent.click(within(alert).getByRole('button', { name: TEXT.retry }));
    await screen.findByRole('region', { name: TEXT.bannerTitle });
    expect(api.submitCalls.map((call) => call.body)).toStrictEqual([
      { khungGioId: SLOT_ID, lyDoYeuCau: 'Cần đổi gấp' },
      { khungGioId: SLOT_ID, lyDoYeuCau: 'Cần đổi gấp' },
    ]);
  });

  it('WDH-39 `maLoi` lạ (kể cả HTTP 409 hay 404) ⇒ câu chung kèm "Thử lại", không in mã', async () => {
    for (const status of [409, 404, 500]) {
      const { container, unmount } = await submitWith(() =>
        apiError(status, 'MA_LA'),
      );
      const alert = await alertOf();
      expect(alert).toHaveTextContent(GENERIC_ERROR_MESSAGE);
      expect(
        within(alert).getByRole('button', { name: TEXT.retry }),
      ).toBeInTheDocument();
      expect(alert).not.toHaveTextContent(DETAIL_TEXT.notFound);
      noLeak(container);
      unmount();
      cleanUpDetailPage();
      vi.useFakeTimers({ toFake: ['Date'] });
    }
  });
});

describe('mất mạng, hết thời gian chờ, phản hồi lạ: "chưa rõ" (WDH-39, WDH-46, WDH-47)', () => {
  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      'HTML 502 (nginx)',
      () => new Response('<html>502</html>', { status: 502 }),
    ],
    [
      '201 sai hình dạng (thiếu `lichHenCu`)',
      () =>
        jsonResponse(
          {
            ketQua: 'DaDoi',
            lichHenMoi: {
              maLichHen: 'CP1',
              thoiGian: '2026-12-02T03:00:00.000Z',
              trangThai: 'DaXacNhan',
            },
            thoiGianMayChu: '2026-11-25T03:00:00.000Z',
          },
          201,
        ),
    ],
  ])(
    'WDH-39 %s ⇒ "chưa rõ lịch hẹn đã được đổi hay chưa" kèm liên kết "Lịch hẹn của tôi"; nút gửi VẪN bấm được; không điều hướng',
    async (_name, response) => {
      const { api, container } = await submitWith(response);
      const alert = await alertOf();
      expect(alert).toHaveTextContent(TEXT.uncertain);
      expect(alert).toBe(document.activeElement);
      expect(
        within(alert).getByRole('link', { name: TEXT.myAppointments }),
      ).toHaveAttribute('href', '/benh-nhan/lich-hen-cua-toi');
      expect(confirmButton()).toBeEnabled();
      expect(currentUrl()).toBe(CONFIRM_PATH);
      expect(api.submitCalls).toHaveLength(1);
      noLeak(container);
    },
  );

  it('WDH-39 hết 15 giây không phản hồi ⇒ cũng là "chưa rõ" (không phải lỗi chung)', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
    renderConfirm({
      before: (api) =>
        api.failNext(
          'submit',
          (init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              );
            }),
        ),
    });
    await formLoaded();
    fireEvent.click(confirmButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.uncertain);
    expect(confirmButton()).toBeEnabled();
  });

  it('WDH-39 nhánh yêu cầu: "chưa rõ" GIỮ lý do đã gõ; gửi lại thành công ⇒ sang chi tiết', async () => {
    const { api } = renderConfirm({
      preview: REQUEST,
      before: (fake) => {
        fake.failNext('submit', () => Promise.reject(new TypeError('x')));
        fake.submitResult = makeRequestResult();
        fake.onSubmit = () => becomePendingRequest(fake);
      },
    });
    await formLoaded();
    typeReason('Lý do cần giữ lại');
    fireEvent.click(requestButton());
    await alertOf();
    expect(reasonField()).toHaveValue('Lý do cần giữ lại');
    fireEvent.click(requestButton());
    await screen.findByRole('region', { name: TEXT.bannerTitle });
    expect(api.submitCalls).toHaveLength(2);
    expect(currentUrl()).toBe(OLD_DETAIL_PATH);
  });

  it('WDH-46 "chưa rõ" rồi gửi lại ra 404 (lần trước đã đổi được) ⇒ thẻ "Không tìm thấy lịch hẹn này." KÈM gợi ý "Có thể lịch hẹn đã được đổi… Hãy xem Lịch hẹn của tôi."', async () => {
    const { api } = renderConfirm({
      before: (fake) => {
        fake.failNext('submit', () => Promise.reject(new TypeError('x')));
        fake.failNext('submit', () => apiError(404, 'KHONG_TIM_THAY'));
      },
    });
    await formLoaded();
    fireEvent.click(confirmButton());
    await alertOf();
    fireEvent.click(confirmButton());
    await screen.findByText(
      `${DETAIL_TEXT.notFound} ${TEXT.afterUncertainHint}`,
    );
    expect(api.submitCalls).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: DETAIL_TEXT.backToList }),
    ).toBeInTheDocument();
    expectNoSubmitButton();
  });

  it('WDH-47 "chưa rõ" rồi gửi lại ra 409 `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET` (lần trước đã gửi được) ⇒ câu 5.13 KÈM gợi ý và liên kết về chi tiết (nơi có banner)', async () => {
    renderConfirm({
      preview: REQUEST,
      before: (fake) => {
        fake.failNext(
          'submit',
          () => new Response('<html>504</html>', { status: 504 }),
        );
        fake.failNext('submit', () => apiError(409, OWN.REQUEST_PENDING));
      },
    });
    await formLoaded();
    typeReason('Cần đổi vì có việc');
    fireEvent.click(requestButton());
    await alertOf();
    fireEvent.click(requestButton());
    const message = `${rescheduleMessageForCode(OWN.REQUEST_PENDING)?.message} ${TEXT.afterUncertainHint}`;
    const alert = await screen.findByText(message);
    expect(
      within(alert.closest('[role="alert"]') as HTMLElement).getByRole('link', {
        name: TEXT.backToDetailLink,
      }),
    ).toHaveAttribute('href', OLD_DETAIL_PATH);
  });

  it('WDH-46 KHÔNG có gợi ý khi chưa từng gặp "chưa rõ": 404 và 409 yêu cầu đang chờ ở lần gửi ĐẦU chỉ có câu của mã', async () => {
    const first = await submitWith(() => apiError(404, 'KHONG_TIM_THAY'));
    expect(await alertOf()).not.toHaveTextContent(TEXT.afterUncertainHint);
    first.unmount();
    cleanUpDetailPage();
    vi.useFakeTimers({ toFake: ['Date'] });
    await submitWith(() => apiError(409, OWN.REQUEST_PENDING));
    expect(await alertOf()).not.toHaveTextContent(TEXT.afterUncertainHint);
  });

  it('WDH-46 gợi ý chỉ đi với 404 và 409 yêu cầu đang chờ: sau "chưa rõ", lỗi khác (`LICH_HEN_DA_QUA_GIO`) giữ nguyên câu của mã', async () => {
    renderConfirm({
      before: (fake) => {
        fake.failNext('submit', () => Promise.reject(new TypeError('x')));
        fake.failNext('submit', () => apiError(409, OWN.TOO_LATE));
      },
    });
    await formLoaded();
    fireEvent.click(confirmButton());
    await alertOf();
    fireEvent.click(confirmButton());
    await screen.findByText(
      rescheduleMessageForCode(OWN.TOO_LATE)?.message as string,
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      TEXT.afterUncertainHint,
    );
  });
});

describe('không rò chi tiết nội bộ (WDH-38)', () => {
  it('WDH-38 mọi lỗi ở trên không in `thongBao`, `requestId`, mã lỗi hay id khung giờ', async () => {
    const { container } = await submitWith(() =>
      apiError(409, OWN.NOT_RESCHEDULABLE, {
        chiTiet: { trangThai: 'ChoThanhToan' },
      }),
    );
    const alert = await alertOf();
    noLeak(container);
    expect(alert.textContent).not.toContain(SLOT_ID);
  });
});
