import { screen, within } from '@testing-library/react';
import { RECEPTION_PATHS } from '../patient-paths';
import { renderLookupPage, searchBox } from '../testing/lookup-harness';

// patient F8 (TRACKING F8-B, F8-H, F8-I): trạng thái ban đầu (Figma `483:2`) và mở trang. Mã ca LK-nn là [đề xuất]; mỗi ca ghi mã TC, H, KG
// của PLAN mục 7 và 3.5. Tìm, lỗi, danh sách, hồ sơ, riêng tư, bố cục ở các file `reception-lookup-*.test.tsx` cùng thư mục.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mở trang (TC-17, trạng thái ban đầu 483:2)', () => {
  it('LK-01 TC-17 mở trang: h1 "Tra cứu bệnh nhân", ô tìm có tên truy cập và chữ mờ, hai lời mời đúng câu Figma, KHÔNG gọi API', async () => {
    const { lookup } = await renderLookupPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Tra cứu bệnh nhân' }),
    ).toBeInTheDocument();
    expect(searchBox()).toHaveValue('');
    expect(searchBox()).toHaveAttribute(
      'placeholder',
      'Tìm theo họ tên, số điện thoại hoặc email...',
    );
    expect(
      screen.getByText('Nhập tên, số điện thoại hoặc email để tra cứu'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chọn một bệnh nhân để xem hồ sơ'),
    ).toBeInTheDocument();
    expect(lookup.searches).toHaveLength(0);
    expect(lookup.details).toHaveLength(0);
  });

  it('LK-02 KG-09 lúc mới mở KHÔNG có alert, nút hay liên kết nào (PL-12, PL-15, PL-19 của khung Lễ tân đang đếm chúng)', async () => {
    await renderLookupPage();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelectorAll('a[href], button')).toHaveLength(0);
  });

  it('LK-03 H5 ô tìm: type=text, autoComplete=off, không name, không nằm trong form, không đoán chính tả', async () => {
    await renderLookupPage();
    const box = searchBox();

    expect(box).toHaveAttribute('type', 'text');
    expect(box).toHaveAttribute('autocomplete', 'off');
    expect(box).toHaveAttribute('inputmode', 'search');
    expect(box).toHaveAttribute('enterkeyhint', 'search');
    expect(box).toHaveAttribute('spellcheck', 'false');
    expect(box).not.toHaveAttribute('name');
    expect(box).not.toHaveAttribute('maxlength');
    expect(box.closest('form')).toBeNull();
  });

  it('LK-04 KG-09 vùng tìm kiếm, vùng kết quả và vùng hồ sơ có tên', async () => {
    await renderLookupPage();

    expect(screen.getByRole('search')).toContainElement(searchBox());
    expect(
      screen.getByRole('region', { name: 'Kết quả tìm kiếm' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Hồ sơ bệnh nhân' }),
    ).toBeInTheDocument();
  });

  it('LK-05 KG-02 KG-06 trong khung Lễ tân thật: mở thẳng đường dẫn ⇒ h1 nằm trong main, mục menu đang chọn, 0 lời gọi API tra cứu', async () => {
    const { lookup, router } = await renderLookupPage({ withLayout: true });

    const main = await screen.findByRole('main');
    expect(
      within(main).getByRole('heading', {
        level: 1,
        name: 'Tra cứu bệnh nhân',
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.lookup);
    expect(lookup.searches).toHaveLength(0);
    expect(lookup.details).toHaveLength(0);
  });

  it('LK-06 TC-17 chân danh sách có phần tử aria-live ngay từ đầu nhưng chưa có chữ "N kết quả"', async () => {
    await renderLookupPage();

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveTextContent('');
    expect(screen.queryByText(/kết quả$/)).toBeNull();
  });

  it('LK-07 TC-17 không có nút "Xóa tìm kiếm" khi ô trống', async () => {
    await renderLookupPage();

    expect(screen.queryByRole('button', { name: 'Xóa tìm kiếm' })).toBeNull();
  });
});
