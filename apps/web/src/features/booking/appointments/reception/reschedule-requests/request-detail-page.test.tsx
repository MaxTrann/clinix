import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import { apiErrorResponse } from '../../../testing/fake-appointment-list-api';
import { fakeRecord } from '../../../testing/fake-reschedule-requests-api';
import {
  makeHandledDetail,
  makeRequestDetail,
} from '../../../testing/reschedule-requests-fixtures';
import {
  cleanUpRequestsPage,
  detailCalls,
  renderRequests,
  type FakeRequestsApi,
} from '../../../testing/reschedule-requests-harness';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';
import type { RequestDetail } from '../../common/reschedule-requests/request-types';

// reschedule F4: trang chi tiết MỘT yêu cầu đổi lịch của Lễ tân (WXD-05 theo PLAN reschedule 7.11; WXD-69…WXD-73 `[đề xuất]`; hợp đồng THẬT của B8: 19 khoá). Hiển thị thuần: nút Duyệt, Từ chối là việc của Pha B.
// Giờ theo GIỜ VIỆT NAM; lý do và ghi chú là chữ tự do hiển thị dạng chữ thuần. Dữ liệu giả.
afterEach(cleanUpRequestsPage);

const DETAIL = '/le-tan/yeu-cau-doi-lich';

async function openDetail(
  detail: RequestDetail,
  before?: (api: FakeRequestsApi) => void,
  entry?: string | { pathname: string; state?: unknown },
) {
  const view = renderRequests({
    before: (api) => {
      api.records = [fakeRecord(detail)];
      before?.(api);
    },
    entry: entry ?? `${DETAIL}/${detail.yeuCauId}`,
  });
  await screen.findByRole('heading', { name: REQUEST_TEXT.detailTitle });
  await screen.findByRole('region', { name: REQUEST_TEXT.summary });
  return view;
}

const card = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('section')!;

