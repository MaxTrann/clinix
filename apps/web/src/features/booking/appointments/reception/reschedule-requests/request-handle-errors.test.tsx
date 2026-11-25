import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../../../../../shared/api/error-message';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../../testing/fake-appointment-list-api';
import { makeHandledDetail } from '../../../testing/reschedule-requests-fixtures';
import {
  approveButton,
  confirmButton,
  dialogOf,
  noteBox,
  openPending,
  rejectButton,
  submitDialog,
  typeNote,
} from '../../../testing/reschedule-requests-handle-helpers';
import {
  cleanUpRequestsPage,
  currentUrl,
} from '../../../testing/reschedule-requests-harness';
import { BUSY_MESSAGE } from '../../common/failure-text';
import { COMMON_LIST_TEXT } from '../../common/list-text';
import { HANDLE_TEXT } from '../../common/reschedule-requests/request-handle-text';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';

// reschedule F4 Pha B1: lỗi khi Duyệt hay Từ chối (WXD-08 theo PLAN reschedule 7.11 và `[đề xuất]` WXD-91…99): từ chối có kiểu của B9 ⇒ 409 và yêu cầu VẪN `ChoDuyet` (GIỮ hộp và chữ), đã xử lý, không có, lịch không còn
// duyệt được, khung giờ vừa bị chiếm, 500, 503, 400 ở ghi chú, 401, 403, mã lạ, và "chưa rõ" (mạng, 200 sai hình dạng: máy chủ CÓ THỂ đã ghi, KHÔNG tự gửi lại). Đua dựng bằng `onHandle` (đổi kho TRƯỚC khi POST được
// xử lý). Câu chọn theo `maLoi`, không theo `thongBao` hay mã HTTP. Dữ liệu giả.
afterEach(cleanUpRequestsPage);

const NOTE = 'Đã liên hệ bệnh nhân, giữ lịch cũ.';
const posts = (api: { requests: { method: string }[] }) =>
  api.requests.filter((request) => request.method === 'POST');
const dialogAlert = (target: 'approve' | 'reject') =>
  within(dialogOf(target)).getByRole('alert');

describe('yêu cầu đã xử lý hay không còn', () => {
  it('WXD-08 người khác vừa xử lý (409 `YEU_CAU_DA_XU_LY`): hộp chỉ còn "Đóng" (không nút xác nhận) kèm câu; chi tiết TỰ tải lại ra "Kết quả xử lý" và hết nút; đóng hộp thì tiêu điểm về h1 (nút đã mất); một POST', async () => {
    const { api } = await openPending(
      {},
      {
        setup: (fake) => {
          fake.onHandle = () => {
            fake.records[0].detail = makeHandledDetail('TuChoi', {
              yeuCauId: '101',
            });
          };
        },
      },
    );
    submitDialog('approve', NOTE);
    await waitFor(() =>
      expect(dialogAlert('approve')).toHaveTextContent(
        HANDLE_TEXT.alreadyHandled,
      ),
    );
    expect(
      screen.queryByRole('button', { name: HANDLE_TEXT.approveConfirm }),
    ).toBeNull();
    const close = within(dialogOf('approve')).getByRole('button', {
      name: HANDLE_TEXT.close,
    });
    expect(close).toBeEnabled();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: REQUEST_TEXT.sections.result }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: HANDLE_TEXT.reject }),
    ).toBeNull();
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: REQUEST_TEXT.detailTitle }),
    ).toHaveFocus();
    expect(posts(api)).toHaveLength(1);
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich/101');
  });

  it('WXD-08 yêu cầu biến mất (404 `YEU_CAU_DOI_LICH_KHONG_TON_TAI` của POST): hộp "Không tìm thấy yêu cầu." chỉ còn "Đóng"; chi tiết tải lại ra thẻ 404 chung (KHÔNG "Thử lại")', async () => {
    await openPending(
      {},
      {
        setup: (fake) => {
          fake.onHandle = () => {
            fake.records = [];
          };
        },
      },
    );
    submitDialog('reject', NOTE);
    await waitFor(() =>
      expect(dialogAlert('reject')).toHaveTextContent(HANDLE_TEXT.notFound),
    );
    expect(
      screen.queryByRole('button', { name: HANDLE_TEXT.rejectConfirm }),
    ).toBeNull();
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: REQUEST_TEXT.summary }),
    ).toBeNull();
  });

  it('WXD-08 từ chối ở yêu cầu đã xử lý sẵn (người khác xử lý): cũng "đã được xử lý", không ghi gì thêm', async () => {
    const { api } = await openPending(
      {},
      {
        setup: (fake) => {
          fake.onHandle = () => {
            fake.records[0].detail = makeHandledDetail('DaDuyet', {
              yeuCauId: '101',
            });
          };
        },
      },
    );
    submitDialog('reject', NOTE);
    await waitFor(() =>
      expect(dialogAlert('reject')).toHaveTextContent(
        HANDLE_TEXT.alreadyHandled,
      ),
    );
    expect(api.records[0].detail.trangThai).toBe('DaDuyet');
    expect(api.records[0].detail.ghiChuXuLy).not.toBe(NOTE);
  });
});

