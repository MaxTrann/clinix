import { act, fireEvent, screen, within } from '@testing-library/react';
import { fakeMatchMedia } from '../../../test/fake-match-media';
import { apiError } from '../../../test/fake-auth-api';
import { makePatients } from '../testing/fake-lookup-api';
import {
  advance,
  nextTick,
  renderLookupPage,
  resultRow,
  searchFor,
  startFakeClock,
} from '../testing/lookup-harness';

// patient F8 (TRACKING F8-B, F8-I): bố cục hai cột từ 1024 px và một cột dưới 1024 px (Q21c), focus, trợ năng. Mã ca LK-nn là [đề xuất]; mỗi
// ca ghi mã KG-09 và Q21c. Vitest chạy `css: false`, nên hẹp/rộng do JS quyết định và kiểm bằng `fakeMatchMedia` (như F11); số đo thật
// (px, tương phản, cuộn ngang) kiểm ở Chrome.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Vùng bị ẩn (thuộc tính `hidden`) không có tên truy cập trong dom-accessibility-api, nên tìm theo `aria-label` (đúng thứ trình đọc màn hình dùng)
const region = (label: string) =>
  document.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!;
const resultsRegion = () => region('Kết quả tìm kiếm');
const detailRegion = () => region('Hồ sơ bệnh nhân');
const searchWrapper = () =>
  screen.getByRole('search', { hidden: true }).parentElement;
const backButton = () =>
  screen.queryByRole('button', { name: 'Quay lại danh sách' });

async function mount(width: number) {
  const media = fakeMatchMedia(width);
  const api = await renderLookupPage();
  startFakeClock();
  await searchFor('example');
  return { ...api, media };
}

describe('từ 1024 px: hai cột', () => {
  it('LK-88 Q21c 1024 px: cả hai vùng hiện cùng lúc, không có nút "Quay lại danh sách"; chọn hàng KHÔNG chuyển focus', async () => {
    await mount(1024);
    const row = resultRow(/Đặng Văn Hùng/);
    row.focus();
    fireEvent.click(row);
    await advance(0);

    expect(resultsRegion()).not.toHaveAttribute('hidden');
    expect(detailRegion()).not.toHaveAttribute('hidden');
    expect(searchWrapper()).not.toHaveAttribute('hidden');
    expect(backButton()).toBeNull();
    expect(document.activeElement).toBe(row);
    expect(
      within(detailRegion()).getByRole('heading', {
        level: 2,
        name: 'Đặng Văn Hùng',
      }),
    ).toBeInTheDocument();
  });

  it('LK-89 Q21c hồ sơ chưa chọn ở 1024 px: vùng hồ sơ hiện lời mời chọn (không ẩn)', async () => {
    await mount(1280);

    expect(detailRegion()).not.toHaveAttribute('hidden');
    expect(
      within(detailRegion()).getByText('Chọn một bệnh nhân để xem hồ sơ'),
    ).toBeInTheDocument();
  });
});

describe('dưới 1024 px: một cột', () => {
  it('LK-90 Q21c 390 px chưa chọn: chỉ thấy danh sách (vùng hồ sơ có thuộc tính hidden), ô tìm hiện', async () => {
    await mount(390);

    expect(resultsRegion()).not.toHaveAttribute('hidden');
    expect(detailRegion()).toHaveAttribute('hidden');
    expect(searchWrapper()).not.toHaveAttribute('hidden');
    expect(backButton()).toBeNull();
  });

  it('LK-91 Q21c 390 px chọn một mục: danh sách và ô tìm bị ẩn (vẫn trong DOM), hồ sơ hiện kèm "Quay lại danh sách", focus vào vùng hồ sơ, đúng MỘT GET chi tiết', async () => {
    const { lookup } = await mount(390);
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);

    expect(resultsRegion()).toHaveAttribute('hidden');
    expect(searchWrapper()).toHaveAttribute('hidden');
    expect(detailRegion()).not.toHaveAttribute('hidden');
    expect(backButton()).toBeVisible();
    expect(document.activeElement).toBe(detailRegion());
    expect(lookup.details).toHaveLength(1);
    expect(document.querySelector('input')).toHaveValue('example');
  });

  it('LK-92 Q21c "Quay lại danh sách": hiện lại danh sách và ô tìm, focus về hàng đã chọn, vẫn còn đánh dấu, không gọi thêm API', async () => {
    const { lookup } = await mount(390);
    fireEvent.click(resultRow(/Lê Thị Mai/));
    await advance(0);

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại danh sách' }));
    await advance(0);

    expect(resultsRegion()).not.toHaveAttribute('hidden');
    expect(searchWrapper()).not.toHaveAttribute('hidden');
    expect(detailRegion()).toHaveAttribute('hidden');
    const row = resultRow(/Lê Thị Mai/);
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(document.activeElement).toBe(row);
    expect(lookup.searches).toHaveLength(1);
    expect(lookup.details).toHaveLength(1);

    // chọn lại: hồ sơ hiện lại ngay (đã có trong bộ nhớ, không gọi lại)
    fireEvent.click(row);
    await advance(0);
    expect(detailRegion()).not.toHaveAttribute('hidden');
    expect(lookup.details).toHaveLength(1);
  });

  it('LK-93 Q21c 390 px: nút "Quay lại danh sách" có cả khi đang tải, khi 404 và khi lỗi', async () => {
    const { lookup } = await mount(390);
    const release = lookup.hold('detail');
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);
    expect(screen.getByText('Đang tải hồ sơ...')).toBeInTheDocument();
    expect(backButton()).toBeVisible();

    await act(async () => {
      release(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' });
      await nextTick();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không tìm thấy bệnh nhân.',
    );
    expect(backButton()).toBeVisible();

    lookup.failNext('detail', () => apiError(500, 'LOI_HE_THONG'));
    fireEvent.click(backButton()!);
    await advance(0);
    fireEvent.click(resultRow(/Lê Thị Mai/));
    await advance(0);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(backButton()).toBeVisible();
  });

  it('LK-94 Q21c đang xem hồ sơ ở 390 px rồi mở rộng tới 1280 px ⇒ hai vùng hiện cùng lúc, nút "Quay lại" biến mất, hồ sơ giữ nguyên', async () => {
    const { media } = await mount(390);
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);

    act(() => media.resize(1280));
    expect(resultsRegion()).not.toHaveAttribute('hidden');
    expect(detailRegion()).not.toHaveAttribute('hidden');
    expect(backButton()).toBeNull();
    expect(
      within(detailRegion()).getByText('hung@example.invalid'),
    ).toBeInTheDocument();
  });

  it('LK-95 Q21c thu hẹp từ 1280 px xuống 390 px khi đã chọn ⇒ chỉ còn hồ sơ nếu đang ở chế độ xem hồ sơ; chưa từng chọn thì chỉ danh sách', async () => {
    const { media } = await mount(1280);
    act(() => media.resize(390));
    expect(detailRegion()).toHaveAttribute('hidden');
    expect(resultsRegion()).not.toHaveAttribute('hidden');
  });
});

