import { colorsOf, contrastRatio } from '../testing/color-tokens';
import {
  CELL_BASE,
  CELL_STATE,
  MONTH_CELL_BASE,
  NAV_BUTTON,
  WEEKDAY_HEADER,
} from './picker-styles';

// doctor UX5 (G2), DUX5-14: chữ và nền của hộp chọn đạt tương phản chữ ≥ 4,5:1 (WCAG 2.2 AA, ADR 0004) theo token THẬT của `styles/index.css` và
// `tailwindcss/theme.css` (bộ tính của UX3, `testing/color-tokens.ts`). Nền hộp là `bg-white` của `ModalFrame`. Ô `disabled` (ngoài 2000 đến 2099) không
// tính: WCAG 1.4.3 miễn trừ thành phần không dùng được.
const MIN_RATIO = 4.5;

const PAIRS: readonly (readonly [string, string])[] = [
  ['ô ngày thường', `${CELL_BASE} ${CELL_STATE.normal}`],
  ['ô ngày của tháng liền kề', `${CELL_BASE} ${CELL_STATE.outside}`],
  ['ô trong tuần / tháng đang xem', `${CELL_BASE} ${CELL_STATE.viewed}`],
  ['ô tháng thường', `${MONTH_CELL_BASE} ${CELL_STATE.normal}`],
  ['ô tháng đang xem', `${MONTH_CELL_BASE} ${CELL_STATE.viewed}`],
  ['nút ‹ ›', NAV_BUTTON],
  ['tiêu đề cột thứ', WEEKDAY_HEADER],
];

describe('màu của hộp chọn tuần/tháng', () => {
  it.each(PAIRS)(
    'DUX5-14 %s: chữ/nền (và nền khi rê chuột) ≥ 4,5:1',
    (_name, classes) => {
      const { text, bg = 'white', hoverBg } = colorsOf(classes);
      expect(text, `${classes}: thiếu màu chữ`).toBeDefined();
      const base = contrastRatio(text ?? 'white', bg);
      expect(
        base,
        `${classes}: ${text} trên ${bg} = ${base.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(MIN_RATIO);
      if (hoverBg !== undefined) {
        const hover = contrastRatio(text ?? 'white', hoverBg);
        expect(
          hover,
          `${classes}: ${text} trên ${hoverBg} (hover) = ${hover.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(MIN_RATIO);
      }
    },
  );

  it('DUX5-14 bộ kiểm có tác dụng: chữ gray-400 trên nền trắng (màu của ô `disabled`) KHÔNG đạt 4,5:1', () => {
    const { text, bg = 'white' } = colorsOf(
      `${CELL_BASE} ${CELL_STATE.disabled}`,
    );
    expect(text).toBe('gray-400');
    expect(contrastRatio(text ?? 'white', bg)).toBeLessThan(MIN_RATIO);
  });

  it('DUX5-14 ô đang xem khác ô thường (không chỉ dựa vào màu chữ): có nền riêng và chữ đậm', () => {
    const viewed = colorsOf(`${CELL_BASE} ${CELL_STATE.viewed}`);
    const normal = colorsOf(`${CELL_BASE} ${CELL_STATE.normal}`);
    expect(viewed.bg).toBeDefined();
    expect(viewed.bg).not.toBe(normal.bg);
    expect(CELL_STATE.viewed).toContain('font-semibold');
  });
});
