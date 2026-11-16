import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { ExamRecordSection } from './exam-record-section';
import { detailOf } from './testing/render-sections';

// doctor-exam F6, WXH-09 (phần thẻ hồ sơ), WXH-18, WDG-17: thẻ "Hồ sơ khám bệnh" ở cột trái (Figma `422:2`, `424:2`, `425:2`). Trạng thái cho thẳng qua props. happy-dom không đo kích thước: khoá TÊN LỚP, MỖI lớp một khẳng định (AI-BUG-052).
type Props = ComponentProps<typeof ExamRecordSection>;

function renderSection(state: Props['state']) {
  const onRetry = vi.fn();
  const view = render(
    <MemoryRouter>
      <ExamRecordSection state={state} onRetry={onRetry} />
    </MemoryRouter>,
  );
  return { onRetry, ...view };
}

const ready = (
  overrides: Parameters<typeof detailOf>[0] = {},
): Props['state'] => ({
  status: 'ready',
  data: detailOf(overrides),
});
const link = () =>
  screen.queryByRole('link', { name: 'Xem trong sổ khám bệnh →' });

describe('doctor-exam F6 — thẻ hồ sơ: ba trạng thái (WXH-09)', () => {
  it('WXH-09 có hồ sơ ⇒ bốn khối của F5 (nội dung NGUYÊN VĂN), "Cập nhật lần cuối … · bởi <chức danh> <bác sĩ>", và liên kết sổ khám (Figma 424:2)', () => {
    renderSection(ready());
    expect(
      screen.getByRole('region', { name: 'Hồ sơ khám bệnh' }),
    ).toBeInTheDocument();
    for (const label of [
      'Triệu chứng',
      'Chẩn đoán sơ bộ',
      'Hướng xử lý / Lời khuyên',
      'Ngày tái khám dự kiến',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByText('Bệnh nhân mô tả đau ngực, khó thở khi gắng sức.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Thứ 6, 10/07/2026')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cập nhật lần cuối: 17:30 10/6/26 · bởi ThS.BS Nguyễn Minh Anh',
      ),
    ).toBeInTheDocument();
    expect(link()).toBeInTheDocument();
  });

  it('WXH-09 chưa có hồ sơ (`hoSoKham: null`) ⇒ MỘT dòng câu Figma 422:284, KHÔNG bốn khối, KHÔNG "Cập nhật lần cuối", KHÔNG liên kết (Q6 (3))', () => {
    renderSection(ready({ hoSoKham: null }));
    expect(
      screen.getByText(
        'Chưa có hồ sơ khám. Ca khám đã hoàn thành nhưng bác sĩ chưa ghi nội dung. Hồ sơ sẽ hiển thị sau khi bác sĩ cập nhật.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Triệu chứng')).toBeNull();
    expect(screen.queryByText(/Cập nhật lần cuối/)).toBeNull();
    expect(link()).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('WXH-09 ba cột chữ rỗng (cột `text` của DB là NULL) ⇒ "Chưa ghi" (XHS-14), vẫn có liên kết', () => {
    renderSection(
      ready({
        hoSoKham: {
          trieuChung: '',
          chanDoanSoBo: '',
          huongXuLy: '',
          ngayTaiKhamDuKien: null,
          capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
          capNhatBoi: '',
        },
      }),
    );
    expect(screen.getAllByText('Chưa ghi')).toHaveLength(3);
    expect(screen.queryByText('Ngày tái khám dự kiến')).toBeNull();
    expect(link()).toBeInTheDocument();
  });

  it('WXH-09 đang tải ⇒ tiêu đề thẻ và "Đang tải hồ sơ khám..." (`role="status"`); chưa có nội dung, chưa có liên kết', () => {
    renderSection({ status: 'loading' });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Hồ sơ khám bệnh' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải hồ sơ khám...',
    );
    expect(screen.queryByText('Triệu chứng')).toBeNull();
    expect(link()).toBeNull();
  });

  it('WXH-09 lỗi (mạng, 200 sai hình dạng, 500) ⇒ hộp lỗi `Thử lại` CHỈ trong thẻ này; bấm gọi `onRetry`; không nội dung dở dang', () => {
    for (const error of [
      new NetworkError(),
      new UnexpectedResponseError(200),
      new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    ]) {
      const view = renderSection({ status: 'error', error });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.queryByText('Triệu chứng')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
      expect(view.onRetry).toHaveBeenCalledTimes(1);
      view.unmount();
    }
  });

  it('WXH-09 404 `KHONG_TIM_THAY` ⇒ "Không tìm thấy ca khám này." KHÔNG `Thử lại` (thử lại không đổi được kết quả)', () => {
    renderSection({
      status: 'error',
      error: new ApiError(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không tìm thấy ca khám này.',
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('WXH-09 không dữ liệu (`ready` mà `null`) ⇒ thẻ chỉ có tiêu đề, không lỗi, không liên kết', () => {
    renderSection({ status: 'ready', data: null });
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(link()).toBeNull();
  });
});

describe('doctor-exam F6 — liên kết "Xem trong sổ khám bệnh →" (WXH-18)', () => {
  it('WXH-18 tới trang Hồ sơ khám bệnh kèm `?ca=<mã>`; trong URL CHỈ có mã lịch hẹn (không nội dung khám, không người khám)', () => {
    renderSection(ready({ maLichHen: 'CLX-20260610-001' }));
    expect(link()).toHaveAttribute(
      'href',
      '/benh-nhan/ho-so-kham-benh?ca=CLX-20260610-001',
    );
    const url = new URL(link()!.getAttribute('href')!, 'http://web.invalid');
    expect([...url.searchParams.keys()]).toEqual(['ca']);
    expect(url.search).toBe('?ca=CLX-20260610-001');
    expect(url.hash).toBe('');
  });

  it('WXH-18 mã có `/`, `?`, `#`, `&`, `=`, khoảng trắng, tiếng Việt, `%` được MÃ HOÁ (không vỡ URL, không thêm khoá query, đọc lại đúng nguyên mã)', () => {
    const code = 'A/B?C#D E&F=G Đ%1';
    renderSection(ready({ maLichHen: code }));
    const href = link()!.getAttribute('href')!;
    expect(href).toBe(
      '/benh-nhan/ho-so-kham-benh?ca=A%2FB%3FC%23D%20E%26F%3DG%20%C4%90%251',
    );
    const url = new URL(href, 'http://web.invalid');
    expect([...url.searchParams.keys()]).toEqual(['ca']);
    expect(url.searchParams.get('ca')).toBe(code);
    expect(url.hash).toBe('');
  });
});

describe('doctor-exam F6 — thẻ hồ sơ: khoá tên lớp (WDG-17)', () => {
  it('WDG-17 liên kết `text-xs`, `font-medium`, `text-brand-strong` (không `text-brand`), `underline`, `leading-[15px]`', () => {
    renderSection(ready());
    const anchor = link()!;
    expect(anchor).toHaveClass('text-xs');
    expect(anchor).toHaveClass('font-medium');
    expect(anchor).toHaveClass('text-brand-strong');
    expect(anchor).not.toHaveClass('text-brand');
    expect(anchor).toHaveClass('underline');
    expect(anchor).toHaveClass('leading-[15px]');
  });

  it('WDG-17 dòng "chưa có hồ sơ": câu `text-sm` `text-gray-500` (không `#6a7282` thô), biểu tượng `size-4` `text-gray-300` `aria-hidden`, cùng hàng (`flex`), đệm `p-5`, cách `gap-2.5`', () => {
    const { container } = renderSection(ready({ hoSoKham: null }));
    const paragraph = screen.getByText(/^Chưa có hồ sơ khám\./);
    expect(paragraph).toHaveClass('text-sm');
    expect(paragraph).toHaveClass('text-gray-500');
    const row = paragraph.parentElement!;
    expect(row).toHaveClass('flex');
    expect(row).toHaveClass('p-5');
    expect(row).toHaveClass('gap-2.5');
    const icon = container.querySelector(
      'section svg[class*="text-gray-300"]',
    )!;
    expect(icon).toHaveClass('size-4');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('WDG-17 nội dung hồ sơ là chữ thuần: `whitespace-pre-wrap` và `wrap-anywhere` (tái dùng `RecordFields`); không HTML thô', () => {
    const { container } = renderSection(
      ready({
        hoSoKham: {
          trieuChung: '<script>alert(1)</script>\nDòng hai',
          chanDoanSoBo: 'b',
          huongXuLy: 'c',
          ngayTaiKhamDuKien: null,
          capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
          capNhatBoi: 'Nguyễn Minh Anh',
        },
      }),
    );
    expect(container.querySelector('script')).toBeNull();
    const value = screen.getByText(/alert\(1\)/);
    expect(value.textContent).toBe('<script>alert(1)</script>\nDòng hai');
    expect(value).toHaveClass('whitespace-pre-wrap');
    expect(value).toHaveClass('wrap-anywhere');
  });
});
