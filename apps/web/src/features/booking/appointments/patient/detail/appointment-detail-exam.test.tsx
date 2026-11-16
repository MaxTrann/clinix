import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Link } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patientAppointmentDetailPath } from '../../../../../shared/routes/booking-paths';
import {
  cleanUpDetailPage,
  DETAIL_API_PATH,
  DETAIL_CODE,
  detailLoaded,
  renderDetailPage,
} from '../../../testing/appointment-detail-harness';
import { makeDetail } from '../../../testing/fake-appointment-detail-api';
import { APPOINTMENT_STATES } from '../../common/appointment-status';
import { DETAIL_TEXT } from './detail-messages';

// doctor-exam F6, WXH-09 (phần trang chi tiết THẬT), WDG-18 [đề xuất]: trang chi tiết lịch hẹn của Bệnh nhân ghép hai thẻ của module `doctor` (`PatientExamSections`, import CHỈ qua `features/doctor/index.ts`: Q20). `fetch` là bản bọc của API giả booking: đường dẫn
// `/patient/exam-records/…` do hàm của test trả lời (JSON dựng TẠI CHỖ theo hợp đồng B5, B6; KHÔNG import file `testing/` của `doctor`), mọi đường dẫn khác chuyển cho API giả của booking. KHÔNG sửa `features/booking/testing/*`. Dữ liệu giả.
afterEach(cleanUpDetailPage);

const EXAM_PATH = `/patient/exam-records/${DETAIL_CODE}`;
const NOTE = {
  trieuChung: 'Bệnh nhân mô tả đau ngực nhẹ.',
  chanDoanSoBo: 'Ghi nhận ban đầu.',
  huongXuLy: 'Theo dõi huyết áp.',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-10-20T10:30:00.000Z',
  capNhatBoi: 'Nguyễn Minh Anh',
};
const RATING = {
  soSao: 4,
  nhanXet: 'Khám kỹ, giải thích dễ hiểu.',
  thoiDiemTao: '2026-10-21T03:00:00.000Z',
};

function examBody(
  overrides: {
    hoSoKham?: unknown;
    danhGia?: unknown;
    coTheDanhGia?: boolean;
  } = {},
) {
  const danhGia = overrides.danhGia === undefined ? null : overrides.danhGia;
  return {
    maLichHen: DETAIL_CODE,
    thoiGian: '2026-10-20T01:00:00.000Z',
    chuyenKhoa: 'Tim mạch',
    chiNhanh: 'CLINIX Quận 1',
    bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
    nguoiKham: { hoTen: 'Nguyễn Văn A', quanHe: null },
    hoSoKham: overrides.hoSoKham === undefined ? NOTE : overrides.hoSoKham,
    danhGia,
    coTheDanhGia: overrides.coTheDanhGia ?? danhGia === null,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface ExamCall {
  method: string;
  path: string;
  body: string | null;
}
type ExamHandler = (call: ExamCall) => Response | Promise<Response>;

// Dựng trang với lịch ở `trangThai`; lời gọi `exam-records` đi vào `handler` và được ghi lại ở `calls`
function renderPage(
  trangThai: string,
  handler: ExamHandler,
  options: { extra?: Parameters<typeof renderDetailPage>[0] } = {},
) {
  const calls: ExamCall[] = [];
  const view = renderDetailPage({
    ...options.extra,
    before: (api) => {
      api.detail = makeDetail({ trangThai, choPhepHuy: false });
      const base = api.fetch;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const { pathname } = new URL(String(input), 'http://localhost');
          const path = pathname.replace(/^\/api/, '');
          if (!path.startsWith('/patient/exam-records/')) {
            return base(input, init);
          }
          const call: ExamCall = {
            method: init?.method ?? 'GET',
            path,
            body: typeof init?.body === 'string' ? init.body : null,
          };
          calls.push(call);
          return handler(call);
        }),
      );
    },
  });
  return { calls, ...view };
}

const heading = (name: string) =>
  screen.getByRole('heading', { level: 2, name });
const column = (name: string) =>
  screen.getByRole('region', { name }).parentElement as HTMLElement;
const titles = (area: HTMLElement) =>
  within(area)
    .getAllByRole('heading', { level: 2 })
    .map((element) => element.textContent);
const rateNow = () => screen.queryByRole('button', { name: 'Đánh giá ngay' });

