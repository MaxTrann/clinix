import { act } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import { RECEPTION_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { cleanUpReceptionPage } from '../../../testing/reception-harness';
import { makeReceptionDetail } from '../../../testing/fake-reception-api';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import { makeDoneResult } from '../../../testing/fake-reschedule-api';
import { renderReceptionReschedule } from '../../../testing/reception-reschedule-harness';
import {
  apiError,
  CONFIRM_PATH,
  confirmButton,
  currentUrl,
  formLoaded,
  GRID_PATH,
  noLeak,
  OLD_DETAIL_PATH,
  reasonField,
  RECEPTION_CODE,
  RTEXT,
  TEXT,
  typeReason,
} from '../../../testing/reception-reschedule-helpers';
import { rescheduleMessageForCode } from '../../common/reschedule-errors';
import { DETAIL_TEXT } from '../detail/detail-messages';

// reschedule F3, mã ca WDO-05 (PLAN reschedule 7.11: lỗi 409, 404 ngoài chi nhánh) cộng các ca [đề xuất] cùng mã: MỌI mã lỗi của `POST /reception/appointments/:ma/reschedule` ⇒ loại hành động (câu theo `maLoi`,
// KHÔNG theo `thongBao` hay mã HTTP; PLAN 5.13, TRACKING mục 7 khối B7). Thân lỗi giả cố ý có `thongBao` và `requestId` để chứng minh chúng không bao giờ lên màn hình. Hôm nay giả là 25/11/2026. Chuỗi giống bí mật
// ghép từ hai mảnh để gitleaks không báo. Dữ liệu giả.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanUpReceptionPage();
});

const REASON = 'Bác sĩ báo bận đột xuất';

// Dựng màn xác nhận, gõ lý do, làm lần gửi ĐẦU TIÊN trả `response` (hay ném lỗi), bấm gửi
async function submitWith(
  response: Response | (() => Response | Promise<Response>),
  reason = REASON,
) {
  const view = renderReceptionReschedule({
    path: CONFIRM_PATH,
    before: (api) =>
      api.failNext(
        'submit',
        typeof response === 'function' ? response : () => response,
      ),
  });
  await formLoaded();
  typeReason(reason);
  fireEvent.click(confirmButton());
  return view;
}
const alertOf = () => screen.findByRole('alert');
const linkIn = (box: HTMLElement, name: string) =>
  within(box).getByRole('link', { name });

