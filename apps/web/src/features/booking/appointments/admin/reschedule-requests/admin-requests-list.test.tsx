import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BRANCH_SCOPE,
  BRANCHES,
  branchSelect,
  cleanUpAdminRequests,
  CODE_A,
  CODE_B,
  renderAdminRequests,
  requestAt,
} from '../../../../../router/admin-reschedule-requests-harness';
import { ADMIN_RESCHEDULE_REQUESTS_PATH } from '../../../../../shared/routes/booking-paths';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import { makeAppointmentCode } from '../../../testing/reschedule-requests-fixtures';
import {
  detailLink,
  DOCTORS,
  doctorSelect,
  loaded,
  rowCodes,
  submitSearch,
  tabButton,
  typeCode,
} from '../../../testing/reschedule-requests-harness';
import { COMMON_LIST_TEXT } from '../../common/list-text';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';
import { ADMIN_REQUEST_TEXT } from './admin-requests-text';

// reschedule F5: trang danh sách yêu cầu đổi lịch của Quản trị viên trong trang "Duyệt yêu cầu" (WXD-13 theo PLAN reschedule 7.11; WXD-111…WXD-118 `[đề xuất]`): nội dung dùng chung với Lễ tân, bộ chọn chi nhánh
// theo phạm vi, `chiNhanhId` đúng lúc. Dựng bằng ROUTER THẬT với API giả khớp B8; dữ liệu giả.
afterEach(cleanUpAdminRequests);

// `count` yêu cầu đang chờ của MỘT chi nhánh, id và mã khác nhau
const manyAt = (chiNhanhId: string, count: number, offset: number) =>
  Array.from({ length: count }, (_, index) =>
    requestAt(chiNhanhId, {
      yeuCauId: String(offset + index),
      maLichHen: makeAppointmentCode(offset + index),
    }),
  );

const optionTexts = () =>
  within(branchSelect())
    .getAllByRole('option')
    .map((option) => option.textContent);

// Chờ danh sách chi nhánh về (ô có đủ "Tất cả" và hai chi nhánh)
const branchesLoaded = () =>
  waitFor(() => expect(optionTexts()).toHaveLength(BRANCHES.length + 1));

const chooseBranch = (value: string) =>
  fireEvent.change(branchSelect(), { target: { value } });

describe('nội dung trang', () => {
  it('WXD-13 dùng chung với Lễ tân: hai tab, dòng đếm, ô tìm mã, lọc bác sĩ, bảng đúng các cột và dòng phụ đề; tiêu đề do trang host "Duyệt yêu cầu" đặt', async () => {
    renderAdminRequests();
    await loaded();
    expect(
      screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent),
    ).toEqual(['Duyệt yêu cầu']);
    expect(screen.getByText(REQUEST_TEXT.subtitle)).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: REQUEST_TEXT.tabsLabel }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 yêu cầu')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: REQUEST_TEXT.searchLabel }),
    ).toBeInTheDocument();
    expect(doctorSelect()).toBeInTheDocument();
    const { columns } = REQUEST_TEXT;
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual([
      columns.code,
      columns.patient,
      columns.doctor,
      columns.change,
      columns.selfChanges,
      columns.sent,
      columns.status,
      columns.actions,
    ]);
    // thứ tự hai dòng do máy chủ (cùng thời điểm tạo ⇒ theo id tăng ở tab Chờ duyệt)
    expect(rowCodes()).toEqual([CODE_A, CODE_B]);
    expect(detailLink(CODE_A)).toHaveAttribute(
      'href',
      `${ADMIN_RESCHEDULE_REQUESTS_PATH}/101`,
    );
  });
});

