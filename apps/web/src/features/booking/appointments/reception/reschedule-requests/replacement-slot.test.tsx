import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_ERROR_MESSAGE } from '../../../../../shared/api/error-message';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../../testing/fake-appointment-list-api';
import { makeReceptionPreview } from '../../../testing/fake-reception-reschedule-api';
import { fakeDay, fakeSlot } from '../../../testing/fake-reschedule-api';
import { fakeRecord } from '../../../testing/fake-reschedule-requests-api';
import { installFakeFetch } from '../../../testing/install-fake-fetch';
import {
  backToApproveButton,
  chooseSlot,
  DESIRED,
  DESIRED_TEXT,
  FIRST_SLOT,
  fixClock,
  makeSlotApis,
  openApproveWithSlots,
  openPanel,
  panelHeading,
  pickButton,
  queryPickButton,
  SECOND_SLOT,
  slotCell,
  TODAY,
  useDesiredButton,
} from '../../../testing/replacement-slot-helpers';
import {
  makeHandledDetail,
  makeRequestDetail,
} from '../../../testing/reschedule-requests-fixtures';
import {
  approveButton,
  confirmButton,
  dialogOf,
  noteBox,
  rejectButton,
  submitDialog,
  typeNote,
} from '../../../testing/reschedule-requests-handle-helpers';
import {
  cleanUpRequestsPage,
  currentUrl,
} from '../../../testing/reschedule-requests-harness';
import { COMMON_LIST_TEXT } from '../../common/list-text';
import { RequestDetailPage } from '../../common/reschedule-requests/request-detail-page';
import { HANDLE_TEXT } from '../../common/reschedule-requests/request-handle-text';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';
import { receptionRequestsApi } from './reception-requests-api';
import { receptionRequestHandlers } from './reception-requests-handle-api';

// reschedule F4 Pha B2: "Chọn khung giờ khác" trong hộp Duyệt (WXD-07 theo PLAN reschedule 7.11: chọn khung giờ thay thế; `[đề xuất]` WXD-86, 87, 89…99). Nút chỉ ở hộp Duyệt; bấm mới hỏi preview đổi hộ MỘT lần để lấy id
// bác sĩ; có rồi hộp tạm đóng (giữ ghi chú), bảng chọn hiện trên trang với lưới của đúng bác sĩ; chọn ô hay "Quay lại hộp duyệt" (Đại chốt 26/11/2026) mở lại hộp; hai nút của trang khoá khi bảng mở. Duyệt bằng khung
// giờ thay thế gửi `khungGioId`; lỗi lấy id bác sĩ hiện CẠNH NÚT, hộp giữ nguyên. Đồng hồ cố định 25/11/2026. Dữ liệu giả.
beforeEach(fixClock);
afterEach(cleanUpRequestsPage);

const NOTE = 'Đã gọi bệnh nhân, đổi sang buổi sáng.';
const PAGE = '/le-tan/yeu-cau-doi-lich/101';
const BIG_ID = '9223372036854775807';

const lookupAlert = () => within(dialogOf('approve')).getByRole('alert');

// Giữ phản hồi preview: trả hàm thả và `signal` của lời gọi
function holdPreview(
  fake: ReturnType<typeof makeSlotApis>['reception'],
  body: unknown = makeReceptionPreview(),
) {
  const held: { release: () => void; signal: AbortSignal | null | undefined } =
    { release: () => undefined, signal: undefined };
  fake.failNext('preview', (init) => {
    held.signal = init?.signal;
    return new Promise<Response>((resolve) => {
      held.release = () => resolve(jsonResponse(body));
    });
  });
  return held;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('nút "Chọn khung giờ khác"', () => {
  it('WXD-86 mở hộp Duyệt KHÔNG gọi preview; chỉ khi bấm nút mới gọi ĐÚNG MỘT lần (không `khungGioId`) cho mã lịch của yêu cầu', async () => {
    const { reception, api } = await openApproveWithSlots();
    expect(reception.previewCalls).toEqual([]);
    expect(reception.slots.slotCalls).toEqual([]);
    await openPanel();
    expect(reception.previewCalls).toEqual([
      { maLichHen: api.records[0].detail.maLichHen, khungGioId: null },
    ]);
    expect(api.writes()).toEqual([]);
  });

  it('WXD-86 hộp Từ chối KHÔNG có nút', async () => {
    await openApproveWithSlots();
    fireEvent.click(
      within(dialogOf('approve')).getByRole('button', {
        name: HANDLE_TEXT.close,
      }),
    );
    fireEvent.click(rejectButton());
    expect(dialogOf('reject')).toBeInTheDocument();
    expect(queryPickButton()).toBeNull();
  });

  it('WXD-93 hai cú bấm trong CÙNG MỘT lượt xử lý ⇒ một lời gọi preview; đang chờ: chữ "Đang tải khung giờ…", `aria-disabled` (không `disabled`) nên tiêu điểm ở lại nút', async () => {
    let held: ReturnType<typeof holdPreview> | undefined;
    const { reception } = await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          held = holdPreview(apis.reception);
        },
      },
    );
    const button = pickButton();
    button.focus();
    act(() => {
      button.click();
      button.click();
    });
    expect(button).toHaveTextContent(HANDLE_TEXT.pickLoading);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(reception.previewCalls).toHaveLength(1);
    held?.release();
    await screen.findByRole('heading', {
      level: 2,
      name: HANDLE_TEXT.panelTitle,
    });
    expect(reception.previewCalls).toHaveLength(1);
  });
});

