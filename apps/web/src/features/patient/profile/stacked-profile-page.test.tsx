import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import { SAMPLE_PROFILE, json } from '../testing/fake-profile-api';
import {
  FORM_NAME,
  nameInput,
  openEditForm,
  saveButton,
  setUpApi,
  typeInto,
} from '../testing/profile-page-harness';
import { SAVED_MESSAGE } from './profile-errors';
import { ReadOnlyField } from './profile-field';
import {
  StackedProfilePage,
  type StackedProfilePageProps,
} from './stacked-profile-page';
import type { Profile } from './profile-types';

// patient F5 (TRACKING F5-C, F5-I): thành phần trang dùng chung của Lễ tân và Quản trị viên, kiểm hợp đồng props bằng cấu hình GIẢ
// (không phải của hai trang thật). Mã ca SP-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1. Trang thật có test riêng (TT-, AP-).
const config = (
  overrides: Partial<StackedProfilePageProps> = {},
): StackedProfilePageProps => ({
  widthClass: 'max-w-xs',
  intro: 'LỜI DẪN THỬ',
  subtitleOf: (profile: Profile) => `DÒNG PHỤ: ${profile.hoTen}`,
  extraRowsOf: () => [
    { label: 'Hàng thêm A', value: 'giá trị A' },
    { label: 'Hàng thêm B', value: null },
  ],
  extraReadOnlyOf: () => (
    <ReadOnlyField label="Khối thêm X" value="giá trị X" note="chú thích X" />
  ),
  ...overrides,
});

async function renderStacked(props: StackedProfilePageProps) {
  const api = await setUpApi();
  const router = createMemoryRouter(
    [{ path: '/thu', element: <StackedProfilePage {...props} /> }],
    { initialEntries: ['/thu'] },
  );
  const view = render(<RouterProvider router={router} />);
  return { ...api, ...view };
}
const ready = () => screen.findByRole('button', { name: 'Chỉnh sửa' });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('StackedProfilePage (HS-17, HS-21)', () => {
  it('SP-01 HS-17 widthClass đặt lên section, intro dưới h1; h1 luôn "Thông tin cá nhân" (ca ghim tên lớp)', async () => {
    const { container } = await renderStacked(config());
    await ready();

    expect(container.querySelector('section')).toHaveClass('max-w-xs');
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Thông tin cá nhân');
    expect(screen.getByText('LỜI DẪN THỬ')).toBeInTheDocument();
    expect(
      h1.compareDocumentPosition(screen.getByText('LỜI DẪN THỬ')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('SP-02 HS-21 dòng phụ do trang tính từ hồ sơ; không truyền statusLabel ⇒ KHÔNG nhãn trạng thái', async () => {
    await renderStacked(config());
    await ready();

    expect(
      screen.getByText(`DÒNG PHỤ: ${SAMPLE_PROFILE.hoTen}`),
    ).toBeInTheDocument();
    expect(screen.queryByText('Đang hoạt động')).toBeNull();
  });

  it('SP-03 HS-21 statusLabel có truyền ⇒ hiện đúng nhãn đó', async () => {
    await renderStacked(config({ statusLabel: 'NHÃN THỬ' }));
    await ready();
    expect(screen.getByText('NHÃN THỬ')).toBeInTheDocument();
  });

  it('SP-04 HS-17 HS-21 hàng thêm đứng SAU sáu hàng gốc, đúng thứ tự; giá trị trống ⇒ "Chưa cập nhật"', async () => {
    await renderStacked(config());
    await ready();

    const labels = Array.from(document.querySelectorAll('dt')).map(
      (term) => term.textContent,
    );
    expect(labels).toEqual([
      'Họ và tên',
      'Email',
      'Số điện thoại',
      'Giới tính',
      'Ngày sinh',
      'Địa chỉ',
      'Hàng thêm A',
      'Hàng thêm B',
    ]);
    const value = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).nextElementSibling
        ?.textContent;
    expect(value('Hàng thêm A')).toBe('giá trị A');
    expect(value('Hàng thêm B')).toBe('Chưa cập nhật');
  });

  it('SP-05 HS-21 khối chỉ đọc thêm nằm SAU email và TRƯỚC hàng nút trong form, là khối chữ (không ô nhập), email dùng câu "không thể chỉnh sửa"', async () => {
    await renderStacked(config());
    await openEditForm();

    const email = screen.getByRole('group', { name: 'Email' });
    const extra = screen.getByRole('group', { name: 'Khối thêm X' });
    const save = saveButton();
    const after = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(email, extra)).toBe(true);
    expect(after(extra, save)).toBe(true);
    expect(extra.querySelector('input, select, textarea')).toBeNull();
    expect(extra).toHaveAccessibleDescription('chú thích X');
    expect(
      screen.getByText('Email dùng để đăng nhập, không thể chỉnh sửa.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('form', { name: FORM_NAME })).toBeInTheDocument();
  });

  it('SP-06 HS-19 sau lưu, dòng phụ và hàng thêm được tính lại từ hồ sơ của PHẢN HỒI PUT', async () => {
    const { profile } = await renderStacked(config());
    await openEditForm();
    typeInto(nameInput(), 'Tên Đã Gõ');
    profile.failNext('PUT', () =>
      json(200, { ...SAMPLE_PROFILE, hoTen: 'Tên Của Máy Chủ' }),
    );

    fireEvent.click(saveButton());

    await screen.findByText(SAVED_MESSAGE);
    expect(screen.getByText('DÒNG PHỤ: Tên Của Máy Chủ')).toBeInTheDocument();
    expect(screen.queryByText(/Tên Đã Gõ/)).toBeNull();
  });

  it('SP-07 HS-17 đang tải và lỗi tải: h1, lời dẫn và khối đổi mật khẩu vẫn có; "Thử lại" gọi lại một lần', async () => {
    const api = await setUpApi();
    api.profile.failNext('GET', () => {
      throw new TypeError('Failed to fetch');
    });
    const router = createMemoryRouter(
      [{ path: '/thu', element: <StackedProfilePage {...config()} /> }],
      { initialEntries: ['/thu'] },
    );
    render(<RouterProvider router={router} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(screen.getByText('LỜI DẪN THỬ')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
    ).toBeInTheDocument();
    const release = api.profile.hold('GET');
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    release(200, SAMPLE_PROFILE);
    await ready();
    expect(api.profile.count('GET')).toBe(2);
    expect(GENERIC_ERROR_MESSAGE).not.toBe(NETWORK_ERROR_MESSAGE);
  });
});