describe('Quản trị viên Toàn hệ thống: bộ chọn chi nhánh', () => {
  it('WXD-111 có ô "Chi nhánh" (Tất cả và các chi nhánh), mặc định "Tất cả", lời gọi đầu KHÔNG có `chiNhanhId`', async () => {
    const { api } = renderAdminRequests();
    await loaded();
    await branchesLoaded();
    expect(optionTexts()).toEqual([
      COMMON_LIST_TEXT.allOption,
      'CLINIX Chi nhánh Quận 3',
      'CLINIX Chi nhánh Quận 4',
    ]);
    expect(branchSelect().value).toBe('');
    expect(api.listQueries()).toEqual([{ trangThai: 'ChoDuyet', page: '1' }]);
    expect(api.callsTo('/public/branches')).toHaveLength(1);
    // route công khai không gắn token, route của Quản trị viên thì có
    expect(api.callsTo('/public/branches')[0].hasToken).toBe(false);
    expect(api.callsTo('/admin/reschedule-requests')[0].hasToken).toBe(true);
    expect(
      screen.queryByText(/Chi nhánh: /, { selector: 'p' }),
    ).not.toBeInTheDocument();
  });

  it('WXD-112 đang ở trang 2, chọn chi nhánh ⇒ gọi lại có `chiNhanhId`, về trang 1 (query và URL); "Tất cả" bỏ khoá; chi nhánh không có yêu cầu ra câu rỗng', async () => {
    const { api, router } = renderAdminRequests(
      `${ADMIN_RESCHEDULE_REQUESTS_PATH}?page=2`,
      {
        before: (fake) => {
          fake.branches = [
            ...BRANCHES,
            { chiNhanhId: '9', ten: 'CLINIX Chi nhánh trống' },
          ];
          // chi nhánh 4 có đủ nhiều yêu cầu để trang 2 vẫn tồn tại: bỏ bước "về trang 1" thì lộ ra
          fake.records = [...manyAt('3', 3, 1), ...manyAt('4', 25, 100)];
        },
      },
    );
    await loaded();
    await waitFor(() => expect(optionTexts()).toHaveLength(4));
    expect(api.listQueries()).toEqual([{ trangThai: 'ChoDuyet', page: '2' }]);

    chooseBranch('4');
    await waitFor(() => expect(screen.getByText('25 yêu cầu')).toBeVisible());
    // đúng MỘT lời gọi mới: trang 1 của chi nhánh mới, không gọi thừa trang cũ
    expect(api.listQueries().slice(1)).toEqual([
      { trangThai: 'ChoDuyet', page: '1', chiNhanhId: '4' },
    ]);
    expect(router.state.location.search).toBe('');
    expect(rowCodes()).toHaveLength(20);

    chooseBranch('');
    await waitFor(() => expect(screen.getByText('28 yêu cầu')).toBeVisible());
    expect(api.listQueries().at(-1)).toEqual({
      trangThai: 'ChoDuyet',
      page: '1',
    });

    chooseBranch('9');
    expect(
      await screen.findByText(REQUEST_TEXT.emptyWaiting),
    ).toBeInTheDocument();
    expect(api.listQueries().at(-1)).toMatchObject({ chiNhanhId: '9' });
    expect(screen.getByText('0 yêu cầu')).toBeVisible();
  });

  it('WXD-114 tải danh sách chi nhánh lỗi: ô còn "Tất cả" kèm "Thử lại", bảng không bị chặn; thử lại thì có lựa chọn', async () => {
    const { api } = renderAdminRequests(undefined, {
      before: (fake) =>
        fake.failNextBranches(() =>
          jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'giả' }, 500),
        ),
    });
    await loaded();
    expect(
      await screen.findByText(/Không tải được danh sách chi nhánh\./),
    ).toBeInTheDocument();
    expect(optionTexts()).toEqual([COMMON_LIST_TEXT.allOption]);
    expect(rowCodes()).toEqual([CODE_A, CODE_B]);
    fireEvent.click(
      screen.getByRole('button', { name: COMMON_LIST_TEXT.optionsRetry }),
    );
    await branchesLoaded();
    expect(api.callsTo('/public/branches')).toHaveLength(2);
  });

  it('WXD-114 danh sách chi nhánh bị cắt (`total` lớn hơn số mục): ghi chú rút gọn', async () => {
    renderAdminRequests(undefined, {
      before: (fake) => {
        fake.branchTotal = 150;
      },
    });
    await loaded();
    expect(
      await screen.findByText(
        'Danh sách chi nhánh rút gọn: chỉ hiện 100 mục đầu.',
      ),
    ).toBeInTheDocument();
  });

  it('WXD-115 giữ chi nhánh đã chọn qua việc mở chi tiết rồi "Quay lại danh sách"; tải lại cả trang thì về "Tất cả" (giới hạn đã biết)', async () => {
    const view = renderAdminRequests();
    await loaded();
    await branchesLoaded();
    chooseBranch('4');
    await waitFor(() => expect(rowCodes()).toEqual([CODE_B]));
    fireEvent.click(detailLink(CODE_B));
    await screen.findByRole('region', { name: REQUEST_TEXT.summary });
    // chi tiết không bao giờ gửi tham số chi nhánh
    expect(view.api.callsTo('/admin/reschedule-requests/102')[0].query).toEqual(
      {},
    );
    fireEvent.click(screen.getByRole('link', { name: REQUEST_TEXT.back }));
    await loaded();
    await waitFor(() => expect(rowCodes()).toEqual([CODE_B]));
    expect(view.api.listQueries().at(-1)).toMatchObject({ chiNhanhId: '4' });
    await branchesLoaded();
    expect(branchSelect().value).toBe('4');

    view.unmount();
    const reloaded = renderAdminRequests();
    await loaded();
    await branchesLoaded();
    expect(branchSelect().value).toBe('');
    expect(reloaded.api.listQueries()).toEqual([
      { trangThai: 'ChoDuyet', page: '1' },
    ]);
  });
});

