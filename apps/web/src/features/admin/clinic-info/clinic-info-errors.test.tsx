import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AdminMeProvider } from '../admin-me-context';
import { ClinicInfoPage } from './clinic-info-page';

// AF4-10 (admin PR2 mục 6.2): lỗi của từng ô Thông tin chung là MỘT vùng `role="alert"` dưới đúng ô, focus vào ô lỗi đầu tiên;
// banner chỉ cho lỗi không gắn ô. Không cướp focus khi người dùng đang gõ (điều kiện B của phiên kiểm).

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const current = {
  tenThuongHieu: 'CLINIX Clinic',
  diaChiTruSo: '123 Nguyễn Thị Minh Khai, Phường 6, Quận 3',
  duongDayNong: '1900 1234',
  email: 'contact@clinix.vn',
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openForm() {
  fetchMock.mockResolvedValueOnce(response(current));
  render(
    <AdminMeProvider value={{ phamVi: 'ToanHeThong' }}>
      <MemoryRouter>
        <ClinicInfoPage />
      </MemoryRouter>
    </AdminMeProvider>,
  );
  await screen.findByDisplayValue('CLINIX Clinic');
}

const brand = () => screen.getByLabelText(/Tên thương hiệu/);
const address = () => screen.getByLabelText(/Địa chỉ trụ sở chính/);
const hotline = () => screen.getByLabelText(/Đường dây nóng/);
const email = () => screen.getByLabelText(/Email liên hệ chung/);
const save = () => screen.getByRole('button', { name: 'Lưu thông tin chung' });
const alertTexts = () =>
  screen.queryAllByRole('alert').map((element) => element.textContent);

describe('ClinicInfoPage: lỗi từng ô (AF4-10)', () => {
  it('AF4-10 lỗi phía form: mỗi ô lỗi là một vùng báo dưới ô, focus vào ô lỗi ĐẦU TIÊN (tên thương hiệu)', async () => {
    await openForm();
    fireEvent.change(brand(), { target: { value: '' } });
    fireEvent.change(address(), { target: { value: '' } });
    email().focus();

    fireEvent.click(save());

    expect(alertTexts()).toEqual([
      'Tên thương hiệu cần có từ 1 đến 100 ký tự.',
      'Địa chỉ trụ sở chính cần có từ 1 đến 255 ký tự.',
    ]);
    expect(brand()).toHaveAttribute('aria-invalid', 'true');
    expect(brand()).toHaveAccessibleDescription(
      'Tên thương hiệu cần có từ 1 đến 100 ký tự.',
    );
    expect(brand()).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AF4-10 chỉ ô sau có lỗi thì focus vào đúng ô đó', async () => {
    await openForm();
    fireEvent.change(address(), { target: { value: '' } });

    fireEvent.click(save());

    expect(address()).toHaveFocus();
  });

  it('AF4-10 lỗi từ máy chủ gắn ô: một vùng báo dưới ô, không banner, focus vào ô đó', async () => {
    await openForm();
    fetchMock.mockResolvedValueOnce(
      response(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }],
        },
        400,
      ),
    );
    fireEvent.change(brand(), { target: { value: 'CLINIX Mới' } });

    fireEvent.click(save());

    expect(
      await screen.findByText('Email liên hệ chung không đúng định dạng.'),
    ).toBeInTheDocument();
    expect(alertTexts()).toEqual(['Email liên hệ chung không đúng định dạng.']);
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(email()).toHaveFocus();
  });

  it('AF4-10 lỗi máy chủ không gắn ô nào: banner là vùng báo duy nhất', async () => {
    await openForm();
    fetchMock.mockResolvedValueOnce(
      response(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'la', ma: 'LA' }],
        },
        400,
      ),
    );
    fireEvent.change(brand(), { target: { value: 'CLINIX Mới' } });

    fireEvent.click(save());

    expect(
      await screen.findByText(
        'Một số thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường.',
      ),
    ).toBeInTheDocument();
    expect(alertTexts()).toHaveLength(1);
    for (const field of [brand(), address(), hotline(), email()])
      expect(field).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('AF4-10 điều kiện B: sau lỗi phía form, gõ vào ô khác không kéo focus về ô lỗi', async () => {
    await openForm();
    fireEvent.change(brand(), { target: { value: '' } });
    fireEvent.click(save());
    expect(brand()).toHaveFocus();

    hotline().focus();
    fireEvent.change(hotline(), { target: { value: '1900 5555' } });

    expect(hotline()).toHaveFocus();
  });
});