describe('409 theo từng mã: câu, điều hướng, "Thử lại" (WDO-05)', () => {
  it.each([['KHUNG_GIO_TRUNG_LICH_CU'], ['KHUNG_GIO_KHAC_BAC_SI']])(
    'WDO-05 %s ⇒ thẻ thay form, câu theo mã kèm liên kết "Chọn khung giờ khác" về LƯỚI của Lễ tân; không còn nút gửi',
    async (code) => {
      const { container } = await submitWith(apiError(409, code));
      const box = await alertOf();
      expect(box).toHaveTextContent(
        rescheduleMessageForCode(code)?.message ?? '??',
      );
      expect(linkIn(box, TEXT.pickAnother)).toHaveAttribute('href', GRID_PATH);
      expect(
        screen.queryByRole('button', { name: RTEXT.confirmButton }),
      ).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
      noLeak(container);
    },
  );

  it.each([
    ['LICH_HEN_KHONG_CHO_DOI', { trangThai: 'DaDoiLich' }],
    ['LICH_HEN_KHONG_CHO_DOI', { trangThai: 'ChoThanhToan' }],
    ['LICH_HEN_DA_QUA_GIO', undefined],
    ['LICH_HEN_KHAC_DICH_VU_HIEN_TAI', undefined],
    ['LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI', undefined],
    ['CHUOI_DOI_LICH_QUA_DAI', undefined],
    ['HO_SO_NGUOI_THAN_DA_NGUNG', undefined],
  ])(
    'WDO-05 %s (%j) ⇒ thẻ thay form, câu theo mã kèm liên kết "Quay lại chi tiết lịch hẹn" về chi tiết của Lễ tân; KHÔNG "Thử lại"; kể cả `DaDoiLich` (KHÔNG phải "không tìm thấy")',
    async (code, chiTiet) => {
      const { container } = await submitWith(
        apiError(409, code, chiTiet === undefined ? {} : { chiTiet }),
      );
      const box = await alertOf();
      expect(box).toHaveTextContent(
        rescheduleMessageForCode(code)?.message ?? '??',
      );
      expect(box).not.toHaveTextContent(DETAIL_TEXT.notFound);
      expect(linkIn(box, TEXT.backToDetailLink)).toHaveAttribute(
        'href',
        OLD_DETAIL_PATH,
      );
      expect(screen.queryByRole('button', { name: TEXT.retry })).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
      noLeak(container);
    },
  );

  it.each([
    [409, 'KHUNG_GIO_DA_DAT'],
    [409, 'KHUNG_GIO_DANG_GIU'],
    [409, 'KHUNG_GIO_DA_QUA'],
    [404, 'KHUNG_GIO_KHONG_TON_TAI'],
  ])(
    'WDO-05 %i %s ⇒ QUAY VỀ LƯỚI (thay lịch sử), trang chọn gắn lại nên preview và lưới được TẢI LẠI, kèm câu của mã đó',
    async (status, code) => {
      const { api, container } = await submitWith(apiError(status, code));
      expect(
        await screen.findByRole('heading', { level: 1, name: RTEXT.title }),
      ).toBeInTheDocument();
      await screen.findByRole('button', { name: '08:00, còn trống' });
      expect(currentUrl()).toBe(GRID_PATH);
      expect(
        screen.getByText(rescheduleMessageForCode(code)?.message ?? '??'),
      ).toBeInTheDocument();
      // preview của màn xác nhận (1) rồi của trang chọn (2, KHÔNG `khungGioId`); lưới tải lại
      expect(api.previewCalls).toHaveLength(2);
      expect(api.previewCalls[1].khungGioId).toBeNull();
      expect(api.slots.slotCalls.length).toBeGreaterThanOrEqual(1);
      expect(api.submitCalls).toHaveLength(1);
      noLeak(container);
    },
  );

  it('WDO-05 sau khi về lưới vì `KHUNG_GIO_DA_DAT`, chọn ô khác và gửi lại thành công (không bị kẹt)', async () => {
    const { api } = await submitWith(apiError(409, 'KHUNG_GIO_DA_DAT'));
    fireEvent.click(
      await screen.findByRole('button', { name: '09:00, còn trống' }),
    );
    await formLoaded();
    typeReason(REASON);
    fireEvent.click(confirmButton());
    await screen.findByText(RTEXT.doneNotice);
    expect(api.submitCalls).toHaveLength(2);
  });

  it.each([
    [503, 'HE_THONG_DANG_BAN'],
    [409, 'HE_THONG_CHUA_CAU_HINH'],
  ])(
    'WDO-05 %i %s ⇒ câu theo mã kèm "Thử lại"; form và chữ đã gõ GIỮ NGUYÊN; "Thử lại" gửi lại ĐÚNG chữ đó và thành công',
    async (status, code) => {
      const { api, container } = await submitWith(apiError(status, code));
      const box = await alertOf();
      expect(box).toHaveTextContent(
        rescheduleMessageForCode(code)?.message ?? '??',
      );
      expect(box).toBe(document.activeElement);
      expect(reasonField()).toHaveValue(REASON);
      noLeak(container);
      fireEvent.click(within(box).getByRole('button', { name: TEXT.retry }));
      await screen.findByText(RTEXT.doneNotice);
      expect(api.submitCalls).toHaveLength(2);
      expect(api.submitCalls[1].body).toStrictEqual(api.submitCalls[0].body);
    },
  );

  it.each([['VUOT_SO_LAN_TU_DOI'], ['DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET']])(
    'WDO-05 %s (B7: KHÔNG bao giờ ra ở đổi hộ) vẫn không làm hỏng trang: thẻ kèm đường về chi tiết, KHÔNG mở ô lý do kiểu Bệnh nhân, KHÔNG nhãn "Gửi yêu cầu"',
    async (code) => {
      await submitWith(apiError(409, code));
      const box = await alertOf();
      expect(linkIn(box, TEXT.backToDetailLink)).toHaveAttribute(
        'href',
        OLD_DETAIL_PATH,
      );
      expect(
        screen.queryByRole('button', { name: TEXT.requestButton }),
      ).toBeNull();
      expect(screen.queryByText(TEXT.requestConfirmNotice)).toBeNull();
    },
  );
});

