import { render, screen, within } from '@testing-library/react';
import {
  SHIFT_STATUS_ORDER,
  type ShiftStatus,
} from '../../../shared/schedule/shift-labels';
import {
  colorsOf,
  contrastRatio,
  familyOf,
  resolveColor,
  type ClassColors,
} from '../testing/color-tokens';
import { ScheduleSummary } from './schedule-summary';
import { STATUS_STYLES } from './status-styles';

// DUX3-20 đến DUX3-29 (doctor UX3, G16, T6; WL-02; ADR 0004): bảng màu trạng thái của ô lịch, chip ca và chấm chú giải. Đối tượng của test này CHÍNH là bảng
// `STATUS_STYLES` nên đọc tên lớp của nó (test thành phần ở file khác không đọc tên lớp). Màu và tỉ lệ tính từ token thật (xem `testing/color-tokens.ts`).

const NEUTRAL_FAMILIES = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
const MIN_TEXT_CONTRAST = 4.5;

const PARTS = ['cell', 'chip', 'dot'] as const;

function colorsOfPart(status: ShiftStatus, part: (typeof PARTS)[number]) {
  return colorsOf(STATUS_STYLES[status][part]);
}

function familiesOf(colors: ClassColors): string[] {
  return Object.values(colors).map((token) => familyOf(token));
}

describe('DUX3-20 "Nghỉ đã duyệt" trung tính, tách khỏi "Không có ca/Không có lịch"', () => {
  it('DUX3-20 WL-02 nền, chữ, viền, nền hover của ô, chip và chấm đều thuộc họ trung tính (không đỏ, cam, hổ phách, xanh lá)', () => {
    for (const part of PARTS) {
      const colors = colorsOfPart('DaDuyet', part);
      expect(colors.bg, `DaDuyet ${part} thiếu nền`).toBeDefined();
      expect(colors.border, `DaDuyet ${part} thiếu viền`).toBeDefined();
      for (const family of familiesOf(colors)) {
        expect(NEUTRAL_FAMILIES, `DaDuyet ${part}: họ ${family}`).toContain(
          family,
        );
      }
    }
  });

  it('DUX3-20 WL-02 nền "Nghỉ đã duyệt" có độ chói KHÁC nền "Không có lịch" (gray-100) và "Không có ca" (gray-50): chênh ≥ 1,10:1, không nhầm hai trạng thái', () => {
    const bg = colorsOfPart('DaDuyet', 'cell').bg ?? '';
    expect(contrastRatio(bg, 'gray-100')).toBeGreaterThanOrEqual(1.1);
    expect(contrastRatio(bg, 'gray-50')).toBeGreaterThanOrEqual(1.1);
    const dotBg = colorsOfPart('DaDuyet', 'dot').bg ?? '';
    expect(contrastRatio(dotBg, 'gray-100')).toBeGreaterThanOrEqual(1.1);
  });
});

describe('DUX3-21 họ màu của bốn trạng thái', () => {
  it('DUX3-21 WL-02 "Yêu cầu bị từ chối" đỏ nhạt, "Chờ duyệt" hổ phách, "Làm việc" xanh dương (cyan, sky)', () => {
    for (const part of PARTS) {
      for (const family of familiesOf(colorsOfPart('TuChoi', part))) {
        expect(family, `TuChoi ${part}`).toBe('red');
      }
      for (const family of familiesOf(colorsOfPart('ChoDuyet', part))) {
        expect(family, `ChoDuyet ${part}`).toBe('amber');
      }
      for (const family of familiesOf(colorsOfPart('LamViec', part))) {
        expect(['cyan', 'sky'], `LamViec ${part}`).toContain(family);
      }
    }
  });
});