describe('bảng chọn khung giờ', () => {
  it('WXD-87 lưới là của ĐÚNG bác sĩ: id lấy từ `lichCu.bacSiId` của preview, lớn hơn 2^53 vẫn nguyên chuỗi, ngày hôm nay', async () => {
    const big = '9007199254740993';
    const { reception } = await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          apis.reception.preview = makeReceptionPreview({
            lichCu: { thoiGian: '2026-11-30T02:30:00.000Z', bacSiId: big },
          });
        },
      },
    );
    await openPanel();
    await slotCell(FIRST_SLOT.cell);
    expect(reception.slots.slotCalls).toEqual([{ bacSiIds: big, ngay: TODAY }]);
  });

  it('WXD-87 preview nói lịch không đổi hộ được (`choPhepDoi: false`) vẫn dùng id bác sĩ: quyết định thật ở lúc duyệt', async () => {
    const { reception } = await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          apis.reception.preview = makeReceptionPreview({
            choPhepDoi: false,
            lyDoKhongDoi: 'LICH_HEN_KHONG_CHO_DOI',
          });
        },
      },
    );
    await openPanel();
    await slotCell(FIRST_SLOT.cell);
    expect(reception.slots.slotCalls[0].bacSiIds).toBe('12');
  });

  it('WXD-89 mở bảng: hộp đóng, tiêu điểm vào tiêu đề bảng, hai nút Duyệt và Từ chối của trang bị KHOÁ, URL không đổi', async () => {
    await openApproveWithSlots();
    typeNote('approve', NOTE);
    const heading = await openPanel();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(heading).toHaveFocus();
    expect(approveButton()).toBeDisabled();
    expect(rejectButton()).toBeDisabled();
    expect(screen.getByText(HANDLE_TEXT.panelIntro)).toBeInTheDocument();
    expect(currentUrl()).toBe(PAGE);
  });

  it('WXD-99 ô nào chọn được do MÁY CHỦ quyết: ô đã đặt, đang giữ, hết hạn không bấm được; không liên kết sang luồng đặt lịch', async () => {
    await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          apis.reception.slots.slotsFor = (bacSiId, ngay) =>
            fakeDay(bacSiId, [
              fakeSlot('1', ngay, '08:00'),
              fakeSlot('2', ngay, '08:30', 'DaDat'),
              fakeSlot('3', ngay, '09:00', 'DangGiuCho'),
              fakeSlot('4', ngay, '09:30', 'HetHan'),
            ]);
        },
      },
    );
    await openPanel();
    await slotCell(FIRST_SLOT.cell);
    for (const name of [
      '08:30, đã đặt',
      '09:00, đang giữ chỗ',
      '09:30, hết hạn',
    ]) {
      expect(screen.getByRole('img', { name }).closest('a, button')).toBeNull();
    }
    expect(document.querySelector('a[href^="/dat-lich"]')).toBeNull();
  });

  it('WXD-89 "Quay lại hộp duyệt" khi CHƯA chọn: hộp Duyệt mở lại với ghi chú đang gõ, vẫn khung giờ mong muốn, tiêu điểm vào ô; nút trang dùng lại được sau khi đóng và tiêu điểm về nút "Duyệt"', async () => {
    const { api } = await openApproveWithSlots();
    typeNote('approve', NOTE);
    await openPanel();
    fireEvent.click(backToApproveButton());
    expect(panelHeading()).toBeNull();
    const dialog = dialogOf('approve');
    expect(noteBox('approve').value).toBe(NOTE);
    expect(noteBox('approve')).toHaveFocus();
    expect(dialog).toHaveTextContent(
      `${HANDLE_TEXT.approveSlotLabel}: ${DESIRED_TEXT}`,
    );
    expect(dialog).toHaveTextContent(HANDLE_TEXT.approveIntro);
    fireEvent.click(
      within(dialog).getByRole('button', { name: HANDLE_TEXT.close }),
    );
    expect(approveButton()).toHaveFocus();
    expect(approveButton()).toBeEnabled();
    expect(rejectButton()).toBeEnabled();
    expect(api.writes()).toEqual([]);
  });

  it('WXD-90 chọn ô: bảng đóng, hộp Duyệt mở lại với "Khung giờ mới", câu giải thích mới (không còn nói "khung giờ mong muốn" là đích), ghi chú giữ nguyên, có "Dùng lại khung giờ mong muốn"; chọn ô KHÔNG gọi API ghi', async () => {
    const { api, reception } = await openApproveWithSlots();
    typeNote('approve', NOTE);
    await chooseSlot(SECOND_SLOT.cell);
    expect(panelHeading()).toBeNull();
    const dialog = dialogOf('approve');
    expect(dialog).toHaveTextContent(
      `${HANDLE_TEXT.replacementSlotLabel}: ${SECOND_SLOT.text}`,
    );
    expect(dialog).not.toHaveTextContent(DESIRED_TEXT);
    expect(dialog).toHaveTextContent(HANDLE_TEXT.approveReplacementIntro);
    expect(dialog).not.toHaveTextContent(HANDLE_TEXT.approveIntro);
    expect(noteBox('approve').value).toBe(NOTE);
    expect(useDesiredButton()).toBeEnabled();
    expect(api.writes()).toEqual([]);
    expect(reception.submitCalls).toEqual([]);
  });

  it('WXD-89 đã chọn rồi mở bảng lần nữa và "Quay lại": GIỮ khung giờ đã chọn; mỗi lần bấm nút hỏi preview một lần', async () => {
    const { reception } = await openApproveWithSlots();
    await chooseSlot(FIRST_SLOT.cell);
    await openPanel();
    fireEvent.click(backToApproveButton());
    expect(dialogOf('approve')).toHaveTextContent(
      `${HANDLE_TEXT.replacementSlotLabel}: ${FIRST_SLOT.text}`,
    );
    expect(reception.previewCalls).toHaveLength(2);
  });

  it('WXD-99 hai ô bấm trong CÙNG MỘT lượt xử lý: chỉ nhận ô ĐẦU', async () => {
    await openApproveWithSlots();
    await openPanel();
    const first = await slotCell(FIRST_SLOT.cell);
    const second = await slotCell(SECOND_SLOT.cell);
    act(() => {
      first.click();
      second.click();
    });
    expect(dialogOf('approve')).toHaveTextContent(
      `${HANDLE_TEXT.replacementSlotLabel}: ${FIRST_SLOT.text}`,
    );
  });
});