describe('404, 403, 401 (WDO-05)', () => {
  it.each([
    [404, 'KHONG_TIM_THAY'],
    [403, 'KHONG_DU_QUYEN'],
  ])(
    'WDO-05 %i %s ⇒ MỘT thẻ chung "không tìm thấy" kèm liên kết về danh sách; KHÔNG "Thử lại", không lộ mã',
    async (status, code) => {
      const { container } = await submitWith(apiError(status, code));
      const box = await alertOf();
      expect(box).toHaveTextContent(DETAIL_TEXT.notFound);
      expect(linkIn(box, DETAIL_TEXT.back)).toHaveAttribute(
        'href',
        RECEPTION_APPOINTMENTS_PATH,
      );
      expect(screen.queryByRole('button', { name: TEXT.retry })).toBeNull();
      noLeak(container);
    },
  );

  it('WDO-05 404 NGOÀI chi nhánh và 404 lịch không có CÙNG một thẻ từng ký tự (không lộ lịch có tồn tại hay không)', async () => {
    const first = await submitWith(
      apiError(404, 'KHONG_TIM_THAY', { thongBao: 'NGOAI_CHI_NHANH' }),
    );
    const a = (await alertOf()).outerHTML;
    first.unmount();
    cleanUpReceptionPage();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
    // lịch không có: API giả trả 404 `KHONG_TIM_THAY` của chính nó (xoá chi tiết rồi gửi)
    const second = renderReceptionReschedule({
      path: CONFIRM_PATH,
      before: (api) => {
        api.reception.details[RECEPTION_CODE] = makeReceptionDetail();
      },
    });
    await formLoaded();
    typeReason(REASON);
    delete second.api.reception.details[RECEPTION_CODE];
    second.api.reception.appointments = [];
    fireEvent.click(confirmButton());
    const b = (await alertOf()).outerHTML;
    expect(b).toBe(a);
  });

  it('WDO-05 401 ⇒ câu phiên hết hạn, không "Thử lại", không nút gửi', async () => {
    await submitWith(apiError(401, 'CHUA_DANG_NHAP'));
    expect(
      await screen.findByText(/Phiên đăng nhập đã hết hạn/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TEXT.retry })).toBeNull();
  });
});

