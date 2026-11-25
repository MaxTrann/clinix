import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanUpReceptionPage } from '../../../testing/reception-harness';
import { makeReceptionPreview } from '../../../testing/fake-reception-reschedule-api';
import { renderReceptionReschedule } from '../../../testing/reception-reschedule-harness';
import {
  apiError,
  CONFIRM_PATH,
  confirmButton,
  formLoaded,
  GRID_PATH,
  noLeak,
  OLD_DETAIL_PATH,
  reasonField,
  RECEPTION_CODE,
  RTEXT,
  SLOT_ID,
  TEXT,
  typeReason,
} from '../../../testing/reception-reschedule-helpers';
import { RECEPTION_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { rescheduleMessageForCode } from '../../common/reschedule-errors';
import { DETAIL_TEXT } from '../detail/detail-messages';

// reschedule F3, mã ca WDO-03 (PLAN reschedule 7.11: màn xác nhận, ô lý do BẮT BUỘC 1 đến 255 và dòng nhắc) cộng các ca [đề xuất] cùng mã. API giả theo hợp đồng THẬT của B7; đường dẫn `…/doi-lich/xac-nhan?khungGioId=`
// với id lớn hơn 2^53 để mọi ca chứng minh id đi nguyên chuỗi. Ký tự đặc biệt dựng bằng `String.fromCodePoint` để không phụ thuộc cách file được lưu. Dữ liệu giả.
afterEach(cleanUpReceptionPage);

const NBSP = String.fromCodePoint(0xa0);
const EMOJI = String.fromCodePoint(0x1f600);
const ACUTE = String.fromCodePoint(0x301);
const rangeMessage = TEXT.reasonRange(1, 255);
const counter = (used: number) => TEXT.reasonCount(used, 255);
const openConfirm = async (
  options: Parameters<typeof renderReceptionReschedule>[0] = {},
) => {
  const view = renderReceptionReschedule({ path: CONFIRM_PATH, ...options });
  await formLoaded();
  return view;
};
const lastBody = (api: { submitCalls: { body: unknown }[] }) =>
  api.submitCalls.at(-1)?.body as { khungGioId: string; lyDo: string };

describe('màn xác nhận: nội dung (WDO-03)', () => {
  it('WDO-03 "Lịch hiện tại → Lịch mới" theo giờ Việt Nam, thẻ "Lịch hẹn", dòng nhắc của Lễ tân, ô lý do BẮT BUỘC có nhãn và hai dòng nhắc, nút "Xác nhận đổi lịch"', async () => {
    renderReceptionReschedule({ path: CONFIRM_PATH });
    expect(
      screen.getByRole('heading', { level: 1, name: RTEXT.confirmTitle }),
    ).toHaveFocus();
    await formLoaded();
    const current = screen
      .getByRole('heading', { level: 2, name: TEXT.currentTitle })
      .closest('section') as HTMLElement;
    expect(within(current).getByText('Thứ 2, 30/11/2026')).toBeInTheDocument();
    expect(within(current).getByText('09:30')).toBeInTheDocument();
    const next = screen
      .getByRole('heading', { level: 2, name: TEXT.newTitle })
      .closest('section') as HTMLElement;
    expect(within(next).getByText('Thứ 4, 02/12/2026')).toBeInTheDocument();
    expect(within(next).getByText('10:00')).toBeInTheDocument();

    // thẻ "Lịch hẹn" từ chi tiết của Lễ tân (bác sĩ, chuyên khoa, chi nhánh, người khám)
    const summary = (
      await screen.findByRole('heading', {
        level: 2,
        name: TEXT.appointmentTitle,
      })
    ).closest('section') as HTMLElement;
    for (const text of [
      'Nguyễn Minh Anh',
      'Tim mạch',
      'CLINIX Quận 1',
      'Nguyễn Văn A',
    ]) {
      expect(within(summary).getByText(text)).toBeInTheDocument();
    }

    expect(screen.getByText(RTEXT.intro)).toBeInTheDocument();
    const field = reasonField();
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(field).toHaveAccessibleDescription(
      new RegExp(`${RTEXT.reasonHint.replace(/[.]/g, '\\.')}.*${counter(0)}`),
    );
    expect(RTEXT.reasonHint).toContain('Bệnh nhân sẽ đọc lý do này');
    expect(RTEXT.reasonHint).toContain(
      'Không nhập thông tin cá nhân hay mật khẩu',
    );
    expect(screen.getByText(counter(0))).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it('WDO-03 KHÔNG có dòng "còn n lần tự đổi" và KHÔNG nhãn "Gửi yêu cầu đổi lịch" (đổi hộ không có hạn mức)', async () => {
    await openConfirm();
    expect(screen.queryByText(/lần tự đổi/)).toBeNull();
    expect(screen.queryByText(/tự đổi/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: TEXT.requestButton }),
    ).toBeNull();
    expect(screen.queryByText(TEXT.requestConfirmNotice)).toBeNull();
  });

  it('WDO-03 liên kết quay lại "Chọn khung giờ khác" về TRANG CHỌN của Lễ tân', async () => {
    await openConfirm();
    expect(
      screen.getByRole('link', { name: TEXT.pickAnother }),
    ).toHaveAttribute('href', GRID_PATH);
  });

  it('WDO-03 gọi preview CÓ `khungGioId` (id lớn hơn 2^53 nguyên chuỗi), một GET chi tiết của Lễ tân; không ghi; không kho trình duyệt', async () => {
    const { api } = await openConfirm();
    expect(api.previewCalls).toEqual([
      { maLichHen: RECEPTION_CODE, khungGioId: SLOT_ID },
    ]);
    expect(
      api.reception.callsTo(`/reception/appointments/${RECEPTION_CODE}`),
    ).toHaveLength(1);
    expect(api.submitCalls).toEqual([]);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('WDO-03 17:30Z đã là 00:30 NGÀY HÔM SAU ở Việt Nam (cả hai thẻ)', async () => {
    await openConfirm({
      before: (api) => {
        api.preview = makeReceptionPreview({
          lichCu: { thoiGian: '2026-11-30T17:30:00.000Z', bacSiId: '12' },
        });
        api.candidate = (khungGioId) => ({
          khungGioId,
          thoiGian: '2026-12-02T17:30:00.000Z',
          hopLe: true,
        });
      },
    });
    expect(screen.getByText('Thứ 3, 01/12/2026')).toBeInTheDocument();
    expect(screen.getByText('Thứ 5, 03/12/2026')).toBeInTheDocument();
    expect(screen.getAllByText('00:30')).toHaveLength(2);
  });

  it('WDO-03 thẻ "Lịch hẹn" là lời gọi PHỤ: chi tiết lỗi thì không vẽ thẻ và KHÔNG báo lỗi, màn xác nhận vẫn dùng được', async () => {
    renderReceptionReschedule({
      path: CONFIRM_PATH,
      before: (api) =>
        api.reception.failNext('detail', () => apiError(500, 'LOI_HE_THONG')),
    });
    await formLoaded();
    expect(
      screen.queryByRole('heading', { level: 2, name: TEXT.appointmentTitle }),
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmButton()).toBeEnabled();
  });
});

describe('màn xác nhận: các trạng thái của preview (WDO-03)', () => {
  it('WDO-03 `coYeuCauChoDuyet = true` ⇒ thêm dòng "yêu cầu chờ duyệt…"; vẫn gửi được (KDL-19)', async () => {
    const { api } = await openConfirm({
      before: (fake) => {
        fake.preview = makeReceptionPreview({ coYeuCauChoDuyet: true });
      },
    });
    expect(screen.getByText(RTEXT.pendingRequest)).toBeInTheDocument();
    expect(screen.getByText(RTEXT.intro)).toBeInTheDocument();
    typeReason('Bác sĩ báo bận');
    fireEvent.click(confirmButton());
    await screen.findByText(RTEXT.doneNotice);
    expect(api.submitCalls).toHaveLength(1);
  });

  it('WDO-03 `coYeuCauChoDuyet = false` ⇒ không có dòng yêu cầu chờ', async () => {
    await openConfirm();
    expect(screen.queryByText(RTEXT.pendingRequest)).toBeNull();
  });

  it('WDO-03 `hopLe = false` ⇒ thẻ "Lịch hiện tại", câu theo `lyDoKhongHopLe` và liên kết "Chọn khung giờ khác"; KHÔNG ô lý do, KHÔNG nút gửi', async () => {
    renderReceptionReschedule({
      path: CONFIRM_PATH,
      before: (api) => {
        api.candidate = (khungGioId) => ({
          khungGioId,
          thoiGian: '2026-12-02T03:00:00.000Z',
          hopLe: false,
          lyDoKhongHopLe: 'KHUNG_GIO_KHAC_BAC_SI',
        });
      },
    });
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent(
      rescheduleMessageForCode('KHUNG_GIO_KHAC_BAC_SI')?.message ?? '??',
    );
    expect(
      within(notice).getByRole('link', { name: TEXT.pickAnother }),
    ).toHaveAttribute('href', GRID_PATH);
    expect(
      screen.getByRole('heading', { level: 2, name: TEXT.currentTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
      screen.queryByRole('button', { name: RTEXT.confirmButton }),
    ).toBeNull();
  });

  it.each([[undefined], ['MA_LA_CHUA_BIET']])(
    'WDO-03 `hopLe = false` với `lyDoKhongHopLe` = %s ⇒ câu riêng của khung giờ, không lộ mã',
    async (reason) => {
      const { container } = renderReceptionReschedule({
        path: CONFIRM_PATH,
        before: (api) => {
          api.candidate = (khungGioId) => ({
            khungGioId,
            thoiGian: '2026-12-02T03:00:00.000Z',
            hopLe: false,
            ...(reason === undefined ? {} : { lyDoKhongHopLe: reason }),
          });
        },
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        TEXT.slotNotUsable,
      );
      noLeak(container);
      expect(container.textContent).not.toMatch(/MA_LA_CHUA_BIET/);
    },
  );

  it.each([
    ['lichMoi null', null],
    ['lichMoi của khung giờ KHÁC', '555'],
  ])(
    'WDO-03 %s ⇒ "phản hồi không dùng được": không vẽ "Lịch mới" của khung giờ khác, không nút gửi, có "Thử lại"',
    async (_name, otherId) => {
      renderReceptionReschedule({
        path: CONFIRM_PATH,
        before: (api) => {
          api.candidate =
            otherId === null
              ? null
              : () => ({
                  khungGioId: otherId,
                  thoiGian: '2026-12-02T03:00:00.000Z',
                  hopLe: true,
                });
        },
      });
      expect(
        await screen.findByRole('button', { name: TEXT.retry }),
      ).toBeInTheDocument();
      expect(screen.queryByText(TEXT.newTitle)).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(
        screen.queryByRole('button', { name: RTEXT.confirmButton }),
      ).toBeNull();
    },
  );

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
    'WDO-03 `choPhepDoi = false` với %s (đường vào trực tiếp tới lịch `DaDoiLich` cũng vào đây) ⇒ câu theo mã và liên kết về chi tiết; KHÔNG ô lý do, KHÔNG nút gửi',
    async (code, sentence) => {
      const { container } = renderReceptionReschedule({
        path: CONFIRM_PATH,
        before: (api) => {
          api.preview = makeReceptionPreview({
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
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(
        screen.queryByRole('button', { name: RTEXT.confirmButton }),
      ).toBeNull();
      noLeak(container);
    },
  );

  it('WDO-03 đang tải preview ⇒ chữ đang tải, chưa có ô lý do', async () => {
    let release: (() => void) | null = null;
    renderReceptionReschedule({
      path: CONFIRM_PATH,
      before: (api) =>
        api.failNext(
          'preview',
          () =>
            new Promise<Response>((resolve) => {
              release = () =>
                resolve(
                  Response.json({
                    ...makeReceptionPreview(),
                    lichMoi: {
                      khungGioId: SLOT_ID,
                      thoiGian: '2026-12-02T03:00:00.000Z',
                      hopLe: true,
                    },
                  }),
                );
            }),
        ),
    });
    expect(screen.getByText(TEXT.loading)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    await expect.poll(() => release).not.toBeNull();
    (release as unknown as () => void)();
    await formLoaded();
  });

  it.each([
    [404, 'KHONG_TIM_THAY'],
    [403, 'KHONG_DU_QUYEN'],
  ])(
    'WDO-03 preview %i %s (lịch ngoài chi nhánh hay không có) ⇒ MỘT thẻ chung kèm liên kết về danh sách; không lộ mã',
    async (status, maLoi) => {
      const { container } = renderReceptionReschedule({
        path: CONFIRM_PATH,
        before: (api) => api.failNext('preview', () => apiError(status, maLoi)),
      });
      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent(DETAIL_TEXT.notFound);
      expect(
        within(notice).getByRole('link', { name: DETAIL_TEXT.back }),
      ).toHaveAttribute('href', RECEPTION_APPOINTMENTS_PATH);
      noLeak(container);
    },
  );

  it('WDO-03 preview 404 `KHUNG_GIO_KHONG_TON_TAI` (URL cũ) ⇒ câu "khung giờ không còn" kèm liên kết "Chọn khung giờ khác", KHÔNG phải "không tìm thấy lịch hẹn"', async () => {
    renderReceptionReschedule({
      path: CONFIRM_PATH,
      before: (api) =>
        api.failNext('preview', () => apiError(404, 'KHUNG_GIO_KHONG_TON_TAI')),
    });
    const notice = await screen.findByRole('alert');
    expect(notice).not.toHaveTextContent(DETAIL_TEXT.notFound);
    expect(
      within(notice).getByRole('link', { name: TEXT.pickAnother }),
    ).toHaveAttribute('href', GRID_PATH);
  });

  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      '502 không phải JSON',
      () => new Response('<html>502</html>', { status: 502 }),
    ],
    ['thân thiếu khoá', () => Response.json({ choPhepDoi: true })],
    [
      'thân có khoá của Bệnh nhân nhưng thiếu `coYeuCauChoDuyet`',
      () =>
        Response.json({
          choPhepDoi: true,
          loai: 'TuDoi',
          soLanDaDoi: 0,
          soLanToiDa: 2,
          lichCu: { thoiGian: '2026-11-30T02:30:00.000Z', bacSiId: '12' },
          lichMoi: null,
          thoiGianMayChu: '2026-11-25T03:00:00.000Z',
        }),
    ],
  ])(
    'WDO-03 preview %s ⇒ có "Thử lại"; thử lại thành công vẽ lại form',
    async (_name, override) => {
      const { api } = renderReceptionReschedule({
        path: CONFIRM_PATH,
        before: (fake) => fake.failNext('preview', override),
      });
      fireEvent.click(await screen.findByRole('button', { name: TEXT.retry }));
      await formLoaded();
      expect(api.previewCalls).toHaveLength(2);
    },
  );
});

describe('ô lý do BẮT BUỘC 1 đến 255 đơn vị UTF-16 (WDO-03)', () => {
  it.each([
    ['rỗng', ''],
    ['toàn khoảng trắng', '   '],
    ['xuống dòng và tab', '\n\t\n'],
    ['toàn khoảng không ngắt U+00A0', `${NBSP}${NBSP}${NBSP}`],
  ])(
    'WDO-03 lý do %s ⇒ bấm gửi KHÔNG gọi API, lỗi cạnh ô, ô nhận tiêu điểm, nút vẫn bật',
    async (_name, value) => {
      const { api } = await openConfirm();
      if (value !== '') typeReason(value);
      fireEvent.click(confirmButton());
      expect(api.submitCalls).toEqual([]);
      expect(await screen.findByText(rangeMessage)).toBeInTheDocument();
      expect(reasonField()).toHaveAttribute('aria-invalid', 'true');
      expect(reasonField()).toHaveFocus();
      expect(confirmButton()).toBeEnabled();
    },
  );

  it('WDO-03 chưa gõ gì thì CHƯA báo lỗi (chỉ báo sau lần bấm gửi đầu)', async () => {
    await openConfirm();
    expect(screen.queryByText(rangeMessage)).toBeNull();
    typeReason('a');
    typeReason('');
    expect(screen.queryByText(rangeMessage)).toBeNull();
  });

  it.each([
    ['1 đơn vị', 'a'],
    ['255 đơn vị', 'a'.repeat(255)],
    ['127 biểu tượng và một chữ (255 đơn vị UTF-16)', `${EMOJI.repeat(127)}a`],
    ['"é" dạng tổ hợp 127 lần (254 đơn vị)', `e${ACUTE}`.repeat(127)],
  ])(
    'WDO-03 lý do %s ⇒ hợp lệ: gửi đúng MỘT POST với chữ NGUYÊN VẸN (không chuẩn hoá NFC)',
    async (_name, value) => {
      const { api } = await openConfirm();
      typeReason(value);
      fireEvent.click(confirmButton());
      await screen.findByText(RTEXT.doneNotice);
      expect(api.submitCalls).toHaveLength(1);
      expect(lastBody(api)).toStrictEqual({ khungGioId: SLOT_ID, lyDo: value });
    },
  );

  it.each([
    ['256 đơn vị', 'a'.repeat(256), 256],
    ['128 biểu tượng (256 đơn vị UTF-16)', EMOJI.repeat(128), 256],
    ['"é" dạng tổ hợp 128 lần (256 đơn vị)', `e${ACUTE}`.repeat(128), 256],
  ])(
    'WDO-03 lý do %s ⇒ báo lỗi NGAY khi gõ, bộ đếm quá 255, bấm gửi KHÔNG gọi API',
    async (_name, value, units) => {
      const { api } = await openConfirm();
      typeReason(value);
      expect(await screen.findByText(rangeMessage)).toBeInTheDocument();
      expect(screen.getByText(counter(units))).toBeInTheDocument();
      fireEvent.click(confirmButton());
      expect(api.submitCalls).toEqual([]);
      expect(reasonField()).toHaveFocus();
    },
  );

  it('WDO-03 bộ đếm theo ĐƠN VỊ UTF-16 của chữ đã cắt: 3 biểu tượng là 6; khoảng trắng hai đầu không tính', async () => {
    await openConfirm();
    typeReason(`  ${EMOJI.repeat(3)}  `);
    expect(screen.getByText(counter(6))).toBeInTheDocument();
    typeReason(`${NBSP}abc${NBSP}`);
    expect(screen.getByText(counter(3))).toBeInTheDocument();
  });

  it('WDO-03 chữ gửi đi được cắt bằng `trim()` (cả U+00A0); khoảng trắng ở giữa và Tab ở giữa giữ nguyên', async () => {
    const { api } = await openConfirm();
    typeReason(`${NBSP}  Bệnh nhân\tbáo   bận \n`);
    fireEvent.click(confirmButton());
    await screen.findByText(RTEXT.doneNotice);
    expect(lastBody(api).lyDo).toBe('Bệnh nhân\tbáo   bận');
  });

  it('WDO-03 sửa lại lý do sau lỗi ⇒ lỗi biến mất và gửi được', async () => {
    const { api } = await openConfirm();
    fireEvent.click(confirmButton());
    expect(await screen.findByText(rangeMessage)).toBeInTheDocument();
    typeReason('Đã sửa');
    expect(screen.queryByText(rangeMessage)).toBeNull();
    fireEvent.click(confirmButton());
    await screen.findByText(RTEXT.doneNotice);
    expect(api.submitCalls).toHaveLength(1);
  });
});

describe('đường dẫn và tải lại (WDO-03)', () => {
  it.each([
    [
      'không có query',
      '/le-tan/quan-ly-lich-hen/CP20261018001/doi-lich/xac-nhan',
    ],
    ['khungGioId rỗng', `${GRID_PATH}/xac-nhan?khungGioId=`],
    ['khungGioId chữ', `${GRID_PATH}/xac-nhan?khungGioId=abc`],
    ['khungGioId số 0 đứng đầu', `${GRID_PATH}/xac-nhan?khungGioId=012`],
    [
      'khungGioId lớn hơn BIGINT',
      `${GRID_PATH}/xac-nhan?khungGioId=9223372036854775808`,
    ],
    ['khungGioId lặp khoá', `${GRID_PATH}/xac-nhan?khungGioId=1&khungGioId=2`],
  ])(
    'WDO-03 URL %s ⇒ "liên kết không hợp lệ" kèm đường về lưới; KHÔNG gọi preview',
    async (_name, path) => {
      const { api } = renderReceptionReschedule({ path });
      expect(await screen.findByText(TEXT.invalidLink)).toBeInTheDocument();
      // liên kết quay lại ở đầu trang và liên kết trong thẻ báo đều về LƯỚI của Lễ tân
      const links = screen.getAllByRole('link', { name: TEXT.pickAnother });
      expect(links).toHaveLength(2);
      for (const link of links) expect(link).toHaveAttribute('href', GRID_PATH);
      expect(api.previewCalls).toEqual([]);
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  );

  it('WDO-03 TẢI LẠI trang (dựng lại từ cùng URL) vẫn chạy: id từ URL, preview gọi lại, lý do đã gõ KHÔNG được giữ (không kho trình duyệt)', async () => {
    const first = await openConfirm();
    typeReason('Lý do chưa gửi');
    first.unmount();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    const { api } = await openConfirm();
    expect(api.previewCalls).toEqual([
      { maLichHen: RECEPTION_CODE, khungGioId: SLOT_ID },
    ]);
    expect(reasonField()).toHaveValue('');
  });
});