describe('doctor-exam F6 — trang chi tiết lịch hẹn THẬT khi `HoanThanh` (WXH-09)', () => {
  it('WXH-09 hồ sơ THẬT thay câu tĩnh ở cột TRÁI (sau "Thông tin lịch hẹn"), thẻ "Đánh giá bác sĩ" ở cột PHẢI (sau "Trạng thái lịch hẹn"); MỘT lần gọi `exam-records`', async () => {
    const { calls, api } = renderPage('HoanThanh', () => json(examBody()));
    await detailLoaded();
    await screen.findByRole('button', { name: 'Đánh giá ngay' });

    expect(screen.queryByText(DETAIL_TEXT.recordNote)).toBeNull();
    expect(
      screen.getByText('Bệnh nhân mô tả đau ngực nhẹ.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Xem trong sổ khám bệnh →' }),
    ).toHaveAttribute('href', `/benh-nhan/ho-so-kham-benh?ca=${DETAIL_CODE}`);

    const leftColumn = column('Hồ sơ khám bệnh');
    const rightColumn = column('Đánh giá bác sĩ');
    expect(leftColumn).not.toBe(rightColumn);
    // hai cột cùng một lưới, trái trước phải
    expect(leftColumn.parentElement).toBe(rightColumn.parentElement);
    expect(leftColumn.nextElementSibling).toBe(rightColumn);
    expect(titles(leftColumn)).toEqual([
      'Thông tin lịch hẹn',
      'Hồ sơ khám bệnh',
    ]);
    expect(titles(rightColumn)).toEqual([
      'Chi phí & Thanh toán',
      'Trạng thái lịch hẹn',
      'Đánh giá bác sĩ',
    ]);

    expect(calls).toEqual([{ method: 'GET', path: EXAM_PATH, body: null }]);
    // lời gọi chi tiết của chính trang chỉ MỘT lần, không gọi thêm API nào của booking
    expect(api.callsTo('GET', DETAIL_API_PATH)).toHaveLength(1);
    expect(api.requests).toHaveLength(1);
  });

  it('WXH-09 chưa có hồ sơ (Figma 422:2) ⇒ thẻ hồ sơ là câu "Chưa có hồ sơ khám. …" (không câu tĩnh cũ, không liên kết), vẫn có `Đánh giá ngay`', async () => {
    renderPage('HoanThanh', () => json(examBody({ hoSoKham: null })));
    await detailLoaded();
    await screen.findByRole('button', { name: 'Đánh giá ngay' });
    expect(
      screen.getByText(/^Chưa có hồ sơ khám\. Ca khám đã hoàn thành/),
    ).toBeInTheDocument();
    expect(screen.queryByText(DETAIL_TEXT.recordNote)).toBeNull();
    expect(screen.queryByRole('link', { name: /sổ khám bệnh/ })).toBeNull();
  });

  it('WXH-09 đã có hồ sơ và đã đánh giá (Figma 424:2) ⇒ hồ sơ + đánh giá ở đúng cột, KHÔNG nút, KHÔNG form', async () => {
    renderPage('HoanThanh', () =>
      json(examBody({ danhGia: RATING, coTheDanhGia: false })),
    );
    await detailLoaded();
    await screen.findByRole('img', { name: '4 sao' });
    expect(
      within(column('Đánh giá bác sĩ')).getByText('Tốt'),
    ).toBeInTheDocument();
    expect(screen.getByText(RATING.nhanXet)).toBeInTheDocument();
    expect(rateNow()).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it.each([
    ...APPOINTMENT_STATES.filter((status) => status !== 'HoanThanh'),
    'DaDoiLich',
  ])(
    'WXH-09 trạng thái %s giữ câu tĩnh cũ ở thẻ hồ sơ, KHÔNG thẻ đánh giá và KHÔNG lời gọi `exam-records`',
    async (status) => {
      const { calls } = renderPage(status, () => json(examBody()));
      await detailLoaded();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.getByText(DETAIL_TEXT.recordNote)).toBeInTheDocument();
      expect(heading('Hồ sơ khám bệnh')).toBeInTheDocument();
      expect(screen.queryByText(/Đánh giá bác sĩ/)).toBeNull();
      expect(screen.queryByRole('link', { name: /sổ khám bệnh/ })).toBeNull();
      expect(calls).toEqual([]);
    },
  );
});