describe('400 ở ô lý do (WDO-05)', () => {
  it('WDO-05 400 `LY_DO_BAT_BUOC` ở trường `lyDo` ⇒ lỗi CẠNH Ô, GIỮ nguyên chữ đã gõ, tiêu điểm vào ô, KHÔNG thẻ lỗi; sửa lại rồi gửi thành công', async () => {
    const { api, container } = await submitWith(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
      }),
    );
    expect(await screen.findByText(RTEXT.reasonInvalid)).toBeInTheDocument();
    expect(reasonField()).toHaveValue(REASON);
    expect(reasonField()).toHaveAttribute('aria-invalid', 'true');
    expect(reasonField()).toHaveFocus();
    expect(confirmButton()).toBeEnabled();
    noLeak(container);
    typeReason('Đã sửa lại lý do');
    fireEvent.click(confirmButton());
    await screen.findByText(RTEXT.doneNotice);
    expect(api.submitCalls).toHaveLength(2);
    expect(api.submitCalls[1].body).toMatchObject({ lyDo: 'Đã sửa lại lý do' });
  });

  it('WDO-05 chữ GIỐNG BÍ MẬT (bộ che bí mật của máy chủ) ⇒ máy chủ từ chối 400 `LY_DO_BAT_BUOC`; web KHÔNG chặn trước (không chép bộ che), lỗi hiện cạnh ô và chữ được GIỮ', async () => {
    const secret = ['pass', 'word=abc123'].join('');
    const { api } = renderReceptionReschedule({ path: CONFIRM_PATH });
    await formLoaded();
    typeReason(`Quên ${secret}`);
    fireEvent.click(confirmButton());
    expect(await screen.findByText(RTEXT.reasonInvalid)).toBeInTheDocument();
    expect(reasonField()).toHaveValue(`Quên ${secret}`);
    expect(api.submitCalls).toHaveLength(1);
  });

  it('WDO-05 `mật khẩu: …` có dấu KHÔNG bị bộ che bắt (TECH_DEBT 284): máy chủ nhận, web cũng không chặn', async () => {
    const { api } = renderReceptionReschedule({ path: CONFIRM_PATH });
    await formLoaded();
    typeReason('mật khẩu: abc123');
    fireEvent.click(confirmButton());
    await screen.findByText(RTEXT.doneNotice);
    expect(api.submitCalls).toHaveLength(1);
  });

  it('WDO-05 400 KHÔNG ở trường `lyDo` (khoá lạ, id sai) ⇒ KHÔNG phải lỗi ô lý do: câu chung kèm "Thử lại", chữ giữ nguyên', async () => {
    await submitWith(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'lyDoYeuCau', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      }),
    );
    const box = await alertOf();
    expect(box).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(screen.queryByText(RTEXT.reasonInvalid)).toBeNull();
    expect(reasonField()).toHaveValue(REASON);
  });
});

