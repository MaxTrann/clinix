import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import type { RemoteState } from '../../../../shared/hooks/use-remote';
import { patientAppointmentDetailPath } from '../../../../shared/routes/booking-paths';
import type { ExamDetail, ExamDetailNote } from '../api/patient-exam-types';
import { FailureBox } from './failure-box';
import { RecordPane } from './record-pane';

// doctor-exam F5: ngăn chi tiết của ca đang chọn (Figma `414:382`, `443:517`, `415:383`). WXH-04 (thẻ đầu, bốn khối, "Cập nhật lần cuối", liên kết), WXH-05 (hộp "Chưa có hồ sơ khám"), WXH-07 (mã trong liên kết được mã hoá),
// XHS-14 phần web (chữ trống ⇒ "Chưa ghi"), WXH-06 (đang tải, lỗi, 404 không Thử lại), WXH-17 [đề xuất] (tên vùng, `aria-busy`, khoá TÊN LỚP). Giờ theo giờ Việt Nam. Dữ liệu giả, không phải của ai.
const NOTE: ExamDetailNote = {
  trieuChung: 'Bệnh nhân mô tả đau ngực, khó thở khi gắng sức.',
  chanDoanSoBo: 'Ghi nhận ban đầu; cần theo dõi thêm.',
  huongXuLy: 'Hạn chế hoạt động thể lực nặng.',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
  capNhatBoi: 'Nguyễn Minh Anh',
};

function detail(overrides: Partial<ExamDetail> = {}): ExamDetail {
  return {
    maLichHen: 'CLX-20260610-001',
    thoiGian: '2026-06-10T02:00:00.000Z',
    chuyenKhoa: 'Tim mạch',
    chiNhanh: 'CLINIX Chi nhánh Quận 3',
    bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
    nguoiKham: { hoTen: 'Nguyễn Văn A', quanHe: null },
    hoSoKham: NOTE,
    // F6: chi tiết đủ chín khoá (hai khoá cuối do thẻ đánh giá dùng; ngăn của F5 không đọc)
    danhGia: null,
    coTheDanhGia: true,
    ...overrides,
  };
}

function renderPane(
  state: RemoteState<ExamDetail | null>,
  caseCode: string | null = 'CLX-20260610-001',
) {
  const onRetry = vi.fn();
  const paneRef = createRef<HTMLElement>();
  render(
    <MemoryRouter>
      <RecordPane
        caseCode={caseCode}
        detail={state}
        onRetry={onRetry}
        paneRef={paneRef}
      />
    </MemoryRouter>,
  );
  return { onRetry, paneRef };
}
const ready = (data: ExamDetail): RemoteState<ExamDetail | null> => ({
  status: 'ready',
  data,
});
const pane = () => screen.getByRole('region', { name: 'Chi tiết ca khám' });
const terms = () => within(pane()).queryAllByRole('term');
const defs = () => within(pane()).queryAllByRole('definition');