describe('bỏ chọn thật khi từ khoá đổi, ở cả hai chế độ (Q18, H4)', () => {
  const noPatientProfile = () =>
    expect(
      within(detailRegion()).queryByRole('heading', { level: 2 }),
    ).toBeNull();

  it('LK-101 Q21c Q18 H4 390 px: xem hồ sơ, "Quay lại danh sách", đổi từ khoá rồi QUAY LẠI từ khoá cũ ⇒ không có hồ sơ, vẫn ở chế độ danh sách', async () => {
    await mount(390);
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);
    expect(searchWrapper()).toHaveAttribute('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại danh sách' }));
    await advance(0);
    await searchFor('mai');
    await searchFor('example');

    noPatientProfile();
    expect(detailRegion()).toHaveAttribute('hidden');
    expect(resultsRegion()).not.toHaveAttribute('hidden');
    expect(searchWrapper()).not.toHaveAttribute('hidden');
    expect(
      screen.getAllByRole('button').some((b) => b.hasAttribute('aria-current')),
    ).toBe(false);
  });

  it('LK-102 Q21c Q18 H4 chọn hồ sơ ở màn rộng, đổi từ khoá rồi quay lại từ khoá cũ, rồi thu hẹp ⇒ KHÔNG nhảy về chế độ chỉ-hồ-sơ', async () => {
    const { media } = await mount(1280);
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);
    await searchFor('mai');
    await searchFor('example');

    act(() => media.resize(390));
    noPatientProfile();
    expect(detailRegion()).toHaveAttribute('hidden');
    expect(resultsRegion()).not.toHaveAttribute('hidden');
  });
});

describe('trợ năng (KG-09)', () => {
  it('LK-96 KG-09 mọi nút (hàng, "Xóa tìm kiếm", "Trang trước", "Trang sau", "Quay lại danh sách") đều có tên truy cập', async () => {
    const media = fakeMatchMedia(390);
    await renderLookupPage({ patients: makePatients(25) });
    startFakeClock();
    await searchFor('mẫu');
    fireEvent.click(resultRow(/Mẫu 001/));
    await advance(0);
    act(() => media.resize(1280));

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(23);
    for (const button of buttons) expect(button).toHaveAccessibleName();
    expect(
      screen.getByRole('button', { name: 'Xóa tìm kiếm' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Trang sau' }),
    ).toBeInTheDocument();
  });

  it('LK-97 KG-09 chỉ hàng đang chọn có aria-current; không hàng nào dùng aria-pressed', async () => {
    await mount(1280);
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);

    const rows = within(resultsRegion()).getAllByRole('button');
    expect(rows.filter((row) => row.hasAttribute('aria-current'))).toHaveLength(
      1,
    );
    expect(rows.some((row) => row.hasAttribute('aria-pressed'))).toBe(false);
  });

  it('LK-98 Q21c lưới thông tin hồ sơ chỉ thành hai cột theo VÙNG chứa rộng (container query), một cột mặc định, Địa chỉ chiếm hai cột', async () => {
    await mount(1280);
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);

    const grid = within(detailRegion())
      .getByText('Số điện thoại')
      .closest('dl');
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('@lg:grid-cols-2');
    expect(
      within(detailRegion()).getByText('Địa chỉ', { selector: 'dt' })
        .parentElement?.className,
    ).toContain('@lg:col-span-2');
    expect(detailRegion().querySelector('.\\@container')).not.toBeNull();
  });
});