describe('DUX3-22 tương phản chữ/nền ≥ 4,5:1 (ADR 0004), tính từ token thật', () => {
  it.each(SHIFT_STATUS_ORDER)(
    'DUX3-22 WL-02 %s: chữ trên nền, và chữ trên nền hover, của ô và chip đạt ≥ 4,5:1',
    (status) => {
      for (const part of ['cell', 'chip'] as const) {
        const { text, bg, hoverBg } = colorsOfPart(status, part);
        expect(text, `${status} ${part} thiếu màu chữ`).toBeDefined();
        expect(bg, `${status} ${part} thiếu nền`).toBeDefined();
        const ratio = contrastRatio(text ?? '', bg ?? '');
        expect(
          ratio,
          `${status} ${part}: ${text} trên ${bg} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        if (hoverBg !== undefined) {
          const hover = contrastRatio(text ?? '', hoverBg);
          expect(
            hover,
            `${status} ${part} hover: ${text} trên ${hoverBg} = ${hover.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        }
      }
      // Ô lịch là nút nên PHẢI có màu hover (đủ phản hồi khi rê chuột)
      expect(colorsOfPart(status, 'cell').hoverBg).toBeDefined();
    },
  );
});

describe('DUX3-23 chú giải khớp màu ô', () => {
  it('DUX3-23 WL-02 nền chấm chú giải bằng nền ô của đúng trạng thái đó, cho cả bốn trạng thái', () => {
    for (const status of SHIFT_STATUS_ORDER) {
      expect(colorsOfPart(status, 'dot').bg, status).toBe(
        colorsOfPart(status, 'cell').bg,
      );
    }
  });

  it('DUX3-23 WL-02 bốn chấm chú giải khác nhau từng đôi một (cặp nền và viền), không hai trạng thái cùng màu', () => {
    const keys = SHIFT_STATUS_ORDER.map((status) => {
      const { bg, border } = colorsOfPart(status, 'dot');
      return `${bg}|${border}`;
    });
    expect(new Set(keys).size).toBe(SHIFT_STATUS_ORDER.length);
  });
});

describe('DUX3-24 và DUX3-25 bảng đủ phần, không còn cam', () => {
  it('DUX3-24 WL-02 mỗi trạng thái có đủ `cell`, `chip` (chữ, nền, viền) và `dot` (nền, viền)', () => {
    for (const status of SHIFT_STATUS_ORDER) {
      for (const part of ['cell', 'chip'] as const) {
        const colors = colorsOfPart(status, part);
        expect(
          [colors.text, colors.bg, colors.border].every(Boolean),
          `${status} ${part}`,
        ).toBe(true);
      }
      const dot = colorsOfPart(status, 'dot');
      expect([dot.bg, dot.border].every(Boolean), `${status} dot`).toBe(true);
    }
  });

  it('DUX3-25 WL-02 không trạng thái nào còn dùng họ cam (trước UX3 "Từ chối" màu cam)', () => {
    const families = SHIFT_STATUS_ORDER.flatMap((status) =>
      PARTS.flatMap((part) => familiesOf(colorsOfPart(status, part))),
    );
    expect(families).not.toContain('orange');
  });
});

describe('DUX3-26 số thống kê', () => {
  function numberOf(label: string): HTMLElement {
    const stats = screen.getByRole('region', { name: 'Thống kê tuần' });
    const element = within(stats).getByText(label, {
      selector: 'p',
    }).previousElementSibling;
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Không thấy số của "${label}"`);
    }
    return element;
  }

  it('DUX3-26 WL-02 số "Nghỉ đã duyệt" trung tính (không đỏ) và ≥ 4,5:1 trên trắng; "Chờ duyệt" hổ phách; "Ca làm việc" xanh thương hiệu', () => {
    render(
      <ScheduleSummary
        counts={{ working: 3, approvedLeave: 1, pendingLeave: 1 }}
      />,
    );

    const approved = colorsOf(numberOf('Nghỉ đã duyệt').className).text ?? '';
    expect(NEUTRAL_FAMILIES).toContain(familyOf(approved));
    expect(contrastRatio(approved, 'white')).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );

    const pending = colorsOf(numberOf('Chờ duyệt').className).text ?? '';
    expect(familyOf(pending)).toBe('amber');
    expect(contrastRatio(pending, 'white')).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );

    const working = colorsOf(numberOf('Ca làm việc').className).text ?? '';
    expect(familyOf(working)).toBe('cyan');
  });
});

describe('DUX3-27 đến DUX3-29 bộ tính màu đáng tin', () => {
  // Số hiệu chuẩn của ADR 0004 (đo từ điểm ảnh Chrome); sai số cho phép 0,02
  it.each<[string, string, number]>([
    ['cyan-700', 'white', 5.28],
    ['red-700', 'white', 6.42],
    ['red-700', 'red-50', 5.87],
    ['green-700', 'green-50', 4.72],
    ['amber-700', 'amber-50', 4.87],
    ['gray-600', 'white', 7.56],
  ])(
    'DUX3-27 hiệu chuẩn %s trên %s = %s:1 (khớp ADR 0004)',
    (text, bg, expected) => {
      expect(Math.abs(contrastRatio(text, bg) - expected)).toBeLessThanOrEqual(
        0.02,
      );
    },
  );

  it('DUX3-27 token ngữ nghĩa đi theo chuỗi `var()` tới họ thật: `danger-strong` ra `red`, `success-soft` ra `green`, `brand-strong` ra `cyan`', () => {
    expect(familyOf('danger-strong')).toBe('red');
    expect(familyOf('success-soft')).toBe('green');
    expect(familyOf('brand-strong')).toBe('cyan');
    expect(resolveColor('danger-strong').rgb).toEqual(
      resolveColor('red-700').rgb,
    );
  });

  it('DUX3-28 cặp CỐ Ý không đạt bị báo là không đạt (bộ tính không "luôn đạt")', () => {
    expect(contrastRatio('slate-300', 'slate-200')).toBeLessThan(
      MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio('gray-500', 'gray-400')).toBeLessThan(
      MIN_TEXT_CONTRAST,
    );
    // Trắng trên trắng đúng 1:1 (đối chứng cận dưới)
    expect(contrastRatio('white', 'white')).toBe(1);
  });

  it('DUX3-29 token lạ hay lớp màu gõ sai ném lỗi (không trả NaN âm thầm); lớp không phải màu bị bỏ qua', () => {
    expect(() => resolveColor('slte-800')).toThrow(/slte-800/);
    expect(() => colorsOf('border-slte-400 bg-slate-200')).toThrow(/slte-400/);
    expect(colorsOf('text-xs text-2xl border-dashed font-semibold')).toEqual(
      {},
    );
    expect(colorsOf('text-slate-800 bg-slate-200 hover:bg-slate-300')).toEqual({
      text: 'slate-800',
      bg: 'slate-200',
      hoverBg: 'slate-300',
    });
  });
});
