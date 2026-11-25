import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fakeRecord,
  type FakeRequestRecord,
} from '../../../testing/fake-reschedule-requests-api';
import {
  makeAppointmentCode,
  makeHandledDetail,
  makeRequestDetail,
  makeRequestRows,
} from '../../../testing/reschedule-requests-fixtures';
import {
  cleanUpRequestsPage,
  currentUrl,
  detailLink,
  DOCTORS,
  doctorSelect,
  lastListQuery,
  listQueries,
  loaded,
  renderRequests,
  rowCodes,
  searchBox,
  submitSearch,
  tabButton,
  typeCode,
  type FakeRequestsApi,
} from '../../../testing/reschedule-requests-harness';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';

// reschedule F4: trang danh sách "Yêu cầu đổi lịch" của Lễ tân với API giả khớp B8 (WXD-02, WXD-03 theo PLAN reschedule 7.11; WXD-59…WXD-64 `[đề xuất]`). Trang THẬT của Lễ tân đi qua `request()` thật nên truy vấn
// đã gửi được khẳng định trực tiếp. Dữ liệu giả.
afterEach(cleanUpRequestsPage);

const seed = (
  api: FakeRequestsApi,
  details: ReturnType<typeof makeRequestDetail>[],
  bacSiId = '5',
) => {
  api.records = details.map((detail): FakeRequestRecord =>
    fakeRecord(detail, bacSiId),
  );
};

const pending = (count: number) =>
  makeRequestRows(count).map((row) => makeRequestDetail(row));

describe('hai tab Chờ duyệt và Đã xử lý', () => {
  it('WXD-02 vào trang: h1, tab Chờ duyệt đang chọn, truy vấn đầu CHỈ có `trangThai=ChoDuyet` và `page=1`', async () => {
    const { api } = renderRequests({
      before: (fake) => seed(fake, pending(3)),
    });
    await loaded();
    expect(
      screen.getByRole('heading', { level: 1, name: REQUEST_TEXT.title }),
    ).toBeInTheDocument();
    expect(tabButton('Chờ duyệt')).toHaveAttribute('aria-pressed', 'true');
    expect(tabButton('Đã xử lý')).toHaveAttribute('aria-pressed', 'false');
    expect(listQueries(api)).toEqual([{ trangThai: 'ChoDuyet', page: '1' }]);
    expect(rowCodes()).toHaveLength(3);
  });

  it('WXD-02 bấm "Đã xử lý": truy vấn `trangThai=DaDuyet,TuChoi`, URL `?tab=da-xu-ly`, chỉ hiện yêu cầu đã xử lý (không lẫn yêu cầu đang chờ)', async () => {
    const { api } = renderRequests({
      before: (fake) =>
        seed(fake, [
          makeRequestDetail({
            yeuCauId: '1',
            maLichHen: makeAppointmentCode(1),
          }),
          makeHandledDetail('DaDuyet', {
            yeuCauId: '2',
            maLichHen: makeAppointmentCode(2),
          }),
          makeHandledDetail('TuChoi', {
            yeuCauId: '3',
            maLichHen: makeAppointmentCode(3),
          }),
        ]),
    });
    await loaded();
    expect(rowCodes()).toEqual([makeAppointmentCode(1)]);

    fireEvent.click(tabButton('Đã xử lý'));
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({
        trangThai: 'DaDuyet,TuChoi',
        page: '1',
      }),
    );
    await waitFor(() => expect(rowCodes()).toHaveLength(2));
    expect(rowCodes()).not.toContain(makeAppointmentCode(1));
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich?tab=da-xu-ly');
    expect(tabButton('Đã xử lý')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(tabButton('Chờ duyệt'));
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ trangThai: 'ChoDuyet', page: '1' }),
    );
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich');
  });

  it('WXD-02 đổi tab về trang 1 và giữ bộ lọc bác sĩ; bấm lại tab đang chọn không gọi lại API', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        seed(fake, pending(45), '9');
        fake.doctors = DOCTORS;
      },
      entry: '/le-tan/yeu-cau-doi-lich?bacSiId=9&page=2',
    });
    await loaded();
    expect(lastListQuery(api)).toEqual({
      trangThai: 'ChoDuyet',
      page: '2',
      bacSiId: '9',
    });
    const before = listQueries(api).length;

    fireEvent.click(tabButton('Chờ duyệt'));
    expect(listQueries(api)).toHaveLength(before);

    fireEvent.click(tabButton('Đã xử lý'));
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({
        trangThai: 'DaDuyet,TuChoi',
        page: '1',
        bacSiId: '9',
      }),
    );
    expect(currentUrl()).toBe(
      '/le-tan/yeu-cau-doi-lich?tab=da-xu-ly&bacSiId=9',
    );
  });
});