describe('duyệt bằng khung giờ thay thế', () => {
  it('WXD-07 thân duyệt CÓ `khungGioId` của ô đã chọn (id lớn hơn 2^53 nguyên chuỗi), ghi chú đã cắt; về danh sách kèm "Đã duyệt yêu cầu đổi lịch."', async () => {
    const { api } = await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          apis.reception.slots.slotsFor = (bacSiId, ngay) =>
            fakeDay(bacSiId, [fakeSlot(BIG_ID, ngay, '08:00')]);
        },
      },
    );
    await chooseSlot();
    typeNote('approve', `  ${NOTE}  `);
    fireEvent.click(confirmButton('approve'));
    await screen.findByText(HANDLE_TEXT.doneApproved);
    expect(api.approveCalls).toHaveLength(1);
    expect(api.approveCalls[0].body).toEqual({
      ghiChu: NOTE,
      khungGioId: BIG_ID,
    });
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich');
  });

  it('WXD-91 "Dùng lại khung giờ mong muốn": dòng giờ và câu giải thích trở lại, nút này biến mất, tiêu điểm sang "Chọn khung giờ khác", thân duyệt KHÔNG có khoá `khungGioId`', async () => {
    const { api } = await openApproveWithSlots();
    await chooseSlot();
    fireEvent.click(useDesiredButton());
    const dialog = dialogOf('approve');
    expect(dialog).toHaveTextContent(
      `${HANDLE_TEXT.approveSlotLabel}: ${DESIRED_TEXT}`,
    );
    expect(dialog).toHaveTextContent(HANDLE_TEXT.approveIntro);
    expect(
      within(dialog).queryByRole('button', { name: HANDLE_TEXT.useDesired }),
    ).toBeNull();
    expect(pickButton()).toHaveFocus();
    typeNote('approve', NOTE);
    fireEvent.click(confirmButton('approve'));
    await screen.findByText(HANDLE_TEXT.doneApproved);
    expect(api.approveCalls[0].body).toEqual({ ghiChu: NOTE });
  });

  it('WXD-98 đóng hộp rồi mở lại: khung giờ đã chọn và ghi chú bị BỎ (thân không `khungGioId`)', async () => {
    const { api } = await openApproveWithSlots();
    typeNote('approve', NOTE);
    await chooseSlot();
    fireEvent.click(
      within(dialogOf('approve')).getByRole('button', {
        name: HANDLE_TEXT.close,
      }),
    );
    fireEvent.click(approveButton());
    const dialog = dialogOf('approve');
    expect(noteBox('approve').value).toBe('');
    expect(dialog).toHaveTextContent(
      `${HANDLE_TEXT.approveSlotLabel}: ${DESIRED_TEXT}`,
    );
    typeNote('approve', NOTE);
    fireEvent.click(confirmButton('approve'));
    await screen.findByText(HANDLE_TEXT.doneApproved);
    expect(api.approveCalls[0].body).toEqual({ ghiChu: NOTE });
  });

  it('WXD-98 đã chọn khung giờ, đóng rồi TỪ CHỐI: thân chỉ có `ghiChu`', async () => {
    const { api } = await openApproveWithSlots();
    await chooseSlot();
    fireEvent.click(
      within(dialogOf('approve')).getByRole('button', {
        name: HANDLE_TEXT.close,
      }),
    );
    submitDialog('reject', NOTE);
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(api.rejectCalls[0].body).toEqual({ ghiChu: NOTE });
  });

  it('WXD-90 đang gửi: hai nút khung giờ vô hiệu', async () => {
    let release: () => void = () => undefined;
    await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          apis.api.failNextWrite(
            'approve',
            () =>
              new Promise<Response>((resolve) => {
                release = () => resolve(apiErrorResponse(500, 'LOI_HE_THONG'));
              }),
          );
        },
      },
    );
    await chooseSlot();
    typeNote('approve', NOTE);
    fireEvent.click(confirmButton('approve'));
    expect(pickButton()).toBeDisabled();
    expect(useDesiredButton()).toBeDisabled();
    release();
    await waitFor(() => expect(pickButton()).toBeEnabled());
    expect(useDesiredButton()).toBeEnabled();
  });

  it.each([
    ['KHUNG_GIO_DA_DAT', HANDLE_TEXT.slotGonePick],
    ['KHUNG_GIO_KHAC_BAC_SI', HANDLE_TEXT.otherDoctor],
    ['KHUNG_GIO_TRUNG_LICH_CU', HANDLE_TEXT.sameSlot],
  ])(
    'WXD-95 khung giờ thay thế bị từ chối (409 `%s`): hộp giữ ghi chú và lựa chọn kèm câu riêng; chọn ô khác thì câu lỗi mất và duyệt được',
    async (code, message) => {
      const { api } = await openApproveWithSlots(
        {},
        {
          setup: (apis) => {
            apis.api.replacementError = (id) =>
              id === FIRST_SLOT.id ? code : null;
          },
        },
      );
      await chooseSlot(FIRST_SLOT.cell);
      typeNote('approve', NOTE);
      fireEvent.click(confirmButton('approve'));
      await waitFor(() => expect(lookupAlert()).toHaveTextContent(message));
      expect(noteBox('approve').value).toBe(NOTE);
      expect(dialogOf('approve')).toHaveTextContent(
        `${HANDLE_TEXT.replacementSlotLabel}: ${FIRST_SLOT.text}`,
      );
      expect(api.records[0].detail.trangThai).toBe('ChoDuyet');
      await chooseSlot(SECOND_SLOT.cell);
      expect(within(dialogOf('approve')).queryByRole('alert')).toBeNull();
      fireEvent.click(confirmButton('approve'));
      await screen.findByText(HANDLE_TEXT.doneApproved);
      expect(
        api.approveCalls.map(
          (call) => (call.body as { khungGioId?: string }).khungGioId,
        ),
      ).toEqual([FIRST_SLOT.id, SECOND_SLOT.id]);
    },
  );

  it('WXD-91 sau lỗi khung giờ, "Dùng lại khung giờ mong muốn" cũng bỏ câu lỗi cũ', async () => {
    await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          apis.api.replacementError = () => 'KHUNG_GIO_DA_DAT';
        },
      },
    );
    await chooseSlot();
    typeNote('approve', NOTE);
    fireEvent.click(confirmButton('approve'));
    await waitFor(() =>
      expect(lookupAlert()).toHaveTextContent(HANDLE_TEXT.slotGonePick),
    );
    await waitFor(() => expect(useDesiredButton()).toBeEnabled());
    fireEvent.click(useDesiredButton());
    expect(within(dialogOf('approve')).queryByRole('alert')).toBeNull();
  });

  it('WXD-97 yêu cầu vừa bị người khác xử lý: hộp chỉ còn "Đóng" và KHÔNG còn nút khung giờ', async () => {
    await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          apis.api.onHandle = () => {
            apis.api.records[0].detail = makeHandledDetail('TuChoi', {
              yeuCauId: '101',
            });
          };
        },
      },
    );
    typeNote('approve', NOTE);
    fireEvent.click(confirmButton('approve'));
    await waitFor(() =>
      expect(lookupAlert()).toHaveTextContent(HANDLE_TEXT.alreadyHandled),
    );
    expect(queryPickButton()).toBeNull();
  });
});