describe('doctor-exam F5 — ngăn phải: chưa chọn ca, đang tải, lỗi', () => {
  it('WXH-04 chưa chọn ca (Figma 414:383): "Chọn một ca khám để xem hồ sơ" và câu gợi ý; vùng có tên, `tabIndex=-1`, không `aria-busy`', () => {
    const { paneRef } = renderPane({ status: 'ready', data: null }, null);
    expect(
      within(pane()).getByText('Chọn một ca khám để xem hồ sơ'),
    ).toBeInTheDocument();
    expect(
      within(pane()).getByText('Nhấn vào mục bất kỳ ở danh sách bên trái'),
    ).toBeInTheDocument();
    expect(pane()).toHaveAttribute('tabindex', '-1');
    expect(pane()).toHaveAttribute('aria-busy', 'false');
    expect(paneRef.current).toBe(pane());
    expect(within(pane()).queryByRole('link')).toBeNull();
  });

  it('WXH-06 đang tải: một dòng `role="status"` "Đang tải hồ sơ khám..." và `aria-busy="true"`, không hiện chi tiết của ca trước', () => {
    renderPane({ status: 'loading' });
    expect(within(pane()).getByRole('status')).toHaveTextContent(
      'Đang tải hồ sơ khám...',
    );
    expect(pane()).toHaveAttribute('aria-busy', 'true');
    expect(within(pane()).queryByRole('link')).toBeNull();
    expect(terms()).toHaveLength(0);
  });

  it('WXH-06 lỗi chung (503): hộp lỗi kèm `Thử lại` chạy lại đúng bước C', () => {
    const { onRetry } = renderPane({
      status: 'error',
      error: new ApiError(503, { maLoi: 'HE_THONG_DANG_BAN', thongBao: 'x' }),
    });
    expect(within(pane()).getByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    fireEvent.click(within(pane()).getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('WXH-06 mất mạng ⇒ câu mất mạng; phản hồi sai hình dạng ⇒ câu chung; cả hai có `Thử lại`', () => {
    const { unmount } = render(
      <FailureBox error={new NetworkError()} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    unmount();
    render(
      <FailureBox error={new UnexpectedResponseError(200)} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('WXH-06 hết giờ (15 giây) ⇒ câu hết giờ kèm `Thử lại`', () => {
    render(<FailureBox error={new TimeoutError()} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.',
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('WXH-06 404 `KHONG_TIM_THAY`: "Không tìm thấy ca khám này." và KHÔNG có `Thử lại`', () => {
    renderPane({
      status: 'error',
      error: new ApiError(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
    });
    expect(within(pane()).getByRole('alert')).toHaveTextContent(
      'Không tìm thấy ca khám này.',
    );
    expect(within(pane()).queryByRole('button')).toBeNull();
  });
});

describe('doctor-exam F5 — ngăn phải: ca đã có hồ sơ (Figma 443:517)', () => {
  it('WXH-04 thẻ đầu: mã lịch, chip "Hoàn thành", chuyên khoa, Bác sĩ (chức danh, họ tên, chuyên khoa), Ngày khám (thứ, ngày, giờ VN), Chi nhánh, Người khám (tên, "Bản thân")', () => {
    renderPane(ready(detail()));
    const text = pane().textContent ?? '';
    expect(text).toContain('CLX-20260610-001');
    expect(text).toContain('Hoàn thành');
    expect(
      within(pane()).getByRole('heading', { level: 2, name: 'Tim mạch' }),
    ).toBeInTheDocument();
    expect(text).toContain('Bác sĩ');
    expect(text).toContain('ThS.BS Nguyễn Minh Anh');
    expect(text).toContain('Ngày khám');
    expect(text).toContain('Thứ 4, 10/06/2026');
    expect(text).toContain('09:00');
    expect(text).toContain('Chi nhánh');
    expect(text).toContain('CLINIX Chi nhánh Quận 3');
    expect(text).toContain('Người khám');
    expect(text).toContain('Nguyễn Văn A');
    expect(text).toContain('Bản thân');
  });

  it('WXH-04 người khám là người thân ⇒ dòng phụ là quan hệ ("Mẹ"), không "Bản thân"', () => {
    renderPane(
      ready(detail({ nguoiKham: { hoTen: 'Trần Thị Bà', quanHe: 'Me' } })),
    );
    expect(pane().textContent).toContain('Trần Thị Bà');
    expect(pane().textContent).toContain('Mẹ');
    expect(pane().textContent).not.toContain('Bản thân');
  });

  it('WXH-04 thẻ "Nội dung hồ sơ khám": bốn nhãn đúng thứ tự (văn bản gốc, in hoa bằng CSS) và bốn giá trị; ngày tái khám có thứ', () => {
    renderPane(ready(detail()));
    expect(
      within(pane()).getByRole('heading', {
        level: 2,
        name: 'Nội dung hồ sơ khám',
      }),
    ).toBeInTheDocument();
    expect(terms().map((term) => term.textContent)).toEqual([
      'Triệu chứng',
      'Chẩn đoán sơ bộ',
      'Hướng xử lý / Lời khuyên',
      'Ngày tái khám dự kiến',
    ]);
    expect(defs().map((def) => def.textContent)).toEqual([
      NOTE.trieuChung,
      NOTE.chanDoanSoBo,
      NOTE.huongXuLy,
      'Thứ 6, 10/07/2026',
    ]);
  });

  it('WXH-04 dòng cập nhật: "Cập nhật lần cuối: 17:30 10/6/26 · bởi ThS.BS Nguyễn Minh Anh" (giờ VN từ 10:30Z; chức danh gắn vì đúng bác sĩ của lịch)', () => {
    renderPane(ready(detail()));
    expect(
      within(pane()).getByText(
        'Cập nhật lần cuối: 17:30 10/6/26 · bởi ThS.BS Nguyễn Minh Anh',
      ),
    ).toBeInTheDocument();
  });

  it('WXH-04 `capNhatBoi` KHÔNG phải bác sĩ của lịch ⇒ in nguyên, không gắn chức danh; rỗng ⇒ bỏ "· bởi …"; giờ không đọc được ⇒ bỏ cả dòng', () => {
    const { unmount } = render(
      <MemoryRouter>
        <RecordPane
          caseCode="x"
          detail={ready(
            detail({ hoSoKham: { ...NOTE, capNhatBoi: 'Trần Văn B' } }),
          )}
          onRetry={vi.fn()}
          paneRef={createRef<HTMLElement>()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('Cập nhật lần cuối: 17:30 10/6/26 · bởi Trần Văn B'),
    ).toBeInTheDocument();
    unmount();

    const second = render(
      <MemoryRouter>
        <RecordPane
          caseCode="x"
          detail={ready(detail({ hoSoKham: { ...NOTE, capNhatBoi: '' } }))}
          onRetry={vi.fn()}
          paneRef={createRef<HTMLElement>()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('Cập nhật lần cuối: 17:30 10/6/26'),
    ).toBeInTheDocument();
    second.unmount();

    render(
      <MemoryRouter>
        <RecordPane
          caseCode="x"
          detail={ready(
            detail({
              hoSoKham: { ...NOTE, capNhatLanCuoi: 'khong-phai-ngay' },
            }),
          )}
          onRetry={vi.fn()}
          paneRef={createRef<HTMLElement>()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Cập nhật lần cuối/)).toBeNull();
  });

  it('WXH-04 ngày tái khám `null` ⇒ không có khối thứ tư; ngày không có thật (30/02) ⇒ cũng không có', () => {
    const { unmount } = render(
      <MemoryRouter>
        <RecordPane
          caseCode="x"
          detail={ready(
            detail({ hoSoKham: { ...NOTE, ngayTaiKhamDuKien: null } }),
          )}
          onRetry={vi.fn()}
          paneRef={createRef<HTMLElement>()}
        />
      </MemoryRouter>,
    );
    expect(terms()).toHaveLength(3);
    expect(screen.queryByText('Ngày tái khám dự kiến')).toBeNull();
    unmount();
    render(
      <MemoryRouter>
        <RecordPane
          caseCode="x"
          detail={ready(
            detail({ hoSoKham: { ...NOTE, ngayTaiKhamDuKien: '2026-02-30' } }),
          )}
          onRetry={vi.fn()}
          paneRef={createRef<HTMLElement>()}
        />
      </MemoryRouter>,
    );
    expect(terms()).toHaveLength(3);
  });

  it('XHS-14 chữ trống (rỗng, chỉ khoảng trắng) ⇒ "Chưa ghi"; chữ khác giữ nguyên', () => {
    renderPane(
      ready(
        detail({
          hoSoKham: { ...NOTE, trieuChung: '', chanDoanSoBo: '   \n ' },
        }),
      ),
    );
    expect(defs().map((def) => def.textContent)).toEqual([
      'Chưa ghi',
      'Chưa ghi',
      NOTE.huongXuLy,
      'Thứ 6, 10/07/2026',
    ]);
  });

  it('WXH-04 hiển thị an toàn: `<script>`, `<img onerror>`, thực thể HTML, emoji hiện NGUYÊN VĂN là chữ, không thành phần tử', () => {
    const risky =
      '<script>alert(1)</script> <img src=x onerror=alert(2)> &amp; 😀';
    renderPane(ready(detail({ hoSoKham: { ...NOTE, trieuChung: risky } })));
    expect(defs()[0].textContent).toBe(risky);
    expect(pane().querySelector('script')).toBeNull();
    expect(pane().querySelector('img')).toBeNull();
  });

  it('WXH-04 xuống dòng người dùng gõ được giữ (`whitespace-pre-wrap`), chuỗi dài không dấu cách bẻ dòng (`wrap-anywhere`), 2.000 ký tự nguyên vẹn', () => {
    const long = `Dòng một\nDòng hai\n${'a'.repeat(2000)}`;
    renderPane(ready(detail({ hoSoKham: { ...NOTE, huongXuLy: long } })));
    const advice = defs()[2];
    expect(advice.textContent).toBe(long);
    expect(advice).toHaveClass('whitespace-pre-wrap');
    expect(advice).toHaveClass('wrap-anywhere');
    expect(advice).not.toHaveClass('break-words');
  });

  it('WXH-17 nhãn khối in HOA bằng CSS (`uppercase`) và `text-gray-500`; giá trị `text-gray-900`; khối trống `text-gray-500`', () => {
    renderPane(ready(detail({ hoSoKham: { ...NOTE, trieuChung: '' } })));
    const label = terms()[0];
    expect(label).toHaveClass('uppercase');
    expect(label).toHaveClass('text-gray-500');
    expect(label).not.toHaveClass('text-gray-400');
    expect(defs()[1]).toHaveClass('text-gray-900');
    expect(defs()[0]).toHaveClass('text-gray-500');
    expect(defs()[0]).not.toHaveClass('text-gray-900');
  });

  it('WXH-17 chip "Hoàn thành" và mã lịch: `text-success`, `bg-success-soft`, `border-success-line`; mã lịch chữ đơn cách', () => {
    renderPane(ready(detail()));
    const chip = within(pane()).getByText('Hoàn thành');
    expect(chip).toHaveClass('text-success');
    expect(chip).toHaveClass('bg-success-soft');
    expect(chip).toHaveClass('border-success-line');
    expect(chip).not.toHaveClass('text-gray-500');
    expect(within(pane()).getByText('CLX-20260610-001')).toHaveClass(
      'font-mono',
    );
  });
});

describe('doctor-exam F5 — ngăn phải: chưa có hồ sơ và liên kết', () => {
  it('WXH-05 `hoSoKham: null` ⇒ hộp "Chưa có hồ sơ khám" và câu Figma; KHÔNG bốn khối, KHÔNG "Cập nhật lần cuối"; thẻ đầu và liên kết vẫn có', () => {
    renderPane(ready(detail({ hoSoKham: null })));
    expect(within(pane()).getByText('Chưa có hồ sơ khám')).toBeInTheDocument();
    expect(
      within(pane()).getByText(
        'Ca khám đã hoàn thành nhưng bác sĩ chưa ghi nội dung khám. Hồ sơ sẽ hiển thị tại đây sau khi bác sĩ cập nhật.',
      ),
    ).toBeInTheDocument();
    expect(terms()).toHaveLength(0);
    expect(defs()).toHaveLength(0);
    expect(within(pane()).queryByText(/Cập nhật lần cuối/)).toBeNull();
    expect(within(pane()).queryByText('Triệu chứng')).toBeNull();
    expect(within(pane()).getByText('Hoàn thành')).toBeInTheDocument();
    expect(within(pane()).getByRole('link')).toBeInTheDocument();
  });

  it('WXH-17 hộp "chưa có hồ sơ": nền `gray-50`, viền `gray-100`, câu giải thích `gray-500`, biểu tượng trang trí', () => {
    renderPane(ready(detail({ hoSoKham: null })));
    const box = within(pane()).getByText('Chưa có hồ sơ khám')
      .parentElement as HTMLElement;
    expect(box).toHaveClass('bg-gray-50');
    expect(box).toHaveClass('border-gray-100');
    expect(box).not.toHaveClass('bg-white');
    expect(within(pane()).getByText(/Ca khám đã hoàn thành nhưng/)).toHaveClass(
      'text-gray-500',
    );
    expect(box.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('WXH-07 liên kết "Xem chi tiết lịch hẹn →" tới `patientAppointmentDetailPath(mã)`', () => {
    renderPane(ready(detail()));
    const link = within(pane()).getByRole('link', {
      name: 'Xem chi tiết lịch hẹn →',
    });
    expect(link).toHaveAttribute(
      'href',
      patientAppointmentDetailPath('CLX-20260610-001'),
    );
    expect(link).toHaveAttribute(
      'href',
      '/benh-nhan/lich-hen-cua-toi/CLX-20260610-001',
    );
    expect(link).toHaveClass('text-brand-strong');
    expect(link).toHaveClass('underline');
  });

  it.each([
    ['A/B', '/benh-nhan/lich-hen-cua-toi/A%2FB'],
    ['A?B', '/benh-nhan/lich-hen-cua-toi/A%3FB'],
    ['A#B', '/benh-nhan/lich-hen-cua-toi/A%23B'],
    ['A B', '/benh-nhan/lich-hen-cua-toi/A%20B'],
    ['Đ-1', '/benh-nhan/lich-hen-cua-toi/%C4%90-1'],
  ])(
    'WXH-07 mã lịch %j được mã hoá trong liên kết (không vỡ URL)',
    (code, href) => {
      renderPane(ready(detail({ maLichHen: code })));
      expect(within(pane()).getByRole('link')).toHaveAttribute('href', href);
    },
  );
});