describe('nội dung chi tiết', () => {
  it('WXD-05 thẻ đầu: mã lịch, trạng thái yêu cầu và người khám; bốn thẻ có đủ trường theo GIỜ VIỆT NAM', async () => {
    await openDetail(
      makeRequestDetail({
        yeuCauId: '101',
        nguoiKham: { hoTen: 'Nguyễn Thị B', laNguoiThan: true },
        bacSi: { hoTen: 'Lê Thảo Vy' },
        chiNhanh: { id: '3', ten: 'CLINIX Quận 1' },
        thoiGianCu: '2026-11-20T02:00:00.000Z',
        thoiGianMongMuon: '2026-11-27T03:30:00.000Z',
        thoiDiemTao: '2026-11-05T02:30:15.000Z',
        soLanDaTuDoi: 2,
        soLanToiDa: 2,
        lyDoYeuCau: 'Tôi có việc đột xuất.',
        trangThaiLichGoc: 'DaXacNhan',
      }),
    );
    const summary = screen.getByRole('region', { name: REQUEST_TEXT.summary });
    expect(within(summary).getByText('CLX-20261120-7K3M9')).toBeInTheDocument();
    expect(within(summary).getByText('Chờ duyệt')).toBeInTheDocument();
    expect(
      within(summary).getByRole('heading', { name: 'Nguyễn Thị B' }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText(REQUEST_TEXT.relativePerson),
    ).toBeInTheDocument();

    const appointment = card(REQUEST_TEXT.sections.appointment);
    expect(appointment).toHaveTextContent('Lê Thảo Vy');
    expect(appointment).toHaveTextContent('CLINIX Quận 1');
    expect(appointment).toHaveTextContent('Thứ 6, 20/11/2026, 09:00');
    expect(appointment).toHaveTextContent('Đã xác nhận');

    const request = card(REQUEST_TEXT.sections.request);
    expect(request).toHaveTextContent('05/11/2026 09:30');
    expect(request).toHaveTextContent('2 / 2 lần');
    expect(request).toHaveTextContent('Tôi có việc đột xuất.');

    expect(card(REQUEST_TEXT.sections.desired)).toHaveTextContent(
      'Thứ 6, 27/11/2026, 10:30',
    );
    expect(card(REQUEST_TEXT.sections.decision)).toHaveTextContent(
      REQUEST_TEXT.waitingDecision,
    );
  });

  it('WXD-69 số lần tối đa `null` (chưa cấu hình) ⇒ "n lần (chưa cấu hình số lần tối đa)", không "n / null"', async () => {
    await openDetail(makeRequestDetail({ soLanDaTuDoi: 3, soLanToiDa: null }));
    const request = card(REQUEST_TEXT.sections.request);
    expect(request).toHaveTextContent('3 lần (chưa cấu hình số lần tối đa)');
    expect(request).not.toHaveTextContent('null');
  });

  it('WXD-69 lý do của Bệnh nhân là CHỮ THUẦN: chuỗi HTML hiện nguyên chữ (không thành phần tử), giữ xuống dòng', async () => {
    const html = '<img src=x onerror=alert(1)>\nDòng hai <b>đậm</b>';
    const { container } = await openDetail(
      makeRequestDetail({ lyDoYeuCau: html }),
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    const reason = screen.getByText(
      (_, element) =>
        element?.textContent === html && element.tagName === 'SPAN',
    );
    expect(reason).toHaveClass('whitespace-pre-line');
  });

  it('WXD-69 mã trạng thái lịch gốc lạ (kể cả `DaDoiLich`) ⇒ nhãn trung tính "Chưa xác định", không lộ mã thô', async () => {
    await openDetail(makeRequestDetail({ trangThaiLichGoc: 'DaDoiLich' }));
    const appointment = card(REQUEST_TEXT.sections.appointment);
    expect(appointment).toHaveTextContent('Chưa xác định');
    expect(appointment).not.toHaveTextContent('DaDoiLich');
  });

  it('WXD-69 id yêu cầu lớn hơn 2^53 đi NGUYÊN chuỗi lên đường dẫn API (không qua Number)', async () => {
    const { api } = await openDetail(
      makeRequestDetail({ yeuCauId: '9007199254740993' }),
    );
    expect(detailCalls(api).map((call) => call.path)).toEqual([
      '/reception/reschedule-requests/9007199254740993',
    ]);
    expect(detailCalls(api)[0].hasToken).toBe(true);
  });

  it('WXD-69 yêu cầu còn chờ có đúng hai nút Duyệt và Từ chối (Pha B1); chỉ MỞ trang thì KHÔNG có lời gọi ghi nào', async () => {
    const { api } = await openDetail(makeRequestDetail());
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeEnabled();
    expect(api.writes()).toEqual([]);
  });
});

describe('khả năng duyệt (coTheDuyet, lyDoKhongDuyet)', () => {
  it('WXD-70 duyệt được (`coTheDuyet = true`) ⇒ KHÔNG có câu "không thể duyệt"', async () => {
    await openDetail(
      makeRequestDetail({ coTheDuyet: true, lyDoKhongDuyet: null }),
    );
    expect(screen.queryByRole('note')).toBeNull();
  });

  it.each([
    ['LICH_HEN_KHONG_CHO_DOI', 'không còn ở trạng thái đã xác nhận'],
    ['LICH_HEN_DA_QUA_GIO', 'quá giờ cho phép đổi lịch'],
    ['HO_SO_NGUOI_THAN_DA_NGUNG', 'Hồ sơ người thân đã ngừng'],
    ['CHUOI_DOI_LICH_QUA_DAI', 'đã đổi quá nhiều lần'],
    ['HE_THONG_CHUA_CAU_HINH', 'chưa cấu hình số lần đổi lịch'],
  ])(
    'WXD-70 `%s` ⇒ câu riêng, nhắc vẫn có thể từ chối (R6), không in mã thô',
    async (code, phrase) => {
      await openDetail(
        makeRequestDetail({ coTheDuyet: false, lyDoKhongDuyet: code }),
      );
      const note = screen.getByRole('note');
      expect(note).toHaveTextContent(phrase);
      expect(note).toHaveTextContent('Bạn vẫn có thể từ chối.');
      expect(document.body).not.toHaveTextContent(code);
    },
  );

  it('WXD-70 lịch gốc VẪN `DaXacNhan` mà `coTheDuyet = false` vì quá giờ ⇒ vẫn hiện câu (web KHÔNG tự suy khả năng duyệt từ trạng thái lịch)', async () => {
    await openDetail(
      makeRequestDetail({
        trangThaiLichGoc: 'DaXacNhan',
        coTheDuyet: false,
        lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
      }),
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'quá giờ cho phép đổi lịch',
    );
  });

  it.each(['KHONG_TIM_THAY', 'MA_MOI_CUA_TUONG_LAI', 'constructor'])(
    'WXD-70 mã lạ hay mã không thuộc yêu cầu còn chờ (%s) ⇒ câu chung, không in mã',
    async (code) => {
      await openDetail(
        makeRequestDetail({ coTheDuyet: false, lyDoKhongDuyet: code }),
      );
      expect(screen.getByRole('note')).toHaveTextContent(
        'Chưa thể duyệt yêu cầu này.',
      );
      expect(document.body).not.toHaveTextContent(code);
    },
  );
});

describe('khung giờ mong muốn', () => {
  it.each([
    ['ConTrong', 'Khung giờ mong muốn hiện còn trống.'],
    ['DangGiuCho', 'đang được giữ chỗ cho người khác'],
    ['DaDat', 'đã có người đặt'],
    ['HetHan', 'Khung giờ mong muốn đã qua.'],
  ] as const)(
    'WXD-71 trạng thái `%s` ⇒ câu thông tin riêng, không in mã',
    async (trangThai, phrase) => {
      await openDetail(
        makeRequestDetail({
          khungGioMongMuon: { khungGioId: '555', trangThai },
        }),
      );
      const slot = card(REQUEST_TEXT.sections.desired);
      expect(slot).toHaveTextContent(phrase);
      expect(slot).not.toHaveTextContent(trangThai);
    },
  );
});

describe('yêu cầu đã xử lý', () => {
  it.each([
    ['DaDuyet', 'Đã duyệt'],
    ['TuChoi', 'Từ chối'],
  ] as const)(
    'WXD-72 `%s`: thẻ "Kết quả xử lý" có trạng thái, người xử lý, giờ xử lý (giờ Việt Nam) và ghi chú; KHÔNG câu "không thể duyệt", KHÔNG nút',
    async (status, label) => {
      await openDetail(makeHandledDetail(status));
      const result = card(REQUEST_TEXT.sections.result);
      expect(result).toHaveTextContent(label);
      expect(result).toHaveTextContent('Trần Thị Lễ Tân');
      expect(result).toHaveTextContent('06/11/2026 10:00');
      expect(result).toHaveTextContent('Đã liên hệ bệnh nhân.');
      expect(screen.queryByRole('note')).toBeNull();
      expect(
        screen.queryByRole('heading', { name: REQUEST_TEXT.sections.decision }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: /Duyệt|Từ chối/ }),
      ).toBeNull();
    },
  );

  it('WXD-72 ghi chú xử lý là chữ thuần (HTML hiện nguyên chữ), giữ xuống dòng', async () => {
    const note = '<script>x()</script>\nXong';
    const { container } = await openDetail(
      makeHandledDetail('TuChoi', { ghiChuXuLy: note }),
    );
    expect(container.querySelector('script')).toBeNull();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent === note && element.tagName === 'SPAN',
      ),
    ).toHaveClass('whitespace-pre-line');
  });

  it('WXD-72 ba khoá xử lý `null` ở yêu cầu đã xử lý (dữ liệu cũ) ⇒ dấu gạch, không vỡ trang', async () => {
    await openDetail(
      makeHandledDetail('DaDuyet', {
        ghiChuXuLy: null,
        thoiDiemXuLy: null,
        nguoiXuLy: null,
      }),
    );
    expect(card(REQUEST_TEXT.sections.result)).toHaveTextContent('—');
  });
});