describe('từ chối có kiểu (409, yêu cầu VẪN ChoDuyet): giữ hộp', () => {
  it.each([
    ['DaDat', 'KHUNG_GIO_DA_DAT', 'đã có người đặt'],
    ['DangGiuCho', 'KHUNG_GIO_DANG_GIU', 'đang được giữ chỗ cho người khác'],
    ['HetHan', 'KHUNG_GIO_DA_QUA', 'đã qua'],
  ] as const)(
    'WXD-08 khung giờ mong muốn vừa thành `%s` (409 `%s`): hộp VẪN MỞ kèm câu "không còn trống, bạn có thể từ chối", GIỮ chữ ghi chú, nút xác nhận bật lại; chi tiết tải lại ra trạng thái khung giờ mới; yêu cầu còn chờ',
    async (state, _code, phrase) => {
      const { api } = await openPending(
        {},
        {
          setup: (fake) => {
            fake.onHandle = () => {
              const detail = fake.records[0].detail;
              fake.records[0].detail = {
                ...detail,
                khungGioMongMuon: {
                  ...detail.khungGioMongMuon,
                  trangThai: state,
                },
              };
            };
          },
        },
      );
      submitDialog('approve', NOTE);
      await waitFor(() =>
        expect(dialogAlert('approve')).toHaveTextContent(HANDLE_TEXT.slotGone),
      );
      // chưa có nút "Chọn khung giờ khác" (B2) nên câu KHÔNG hứa việc đó
      expect(dialogAlert('approve')).not.toHaveTextContent(
        'chọn khung giờ khác',
      );
      expect(noteBox('approve').value).toBe(NOTE);
      expect(confirmButton('approve')).toBeEnabled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen
            .getByRole('heading', { name: REQUEST_TEXT.sections.desired })
            .closest('section'),
        ).toHaveTextContent(phrase),
      );
      expect(api.records[0].detail.trangThai).toBe('ChoDuyet');
      expect(api.records[0].detail.ghiChuXuLy).toBeNull();
    },
  );

  it('WXD-08 sau khi khung giờ bị chiếm, đóng hộp Duyệt rồi TỪ CHỐI được (yêu cầu vẫn còn chờ): thân đúng, về danh sách kèm thông báo', async () => {
    const { api } = await openPending(
      {},
      {
        setup: (fake) => {
          fake.onHandle = (route) => {
            if (route !== 'approve') return;
            const detail = fake.records[0].detail;
            fake.records[0].detail = {
              ...detail,
              khungGioMongMuon: {
                ...detail.khungGioMongMuon,
                trangThai: 'DaDat',
              },
            };
          };
        },
      },
    );
    submitDialog('approve', NOTE);
    await waitFor(() =>
      expect(dialogAlert('approve')).toHaveTextContent(HANDLE_TEXT.slotGone),
    );
    fireEvent.click(
      within(dialogOf('approve')).getByRole('button', {
        name: HANDLE_TEXT.close,
      }),
    );
    await waitFor(() => expect(approveButton()).toBeEnabled());
    submitDialog('reject', 'Khung giờ đã có người đặt.');
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(api.rejectCalls[0].body).toEqual({
      ghiChu: 'Khung giờ đã có người đặt.',
    });
  });

  it('WXD-08 lịch gốc vừa hết duyệt được (409 `LICH_HEN_DA_QUA_GIO`): hộp chỉ còn "Đóng"; chi tiết tải lại ra câu "không thể duyệt", "Duyệt" vô hiệu, "Từ chối" VẪN dùng được và từ chối được', async () => {
    const { api } = await openPending(
      {},
      {
        setup: (fake) => {
          fake.onHandle = (route) => {
            if (route !== 'approve') return;
            fake.records[0].detail = {
              ...fake.records[0].detail,
              coTheDuyet: false,
              lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
            };
          };
        },
      },
    );
    submitDialog('approve', NOTE);
    await waitFor(() =>
      expect(dialogAlert('approve')).toHaveTextContent(
        'Bạn vẫn có thể từ chối.',
      ),
    );
    expect(
      screen.queryByRole('button', { name: HANDLE_TEXT.approveConfirm }),
    ).toBeNull();
    fireEvent.click(
      within(dialogOf('approve')).getByRole('button', {
        name: HANDLE_TEXT.close,
      }),
    );
    await waitFor(() => expect(approveButton()).toBeDisabled());
    expect(screen.getByRole('note')).toHaveTextContent(
      'quá giờ cho phép đổi lịch',
    );
    expect(rejectButton()).toBeEnabled();
    submitDialog('reject', 'Đã quá giờ.');
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(api.rejectCalls).toHaveLength(1);
  });
});