describe('không lấy được id bác sĩ (câu cạnh nút, hộp giữ nguyên)', () => {
  it.each([
    [
      '404 cùng thân',
      () => apiErrorResponse(404, 'KHONG_TIM_THAY'),
      HANDLE_TEXT.pickFailed,
    ],
    [
      '500',
      () => apiErrorResponse(500, 'LOI_HE_THONG'),
      HANDLE_TEXT.pickFailed,
    ],
    [
      '200 sai hình dạng',
      () => jsonResponse({ choPhepDoi: true }),
      HANDLE_TEXT.pickFailed,
    ],
    [
      'mạng đứt',
      () => Promise.reject(new TypeError('Failed to fetch')),
      NETWORK_ERROR_MESSAGE,
    ],
    [
      'hết phiên',
      () => apiErrorResponse(401, 'CHUA_DANG_NHAP'),
      COMMON_LIST_TEXT.sessionExpired,
    ],
  ] as const)(
    'WXD-92 %s: câu cạnh nút, KHÔNG mở bảng, hộp và ghi chú giữ nguyên; bấm lại thì thử lại và mở được bảng',
    async (_name, failure, message) => {
      const { reception, api } = await openApproveWithSlots(
        {},
        {
          setup: (apis) => {
            apis.reception.failNext('preview', failure);
          },
        },
      );
      typeNote('approve', NOTE);
      fireEvent.click(pickButton());
      await waitFor(() => expect(lookupAlert()).toHaveTextContent(message));
      expect(panelHeading()).toBeNull();
      expect(noteBox('approve').value).toBe(NOTE);
      expect(confirmButton('approve')).toBeEnabled();
      expect(pickButton()).toBeEnabled();
      expect(pickButton()).not.toHaveAttribute('aria-disabled');
      expect(dialogOf('approve').textContent).not.toMatch(
        /KHONG_TIM_THAY|LOI_HE_THONG|CHUA_DANG_NHAP|Failed to fetch/,
      );
      await openPanel();
      expect(reception.previewCalls).toHaveLength(2);
      expect(api.writes()).toEqual([]);
    },
  );

  it('WXD-92 sau lỗi vẫn đóng hộp rồi TỪ CHỐI được', async () => {
    const { api } = await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          apis.reception.failNext('preview', () =>
            apiErrorResponse(404, 'KHONG_TIM_THAY'),
          );
        },
      },
    );
    fireEvent.click(pickButton());
    await waitFor(() =>
      expect(lookupAlert()).toHaveTextContent(HANDLE_TEXT.pickFailed),
    );
    fireEvent.click(
      within(dialogOf('approve')).getByRole('button', {
        name: HANDLE_TEXT.close,
      }),
    );
    submitDialog('reject', NOTE);
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(api.rejectCalls).toHaveLength(1);
  });
});

