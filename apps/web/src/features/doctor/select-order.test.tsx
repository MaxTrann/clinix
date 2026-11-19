import { render, screen, within } from '@testing-library/react';
import { EMPTY_FILTERS } from './admin/approvals/approval-filters';
import { LeaveApprovalFilters } from './admin/approvals/leave-approval-filters';
import { NO_FILTERS } from './schedule/schedule-filters';
import { ScheduleToolbar } from './schedule/schedule-toolbar';

// UX1-72 đến UX1-76 (doctor UX1, G12): ô Chi nhánh của trang Duyệt yêu cầu và của lịch Bác sĩ sắp theo bảng chữ cái tiếng Việt, số tự nhiên, "Tất cả" ở đầu.
// Ô theo thứ tự nghiệp vụ (trạng thái, ca) giữ nguyên. Hộp Phân công (UX1-71) và bộ lọc Lễ tân (UX1-63 đến 70) có test riêng.

// Thứ tự API: Mẫu 10, 2, 1 và một tên có dấu
const BRANCHES = [
  { chiNhanhId: 'a', ten: 'CLINIX Mẫu 10' },
  { chiNhanhId: 'b', ten: 'CLINIX Mẫu 2' },
  { chiNhanhId: 'c', ten: 'Đông Sài Gòn' },
  { chiNhanhId: 'd', ten: 'CLINIX Mẫu 1' },
  { chiNhanhId: 'e', ten: 'Ân Phú' },
];
const EXPECTED = [
  'Ân Phú',
  'CLINIX Mẫu 1',
  'CLINIX Mẫu 2',
  'CLINIX Mẫu 10',
  'Đông Sài Gòn',
];

const optionsOf = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('trang Duyệt yêu cầu: ô Chi nhánh (G12)', () => {
  it('UX1-72 sắp theo chữ cái tiếng Việt và số tự nhiên; "Tất cả chi nhánh" ở đầu', () => {
    render(
      <LeaveApprovalFilters
        filters={EMPTY_FILTERS}
        onChange={() => undefined}
        branches={BRANCHES}
        dateOrderInvalid={false}
      />,
    );

    expect(optionsOf(screen.getByLabelText('Chi nhánh'))).toEqual([
      'Tất cả chi nhánh',
      ...EXPECTED,
    ]);
  });

  it('UX1-73 ô Trạng thái giữ thứ tự nghiệp vụ (không sắp theo chữ cái); mảng chi nhánh đưa vào không bị đổi thứ tự', () => {
    const before = BRANCHES.map((branch) => branch.chiNhanhId);
    render(
      <LeaveApprovalFilters
        filters={EMPTY_FILTERS}
        onChange={() => undefined}
        branches={BRANCHES}
        dateOrderInvalid={false}
      />,
    );

    const status = optionsOf(screen.getByLabelText('Trạng thái'));
    expect(status[0]).toBe('Tất cả');
    expect(status.slice(1)).not.toEqual([...status.slice(1)].sort());
    expect(BRANCHES.map((branch) => branch.chiNhanhId)).toEqual(before);
  });

  it('UX1-74 hai ô ngày gửi là ô chữ dd/mm/yyyy có nhãn (nhãn `htmlFor`, mỗi nhãn đúng MỘT phần tử)', () => {
    render(
      <LeaveApprovalFilters
        filters={{ ...EMPTY_FILTERS, tuNgayGui: '2026-11-24' }}
        onChange={() => undefined}
        dateOrderInvalid={false}
      />,
    );

    expect(screen.getAllByLabelText('Từ ngày gửi')).toHaveLength(1);
    expect(screen.getAllByLabelText('Đến ngày gửi')).toHaveLength(1);
    expect(screen.getByLabelText('Từ ngày gửi')).toHaveValue('24/11/2026');
    expect(screen.getByLabelText('Đến ngày gửi')).toHaveValue('');
  });
});

describe('lịch Bác sĩ: ô Chi nhánh (G12)', () => {
  function renderToolbar() {
    return render(
      <ScheduleToolbar
        mode="week"
        onModeChange={() => undefined}
        periodLabel="Tuần 16/11 – 22/11/2026"
        onPrevious={() => undefined}
        onNext={() => undefined}
        onToday={() => undefined}
        todayDisabled={false}
        filters={NO_FILTERS}
        onFiltersChange={() => undefined}
        branches={BRANCHES}
      />,
    );
  }

  it('UX1-75 sắp theo chữ cái tiếng Việt và số tự nhiên; "Tất cả chi nhánh" ở đầu', () => {
    renderToolbar();

    expect(optionsOf(screen.getByLabelText('Lọc theo chi nhánh'))).toEqual([
      'Tất cả chi nhánh',
      ...EXPECTED,
    ]);
  });

  it('UX1-76 ca và trạng thái CỐ ĐỊNH giữ thứ tự nghiệp vụ: "Tất cả ca, Ca sáng, Ca chiều" (xếp theo chữ cái sẽ đảo Chiều lên trước Sáng)', () => {
    renderToolbar();

    expect(optionsOf(screen.getByLabelText('Lọc theo ca'))).toEqual([
      'Tất cả ca',
      'Ca sáng',
      'Ca chiều',
    ]);
  });
});
