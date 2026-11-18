import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { APPOINTMENT_STATES } from './appointment-status';
import { StatusTimeline } from './status-timeline';

// booking F13 (issue #550): thanh trạng thái DÙNG CHUNG cho Bác sĩ, Bệnh nhân và Quản trị viên. Mã STL là [đề xuất] (PLAN booking mục 7.49). Mức W: vitest chạy `css: false` nên đây là bằng chứng CẤU TRÚC và LỚP CSS;
// kích thước, màu và tương phản thật đo bằng Chromium (TRACKING booking 3.45). Mỗi lớp CSS được kiểm bằng MỘT `not.toHaveClass` riêng (`not.toHaveClass(a, b)` yếu: AI-BUG-052).
// Kế thừa UIF-05 và UIF-07 của F12 (đoạn nối đều nhau, dòng phụ chừa chỗ, tiêu đề kiểu `DetailCard`) từ `patient/detail/detail-timeline.tsx` cũ.
const TITLE = 'Trạng thái lịch hẹn';

type TimelineProps = ComponentProps<typeof StatusTimeline>;

function renderTimeline(
  trangThai: string,
  props: Partial<Omit<TimelineProps, 'trangThai'>> = {},
) {
  return render(
    <StatusTimeline
      trangThai={trangThai}
      title={TITLE}
      unknown="hide"
      {...props}
    />,
  );
}

const list = () => screen.getByRole('list', { name: TITLE });
const stepsOf = () => within(list()).getAllByRole('listitem');
// Chấm là phần tử `aria-hidden` ĐẦU TIÊN của hàng (đoạn nối đứng sau nó)
const dotOf = (step: HTMLElement) =>
  step.querySelector('[aria-hidden="true"]') as HTMLElement;
const labelOf = (step: HTMLElement, text: string) =>
  within(step).getByText(text, { selector: 'span' });

// Lớp riêng của từng kiểu chấm; mọi chấm đều `size-7` (26,25 px = Figma `458:304`, `420:332`) và `rounded-full`
const DOT_CLASSES = {
  passed: ['bg-success'],
  current: ['bg-brand', 'ring-4', 'ring-cyan-100'],
  terminal: ['bg-gray-600'],
  upcoming: ['border-2', 'border-gray-200', 'bg-gray-50'],
} as const;
const ALL_DOT_CLASSES = [
  ...new Set(Object.values(DOT_CLASSES).flatMap((classes) => [...classes])),
];

const LABEL_CLASSES = {
  passed: 'text-success',
  current: 'text-brand-strong',
  upcoming: 'text-gray-600',
  terminal: 'text-gray-700',
} as const;
const ALL_LABEL_CLASSES = Object.values(LABEL_CLASSES);

function expectDotAndLabel(
  step: HTMLElement,
  state: keyof typeof DOT_CLASSES,
  label: string,
) {
  const dot = dotOf(step);
  expect(dot).toHaveClass('size-7', 'rounded-full');
  for (const cls of DOT_CLASSES[state]) expect(dot, cls).toHaveClass(cls);
  for (const cls of ALL_DOT_CLASSES) {
    if (!(DOT_CLASSES[state] as readonly string[]).includes(cls)) {
      expect(dot, `${state} không được có ${cls}`).not.toHaveClass(cls);
    }
  }
  const text = labelOf(step, label);
  expect(text).toHaveClass('font-semibold', LABEL_CLASSES[state]);
  for (const cls of ALL_LABEL_CLASSES) {
    if (cls !== LABEL_CLASSES[state]) {
      expect(text, `${state} không được có ${cls}`).not.toHaveClass(cls);
    }
  }
}

