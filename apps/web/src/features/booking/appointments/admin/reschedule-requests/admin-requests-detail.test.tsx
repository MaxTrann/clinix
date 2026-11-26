import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BRANCH_SCOPE,
  cleanUpAdminRequests,
  CODE_A,
  CODE_B,
  renderAdminRequests,
  type AdminRequestsHarnessOptions,
} from '../../../../../router/admin-reschedule-requests-harness';
import {
  ADMIN_RESCHEDULE_REQUESTS_PATH,
  adminRescheduleRequestDetailPath,
} from '../../../../../shared/routes/booking-paths';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
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
  detailLink,
  loaded,
  rowCodes,
} from '../../../testing/reschedule-requests-harness';
import { HANDLE_TEXT } from '../../common/reschedule-requests/request-handle-text';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';

// reschedule F5: trang chi tiết MỘT yêu cầu đổi lịch của Quản trị viên và việc Duyệt, Từ chối qua API Admin (WXD-119…WXD-128 `[đề xuất]`). Thành phần, câu lỗi và chốt chống gửi đúp là của F4 (đã có ca riêng);
// ở đây khoá phần dây nối của Admin: đúng đường dẫn `admin/…`, đúng trang quay về, không có "Chọn khung giờ khác". Router thật, API giả khớp B8, B9; dữ liệu giả.
afterEach(cleanUpAdminRequests);

const NOTE = 'Đã liên hệ bệnh nhân.';
const API_101 = '/admin/reschedule-requests/101';

// Mở thẳng trang chi tiết của yêu cầu 101 (chi nhánh 3) và chờ thẻ tóm tắt hiện
async function openDetail(options: AdminRequestsHarnessOptions = {}) {
  const view = renderAdminRequests(
    adminRescheduleRequestDetailPath('101'),
    options,
  );
  await screen.findByRole('region', { name: REQUEST_TEXT.summary });
  return view;
}

const detailHeading = () =>
  screen.getByRole('heading', { level: 1, name: REQUEST_TEXT.detailTitle });