describe('Quản trị viên Chi nhánh', () => {
  it('WXD-113 KHÔNG ô chọn, có tên chi nhánh được gán, MỌI lời gọi danh sách (đổi trang, tab, bác sĩ, tìm mã) không có `chiNhanhId`, không tải danh sách chi nhánh', async () => {
    const { api } = renderAdminRequests(undefined, {
      scope: BRANCH_SCOPE,
      before: (fake) => {
        fake.records = [...manyAt('3', 25, 1), ...manyAt('4', 2, 100)];
        fake.inner.doctors = DOCTORS;
      },
    });
    await loaded();
    expect(
      screen.getByText(
        ADMIN_REQUEST_TEXT.assignedBranch('CLINIX Chi nhánh Quận 3'),
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('combobox', { name: ADMIN_REQUEST_TEXT.branchLabel }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('25 yêu cầu')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: COMMON_LIST_TEXT.nextPage }),
    );
    await waitFor(() => expect(rowCodes()).toHaveLength(5));
    fireEvent.click(tabButton(REQUEST_TEXT.tabs['da-xu-ly']));
    expect(
      await screen.findByText(REQUEST_TEXT.emptyHandled),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(doctorSelect()).getAllByRole('option').length,
      ).toBeGreaterThan(1),
    );
    fireEvent.change(doctorSelect(), { target: { value: '5' } });
    await waitFor(() =>
      expect(api.listQueries().at(-1)).toMatchObject({ bacSiId: '5' }),
    );
    typeCode(makeAppointmentCode(1));
    submitSearch();
    await waitFor(() =>
      expect(api.listQueries().at(-1)).toMatchObject({
        q: makeAppointmentCode(1),
      }),
    );

    expect(api.listQueries().length).toBeGreaterThanOrEqual(5);
    for (const query of api.listQueries()) {
      expect(query).not.toHaveProperty('chiNhanhId');
    }
    expect(api.callsTo('/public/branches')).toEqual([]);
  });
});

