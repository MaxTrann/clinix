import { declarationsOf, readCssSource } from '../../../test/css-source';

// CN b1 (PR1 mục 8) phần kiểu của thẻ chi nhánh. Đo Chromium 16/11/2026 ở 375px: nút "Sửa lịch / dịch vụ" (135px, không xuống dòng)
// nằm cạnh khiến danh sách giờ nhận khám chỉ còn 55,9px nên mỗi dòng giờ ngắt thành 4 đến 8 dòng và thẻ cao 1100px. Màn hẹp phải xếp
// nút xuống dưới thẻ. Vitest chạy `css: false` nên khoá giá trị trong nguồn CSS.

const css = readCssSource(import.meta.url, './branches.module.css');

describe('CN b1 kiểu thẻ chi nhánh ở màn hẹp', () => {
  it('thẻ xếp theo cột và nút Sửa lịch căn đầu dòng khi màn hẹp', () => {
    expect(declarationsOf(css, '.branchCard')).toContain(
      'flex-direction: column;',
    );
    expect(declarationsOf(css, '.editButton')).toContain(
      'align-self: flex-start;',
    );
  });

  it('danh sách giờ nhận khám để chữ xuống dòng thay vì cắt bằng dấu ba chấm', () => {
    const declarations = declarationsOf(css, '.scheduleList li');

    expect(declarations).toContain('overflow-wrap: anywhere;');
    expect(declarations).not.toContain('text-overflow');
    expect(declarations).not.toContain('white-space: nowrap');
  });
});

// AF6-06 (admin PR2 mục 6.4): kiểu của panel "Áp dụng nhanh" và ô giờ 24h. Bài học PR1 (Chromium 375px bắt ba lỗi mà vitest không thấy):
// nhãn nút ngắt dòng, nút bên cạnh bóp danh sách, quy tắc nền đứng sau quy tắc focus. Test này chỉ là lưới hồi quy cho khai báo trong nguồn
// (không tính được cascade); kích thước thật, ngắt dòng và điểm ảnh viền focus đo ở Chromium.
describe('AF6-06 kiểu panel Áp dụng nhanh', () => {
  it('khung panel không tràn: border-box, min-width 0, rộng đủ khung lịch', () => {
    const declarations = declarationsOf(css, '.quickApply');

    expect(declarations).toContain('box-sizing: border-box;');
    expect(declarations).toContain('min-width: 0;');
    expect(declarations).toContain('width: 100%;');
  });

  it('các hàng và dãy chọn ngày cho phép xuống dòng ở màn hẹp', () => {
    expect(declarationsOf(css, '.quickRow')).toContain('flex-wrap: wrap;');
    expect(declarationsOf(css, '.dayPicks')).toContain('flex-wrap: wrap;');
  });

  it('nhãn nút và nhãn ngày không ngắt dòng; nút không bị bóp nhỏ hơn nhãn', () => {
    const button = declarationsOf(css, '.compactButton');

    expect(button).toContain('white-space: nowrap;');
    expect(button).toContain('min-width: max-content;');
    expect(declarationsOf(css, '.dayPick')).toContain('white-space: nowrap;');
  });

  it('radio chọn buổi là radio thật vẽ lại: tròn; viền focus do lớp base lo (không còn khối `.radio:focus-visible`: FG-03, FG-06)', () => {
    expect(declarationsOf(css, '.radio')).toContain('appearance: none;');
    expect(declarationsOf(css, '.radio')).toContain('border-radius: 50%;');
    expect(declarationsOf(css, '.radio:focus-visible')).toBe('');
  });

  it('nút Áp dụng dùng chữ #007595 trên nền trắng (5,28:1, ADR 0004), không dùng nền #0092b8 với chữ trắng', () => {
    const declarations = declarationsOf(css, '.quickApplyButton');

    expect(declarations).toContain('color: #007595;');
    expect(declarations).not.toContain('background: #0092b8');
  });

  it('chữ trợ giúp đủ tương phản (#6a7282), không dùng #99a1af (2,6:1)', () => {
    expect(declarationsOf(css, '.quickHelp')).toContain('color: #6a7282;');
    expect(declarationsOf(css, '.quickHelp')).not.toContain('#99a1af');
  });

  it('vùng thông báo aria-live RỖNG không chiếm chỗ (đo Chromium 16/11/2026: dải trống 21px dưới panel khi chưa áp dụng), có chữ thì mới cách 6px', () => {
    // Vùng này phải luôn có trong DOM để trình đọc màn hình đọc được lần đổi nội dung đầu tiên, nên KHÔNG dùng display: none
    const base = declarationsOf(css, '.quickMessage');

    expect(base).toContain('margin: 0;');
    expect(base).not.toContain('min-height');
    expect(base).not.toContain('display: none');
    expect(declarationsOf(css, '.quickMessage:not(:empty)')).toContain(
      'margin-top: 6px;',
    );
  });
});

describe('AF6-06 ô giờ 24h: viền focus do lớp base lo (quy tắc toàn hệ thống, TRACKING admin mục 7)', () => {
  it('.timeRange input không còn khối focus riêng và không tắt outline (nếu tắt, quy tắc `:focus` của lớp base thua vì CSS Module thắng lớp base)', () => {
    expect(declarationsOf(css, '.timeRange input:focus-visible')).toBe('');
    expect(declarationsOf(css, '.timeRange input')).not.toContain('outline');
  });

  it('quy tắc nền/viền thường của ô giờ KHÔNG chọn theo type (áp được cho ô chữ), và có trạng thái vô hiệu', () => {
    expect(declarationsOf(css, '.timeRange input')).toContain('width: 106px;');
    expect(css).not.toMatch(/\.timeRange input\[type/u);
    expect(declarationsOf(css, '.timeRange input:disabled')).toContain(
      'background: #f9fafb;',
    );
  });
});