describe('booking F13 — thanh trạng thái dùng chung: chấm, nhãn, trợ năng', () => {
  it('STL-07 chấm và nhãn đúng kiểu cho đã qua, đang ở, chưa tới (Đã tiếp đón) và kết thúc (Đã hủy); dấu tích, dấu X, tâm trắng, chấm giữa đúng chỗ', () => {
    const view = renderTimeline('DaTiepDon');
    const steps = stepsOf();
    expectDotAndLabel(steps[0], 'passed', 'Đã xác nhận');
    expectDotAndLabel(steps[1], 'current', 'Đã tiếp đón');
    expectDotAndLabel(steps[2], 'upcoming', 'Hoàn thành');
    expect(dotOf(steps[0]).querySelector('svg')).not.toBeNull();
    expect(dotOf(steps[1]).querySelector('svg')).toBeNull();
    expect(dotOf(steps[1]).querySelector('[class~="size-2.5"]')).not.toBeNull();
    expect(dotOf(steps[2]).querySelector('[class~="size-2"]')).not.toBeNull();
    view.unmount();

    renderTimeline('DaHuy');
    const ended = stepsOf();
    expect(ended).toHaveLength(4);
    expectDotAndLabel(ended[3], 'terminal', 'Đã hủy');
    expect(dotOf(ended[3]).querySelector('svg')).not.toBeNull();
    for (const step of ended.slice(0, 3)) {
      expect(dotOf(step)).toHaveClass('border-2');
    }
  });

  it('STL-08 trợ năng: `ol` có tên, đúng MỘT bước `aria-current="step"` với ba trạng thái trong luồng và KHÔNG bước nào ở trạng thái khác; chữ ẩn "Đã qua", "Hiện tại"; "Chưa đến" nhìn thấy; chấm `aria-hidden`', () => {
    const expectedCurrent: Record<string, number | null> = {
      ChoThanhToan: null,
      DaXacNhan: 0,
      DaTiepDon: 1,
      HoanThanh: 2,
      DaHuy: null,
      VangMat: null,
    };
    for (const state of APPOINTMENT_STATES) {
      const view = renderTimeline(state);
      const steps = stepsOf();
      const current = steps
        .map((step, index) =>
          step.getAttribute('aria-current') === 'step' ? index : -1,
        )
        .filter((index) => index >= 0);
      expect(current, state).toEqual(
        expectedCurrent[state] === null ? [] : [expectedCurrent[state]],
      );
      for (const step of steps) {
        expect(dotOf(step)).toHaveAttribute('aria-hidden', 'true');
        const hidden = [...step.querySelectorAll('.sr-only')].map(
          (node) => node.textContent,
        );
        const isCurrent = step.getAttribute('aria-current') === 'step';
        const upcoming = within(step).queryByText('Chưa đến');
        if (upcoming !== null) {
          expect(upcoming, state).not.toHaveClass('sr-only');
          expect(hidden, state).toEqual([]);
        } else {
          // Bước đã qua hay đang ở: đúng một chữ ẩn; bước kết thúc: không chữ ẩn
          const isTerminal = steps.indexOf(step) === 3;
          expect(hidden, state).toEqual(
            isTerminal ? [] : [isCurrent ? 'Hiện tại' : 'Đã qua'],
          );
        }
      }
      view.unmount();
    }
  });

  it('STL-08 tiêu đề kiểu `DetailCard` (UIF-07 của F12): h2 có tên, có biểu tượng `aria-hidden`, cùng lớp với các thẻ khác', () => {
    renderTimeline('DaXacNhan');
    const heading = screen.getByRole('heading', { level: 2, name: TITLE });
    expect(heading.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(heading).toHaveClass('border-b', 'px-5', 'py-3.5', 'font-semibold');
    expect(heading).not.toHaveClass('uppercase');
  });
});

describe('booking F13 — thanh trạng thái dùng chung: đoạn nối đều và dòng phụ (UI-05)', () => {
  it.each(APPOINTMENT_STATES)(
    'STL-09 trạng thái %s ⇒ MỌI hàng có đúng MỘT dòng phụ (chữ "Chưa đến" hay chỗ chừa trống), đúng (số bước − 1) đoạn nối và các đoạn nối cùng lớp',
    (state) => {
      renderTimeline(state);
      const steps = stepsOf();
      for (const step of steps) {
        const reserved = step.querySelectorAll(
          '[data-testid="timeline-reserved-line"]',
        );
        const hasUpcoming = within(step).queryByText('Chưa đến') !== null;
        expect(reserved.length + (hasUpcoming ? 1 : 0)).toBe(1);
        for (const line of reserved) {
          expect(line).toHaveAttribute('aria-hidden', 'true');
          expect(line).toHaveClass('block', 'min-h-4');
          // `h-4` cố định sẽ cắt chữ dài của mốc thời gian: dùng `min-h-4`
          expect(line).not.toHaveClass('h-4');
        }
      }
      const connectors = within(list()).getAllByTestId('timeline-connector');
      expect(connectors).toHaveLength(steps.length - 1);
      for (const connector of connectors) {
        expect(connector).toHaveAttribute('aria-hidden', 'true');
        expect(connector.className).toBe(connectors[0].className);
        expect(connector).toHaveClass('my-1', 'w-0.5', 'flex-1', 'bg-gray-200');
      }
      // Bước cuối không có đoạn nối phía dưới
      expect(
        within(steps[steps.length - 1]).queryByTestId('timeline-connector'),
      ).toBeNull();
    },
  );

  it('STL-10 `notes` theo mã bước: bước đã qua, đang ở, kết thúc hiện chữ của `note` ở đúng dòng phụ (thay chỗ chừa); `note` rỗng hay thiếu ⇒ vẫn chừa chỗ; `note` của bước chưa tới bị bỏ qua; mã lạ không ảnh hưởng', () => {
    const view = renderTimeline('DaTiepDon', {
      notes: {
        DaXacNhan: '10:05 18/11/2026',
        DaTiepDon: '10:30 18/11/2026',
        HoanThanh: 'không được hiện',
        MaLa: 'cũng không',
      },
    });
    const steps = stepsOf();
    expect(steps.map((step) => step.textContent)).toEqual([
      'Đã xác nhận10:05 18/11/2026Đã qua',
      'Đã tiếp đón10:30 18/11/2026Hiện tại',
      'Hoàn thànhChưa đến',
    ]);
    for (const step of steps.slice(0, 2)) {
      expect(within(step).getAllByTestId('timeline-note')).toHaveLength(1);
      expect(within(step).queryByTestId('timeline-reserved-line')).toBeNull();
    }
    expect(within(steps[2]).queryByTestId('timeline-note')).toBeNull();
    expect(screen.queryByText('không được hiện')).toBeNull();
    expect(screen.queryByText('cũng không')).toBeNull();
    view.unmount();

    // Rỗng hay thiếu: chừa chỗ (cùng chiều cao một dòng)
    renderTimeline('HoanThanh', {
      notes: { DaXacNhan: '', DaTiepDon: undefined },
    });
    for (const step of stepsOf()) {
      expect(within(step).queryByTestId('timeline-note')).toBeNull();
      expect(
        within(step).getAllByTestId('timeline-reserved-line'),
      ).toHaveLength(1);
    }
  });

  it('STL-10 `note` dài hiện ĐỦ chữ và dòng phụ dùng `min-h-4` (cao đúng một dòng khi rỗng, giãn ra khi chữ xuống dòng, không bị cắt); bước kết thúc cũng nhận `note`', () => {
    const longNote = 'a'.repeat(200);
    const view = renderTimeline('DaXacNhan', {
      notes: { DaXacNhan: longNote },
    });
    const note = screen.getByText(longNote);
    expect(note).toHaveClass('block', 'min-h-4', 'text-xs', 'text-gray-600');
    expect(note).not.toHaveClass('h-4');
    view.unmount();

    renderTimeline('DaHuy', { notes: { DaHuy: 'Hủy lúc 09:00' } });
    const ended = stepsOf();
    expect(within(ended[3]).getByText('Hủy lúc 09:00')).toBeInTheDocument();
    // Ba bước chưa tới trước nó vẫn chỉ có "Chưa đến"
    for (const step of ended.slice(0, 3)) {
      expect(within(step).getByText('Chưa đến')).toBeInTheDocument();
    }
  });
});

describe('booking F13 — thanh trạng thái dùng chung: dải chờ thanh toán, mã lạ, footer', () => {
  it('STL-11 dải "Chờ xác nhận thanh toán cọc": CHỈ ở Chờ thanh toán; kiểu cảnh báo; `role` chỉ khi truyền `pendingRole` (Bác sĩ), mặc định KHÔNG có (Bệnh nhân, Quản trị viên)', () => {
    for (const state of APPOINTMENT_STATES) {
      const view = renderTimeline(state);
      const banner = screen.queryByText('Chờ xác nhận thanh toán cọc');
      if (state === 'ChoThanhToan') {
        expect(banner).toBeInTheDocument();
        expect(banner).not.toHaveAttribute('role');
        expect(banner).toHaveClass(
          'mb-4',
          'border-warning-line',
          'bg-warning-soft',
          'text-warning',
        );
        expect(banner?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      } else {
        expect(banner, state).toBeNull();
      }
      view.unmount();
    }

    renderTimeline('ChoThanhToan', { pendingRole: 'status' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Chờ xác nhận thanh toán cọc',
    );
  });

  it('STL-11 `pendingRole` truyền vào mà trạng thái không phải Chờ thanh toán ⇒ không có vùng `status` nào', () => {
    renderTimeline('DaXacNhan', { pendingRole: 'status' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('STL-12 `unknown: "hide"` + mã lạ ⇒ không có danh sách và không lộ mã thô, nhưng thẻ và `footer` vẫn còn; `unknown: "upcoming"` ⇒ ba hàng "Chưa đến", không bước đang ở, không dải', () => {
    const hide = renderTimeline('DaDoiLich', {
      unknown: 'hide',
      footer: <p>Chân thẻ</p>,
    });
    expect(screen.queryByRole('list')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: TITLE }),
    ).toBeVisible();
    expect(screen.getByText('Chân thẻ')).toBeInTheDocument();
    expect(screen.queryByText('DaDoiLich')).toBeNull();
    hide.unmount();

    renderTimeline('DaDoiLich', { unknown: 'upcoming' });
    const steps = stepsOf();
    expect(steps.map((step) => step.textContent)).toEqual([
      'Đã xác nhậnChưa đến',
      'Đã tiếp đónChưa đến',
      'Hoàn thànhChưa đến',
    ]);
    expect(
      steps.filter((step) => step.hasAttribute('aria-current')),
    ).toHaveLength(0);
    expect(screen.queryByText('Chờ xác nhận thanh toán cọc')).toBeNull();
    expect(screen.queryByText('DaDoiLich')).toBeNull();
  });

  it('STL-12 mã đã biết: `unknown` không đổi kết quả (cùng chữ và cùng lớp ở hai chế độ)', () => {
    const hide = renderTimeline('HoanThanh', { unknown: 'hide' });
    const hideHtml = list().outerHTML;
    hide.unmount();
    renderTimeline('HoanThanh', { unknown: 'upcoming' });
    expect(list().outerHTML).toBe(hideHtml);
  });

  it('STL-13 `footer` đứng SAU danh sách trong thẻ; không truyền thì không có gì sau danh sách', () => {
    const view = renderTimeline('DaXacNhan', {
      footer: <p data-testid="foot">Ngày đặt lịch</p>,
    });
    const foot = screen.getByTestId('foot');
    expect(
      list().compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(list().parentElement).toBe(foot.parentElement);
    view.unmount();

    renderTimeline('DaXacNhan');
    expect(list().nextElementSibling).toBeNull();
  });
});