describe('trang chi tiết', () => {
  it('WXD-119 tải qua `/admin/reschedule-requests/:id` (không tham số), đủ các thẻ; "Quay lại danh sách" về tab đổi lịch, không về tab nghỉ phép', async () => {
    const { api, router } = await openDetail();
    expect(detailHeading()).toBeVisible();
    const { sections } = REQUEST_TEXT;
    for (const name of [
      sections.appointment,
      sections.request,
      sections.desired,
      sections.decision,
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText(CODE_A)).toBeInTheDocument();
    expect(screen.getByText('CLINIX Chi nhánh Quận 3')).toBeInTheDocument();
    expect(api.requestCalls()).toEqual([
      { method: 'GET', path: API_101, query: {}, hasToken: true },
    ]);

    const back = screen.getByRole('link', { name: REQUEST_TEXT.back });
    expect(back).toHaveAttribute('href', ADMIN_RESCHEDULE_REQUESTS_PATH);
    fireEvent.click(back);
    await loaded();
    expect(router.state.location.pathname).toBe(ADMIN_RESCHEDULE_REQUESTS_PATH);
  });

  it.each([
    ['không có', '999', undefined],
    ['của chi nhánh khác', '102', BRANCH_SCOPE],
  ])(
    'WXD-120 yêu cầu %s: cùng một câu "Không tìm thấy yêu cầu.", không lộ nội dung',
    async (_name, id, scope) => {
      const { api } = renderAdminRequests(
        adminRescheduleRequestDetailPath(id),
        { scope },
      );
      expect(
        await screen.findByText(REQUEST_TEXT.notFound),
      ).toBeInTheDocument();
      expect(screen.queryByText(CODE_B)).not.toBeInTheDocument();
      expect(api.requestCalls().map((call) => call.path)).toEqual([
        `/admin/reschedule-requests/${id}`,
      ]);
    },
  );

  it.each(['abc', '0', '012', '1.5'])(
    'WXD-120 id sai dạng "%s": cùng câu "không tìm thấy" và KHÔNG gọi API',
    async (id) => {
      const { api } = renderAdminRequests(
        `${ADMIN_RESCHEDULE_REQUESTS_PATH}/${id}`,
      );
      expect(
        await screen.findByText(REQUEST_TEXT.notFound),
      ).toBeInTheDocument();
      expect(detailHeading()).toBeVisible();
      expect(api.requestCalls()).toEqual([]);
    },
  );

  it.each([
    [403, 'KHONG_DU_QUYEN', REQUEST_TEXT.forbiddenDetail],
    [401, 'CHUA_DANG_NHAP', REQUEST_TEXT.sessionExpired],
  ])(
    'WXD-121 lỗi %i: câu riêng theo mã, không in chữ của máy chủ',
    async (status, maLoi, message) => {
      renderAdminRequests(adminRescheduleRequestDetailPath('101'), {
        before: (fake) =>
          fake.inner.failNext('detail', () =>
            jsonResponse({ maLoi, thongBao: 'CHỮ CỦA MÁY CHỦ' }, status),
          ),
      });
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText('CHỮ CỦA MÁY CHỦ')).not.toBeInTheDocument();
    },
  );

  it('WXD-128 chuyển sang yêu cầu khác (cùng trang) thì dựng lại: nội dung và hộp của yêu cầu cũ không còn', async () => {
    const { router } = await openDetail();
    fireEvent.click(rejectButton());
    typeNote('reject', NOTE);
    await act(() => router.navigate(adminRescheduleRequestDetailPath('102')));
    expect(await screen.findByText(CODE_B)).toBeInTheDocument();
    expect(screen.queryByText(CODE_A)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('duyệt và từ chối qua API Admin', () => {
  it('WXD-122 duyệt: ghi chú bắt buộc; `POST …/admin/…/approve` thân `{ ghiChu }`; về danh sách Admin kèm thông báo MỘT lần; yêu cầu rời tab Chờ duyệt', async () => {
    const { api, router } = renderAdminRequests();
    await loaded();
    fireEvent.click(detailLink(CODE_A));
    await screen.findByRole('region', { name: REQUEST_TEXT.summary });

    fireEvent.click(approveButton());
    fireEvent.click(confirmButton('approve'));
    expect(within(dialogOf('approve')).getByRole('alert')).toHaveTextContent(
      HANDLE_TEXT.noteRequired,
    );
    expect(api.writes()).toEqual([]);

    typeNote('approve', `  ${NOTE}  `);
    fireEvent.click(confirmButton('approve'));
    expect(await screen.findByText(HANDLE_TEXT.doneApproved)).toHaveAttribute(
      'role',
      'status',
    );
    await waitFor(() => expect(rowCodes()).toEqual([CODE_B]));
    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: `${API_101}/approve`,
        query: {},
        hasToken: true,
        body: { ghiChu: NOTE },
      },
    ]);
    expect(router.state.location.pathname).toBe(ADMIN_RESCHEDULE_REQUESTS_PATH);
    // thông báo chỉ một lần: `state` đã được xoá khỏi lịch sử
    await waitFor(() => expect(router.state.location.state).toBeNull());
  });

  it('WXD-123 từ chối được cả khi lịch gốc không còn duyệt được (nút "Duyệt" vô hiệu): `POST …/reject`', async () => {
    const { api } = await openDetail({
      before: (fake) => {
        fake.records[0].detail = {
          ...fake.records[0].detail,
          coTheDuyet: false,
          lyDoKhongDuyet: 'LICH_HEN_KHONG_CHO_DOI',
        };
      },
    });
    expect(approveButton()).toBeDisabled();
    submitDialog('reject', NOTE);
    expect(
      await screen.findByText(HANDLE_TEXT.doneRejected),
    ).toBeInTheDocument();
    await loaded();
    expect(api.writes()).toEqual([
      expect.objectContaining({
        path: `${API_101}/reject`,
        body: { ghiChu: NOTE },
      }),
    ]);
  });

  it.each(['approve', 'reject'] as const)(
    'WXD-124 hai cú bấm xác nhận (%s) trong CÙNG MỘT lượt xử lý ⇒ đúng MỘT POST tới `/admin/…`',
    async (target) => {
      const { api } = await openDetail();
      fireEvent.click(target === 'approve' ? approveButton() : rejectButton());
      typeNote(target, NOTE);
      const confirm = confirmButton(target);
      act(() => {
        confirm.click();
        confirm.click();
      });
      await screen.findByText(
        target === 'approve'
          ? HANDLE_TEXT.doneApproved
          : HANDLE_TEXT.doneRejected,
      );
      await loaded();
      expect(api.writes().map((call) => call.path)).toEqual([
        `${API_101}/${target}`,
      ]);
    },
  );

  it('WXD-125 người khác vừa xử lý (409): câu theo mã, tải lại chi tiết, không còn nút', async () => {
    const { api } = await openDetail();
    api.inner.onHandle = () => {
      api.records[0].detail = {
        ...api.records[0].detail,
        trangThai: 'TuChoi',
        coTheDuyet: false,
        lyDoKhongDuyet: 'YEU_CAU_DA_XU_LY',
        ghiChuXuLy: 'Người khác đã xử lý.',
        thoiDiemXuLy: api.inner.serverTime,
        nguoiXuLy: { hoTen: 'Người khác' },
      };
    };
    submitDialog('approve', NOTE);
    expect(
      await within(dialogOf('approve')).findByText(HANDLE_TEXT.alreadyHandled),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.callsTo(API_101)).toHaveLength(2));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: HANDLE_TEXT.reject }),
      ).not.toBeInTheDocument(),
    );
  });

  it('WXD-125 WXD-126 khung giờ mong muốn vừa bị chiếm: giữ hộp và ghi chú, câu "bạn có thể từ chối"; hộp Duyệt của Admin KHÔNG có "Chọn khung giờ khác" và thân duyệt không có `khungGioId`', async () => {
    const { api } = await openDetail();
    api.inner.onHandle = () => {
      api.records[0].detail = {
        ...api.records[0].detail,
        khungGioMongMuon: { khungGioId: '555', trangThai: 'DaDat' },
      };
    };
    fireEvent.click(approveButton());
    const noPick = () =>
      expect(
        screen.queryByRole('button', { name: /khung giờ khác/i }),
      ).not.toBeInTheDocument();
    noPick();
    typeNote('approve', NOTE);
    fireEvent.click(confirmButton('approve'));
    expect(
      await within(dialogOf('approve')).findByText(HANDLE_TEXT.slotGone),
    ).toBeInTheDocument();
    noPick();
    expect(noteBox('approve').value).toBe(NOTE);
    expect(api.writes().map((call) => call.body)).toEqual([{ ghiChu: NOTE }]);
  });

  it.each([
    [
      'mất mạng',
      () => Promise.reject(new TypeError('offline')),
      HANDLE_TEXT.unsure,
    ],
    [
      '500',
      () =>
        jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'CHỮ MÁY CHỦ' }, 500),
      HANDLE_TEXT.systemError,
    ],
  ])(
    'WXD-127 gửi gặp %s: câu theo tình huống, giữ ghi chú, KHÔNG tự gửi lại',
    async (_name, failure, message) => {
      const { api } = await openDetail({
        before: (fake) => fake.inner.failNextWrite('reject', failure),
      });
      submitDialog('reject', NOTE);
      expect(
        await within(dialogOf('reject')).findByText(message),
      ).toBeInTheDocument();
      expect(noteBox('reject').value).toBe(NOTE);
      expect(screen.queryByText('CHỮ MÁY CHỦ')).not.toBeInTheDocument();
      expect(api.writes()).toHaveLength(1);
    },
  );
});
