import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HANDLE_TEXT } from '../../common/reschedule-requests/request-handle-text';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';
import {
  makeHandledDetail,
  makeRequestRows,
} from '../../../testing/reschedule-requests-fixtures';
import {
  approveButton,
  confirmButton,
  DETAIL,
  dialogOf,
  noteBox,
  openPending,
  rejectButton,
  submitDialog,
  typeNote,
  type HandleApi,
} from '../../../testing/reschedule-requests-handle-helpers';
import {
  cleanUpRequestsPage,
  currentUrl,
  rowCodes,
  tabButton,
} from '../../../testing/reschedule-requests-harness';

// reschedule F4 Pha B1: hộp Duyệt và hộp Từ chối của trang chi tiết yêu cầu đổi lịch (WXD-05, 06, 08, 09 theo PLAN reschedule 7.11 và `[đề xuất]` WXD-86…90), với API giả GHI khớp hợp đồng B9 (B9 chưa merge). Lỗi 4xx, 5xx và
// "chưa rõ" ở `request-handle-errors.test.tsx`. Trang THẬT của Lễ tân đi qua `request()` thật nên thân POST đã gửi được khẳng định trực tiếp. Dữ liệu giả.
afterEach(cleanUpRequestsPage);

const LIST = '/le-tan/yeu-cau-doi-lich';
const NOTE = 'Đã liên hệ bệnh nhân, giữ lịch cũ.';

// Giữ phản hồi của MỌI POST tới khi test gọi `release` (xử lý thật vẫn chạy SAU khi nhả); phải gọi TRƯỚC khi dựng trang
function holdWrites(api: HandleApi) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = api.fetch;
  api.fetch = async (input, init) => {
    if (init?.method === 'POST') await gate;
    return original(input, init);
  };
  return () => release();
}

describe('nút Duyệt và Từ chối', () => {
  it('WXD-05 yêu cầu còn chờ và duyệt được: cả hai nút có mặt và bật', async () => {
    await openPending();
    expect(approveButton()).toBeEnabled();
    expect(rejectButton()).toBeEnabled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    'LICH_HEN_KHONG_CHO_DOI',
    'LICH_HEN_DA_QUA_GIO',
    'HO_SO_NGUOI_THAN_DA_NGUNG',
    'CHUOI_DOI_LICH_QUA_DAI',
    'HE_THONG_CHUA_CAU_HINH',
  ])(
    'WXD-05 `coTheDuyet = false` (%s): "Duyệt" vô hiệu kèm câu giải thích, "Từ chối" VẪN dùng được (R6); bấm nút vô hiệu không mở hộp',
    async (code) => {
      const { api } = await openPending({
        coTheDuyet: false,
        lyDoKhongDuyet: code,
        trangThaiLichGoc: 'DaXacNhan',
      });
      expect(approveButton()).toBeDisabled();
      expect(rejectButton()).toBeEnabled();
      expect(screen.getByRole('note')).toHaveTextContent(
        'Bạn vẫn có thể từ chối.',
      );
      fireEvent.click(approveButton());
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(rejectButton());
      expect(dialogOf('reject')).toBeInTheDocument();
      expect(api.writes()).toEqual([]);
    },
  );

  it.each(['DaDuyet', 'TuChoi'] as const)(
    'WXD-05 yêu cầu đã xử lý (%s): KHÔNG có nút nào, không hộp',
    async (status) => {
      await openPending(makeHandledDetail(status));
      expect(
        screen.queryByRole('button', { name: HANDLE_TEXT.approve }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: HANDLE_TEXT.reject }),
      ).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );
});