describe('lỗi hệ thống', () => {
  it('WXD-08 500 `LOI_HE_THONG`: câu "Không thực hiện được, vui lòng thử lại.", GIỮ hộp và chữ, nút xác nhận bật; bấm lại thì thành công (hai POST, lần đầu không ghi gì)', async () => {
    const { api } = await openPending(
      {},
      {
        setup: (fake) =>
          fake.failNextWrite('reject', () =>
            apiErrorResponse(500, 'LOI_HE_THONG'),
          ),
      },
    );
    submitDialog('reject', NOTE);
    await waitFor(() =>
      expect(dialogAlert('reject')).toHaveTextContent(HANDLE_TEXT.systemError),
    );
    expect(noteBox('reject').value).toBe(NOTE);
    expect(confirmButton('reject')).toBeEnabled();
    expect(api.records[0].detail.trangThai).toBe('ChoDuyet');
    fireEvent.click(confirmButton('reject'));
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(posts(api)).toHaveLength(2);
    expect(api.rejectCalls).toHaveLength(1);
  });

  it('WXD-08 503 `HE_THONG_DANG_BAN`: câu bận có sẵn, bấm lại được', async () => {
    await openPending(
      {},
      {
        setup: (fake) =>
          fake.failNextWrite('approve', () =>
            apiErrorResponse(503, 'HE_THONG_DANG_BAN'),
          ),
      },
    );
    submitDialog('approve', NOTE);
    await waitFor(() =>
      expect(dialogAlert('approve')).toHaveTextContent(BUSY_MESSAGE),
    );
    expect(confirmButton('approve')).toBeEnabled();
  });

  it.each([400, 404, 409, 500, 502])(
    'WXD-08 HTTP %i với `maLoi` lạ ⇒ câu chung, bấm lại được; KHÔNG in `thongBao` của máy chủ (chọn theo `maLoi`, không theo mã HTTP)',
    async (status) => {
      await openPending(
        {},
        {
          setup: (fake) =>
            fake.failNextWrite('approve', () =>
              apiErrorResponse(status, 'MA_LOI_LA'),
            ),
        },
      );
      submitDialog('approve', NOTE);
      await waitFor(() =>
        expect(dialogAlert('approve')).toHaveTextContent(GENERIC_ERROR_MESSAGE),
      );
      expect(screen.queryByText('Lỗi giả của test')).toBeNull();
      expect(confirmButton('approve')).toBeEnabled();
    },
  );

  it('WXD-08 401 `CHUA_DANG_NHAP` ⇒ câu phiên hết hạn; 403 `KHONG_DU_QUYEN` ⇒ câu không đủ quyền; cả hai chỉ còn "Đóng"', async () => {
    for (const [status, code, text] of [
      [401, 'CHUA_DANG_NHAP', COMMON_LIST_TEXT.sessionExpired],
      [403, 'KHONG_DU_QUYEN', 'Bạn không có quyền thực hiện thao tác này.'],
    ] as const) {
      const view = await openPending(
        {},
        {
          setup: (fake) =>
            fake.failNextWrite('reject', () => apiErrorResponse(status, code)),
        },
      );
      submitDialog('reject', NOTE);
      await waitFor(() =>
        expect(dialogAlert('reject')).toHaveTextContent(text),
      );
      expect(
        screen.queryByRole('button', { name: HANDLE_TEXT.rejectConfirm }),
      ).toBeNull();
      view.unmount();
      cleanUpRequestsPage();
    }
  });
});