describe('quay lại danh sách', () => {
  const backHref = () =>
    screen.getByRole('link', { name: REQUEST_TEXT.back }).getAttribute('href');

  it('WXD-69 vào thẳng chi tiết (không có state) ⇒ liên kết về danh sách trơn', async () => {
    await openDetail(makeRequestDetail());
    expect(backHref()).toBe(DETAIL);
  });

  it('WXD-69 `state.listSearch` hợp lệ khôi phục tab, trang và bộ lọc; khoá lạ và giá trị sai bị bỏ (chuẩn hoá lại)', async () => {
    await openDetail(makeRequestDetail(), undefined, {
      pathname: `${DETAIL}/101`,
      state: { listSearch: '?x=1&page=2&tab=da-xu-ly&bacSiId=0&q=sai' },
    });
    expect(backHref()).toBe(`${DETAIL}?tab=da-xu-ly&page=2`);
  });

  it.each([42, null, 'tab=da-xu-ly', { listSearch: 7 }])(
    'WXD-69 `state` lạ (%j) ⇒ về danh sách trơn',
    async (state) => {
      await openDetail(makeRequestDetail(), undefined, {
        pathname: `${DETAIL}/101`,
        state,
      });
      expect(backHref()).toBe(DETAIL);
    },
  );
});