describe('bảng yêu cầu', () => {
  it('WXD-03 mỗi dòng: mã lịch, người khám kèm nhãn "Người thân", bác sĩ, giờ cũ và giờ mong muốn theo GIỜ VIỆT NAM, số lần đã tự đổi, ngày gửi, trạng thái', async () => {
    renderRequests({
      before: (fake) =>
        seed(fake, [
          makeRequestDetail({
            yeuCauId: '7',
            nguoiKham: { hoTen: 'Nguyễn Thị B', laNguoiThan: true },
            bacSi: { hoTen: 'Lê Thảo Vy' },
            // 17:30 UTC ngày 20/11 đã là 00:30 ngày 21/11 ở Việt Nam
            thoiGianCu: '2026-11-20T17:30:00.000Z',
            thoiGianMongMuon: '2026-11-27T03:30:00.000Z',
            soLanDaTuDoi: 2,
            thoiDiemTao: '2026-11-05T02:30:15.000Z',
          }),
        ]),
    });
    await loaded();
    const [, row] = within(
      screen.getByRole('region', { name: REQUEST_TEXT.resultsRegion }),
    ).getAllByRole('row');
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('CLX-20261120-7K3M9');
    expect(cells[1]).toHaveTextContent('Nguyễn Thị B');
    expect(cells[1]).toHaveTextContent(REQUEST_TEXT.relative);
    expect(cells[2]).toHaveTextContent('Lê Thảo Vy');
    expect(cells[3]).toHaveTextContent('00:30 21/11/2026');
    expect(cells[3]).toHaveTextContent('10:30 27/11/2026');
    expect(cells[4]).toHaveTextContent('2');
    expect(cells[5]).toHaveTextContent('05/11/2026');
    expect(cells[6]).toHaveTextContent('Chờ duyệt');
    expect(cells[7]).toHaveTextContent(REQUEST_TEXT.detail);
  });

  it('WXD-03 người khám là bản thân thì KHÔNG có nhãn "Người thân"; tiêu đề cột đủ và có chú thích bảng', async () => {
    renderRequests({ before: (fake) => seed(fake, pending(1)) });
    await loaded();
    const region = screen.getByRole('region', {
      name: REQUEST_TEXT.resultsRegion,
    });
    expect(within(region).queryByText(REQUEST_TEXT.relative)).toBeNull();
    for (const label of [
      REQUEST_TEXT.columns.code,
      REQUEST_TEXT.columns.patient,
      REQUEST_TEXT.columns.doctor,
      REQUEST_TEXT.columns.change,
      REQUEST_TEXT.columns.selfChanges,
      REQUEST_TEXT.columns.sent,
      REQUEST_TEXT.columns.status,
    ]) {
      expect(
        within(region).getByRole('columnheader', { name: label }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole('table', { name: REQUEST_TEXT.tableCaption }),
    ).toBeInTheDocument();
  });

  it('WXD-63 id yêu cầu lớn hơn 2^53 giữ nguyên chuỗi trong liên kết chi tiết (không qua Number); liên kết có tên kèm mã lịch', async () => {
    renderRequests({
      before: (fake) =>
        seed(fake, [makeRequestDetail({ yeuCauId: '9007199254740993' })]),
    });
    await loaded();
    const link = detailLink('CLX-20261120-7K3M9');
    expect(link).toHaveAttribute(
      'href',
      '/le-tan/yeu-cau-doi-lich/9007199254740993',
    );
  });

  it('WXD-62 thứ tự do MÁY CHỦ: tab Chờ duyệt cũ nhất trước, tab Đã xử lý mới nhất trước; web KHÔNG sắp lại', async () => {
    renderRequests({
      before: (fake) =>
        seed(fake, [
          makeRequestDetail({
            yeuCauId: '1',
            maLichHen: makeAppointmentCode(1),
            thoiDiemTao: '2026-11-03T00:00:00.000Z',
          }),
          makeRequestDetail({
            yeuCauId: '2',
            maLichHen: makeAppointmentCode(2),
            thoiDiemTao: '2026-11-01T00:00:00.000Z',
          }),
          makeRequestDetail({
            yeuCauId: '3',
            maLichHen: makeAppointmentCode(3),
            thoiDiemTao: '2026-11-02T00:00:00.000Z',
          }),
          makeHandledDetail('DaDuyet', {
            yeuCauId: '4',
            maLichHen: makeAppointmentCode(4),
            thoiDiemTao: '2026-11-01T00:00:00.000Z',
          }),
          makeHandledDetail('TuChoi', {
            yeuCauId: '5',
            maLichHen: makeAppointmentCode(5),
            thoiDiemTao: '2026-11-04T00:00:00.000Z',
          }),
          makeHandledDetail('DaDuyet', {
            yeuCauId: '6',
            maLichHen: makeAppointmentCode(6),
            thoiDiemTao: '2026-11-02T00:00:00.000Z',
          }),
        ]),
    });
    await loaded();
    expect(rowCodes()).toEqual([2, 3, 1].map(makeAppointmentCode));

    fireEvent.click(tabButton('Đã xử lý'));
    await waitFor(() => expect(rowCodes()).toHaveLength(3));
    expect(rowCodes()).toEqual([5, 6, 4].map(makeAppointmentCode));
  });
});

describe('phân trang', () => {
  it('WXD-61 dòng đếm là `total` của API (không đếm lại `items`); chuyển trang ghi URL, gửi `page`, hiện đúng dòng', async () => {
    const { api } = renderRequests({
      before: (fake) => seed(fake, pending(45)),
    });
    await loaded();
    expect(screen.getByText('45 yêu cầu')).toBeInTheDocument();
    expect(rowCodes()).toHaveLength(20);
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({ page: '2' }),
    );
    await screen.findByText('Trang 2 / 3');
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich?page=2');
    // Tab Chờ duyệt cũ nhất trước và dòng càng về sau càng cũ (fixture): trang 1 là dòng 45 đến 26, trang 2 mở đầu bằng dòng 25
    expect(rowCodes()[0]).toBe(makeAppointmentCode(25));

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Trang 3 / 3');
    expect(rowCodes()).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('WXD-61 `total` rất lớn: dòng đếm và số trang tính từ `total` của API, không từ số dòng nhận được', async () => {
    renderRequests({
      before: (fake) => {
        fake.listBody = {
          items: makeRequestRows(20),
          total: 2_000_000_000,
          page: 1,
          pageSize: 20,
        };
      },
    });
    await loaded();
    expect(screen.getByText('2000000000 yêu cầu')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 100000000')).toBeInTheDocument();
  });

  it('WXD-61 trang vượt cuối (200 rỗng mà `total` còn lớn) ⇒ về trang cuối còn dữ liệu, không hiện câu rỗng', async () => {
    const { api } = renderRequests({
      before: (fake) => seed(fake, pending(45)),
      entry: '/le-tan/yeu-cau-doi-lich?page=9',
    });
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({ page: '3' }),
    );
    await screen.findByText('Trang 3 / 3');
    expect(rowCodes()).toHaveLength(5);
    expect(screen.queryByText(REQUEST_TEXT.emptyWaiting)).toBeNull();
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich?page=3');
  });
});

describe('tìm theo mã lịch hẹn', () => {
  const CODE = 'CLX-20261120-7K3M9';

  it('WXD-59 gõ mã chữ thường có khoảng trắng rồi bấm "Tìm": gửi chữ HOA đã chuẩn hoá, ghi URL, về trang 1, hiện đúng yêu cầu', async () => {
    const { api } = renderRequests({
      before: (fake) =>
        seed(fake, [
          makeRequestDetail({ yeuCauId: '1', maLichHen: CODE }),
          makeRequestDetail({ yeuCauId: '2', maLichHen: 'CLX-20261121-AAAAA' }),
        ]),
    });
    await loaded();
    expect(rowCodes()).toHaveLength(2);

    typeCode('  clx-20261120-7k3m9 ');
    submitSearch();
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({
        trangThai: 'ChoDuyet',
        page: '1',
        q: CODE,
      }),
    );
    await waitFor(() => expect(rowCodes()).toEqual([CODE]));
    expect(currentUrl()).toBe(`/le-tan/yeu-cau-doi-lich?q=${CODE}`);
    expect(searchBox().value).toBe(CODE);
  });

  it('WXD-59 phím Enter cũng tìm; bộ gõ đang ghép chữ (Enter chốt chữ) thì KHÔNG tìm', async () => {
    const { api } = renderRequests({
      before: (fake) => seed(fake, pending(2)),
    });
    await loaded();
    typeCode(CODE);
    fireEvent.keyDown(searchBox(), { key: 'Enter', keyCode: 229 });
    expect(listQueries(api)).toHaveLength(1);
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await waitFor(() => expect(lastListQuery(api)).toMatchObject({ q: CODE }));
  });

  it('WXD-59 mã SAI DẠNG: lỗi cạnh ô (role alert), tiêu điểm về ô, KHÔNG gọi API và URL không đổi; sửa chữ thì lỗi biến mất', async () => {
    const { api } = renderRequests({
      before: (fake) => seed(fake, pending(2)),
    });
    await loaded();
    for (const bad of ['abc', 'CLX-20261120-7K3M', 'CLX-20261120-7K3MI', 'ſ']) {
      typeCode(bad);
      submitSearch();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        REQUEST_TEXT.codeInvalid,
      );
      expect(searchBox()).toHaveAttribute('aria-invalid', 'true');
      expect(searchBox()).toHaveFocus();
    }
    expect(listQueries(api)).toHaveLength(1);
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich');
    typeCode('CLX');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(searchBox()).toHaveAttribute('aria-invalid', 'false');
  });

  it('WXD-59 ô rỗng hay toàn khoảng trắng rồi "Tìm" ⇒ BỎ bộ lọc mã (không phải lỗi), ô và URL sạch', async () => {
    const { api } = renderRequests({
      before: (fake) =>
        seed(fake, [
          makeRequestDetail({ yeuCauId: '1', maLichHen: CODE }),
          makeRequestDetail({ yeuCauId: '2', maLichHen: 'CLX-20261121-AAAAA' }),
        ]),
      entry: `/le-tan/yeu-cau-doi-lich?q=${CODE}`,
    });
    await loaded();
    expect(rowCodes()).toEqual([CODE]);
    expect(searchBox().value).toBe(CODE);
    typeCode('   ');
    submitSearch();
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ trangThai: 'ChoDuyet', page: '1' }),
    );
    await waitFor(() => expect(rowCodes()).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(searchBox().value).toBe('');
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich');
  });

  it('WXD-59 tìm lại ĐÚNG mã đang áp dụng thì LÀM MỚI danh sách (gọi lại cùng truy vấn), URL không đổi', async () => {
    const { api } = renderRequests({
      before: (fake) =>
        seed(fake, [makeRequestDetail({ yeuCauId: '1', maLichHen: CODE })]),
      entry: `/le-tan/yeu-cau-doi-lich?q=${CODE}`,
    });
    await loaded();
    const first = listQueries(api).length;
    submitSearch();
    await waitFor(() => expect(listQueries(api)).toHaveLength(first + 1));
    expect(listQueries(api).at(-1)).toEqual(listQueries(api)[0]);
    expect(currentUrl()).toBe(`/le-tan/yeu-cau-doi-lich?q=${CODE}`);
  });

  it('WXD-59 không có yêu cầu khớp mã ⇒ câu "không khớp bộ lọc" kèm "Xóa lọc"; bấm "Xóa lọc" bỏ mã và ô nhập về trống', async () => {
    const { api } = renderRequests({
      before: (fake) => seed(fake, pending(2)),
    });
    await loaded();
    typeCode(CODE);
    submitSearch();
    expect(await screen.findByText(REQUEST_TEXT.noMatch)).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: REQUEST_TEXT.clearFilters })[0],
    );
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ trangThai: 'ChoDuyet', page: '1' }),
    );
    await loaded();
    expect(searchBox().value).toBe('');
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich');
  });
});