describe('hộp Từ chối', () => {
  it('WXD-06 mở hộp: hộp modal có tên, dòng giải thích, nhãn "Ghi chú xử lý" bắt buộc, dòng nhắc "Bệnh nhân sẽ đọc ghi chú này" gắn với ô; tiêu điểm vào ô; không có dòng giờ', async () => {
    await openPending();
    fireEvent.click(rejectButton());
    const dialog = dialogOf('reject');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent(HANDLE_TEXT.rejectIntro);
    const field = noteBox('reject');
    expect(field).toHaveAttribute('aria-required', 'true');
    expect(field).toHaveFocus();
    expect(field).toHaveAccessibleDescription(HANDLE_TEXT.noteHint);
    expect(HANDLE_TEXT.noteHint).toContain('Bệnh nhân sẽ đọc ghi chú này');
    expect(HANDLE_TEXT.noteHint).toContain(
      'Không nhập thông tin cá nhân hay mật khẩu',
    );
    expect(
      within(dialog).queryByText(HANDLE_TEXT.approveSlotLabel, {
        exact: false,
      }),
    ).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: HANDLE_TEXT.close }),
    ).toBeEnabled();
  });

  it.each([
    ['rỗng', '', HANDLE_TEXT.noteRequired],
    ['toàn khoảng trắng', '   \n  ', HANDLE_TEXT.noteRequired],
    ['toàn U+00A0', '\u00a0\u00a0', HANDLE_TEXT.noteRequired],
    ['256 đơn vị', 'a'.repeat(256), HANDLE_TEXT.noteTooLong],
    ['128 biểu tượng (256 đơn vị)', '😀'.repeat(128), HANDLE_TEXT.noteTooLong],
    ['có ký tự điều khiển', 'a\u0000b', HANDLE_TEXT.noteControl],
  ])(
    'WXD-06 ghi chú %s ⇒ lỗi cạnh ô, tiêu điểm về ô, KHÔNG gọi API, nút vẫn bật; giữ nguyên chữ đã gõ',
    async (_name, value, message) => {
      const { api } = await openPending();
      fireEvent.click(rejectButton());
      typeNote('reject', value);
      fireEvent.click(confirmButton('reject'));
      expect(within(dialogOf('reject')).getByRole('alert')).toHaveTextContent(
        message,
      );
      expect(noteBox('reject')).toHaveAttribute('aria-invalid', 'true');
      expect(noteBox('reject')).toHaveFocus();
      expect(noteBox('reject').value).toBe(value);
      expect(confirmButton('reject')).toBeEnabled();
      expect(api.writes()).toEqual([]);
    },
  );

  it('WXD-06 ghi chú 1 và 255 đơn vị và 127 biểu tượng qua được kiểm của web (đúng biên); sửa chữ thì lỗi biến mất', async () => {
    const { api } = await openPending();
    fireEvent.click(rejectButton());
    typeNote('reject', '');
    fireEvent.click(confirmButton('reject'));
    expect(within(dialogOf('reject')).getByRole('alert')).toBeInTheDocument();
    typeNote('reject', 'a');
    expect(within(dialogOf('reject')).queryByRole('alert')).toBeNull();
    expect(noteBox('reject')).toHaveAttribute('aria-invalid', 'false');
    typeNote('reject', 'a'.repeat(255));
    fireEvent.click(confirmButton('reject'));
    await waitFor(() => expect(api.rejectCalls).toHaveLength(1));
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect((api.rejectCalls[0].body as { ghiChu: string }).ghiChu).toHaveLength(
      255,
    );
  });

  it('WXD-06 biên: 127 biểu tượng (254 đơn vị) đi lên máy chủ NGUYÊN VẸN', async () => {
    const { api } = await openPending();
    submitDialog('reject', '😀'.repeat(127));
    await waitFor(() => expect(api.rejectCalls).toHaveLength(1));
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(api.rejectCalls[0].body).toEqual({ ghiChu: '😀'.repeat(127) });
  });

  it('WXD-06 thành công: thân CHỈ có `ghiChu` ĐÃ cắt khoảng trắng (không id, không khoá khác); về danh sách kèm thông báo "Đã từ chối yêu cầu đổi lịch."; yêu cầu chuyển sang tab Đã xử lý', async () => {
    const { api } = await openPending();
    submitDialog('reject', `  ${NOTE}  `);
    expect(await screen.findByText(HANDLE_TEXT.doneRejected)).toHaveAttribute(
      'role',
      'status',
    );
    expect(api.rejectCalls).toEqual([
      { yeuCauId: '101', body: { ghiChu: NOTE } },
    ]);
    expect(
      api.requests.filter((request) => request.method === 'POST'),
    ).toHaveLength(1);
    expect(currentUrl()).toBe(LIST);
    expect(
      screen.getByRole('heading', { level: 1, name: REQUEST_TEXT.title }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(REQUEST_TEXT.emptyWaiting),
    ).toBeInTheDocument();
    fireEvent.click(tabButton('Đã xử lý'));
    await waitFor(() => expect(rowCodes()).toEqual(['CLX-20261120-7K3M9']));
  });

  it('WXD-06 xuống dòng trong ghi chú đi lên NGUYÊN (`\\n` được phép), chữ HTML không bị đổi', async () => {
    const { api } = await openPending();
    submitDialog('reject', 'Dòng 1\nDòng 2 <b>x</b> & "y"');
    await waitFor(() => expect(api.rejectCalls).toHaveLength(1));
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(api.rejectCalls[0].body).toEqual({
      ghiChu: 'Dòng 1\nDòng 2 <b>x</b> & "y"',
    });
  });

  it('WXD-06 đóng hộp bằng "Đóng": tiêu điểm về ĐÚNG nút Từ chối đã mở; mở lại thì ô trống (không giữ chữ của lần trước)', async () => {
    const { api } = await openPending();
    fireEvent.click(rejectButton());
    typeNote('reject', 'chữ dở dang');
    fireEvent.click(
      within(dialogOf('reject')).getByRole('button', {
        name: HANDLE_TEXT.close,
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rejectButton()).toHaveFocus();
    fireEvent.click(rejectButton());
    expect(noteBox('reject').value).toBe('');
    expect(api.writes()).toEqual([]);
  });

  it('WXD-06 Esc và bấm lớp phủ đóng hộp; bấm TRONG hộp thì không đóng', async () => {
    await openPending();
    fireEvent.click(rejectButton());
    fireEvent.click(dialogOf('reject'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(rejectButton());
    fireEvent.click(dialogOf('reject').parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('hộp Duyệt', () => {
  it('WXD-07 mở hộp: dòng giải thích, giờ MONG MUỐN theo giờ Việt Nam, ô ghi chú bắt buộc kèm dòng nhắc; chưa có nút "Chọn khung giờ khác" (B2)', async () => {
    await openPending({ thoiGianMongMuon: '2026-11-27T03:30:00.000Z' });
    fireEvent.click(approveButton());
    const dialog = dialogOf('approve');
    expect(dialog).toHaveTextContent(HANDLE_TEXT.approveIntro);
    expect(dialog).toHaveTextContent(
      `${HANDLE_TEXT.approveSlotLabel}: Thứ 6, 27/11/2026, 10:30`,
    );
    expect(noteBox('approve')).toHaveFocus();
    expect(noteBox('approve')).toHaveAccessibleDescription(
      HANDLE_TEXT.noteHint,
    );
    expect(
      within(dialog).queryByRole('button', { name: /Chọn khung giờ khác/ }),
    ).toBeNull();
  });

  it('WXD-07 duyệt đúng khung giờ mong muốn: thân CHỈ có `ghiChu` (KHÔNG khoá `khungGioId`, kể cả `null`); về danh sách kèm "Đã duyệt yêu cầu đổi lịch."', async () => {
    const { api } = await openPending();
    submitDialog('approve', NOTE);
    expect(await screen.findByText(HANDLE_TEXT.doneApproved)).toHaveAttribute(
      'role',
      'status',
    );
    expect(api.approveCalls).toHaveLength(1);
    const body = api.approveCalls[0].body as Record<string, unknown>;
    expect(body).toEqual({ ghiChu: NOTE });
    expect(Object.keys(body)).toEqual(['ghiChu']);
    expect(api.rejectCalls).toHaveLength(0);
    expect(currentUrl()).toBe(LIST);
  });

  it('WXD-07 ghi chú bắt buộc ở hộp Duyệt cũng chặn trước khi gọi API', async () => {
    const { api } = await openPending();
    fireEvent.click(approveButton());
    fireEvent.click(confirmButton('approve'));
    expect(within(dialogOf('approve')).getByRole('alert')).toHaveTextContent(
      HANDLE_TEXT.noteRequired,
    );
    expect(api.writes()).toEqual([]);
  });
});

describe('quay về danh sách đã mở', () => {
  it('WXD-09 vào chi tiết từ danh sách đã lọc rồi duyệt xong: về ĐÚNG danh sách đó (tab, bác sĩ), kèm thông báo', async () => {
    await openPending(
      {},
      {
        entry: {
          pathname: `${DETAIL}/101`,
          state: { listSearch: '?bacSiId=5&x=1&page=0' },
        },
      },
    );
    submitDialog('approve', NOTE);
    expect(await screen.findByText(HANDLE_TEXT.doneApproved)).toHaveAttribute(
      'role',
      'status',
    );
    expect(currentUrl()).toBe(`${LIST}?bacSiId=5`);
  });
});

describe('gửi một lần và khoá khi đang gửi', () => {
  it('WXD-09 bấm đúp "Xác nhận" (hai cú bấm trong cùng một nhịp) ⇒ MỘT POST; đang gửi: nút đổi chữ và vô hiệu, "Đóng" vô hiệu, ô chỉ đọc, Esc và lớp phủ không đóng, liên kết quay lại bị khoá, hai nút của trang vô hiệu', async () => {
    let release: () => void = () => undefined;
    const { api } = await openPending(
      {},
      {
        setup: (fake) => {
          release = holdWrites(fake);
        },
      },
    );
    fireEvent.click(approveButton());
    typeNote('approve', NOTE);
    const confirm = confirmButton('approve');
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    const dialog = dialogOf('approve');
    // Đang gửi: nút xác nhận đổi chữ (tên truy cập đổi theo) và vô hiệu
    expect(
      await within(dialog).findByRole('button', {
        name: HANDLE_TEXT.approving,
      }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: HANDLE_TEXT.close }),
    ).toBeDisabled();
    expect(noteBox('approve')).toHaveAttribute('readonly');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.parentElement!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const back = screen.getByRole('link', { name: REQUEST_TEXT.back });
    expect(back).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(back);
    expect(currentUrl()).toBe(`${DETAIL}/101`);
    expect(approveButton()).toBeDisabled();
    expect(rejectButton()).toBeDisabled();

    release();
    expect(await screen.findByText(HANDLE_TEXT.doneApproved)).toHaveAttribute(
      'role',
      'status',
    );
    expect(api.approveCalls).toHaveLength(1);
    expect(
      api.requests.filter((request) => request.method === 'POST'),
    ).toHaveLength(1);
  });

  it('WXD-09 hai cú bấm trong CÙNG MỘT lượt xử lý (React chưa kịp vẽ lại nên nút chưa vô hiệu) ⇒ vẫn MỘT POST: chứng minh CHỐT `useRef` chứ không chỉ nút vô hiệu', async () => {
    const { api } = await openPending();
    fireEvent.click(rejectButton());
    typeNote('reject', NOTE);
    const confirm = confirmButton('reject');
    act(() => {
      confirm.click();
      confirm.click();
    });
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(api.rejectCalls).toHaveLength(1);
    expect(
      api.requests.filter((request) => request.method === 'POST'),
    ).toHaveLength(1);
  });

  it('WXD-09 bấm đúp "Xác nhận từ chối" cũng chỉ MỘT POST', async () => {
    let release: () => void = () => undefined;
    const { api } = await openPending(
      {},
      {
        setup: (fake) => {
          release = holdWrites(fake);
        },
      },
    );
    fireEvent.click(rejectButton());
    typeNote('reject', NOTE);
    const confirm = confirmButton('reject');
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    release();
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(api.rejectCalls).toHaveLength(1);
  });
});

describe('dữ liệu cá nhân', () => {
  it('WXD-10 suốt luồng nhập và gửi ghi chú: không localStorage, sessionStorage, cookie, không console; URL không chứa ghi chú', async () => {
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    localStorage.clear();
    sessionStorage.clear();
    await openPending();
    submitDialog('reject', 'Ghi chú riêng tư của lễ tân 0901234567');
    await screen.findByText(HANDLE_TEXT.doneRejected);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(currentUrl()).not.toMatch(/riêng|0901234567|%/);
    expect(document.body.textContent).not.toContain('0901234567');
    consoleSpies.forEach((spy) => spy.mockRestore());
  });

  it('WXD-10 danh sách sau khi xử lý không còn dòng vừa xử lý ở tab Chờ duyệt dù còn yêu cầu khác', async () => {
    const { api } = await openPending();
    api.records.push(
      ...makeRequestRows(2, { trangThai: 'ChoDuyet' }).map((row, index) => ({
        detail: {
          ...api.records[0].detail,
          ...row,
          yeuCauId: String(200 + index),
          maLichHen: `CLX-20261121-AAAA${index}`,
        },
        bacSiId: '5',
      })),
    );
    submitDialog('reject', NOTE);
    await screen.findByText(HANDLE_TEXT.doneRejected);
    await waitFor(() => expect(rowCodes()).toHaveLength(2));
    expect(rowCodes()).not.toContain('CLX-20261120-7K3M9');
  });
});