describe('lỗi tải chi tiết', () => {
  it('WXD-73 id không có, thuộc chi nhánh khác hay sai dạng ⇒ CÙNG một câu "Không tìm thấy yêu cầu."; id sai dạng KHÔNG gọi API', async () => {
    const texts: string[] = [];
    for (const [id, calls] of [
      ['777', 1],
      ['55', 1],
      ['abc', 0],
      ['0', 0],
      ['012', 0],
    ] as const) {
      const view = renderRequests({
        before: (api) => {
          api.records = [fakeRecord(makeRequestDetail({ yeuCauId: '101' }))];
          api.otherBranch = [fakeRecord(makeRequestDetail({ yeuCauId: '55' }))];
        },
        entry: `${DETAIL}/${id}`,
      });
      const alert = await screen.findByRole('alert');
      texts.push(alert.textContent ?? '');
      expect(alert).toHaveTextContent(REQUEST_TEXT.notFound);
      expect(detailCalls(view.api)).toHaveLength(calls);
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
      expect(
        screen.getByRole('link', { name: REQUEST_TEXT.back }),
      ).toBeInTheDocument();
      view.unmount();
      cleanUpRequestsPage();
    }
    expect(new Set(texts).size).toBe(1);
  });

  it('WXD-73 `CHUA_DANG_NHAP` ⇒ câu phiên hết hạn; `KHONG_DU_QUYEN` ⇒ câu không đủ quyền; cả hai KHÔNG có "Thử lại"', async () => {
    for (const [status, code, text] of [
      [401, 'CHUA_DANG_NHAP', REQUEST_TEXT.sessionExpired],
      [403, 'KHONG_DU_QUYEN', REQUEST_TEXT.forbiddenDetail],
    ] as const) {
      const view = renderRequests({
        before: (api) =>
          api.failNext('detail', () => apiErrorResponse(status, code)),
        entry: `${DETAIL}/101`,
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
      view.unmount();
      cleanUpRequestsPage();
    }
  });

  it.each([404, 409, 500])(
    'WXD-73 HTTP %i với `maLoi` lạ ⇒ câu chung kèm "Thử lại" (chọn theo `maLoi`, không theo mã HTTP)',
    async (status) => {
      renderRequests({
        before: (api) =>
          api.failNext('detail', () => apiErrorResponse(status, 'MA_LOI_LA')),
        entry: `${DETAIL}/101`,
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(
        screen.getByRole('button', { name: 'Thử lại' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(REQUEST_TEXT.notFound)).toBeNull();
    },
  );

  it('WXD-73 mạng đứt ⇒ câu mạng kèm "Thử lại"; có mạng lại thì "Thử lại" tải lại đúng yêu cầu đó và hiện chi tiết', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        fake.records = [fakeRecord(makeRequestDetail({ yeuCauId: '101' }))];
        fake.failNext('detail', () => {
          throw new TypeError('Failed to fetch');
        });
      },
      entry: `${DETAIL}/101`,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      NETWORK_ERROR_MESSAGE,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('region', { name: REQUEST_TEXT.summary });
    expect(detailCalls(api)).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    [
      'HTML 200',
      () => new Response('<html>bad gateway</html>', { status: 200 }),
    ],
    [
      'HTML 502',
      () => new Response('<html>bad gateway</html>', { status: 502 }),
    ],
  ])(
    'WXD-73 %s ⇒ câu chung kèm "Thử lại", trang không trắng',
    async (_name, bad) => {
      renderRequests({
        before: (api) => api.failNext('detail', bad),
        entry: `${DETAIL}/101`,
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(
        screen.getByRole('heading', { name: REQUEST_TEXT.detailTitle }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Thử lại' }),
      ).toBeInTheDocument();
    },
  );

  it.each([
    [
      'thiếu một khoá',
      (body: Record<string, unknown>) => ({ ...body, soLanDaTuDoi: undefined }),
    ],
    [
      '`coTheDuyet` lệch `lyDoKhongDuyet`',
      (body: Record<string, unknown>) => ({
        ...body,
        coTheDuyet: true,
        lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
      }),
    ],
    [
      'mốc giờ không có múi giờ',
      (body: Record<string, unknown>) => ({
        ...body,
        thoiGianCu: '2026-11-20T09:00:00',
      }),
    ],
    [
      'trạng thái khung giờ lạ',
      (body: Record<string, unknown>) => ({
        ...body,
        khungGioMongMuon: { khungGioId: '555', trangThai: 'Khac' },
      }),
    ],
  ])(
    'WXD-73 chi tiết 200 sai hợp đồng (%s) ⇒ cả trang báo lỗi chung, KHÔNG vẽ dữ liệu dở',
    async (_name, corrupt) => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      renderRequests({
        before: (api) => {
          api.detailBodies['101'] = corrupt({
            ...makeRequestDetail({ yeuCauId: '101' }),
          });
        },
        entry: `${DETAIL}/101`,
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(
        screen.queryByRole('region', { name: REQUEST_TEXT.summary }),
      ).toBeNull();
      expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
      consoleSpy.mockRestore();
    },
  );
});