describe('lọc theo bác sĩ', () => {
  it('WXD-60 ô chọn có "Tất cả" và các bác sĩ công khai; chọn một bác sĩ gửi `bacSiId` (chuỗi) và ghi URL; "Tất cả" bỏ bộ lọc', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        seed(fake, pending(2), '9');
        fake.doctors = DOCTORS;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });
    expect(
      within(doctorSelect())
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Tất cả',
      // `getDoctorOptions` sắp theo tên (tiếng Việt)
      'Lê Thảo Vy',
      'Nguyễn Minh Anh',
    ]);

    fireEvent.change(doctorSelect(), { target: { value: '5' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({ bacSiId: '5' }),
    );
    expect(await screen.findByText(REQUEST_TEXT.noMatch)).toBeInTheDocument();
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich?bacSiId=5');

    fireEvent.change(doctorSelect(), { target: { value: '9' } });
    await waitFor(() => expect(rowCodes()).toHaveLength(2));

    fireEvent.change(doctorSelect(), { target: { value: '' } });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ trangThai: 'ChoDuyet', page: '1' }),
    );
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich');
  });

  it('WXD-60 bác sĩ trên URL không có trong danh sách (đã ngừng, danh sách rút gọn) vẫn hiện thành "Bác sĩ đã chọn" và vẫn được gửi', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        seed(fake, pending(1));
        fake.doctors = DOCTORS;
      },
      entry: '/le-tan/yeu-cau-doi-lich?bacSiId=77',
    });
    await screen.findByRole('option', { name: REQUEST_TEXT.selectedDoctor });
    expect(doctorSelect().value).toBe('77');
    expect(lastListQuery(api)).toMatchObject({ bacSiId: '77' });
  });

  it('WXD-60 tải danh sách bác sĩ lỗi: bảng vẫn hiện, ô còn "Tất cả" kèm "Thử lại"; thử lại được; danh sách rút gọn có ghi chú', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        seed(fake, pending(2));
        fake.failNext('doctors', () => new Response('x', { status: 502 }));
      },
    });
    await loaded();
    expect(
      await screen.findByText(/Không tải được danh sách bác sĩ/),
    ).toBeInTheDocument();
    api.doctors = { items: DOCTORS.items, total: 150, page: 1, pageSize: 100 };
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });
    expect(screen.getByText(/Danh sách bác sĩ rút gọn/)).toBeInTheDocument();
  });
});