describe('doctor-exam F6 — lỗi `exam-records` chỉ hỏng hai thẻ, không hỏng trang (WXH-09; #412 "Đóng khi")', () => {
  it.each([
    [
      '500 LOI_HE_THONG',
      () => json({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500),
    ],
    [
      '404 KHONG_TIM_THAY',
      () => json({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404),
    ],
    ['200 sai hình dạng', () => json({ maLichHen: DETAIL_CODE })],
    ['mất mạng', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])(
    'WXH-09 %s ⇒ thẻ đầu, thông tin, chi phí, mốc trạng thái VẪN đủ; hai thẻ hồ sơ và đánh giá có hộp lỗi',
    async (_name, handler) => {
      renderPage('HoanThanh', handler);
      await detailLoaded();
      await waitFor(() =>
        expect(
          within(column('Hồ sơ khám bệnh')).getByRole('alert'),
        ).toBeInTheDocument(),
      );
      expect(
        within(column('Đánh giá bác sĩ')).getAllByRole('alert').length,
      ).toBeGreaterThan(0);
      expect(heading('Thông tin lịch hẹn')).toBeInTheDocument();
      expect(heading('Chi phí & Thanh toán')).toBeInTheDocument();
      expect(heading('Trạng thái lịch hẹn')).toBeInTheDocument();
      expect(
        screen.getByRole('region', { name: DETAIL_TEXT.summary }),
      ).toBeInTheDocument();
      expect(screen.getByText('300.000đ')).toBeInTheDocument();
      expect(rateNow()).toBeNull();
      // không câu tĩnh cũ, không "Chưa có hồ sơ" bịa khi chưa biết
      expect(screen.queryByText(DETAIL_TEXT.recordNote)).toBeNull();
      expect(screen.queryByText(/^Chưa có hồ sơ khám\./)).toBeNull();
    },
  );

  it('WXH-09 `Thử lại` chạy lại MỘT lời gọi `exam-records` và hai thẻ hồi phục; lời gọi chi tiết của trang không lặp', async () => {
    let fail = true;
    const { calls, api } = renderPage('HoanThanh', () =>
      fail
        ? json({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500)
        : json(examBody()),
    );
    await detailLoaded();
    await waitFor(() =>
      expect(
        within(column('Hồ sơ khám bệnh')).getByRole('alert'),
      ).toBeInTheDocument(),
    );
    fail = false;
    fireEvent.click(
      within(column('Hồ sơ khám bệnh')).getByRole('button', {
        name: 'Thử lại',
      }),
    );
    await screen.findByRole('button', { name: 'Đánh giá ngay' });
    expect(calls).toHaveLength(2);
    expect(api.callsTo('GET', DETAIL_API_PATH)).toHaveLength(1);
    expect(
      screen.getByText('Bệnh nhân mô tả đau ngực nhẹ.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('doctor-exam F6 — gửi đánh giá trên trang thật và đổi lịch hẹn (WDG-04, WDG-18)', () => {
  it('WDG-04 gửi 4 sao kèm nhận xét ⇒ MỘT POST tới `<mã>/rating`, thẻ đánh giá ở cột phải đổi thành "đã đánh giá", booking KHÔNG tải lại chi tiết', async () => {
    const { calls, api } = renderPage('HoanThanh', (call) =>
      call.method === 'POST' ? json(RATING, 201) : json(examBody()),
    );
    await detailLoaded();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Đánh giá ngay' }),
    );
    fireEvent.click(screen.getByRole('radio', { name: '4 sao' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: RATING.nhanXet },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
    await screen.findByRole('img', { name: '4 sao' });

    const posts = calls.filter((call) => call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe(`${EXAM_PATH}/rating`);
    expect(JSON.parse(posts[0].body!)).toEqual({
      soSao: 4,
      nhanXet: RATING.nhanXet,
    });
    expect(
      within(column('Đánh giá bác sĩ')).getByText('Tốt'),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
    expect(api.callsTo('GET', DETAIL_API_PATH)).toHaveLength(1);
    expect(api.writes()).toEqual([]);
  });

  it('WDG-18 đổi mã lịch hẹn trên URL khi form đang mở (cùng component) ⇒ form đóng, nhận xét cũ KHÔNG còn, trang tải lại hai chi tiết', async () => {
    const { calls } = renderPage('HoanThanh', () => json(examBody()), {
      extra: {
        extra: (
          <Link to={patientAppointmentDetailPath('CP20261099999')}>
            sang lịch khác
          </Link>
        ),
      },
    });
    await detailLoaded();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Đánh giá ngay' }),
    );
    fireEvent.click(screen.getByRole('radio', { name: '5 sao' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Nhận xét của lịch trước' },
    });
    expect(screen.getByRole('textbox')).toHaveValue('Nhận xét của lịch trước');

    fireEvent.click(screen.getByRole('link', { name: 'sang lịch khác' }));
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    await screen.findByRole('button', { name: 'Đánh giá ngay' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(document.body.textContent).not.toContain('Nhận xét của lịch trước');
  });
});