describe('tab, bộ lọc và lỗi', () => {
  it('WXD-116 tab "Đã xử lý", bác sĩ và mã nằm trên URL; liên kết `Chi tiết` mang theo bộ lọc và "Quay lại danh sách" khôi phục', async () => {
    const { api, router } = renderAdminRequests(undefined, {
      before: (fake) => {
        fake.inner.doctors = DOCTORS;
        fake.records = [
          requestAt('3', {
            yeuCauId: '201',
            maLichHen: CODE_A,
            trangThai: 'TuChoi',
            coTheDuyet: false,
            lyDoKhongDuyet: 'YEU_CAU_DA_XU_LY',
            ghiChuXuLy: 'Không đổi được.',
            thoiDiemXuLy: '2026-11-06T03:00:00.000Z',
            nguoiXuLy: { hoTen: 'Quản trị viên giả' },
          }),
        ];
      },
    });
    // tab Chờ duyệt rỗng (yêu cầu duy nhất đã bị từ chối)
    await screen.findByText(REQUEST_TEXT.emptyWaiting);
    fireEvent.click(tabButton(REQUEST_TEXT.tabs['da-xu-ly']));
    await waitFor(() => expect(rowCodes()).toEqual([CODE_A]));
    await waitFor(() =>
      expect(
        within(doctorSelect()).getAllByRole('option').length,
      ).toBeGreaterThan(1),
    );
    fireEvent.change(doctorSelect(), { target: { value: '5' } });
    typeCode(CODE_A);
    submitSearch();
    await waitFor(() =>
      expect(api.listQueries().at(-1)).toEqual({
        trangThai: 'DaDuyet,TuChoi',
        page: '1',
        bacSiId: '5',
        q: CODE_A,
      }),
    );
    const filtered = `?tab=da-xu-ly&bacSiId=5&q=${CODE_A}`;
    expect(router.state.location.search).toBe(filtered);

    await waitFor(() => expect(rowCodes()).toEqual([CODE_A]));
    fireEvent.click(detailLink(CODE_A));
    await screen.findByRole('region', { name: REQUEST_TEXT.summary });
    expect(router.state.location.state).toEqual({ listSearch: filtered });
    fireEvent.click(screen.getByRole('link', { name: REQUEST_TEXT.back }));
    await loaded();
    expect(router.state.location.pathname).toBe(ADMIN_RESCHEDULE_REQUESTS_PATH);
    expect(router.state.location.search).toBe(filtered);
  });

  it('WXD-117 URL sai bị bỏ như không có, không gửi giá trị sai lên máy chủ', async () => {
    const { api } = renderAdminRequests(
      `${ADMIN_RESCHEDULE_REQUESTS_PATH}?tab=xyz&page=0&bacSiId=abc&q=sai&chiNhanhId=4`,
    );
    await loaded();
    // kể cả `chiNhanhId` gõ tay trên URL: chi nhánh chỉ đi qua bộ chọn
    expect(api.listQueries()).toEqual([{ trangThai: 'ChoDuyet', page: '1' }]);
  });

  it.each([
    [
      '500',
      () => jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'giả' }, 500),
    ],
    ['mất mạng', () => Promise.reject(new TypeError('offline'))],
  ])(
    'WXD-118 tải danh sách lỗi (%s): khối lỗi có "Thử lại"; thử lại gọi KÈM chi nhánh đang chọn',
    async (_name, failure) => {
      const { api } = renderAdminRequests();
      await loaded();
      await branchesLoaded();
      api.inner.failNext('list', failure);
      chooseBranch('4');
      const retry = await screen.findByRole('button', { name: 'Thử lại' });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      const before = api.listQueries().length;
      fireEvent.click(retry);
      await waitFor(() => expect(rowCodes()).toEqual([CODE_B]));
      expect(api.listQueries()).toHaveLength(before + 1);
      expect(api.listQueries().at(-1)).toMatchObject({ chiNhanhId: '4' });
    },
  );
});
