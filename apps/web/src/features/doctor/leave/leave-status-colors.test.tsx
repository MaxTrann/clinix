import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import type { LeaveRequest, LeaveStatus } from '../api/leave-api';
import { StatusBadge } from '../components/status-badge';
import { colorsOf, contrastRatio, familyOf } from '../testing/color-tokens';
import { LeaveDetailDialog } from './leave-detail-dialog';
import { LeaveHistory } from './leave-history';
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_ORDER } from './leave-format';

// DUX3-30 đến DUX3-37 (doctor UX3, G16, T6; WN-04, WN-07, WN-08, WA-07): chip trạng thái của YÊU CẦU nghỉ (Đã duyệt, Chờ duyệt, Từ chối) dùng MỘT bộ màu xanh lá,
// vàng, đỏ ở mọi màn, qua MỘT thành phần `StatusBadge`. Test thành phần so sánh CHÉO (chip ở màn này có đúng `className` của `StatusBadge` dựng riêng) và đọc
// họ màu, tương phản từ token thật; không khẳng định tên lớp cụ thể. Chữ "Nghỉ đã duyệt" của Ô LỊCH là trạng thái khác (xem `schedule/status-colors.test.tsx`).

const FAMILY_OF_STATUS: Record<LeaveStatus, string> = {
  DaDuyet: 'green',
  ChoDuyet: 'amber',
  TuChoi: 'red',
};

// Dữ liệu giả, lý do không phải chữ thật
function request(trangThai: LeaveStatus, id: string): LeaveRequest {
  return {
    yeuCauNghiPhepId: id,
    trangThai,
    hinhThuc: 'CaNgay',
    tuNgay: '2026-11-21',
    denNgay: '2026-11-21',
    ca: null,
    lyDo: 'Việc riêng (dữ liệu mẫu)',
    thoiDiemTao: '2026-11-18T08:00:00Z',
    thoiDiemXuLy: trangThai === 'ChoDuyet' ? null : '2026-11-19T08:00:00Z',
  };
}

const ALL_REQUESTS = LEAVE_STATUS_ORDER.map((status, index) =>
  request(status, String(index + 1)),
);

// `className` của chip do `StatusBadge` vẽ (dựng riêng rồi gỡ, để không lẫn vào màn đang kiểm)
function badgeClass(status: LeaveStatus): string {
  const { container, unmount } = render(<StatusBadge status={status} />);
  const className = within(container).getByText(
    LEAVE_STATUS_LABELS[status],
  ).className;
  unmount();
  return className;
}

function renderHistory() {
  render(
    <LeaveHistory
      state={{
        status: 'success',
        data: {
          items: ALL_REQUESTS,
          total: ALL_REQUESTS.length,
          page: 1,
          pageSize: 5,
        },
      }}
      page={1}
      onPageChange={() => undefined}
      status={undefined}
      onStatusChange={() => undefined}
      onRetry={() => undefined}
    />,
  );
  // Danh sách dòng (không lẫn ô lọc trạng thái, cũng có chữ "Đã duyệt" ở `<option>`)
  return within(screen.getByRole('list'));
}