describe('máy chủ từ chối ghi chú (400 ở trường ghiChu)', () => {
  it('WXD-06 chữ giống bí mật mà web không đoán được: lỗi CẠNH Ô (không khối lỗi chung), tiêu điểm về ô, GIỮ nguyên chữ, nút bật; sửa chữ rồi gửi lại thì thành công', async () => {
    const { api } = await openPending();
    const secretLike = `${'pass'}${'word=1'} của bệnh nhân`;
    fireEvent.click(rejectButton());
    typeNote('reject', secretLike);
    // Tiêu điểm đang Ở NÚT xác nhận (như người dùng thật vừa bấm): sau lỗi phải TỰ về ô ghi chú
    confirmButton('reject').focus();
    expect(confirmButton('reject')).toHaveFocus();
    fireEvent.click(confirmButton('reject'));
    await waitFor(() =>
      expect(within(dialogOf('reject')).getByRole('alert')).toHaveTextContent(
        HANDLE_TEXT.noteInvalid,
      ),
    );
    expect(within(dialogOf('reject')).getAllByRole('alert')).toHaveLength(1);
    expect(noteBox('reject')).toHaveFocus();
    expect(noteBox('reject').value).toBe(secretLike);
    expect(noteBox('reject')).toHaveAttribute('aria-invalid', 'true');
    expect(confirmButton('reject')).toBeEnabled();
    expect(api.records[0].detail.trangThai).toBe('ChoDuyet');

    typeNote('reject', 'Đã liên hệ bệnh nhân.');
    fireEvent.click(confirmButton('reject'));
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(posts(api)).toHaveLength(2);
  });

  it('WXD-06 400 ở TRƯỜNG khác (khoá lạ) ⇒ câu chung ở khung lỗi, KHÔNG gắn vào ô ghi chú', async () => {
    await openPending(
      {},
      {
        setup: (fake) =>
          fake.failNextWrite('approve', () =>
            apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
              { truong: 'khungGioId', ma: 'IS_BIGINT_ID' },
            ]),
          ),
      },
    );
    submitDialog('approve', NOTE);
    await waitFor(() =>
      expect(dialogAlert('approve')).toHaveTextContent(GENERIC_ERROR_MESSAGE),
    );
    expect(noteBox('approve')).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('kết quả chưa rõ: KHÔNG tự gửi lại', () => {
  it('WXD-08 mạng đứt SAU khi máy chủ đã ghi: hộp giữ lại kèm "Chưa rõ…" và nút "Tải lại chi tiết"; đúng MỘT POST dù chờ; "Tải lại chi tiết" đóng hộp và chi tiết ra kết quả thật (đã duyệt)', async () => {
    const { api } = await openPending(
      {},
      {
        setup: (fake) =>
          fake.failNextWrite('approve', () => {
            fake.records[0].detail = makeHandledDetail('DaDuyet', {
              yeuCauId: '101',
            });
            throw new TypeError('Failed to fetch');
          }),
      },
    );
    submitDialog('approve', NOTE);
    await waitFor(() =>
      expect(dialogAlert('approve')).toHaveTextContent('Chưa rõ'),
    );
    expect(posts(api)).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(posts(api)).toHaveLength(1);
    expect(noteBox('approve').value).toBe(NOTE);

    fireEvent.click(
      within(dialogOf('approve')).getByRole('button', {
        name: 'Tải lại chi tiết',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: REQUEST_TEXT.sections.result }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('region', { name: REQUEST_TEXT.summary }),
    ).toHaveTextContent('Đã duyệt');
    expect(posts(api)).toHaveLength(1);
  });

  it.each([
    [
      '200 thiếu khoá',
      () => jsonResponse({ yeuCau: { trangThai: 'DaDuyet' } }),
    ],
    [
      '200 trạng thái ngược (duyệt trả TuChoi)',
      () =>
        jsonResponse({
          yeuCau: { trangThai: 'TuChoi' },
          thoiGianMayChu: '2026-11-25T03:00:00.000Z',
        }),
    ],
    [
      '502 HTML',
      () => new Response('<html>bad gateway</html>', { status: 502 }),
    ],
  ])(
    'WXD-08 %s ⇒ "chưa rõ" (máy chủ có thể đã ghi), một POST, không tự gửi lại',
    async (_name, make) => {
      const { api } = await openPending(
        {},
        { setup: (fake) => fake.failNextWrite('approve', make) },
      );
      submitDialog('approve', NOTE);
      await waitFor(() =>
        expect(dialogAlert('approve')).toHaveTextContent('Chưa rõ'),
      );
      expect(
        within(dialogOf('approve')).getByRole('button', {
          name: 'Tải lại chi tiết',
        }),
      ).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(posts(api)).toHaveLength(1);
    },
  );

  it('WXD-08 sau "chưa rõ", người dùng CHỦ ĐỘNG bấm lại: nếu lần trước đã ghi thì ra 409 "đã được xử lý" (không bao giờ ghi hai lần)', async () => {
    const { api } = await openPending(
      {},
      {
        setup: (fake) =>
          fake.failNextWrite('reject', () => {
            fake.records[0].detail = makeHandledDetail('TuChoi', {
              yeuCauId: '101',
            });
            throw new TypeError('Failed to fetch');
          }),
      },
    );
    submitDialog('reject', NOTE);
    await waitFor(() =>
      expect(dialogAlert('reject')).toHaveTextContent('Chưa rõ'),
    );
    fireEvent.click(confirmButton('reject'));
    await waitFor(() =>
      expect(dialogAlert('reject')).toHaveTextContent(
        HANDLE_TEXT.alreadyHandled,
      ),
    );
    expect(posts(api)).toHaveLength(2);
    // Lần bấm lại bị từ chối (409), không ghi đè kết quả của lần trước
    expect(api.records[0].detail.ghiChuXuLy).not.toBe(NOTE);
    expect(api.records[0].detail.trangThai).toBe('TuChoi');
  });
});
