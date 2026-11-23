import { readCssSource } from '../../../test/css-source';

// Bộ tính màu và tương phản cho test màu của doctor (UX3, DUX3-20 đến DUX3-37; ADR 0004 mục "Tương phản"). Vitest chạy `css: false` nên không có kiểu
// tính toán: bộ này đọc token THẬT từ hai nguồn như Tailwind làm (không chép mã màu vào test):
//   1. `styles/index.css`: token ngữ nghĩa trỏ về thang chuẩn (`--color-danger-strong: var(--color-red-700)`);
//   2. `tailwindcss/theme.css`: thang chuẩn dạng `oklch(…)`.
// Quy đổi oklch sang sRGB 8 bit (làm tròn như điểm ảnh Chrome vẽ ra, cùng cách ADR 0004 đo) rồi áp công thức WCAG 2.2:
//   độ chói L = 0,2126 R + 0,7152 G + 0,0722 B (kênh tuyến tính hoá từ sRGB), tỉ lệ = (L sáng + 0,05) / (L tối + 0,05).

export type Rgb = readonly [number, number, number];

export interface ResolvedColor {
  rgb: Rgb;
  // Họ màu của thang chuẩn: `red`, `slate`, `green`…; `white` cho màu trắng. Token ngữ nghĩa đi theo chuỗi `var()` tới họ thật (`danger-strong` ra `red`)
  scale: string;
}

const THEME = readCssSource(
  import.meta.url,
  '../../../../node_modules/tailwindcss/theme.css',
);
const INDEX = readCssSource(import.meta.url, '../../../styles/index.css');

const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/;
const MAX_ALIAS_DEPTH = 5;

// Giá trị khai báo `--color-<token>: …;` đầu tiên trong `css`, hoặc null
function declaration(css: string, token: string): string | null {
  const match = new RegExp(`--color-${token}:\\s*([^;]+);`).exec(css);
  return match ? (match[1] ?? '').trim() : null;
}

function encode(linear: number): number {
  const value = Math.min(1, Math.max(0, linear));
  const srgb =
    value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

// Ottosson: oklch → oklab → LMS → sRGB tuyến tính → sRGB 8 bit
function oklchToRgb(lightness: number, chroma: number, hue: number): Rgb {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Màu của một token (`red-700`, `danger-strong`, `white`). Token không có ở hai nguồn thì ném lỗi, KHÔNG trả `NaN` (bẫy của booking F8). */
export function resolveColor(token: string, depth = 0): ResolvedColor {
  if (token === 'white') return { rgb: [255, 255, 255], scale: 'white' };
  const own = declaration(INDEX, token);
  if (own !== null) {
    const alias = /^var\(--color-([a-z0-9-]+)\)$/.exec(own);
    if (alias && depth < MAX_ALIAS_DEPTH) {
      return resolveColor(alias[1] ?? '', depth + 1);
    }
    const hex = /^#([0-9a-f]{6})$/i.exec(own);
    if (hex) {
      const value = parseInt(hex[1] ?? '', 16);
      return {
        rgb: [(value >> 16) & 255, (value >> 8) & 255, value & 255],
        scale: token,
      };
    }
    throw new Error(`Token "${token}": giá trị không hỗ trợ (${own})`);
  }
  const themed = declaration(THEME, token);
  const match = themed === null ? null : OKLCH.exec(themed);
  if (match === null) {
    throw new Error(
      `Không có màu "${token}" ở styles/index.css và tailwindcss/theme.css`,
    );
  }
  const lightness =
    match[2] === '%' ? Number(match[1]) / 100 : Number(match[1]);
  return {
    rgb: oklchToRgb(lightness, Number(match[3]), Number(match[4])),
    scale: token.replace(/-\d+$/, ''),
  };
}

function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** Tỉ lệ tương phản WCAG giữa hai token (thứ tự không quan trọng). */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(resolveColor(first).rgb);
  const b = luminance(resolveColor(second).rgb);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Họ màu (`red`, `slate`…) của một token. */
export function familyOf(token: string): string {
  return resolveColor(token).scale;
}

export interface ClassColors {
  text?: string;
  bg?: string;
  border?: string;
  // `hover:bg-*`
  hoverBg?: string;
}

// Token màu hay không: `white`, thang chuẩn có bậc (`slate-800`; gõ sai họ như `slte-800` VẪN khớp để `resolveColor` ném lỗi), hoặc token ngữ nghĩa khai ở index.css.
// `text-xs`, `text-2xl`, `border-dashed`, `text-left` không phải màu nên bị bỏ qua.
function isColorToken(token: string): boolean {
  return (
    token === 'white' ||
    /^[a-z]+-\d{2,3}$/.test(token) ||
    declaration(INDEX, token) !== null
  );
}

/** Màu chữ, nền, viền và nền hover trong một chuỗi lớp Tailwind (chỉ lớp có màu; lớp màu gõ sai ném lỗi). */
export function colorsOf(classes: string): ClassColors {
  const found: ClassColors = {};
  for (const name of classes.split(/\s+/).filter(Boolean)) {
    const match = /^(hover:)?(text|bg|border)-(.+)$/.exec(name);
    if (match === null) continue;
    const token = match[3] ?? '';
    if (!isColorToken(token)) continue;
    resolveColor(token);
    if (match[1] === 'hover:') {
      if (match[2] === 'bg') found.hoverBg = token;
    } else if (match[2] === 'text') found.text = token;
    else if (match[2] === 'bg') found.bg = token;
    else found.border = token;
  }
  return found;
}
