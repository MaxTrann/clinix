import { declarationsOf, readCssSource } from '../testing/css-source';

// AF1-12 (PR1 mục 1): vitest chạy `css: false` nên không thấy kiểu tính toán. Test này khoá HỢP ĐỒNG trong nguồn CSS: mọi ô nhập
// của Admin khi focus phải đổi viền sang teal và vẽ thêm bóng TRONG 1px (mép ngoài của ô không nhích ra), không dùng `outline` lệch
// (nó chừa khe hở và lộ viền xám bên trong). Kích thước thật, điểm ảnh và màu đo bằng Chromium (TRACKING admin mục 5).

const adminComponentsCss = readCssSource(
  import.meta.url,
  './admin-components.module.css',
);
const branchesCss = readCssSource(
  import.meta.url,
  '../branches/branches.module.css',
);
const clinicInfoCss = readCssSource(
  import.meta.url,
  '../clinic-info/clinic-info.module.css',
);
const specialtyCss = readCssSource(
  import.meta.url,
  '../specialties/specialty.module.css',
);

interface FocusCase {
  file: string;
  css: string;
  selector: string;
  color?: string;
}

const FIELD_FOCUS: FocusCase[] = [
  {
    file: 'admin-components',
    css: adminComponentsCss,
    selector: '.searchField input:focus-visible',
  },
  { file: 'specialty', css: specialtyCss, selector: '.searchBox:focus-within' },
  {
    file: 'specialty',
    css: specialtyCss,
    selector: '.filterField select:focus-visible',
  },
  {
    file: 'specialty',
    css: specialtyCss,
    // phải có :not([type='file']) mới đủ độ ưu tiên thắng quy tắc nền cùng dạng (đo Chromium: viền xám vẫn nằm ngoài nếu thiếu)
    selector: ".formField input:not([type='file']):focus-visible",
  },
  {
    file: 'specialty',
    css: specialtyCss,
    selector: '.formField textarea:focus-visible',
  },
  {
    file: 'specialty',
    css: specialtyCss,
    selector: '.imageDropzone:focus-within',
  },
  { file: 'branches', css: branchesCss, selector: '.searchBox:focus-within' },
  {
    file: 'branches',
    css: branchesCss,
    selector: '.formField input:focus-visible',
  },
  {
    file: 'branches',
    css: branchesCss,
    selector: '.formFieldWide input:focus-visible',
  },
  {
    file: 'branches',
    css: branchesCss,
    selector: '.timeRange input:focus-visible',
  },
  { file: 'clinic-info', css: clinicInfoCss, selector: '.input:focus-visible' },
];

const INVALID_FOCUS: FocusCase[] = [
  {
    file: 'specialty',
    css: specialtyCss,
    selector: ".formField input[aria-invalid='true']:focus-visible",
    color: '#f04438',
  },
  {
    file: 'branches',
    css: branchesCss,
    selector: ".formField input[aria-invalid='true']:focus-visible",
    color: '#d92d20',
  },
  {
    file: 'branches',
    css: branchesCss,
    selector: ".formFieldWide input[aria-invalid='true']:focus-visible",
    color: '#d92d20',
  },
  {
    file: 'clinic-info',
    css: clinicInfoCss,
    selector: ".input[aria-invalid='true']:focus-visible",
    color: '#d92d20',
  },
];

const BUTTON_FOCUS: FocusCase[] = [
  {
    file: 'admin-components',
    css: adminComponentsCss,
    selector: '.pagination button:focus-visible',
  },
  {
    file: 'specialty',
    css: specialtyCss,
    selector: '.addButton:focus-visible',
  },
  { file: 'branches', css: branchesCss, selector: '.addButton:focus-visible' },
  {
    file: 'clinic-info',
    css: clinicInfoCss,
    selector: '.saveButton:focus-visible',
  },
];

describe('AF1-12 viền focus của ô nhập Admin', () => {
  it.each(FIELD_FOCUS)(
    '$file: $selector đổi viền teal và dùng bóng trong, không dùng outline lệch',
    ({ css, selector }) => {
      const declarations = declarationsOf(css, selector);

      expect(declarations).not.toBe('');
      expect(declarations).toMatch(/outline: (none|0);/);
      expect(declarations).toContain('border-color: #0092b8;');
      expect(declarations).toContain('box-shadow: inset 0 0 0 1px #0092b8;');
      expect(declarations).not.toContain('outline-offset');
      expect(declarations).not.toContain('outline: 2px');
    },
  );

  it.each(INVALID_FOCUS)(
    '$file: ô đang lỗi $selector giữ màu đỏ cả viền lẫn bóng khi focus',
    ({ css, selector, color }) => {
      const declarations = declarationsOf(css, selector);

      expect(declarations).toContain(`border-color: ${color};`);
      expect(declarations).toContain(`box-shadow: inset 0 0 0 1px ${color};`);
    },
  );

  it.each(BUTTON_FOCUS)(
    '$file: nút $selector giữ nguyên viền outline (chỉ ô nhập đổi)',
    ({ css, selector }) => {
      const declarations = declarationsOf(css, selector);

      expect(declarations).toContain('outline: 2px solid #0092b8;');
      expect(declarations).toContain('outline-offset: 2px;');
    },
  );
});