describe('huỷ lời hỏi đang chờ', () => {
  it('WXD-94 đóng hộp khi đang chờ: lời gọi bị huỷ, phản hồi muộn KHÔNG mở bảng; mở lại hộp thì nút ở trạng thái thường', async () => {
    let held: ReturnType<typeof holdPreview> | undefined;
    await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          held = holdPreview(apis.reception);
        },
      },
    );
    fireEvent.click(pickButton());
    fireEvent.click(
      within(dialogOf('approve')).getByRole('button', {
        name: HANDLE_TEXT.close,
      }),
    );
    expect(held?.signal?.aborted).toBe(true);
    held?.release();
    await settle();
    expect(panelHeading()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(approveButton());
    expect(pickButton()).toHaveTextContent(HANDLE_TEXT.pickAnother);
    expect(pickButton()).not.toHaveAttribute('aria-disabled');
  });

  it('WXD-94 bấm "Xác nhận duyệt" khi đang chờ: lời hỏi bị huỷ, duyệt khung giờ đang hiện; phản hồi muộn không mở bảng giữa chừng', async () => {
    let held: ReturnType<typeof holdPreview> | undefined;
    let release: () => void = () => undefined;
    const { api } = await openApproveWithSlots(
      {},
      {
        setup: (apis) => {
          held = holdPreview(apis.reception);
          apis.api.failNextWrite(
            'approve',
            () =>
              new Promise<Response>((resolve) => {
                release = () => resolve(apiErrorResponse(500, 'LOI_HE_THONG'));
              }),
          );
        },
      },
    );
    fireEvent.click(pickButton());
    typeNote('approve', NOTE);
    fireEvent.click(confirmButton('approve'));
    expect(held?.signal?.aborted).toBe(true);
    held?.release();
    await settle();
    expect(panelHeading()).toBeNull();
    expect(dialogOf('approve')).toBeInTheDocument();
    release();
    await waitFor(() =>
      expect(lookupAlert()).toHaveTextContent(HANDLE_TEXT.systemError),
    );
    expect(panelHeading()).toBeNull();
    expect(api.writes()).toHaveLength(1);
  });
});