describe('DUX3-30 StatusBadge: xanh lá, vàng, đỏ, đủ tương phản', () => {
  it.each(LEAVE_STATUS_ORDER)(
    'DUX3-30 WN-04 %s: chữ, nền, viền cùng họ màu quy ước và chữ trên nền ≥ 4,5:1',
    (status) => {
      const className = badgeClass(status);
      const { text, bg, border } = colorsOf(className);
      expect([text, bg, border].every(Boolean), className).toBe(true);
      for (const token of [text, bg, border]) {
        expect(familyOf(token ?? '')).toBe(FAMILY_OF_STATUS[status]);
      }
      const ratio = contrastRatio(text ?? '', bg ?? '');
      expect(
        ratio,
        `${status}: ${text} trên ${bg} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('DUX3-30 WN-04 ba trạng thái có ba màu khác nhau (không hai trạng thái cùng màu)', () => {
    const backgrounds = LEAVE_STATUS_ORDER.map(
      (status) => colorsOf(badgeClass(status)).bg,
    );
    expect(new Set(backgrounds).size).toBe(LEAVE_STATUS_ORDER.length);
  });
});

describe('DUX3-31 đến DUX3-36 cùng một trạng thái, cùng một màu ở mọi màn', () => {
  it.each(LEAVE_STATUS_ORDER)(
    'DUX3-31 WN-07 lịch sử yêu cầu của Bác sĩ: chip "%s" có đúng `className` của StatusBadge',
    (status) => {
      const expected = badgeClass(status);
      const list = renderHistory();
      expect(list.getByText(LEAVE_STATUS_LABELS[status]).className).toBe(
        expected,
      );
    },
  );

  it.each(LEAVE_STATUS_ORDER)(
    'DUX3-32 WN-08 hộp "Chi tiết yêu cầu nghỉ": chip "%s" có đúng `className` của StatusBadge',
    (status) => {
      const expected = badgeClass(status);
      render(
        <LeaveDetailDialog
          request={request(status, '9')}
          returnFocusRef={createRef<HTMLElement>()}
          onClose={() => undefined}
        />,
      );
      const dialog = screen.getByRole('dialog', {
        name: 'Chi tiết yêu cầu nghỉ',
      });
      expect(
        within(dialog).getByText(LEAVE_STATUS_LABELS[status]).className,
      ).toBe(expected);
    },
  );

  it('DUX3-34 WN-07 lịch sử và hộp chi tiết cùng một trạng thái ra cùng MỘT bộ màu (chữ, nền, viền)', () => {
    const list = renderHistory();
    for (const status of LEAVE_STATUS_ORDER) {
      const inHistory = colorsOf(
        list.getByText(LEAVE_STATUS_LABELS[status]).className,
      );
      expect(inHistory, status).toEqual(colorsOf(badgeClass(status)));
    }
  });

  it('DUX3-35 WN-07 "Đã duyệt" không còn đỏ và "Từ chối" không còn cam ở màn Bác sĩ (G16: cùng trạng thái, hai màn hai màu ngược nhau)', () => {
    const list = renderHistory();
    const approved = colorsOf(list.getByText('Đã duyệt').className);
    const rejected = colorsOf(list.getByText('Từ chối').className);
    expect(familyOf(approved.bg ?? '')).toBe('green');
    expect(familyOf(rejected.bg ?? '')).toBe('red');
    expect(familyOf(rejected.text ?? '')).not.toBe('orange');
  });

  it('DUX3-36 WN-07 chữ nhãn vẫn đủ, màu không là cách duy nhất: "Đã duyệt", "Chờ duyệt", "Từ chối" hiện đúng một lần mỗi dòng', () => {
    const list = renderHistory();
    for (const status of LEAVE_STATUS_ORDER) {
      expect(list.getAllByText(LEAVE_STATUS_LABELS[status])).toHaveLength(1);
    }
  });
});

// DUX3-33 và DUX3-37: bộ quét mã. Chip yêu cầu của Bác sĩ và Admin chỉ qua `components/status-badge`, KHÔNG đọc `STATUS_STYLES` (bảng màu của Ô LỊCH).
// Màu thật ở trang Duyệt yêu cầu của Admin do số đo trình duyệt kiểm (tiêu chí 6).
const SOURCES = import.meta.glob(
  ['./*.{ts,tsx}', '../admin/approvals/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const IMPORT_PATTERN = /from\s*['"]([^'"]+)['"]/g;

function importsOf(source: string): string[] {
  return Array.from(source.matchAll(IMPORT_PATTERN), (match) => match[1] ?? '');
}

describe('DUX3-33 và DUX3-37 bộ quét: một nguồn màu cho chip yêu cầu', () => {
  it('DUX3-37 WA-07 không file nào trong `leave/` và `admin/approvals/` import `status-styles` (bảng màu Ô LỊCH)', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((file) =>
      importsOf(SOURCES[file] ?? '').some((path) =>
        path.endsWith('status-styles'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('DUX3-33 WA-07 trang Duyệt yêu cầu (bảng và ngăn kéo) và lịch sử, hộp chi tiết của Bác sĩ đều import `components/status-badge`', () => {
    for (const file of [
      '../admin/approvals/leave-approval-page.tsx',
      '../admin/approvals/leave-detail-drawer.tsx',
      './leave-history.tsx',
      './leave-detail-dialog.tsx',
    ]) {
      // Khoá glob không rỗng: file phải thật sự được quét (khoá sai thì `importsOf('')` rỗng và ca đỏ nhầm)
      expect(SOURCES[file], `không quét được ${file}`).toBeDefined();
      const imports = importsOf(SOURCES[file] ?? '');
      expect(
        imports.some((path) => path.endsWith('components/status-badge')),
        file,
      ).toBe(true);
    }
  });

  it('DUX3-37 WA-07 bộ quét có tác dụng: nhận ra một import `status-styles` và không nhầm `status-badge` (đối chứng)', () => {
    const sample = `import { STATUS_STYLES } from '../schedule/status-styles';\nimport { StatusBadge } from '../components/status-badge';`;
    expect(importsOf(sample)).toEqual([
      '../schedule/status-styles',
      '../components/status-badge',
    ]);
    expect(
      importsOf(sample).filter((path) => path.endsWith('status-styles')),
    ).toHaveLength(1);
  });
});