describe('truy vấn và quyền', () => {
  it('WXD-64 chỉ các khoá B8 nhận (`trangThai`, `page`, `bacSiId`, `q`): KHÔNG BAO GIỜ `chiNhanhId`, `pageSize` hay khoá lạ; Lễ tân gắn token, danh sách bác sĩ công khai thì không; không có lời gọi ghi', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        seed(fake, pending(25), '9');
        fake.doctors = DOCTORS;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });
    fireEvent.change(doctorSelect(), { target: { value: '9' } });
    typeCode('clx-20261120-0000a');
    submitSearch();
    fireEvent.click(tabButton('Đã xử lý'));
    await waitFor(() =>
      expect(lastListQuery(api)?.trangThai).toBe('DaDuyet,TuChoi'),
    );

    const allowed = new Set(['trangThai', 'page', 'bacSiId', 'q']);
    for (const query of listQueries(api)) {
      for (const key of Object.keys(query))
        expect(allowed.has(key), key).toBe(true);
    }
    const lists = api.requests.filter(
      (request) => request.path === '/reception/reschedule-requests',
    );
    expect(lists.length).toBeGreaterThan(1);
    expect(lists.every((request) => request.hasToken)).toBe(true);
    const doctors = api.requests.filter(
      (request) => request.path === '/public/doctors',
    );
    expect(doctors.length).toBeGreaterThan(0);
    expect(doctors.every((request) => !request.hasToken)).toBe(true);
    expect(api.writes()).toEqual([]);
  });
});