describe('không có nguồn id bác sĩ (F5 chưa có)', () => {
  it('WXD-96 `api` không có `resolveDoctorId` ⇒ hộp Duyệt KHÔNG có nút; lỗi khung giờ dùng câu không hứa chọn khung khác', async () => {
    const { api, reception } = makeSlotApis();
    api.records = [
      fakeRecord(
        makeRequestDetail({ yeuCauId: '101', thoiGianMongMuon: DESIRED }),
      ),
    ];
    api.onHandle = () => {
      const detail = api.records[0].detail;
      api.records[0].detail = {
        ...detail,
        khungGioMongMuon: { ...detail.khungGioMongMuon, trangThai: 'DaDat' },
      };
    };
    installFakeFetch(api.fetch);
    render(
      <MemoryRouter initialEntries={[PAGE]}>
        <RequestDetailPage
          api={{
            list: receptionRequestsApi.list,
            get: receptionRequestsApi.get,
          }}
          handlers={receptionRequestHandlers}
          yeuCauId="101"
          listPath="/le-tan/yeu-cau-doi-lich"
        />
      </MemoryRouter>,
    );
    await screen.findByRole('region', { name: REQUEST_TEXT.summary });
    fireEvent.click(approveButton());
    expect(queryPickButton()).toBeNull();
    typeNote('approve', NOTE);
    fireEvent.click(confirmButton('approve'));
    await waitFor(() =>
      expect(lookupAlert()).toHaveTextContent(HANDLE_TEXT.slotGone),
    );
    expect(reception.previewCalls).toEqual([]);
  });
});

describe('dữ liệu cá nhân', () => {
  it('WXD-99 suốt luồng chọn khung giờ và duyệt: URL không đổi tới khi xong, không localStorage, sessionStorage, không `console`', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (name) => vi.spyOn(console, name),
    );
    await openApproveWithSlots();
    typeNote('approve', NOTE);
    await chooseSlot();
    expect(currentUrl()).toBe(PAGE);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    fireEvent.click(confirmButton('approve'));
    await screen.findByText(HANDLE_TEXT.doneApproved);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