describe('500 và "chưa rõ" (WDO-05)', () => {
  it('WDO-05 500 `LOI_HE_THONG` (AuditError, DB nguyên vẹn) ⇒ "Không thực hiện được, vui lòng thử lại." kèm "Thử lại"; không lộ `requestId`; gửi lại thành công', async () => {
    const { api, container } = await submitWith(apiError(500, 'LOI_HE_THONG'));
    const box = await alertOf();
    expect(box).toHaveTextContent(RTEXT.systemError);
    expect(reasonField()).toHaveValue(REASON);
    noLeak(container);
    fireEvent.click(within(box).getByRole('button', { name: TEXT.retry }));
    await screen.findByText(RTEXT.doneNotice);
    expect(api.submitCalls).toHaveLength(2);
  });

  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      '502 không phải JSON',
      () => new Response('<html>502</html>', { status: 502 }),
    ],
    [
      '201 sai hình dạng',
      () => jsonResponse({ ...makeDoneResult(), lichHenCu: {} }, 201),
    ],
    [
      '201 `DaGuiYeuCau` (đổi hộ không có nhánh này)',
      () => jsonResponse({ ...makeDoneResult(), ketQua: 'DaGuiYeuCau' }, 201),
    ],
  ])(
    'WDO-05 %s ⇒ "chưa rõ lịch hẹn đã được đổi hay chưa" kèm liên kết "Xem chi tiết lịch hẹn"; nút gửi VẪN bấm được; chữ giữ nguyên; không điều hướng',
    async (_name, response) => {
      const { api, container } = await submitWith(response);
      const box = await alertOf();
      expect(box).toHaveTextContent(RTEXT.uncertain);
      expect(box).toBe(document.activeElement);
      expect(linkIn(box, RTEXT.seeDetail)).toHaveAttribute(
        'href',
        OLD_DETAIL_PATH,
      );
      expect(confirmButton()).toBeEnabled();
      expect(reasonField()).toHaveValue(REASON);
      expect(currentUrl()).toBe(CONFIRM_PATH);
      expect(api.submitCalls).toHaveLength(1);
      noLeak(container);
      expect(container.textContent).not.toContain(NETWORK_ERROR_MESSAGE);
    },
  );

  it('WDO-05 hết 15 giây không phản hồi ⇒ cũng là "chưa rõ" (không phải lỗi chung)', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
    renderReceptionReschedule({
      path: CONFIRM_PATH,
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
    typeReason(REASON);
    fireEvent.click(confirmButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(RTEXT.uncertain);
    expect(confirmButton()).toBeEnabled();
  });

  it('WDO-05 "chưa rõ" rồi gửi lại: lịch cũ đã thành `DaDoiLich` (lần trước thật ra đã đổi) ⇒ 409 `LICH_HEN_KHONG_CHO_DOI` kèm GỢI Ý "có thể lần trước đã đổi" và đường về chi tiết; KHÔNG đổi hai lần', async () => {
    const { api } = await submitWith(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    await alertOf();
    // máy chủ ĐÃ đổi ở lần trước (phản hồi bị mất): lịch cũ nay là `DaDoiLich`
    api.reception.details[RECEPTION_CODE] = makeReceptionDetail({
      trangThai: 'DaDoiLich',
      chuyenDuoc: [],
      conPhaiThu: null,
      choPhepDoiLich: false,
    });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.submitCalls).toHaveLength(2));
    const box = await screen.findByText(RTEXT.afterUncertainHint, {
      exact: false,
    });
    expect(box.textContent).toContain(
      rescheduleMessageForCode('LICH_HEN_KHONG_CHO_DOI')?.message ?? '??',
    );
    expect(
      screen.getByRole('link', { name: TEXT.backToDetailLink }),
    ).toHaveAttribute('href', OLD_DETAIL_PATH);
    // vẫn đúng MỘT lịch mới (không có lần đổi thứ hai)
    expect(api.submitCalls).toHaveLength(2);
  });

  it('WDO-05 lần gửi đầu 409 `LICH_HEN_KHONG_CHO_DOI` KHÔNG có gợi ý "lần trước" (chưa có lần "chưa rõ" nào)', async () => {
    await submitWith(apiError(409, 'LICH_HEN_KHONG_CHO_DOI'));
    const box = await alertOf();
    expect(box).not.toHaveTextContent(RTEXT.afterUncertainHint);
  });
});

describe('chọn câu theo `maLoi`, không theo chữ của máy chủ (WDO-05)', () => {
  it('WDO-05 `thongBao` của máy chủ đổi chữ nhưng `maLoi` giữ ⇒ câu hiển thị không đổi; mã lạ ⇒ câu chung, không lộ mã', async () => {
    const known = await submitWith(
      apiError(409, 'LICH_HEN_DA_QUA_GIO', { thongBao: 'CHU_KHAC_HAN' }),
    );
    expect(await alertOf()).toHaveTextContent(
      'Đã quá giờ hẹn nên không thể đổi lịch.',
    );
    expect(known.container.textContent).not.toContain('CHU_KHAC_HAN');
    known.unmount();
    cleanUpReceptionPage();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));

    const unknown = await submitWith(apiError(409, 'MA_LA_CHUA_BIET'));
    const box = await alertOf();
    expect(box).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    noLeak(unknown.container);
  });
});

describe('hạ chốt sau lỗi (WDO-06)', () => {
  it('WDO-06 sau lỗi 503 nút gửi lại bấm được và gửi được; sau lần gửi lại thành công không còn thẻ lỗi', async () => {
    const { api } = await submitWith(apiError(503, 'HE_THONG_DANG_BAN'));
    await alertOf();
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());
    await screen.findByText(RTEXT.doneNotice);
    expect(api.submitCalls).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
