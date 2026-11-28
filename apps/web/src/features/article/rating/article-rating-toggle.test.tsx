import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { makePublished } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { renderPublicPages } from '../testing/render-public-pages';
import {
  findEnabledButton,
  resetSession,
  signIn,
  signOutAsGuest,
} from '../testing/rating-session';

// article F3: Bệnh nhân bấm Thích, Không thích (ABU-02, ABU-03) và tên đọc của nhóm, nút (ABU-07). Bản giả API tính số đếm từ kho phiếu và từ chối như máy chủ B3,
// nên số hiện ra là số CỦA MÁY CHỦ trong thân trả về (web không cộng trừ), và lời gọi sai loại (PUT thay vì DELETE) lộ ngay ở `calls`.
const PATH = '/cam-nang/12-sot-xuat-huyet';
const GROUP = 'Bài viết có ích không?';
const PATIENT = 'bn-1';

function setup(seed: { thich?: number; khongThich?: number } = {}) {
  const api = createFakeArticleApi([
    makePublished({
      baiVietId: '12',
      tieuDe: 'Sốt xuất huyết',
      noiDung: 'Diệt muỗi.',
    }),
  ]);
  api.seedRatings('12', { thich: 5, khongThich: 2, ...seed });
  signIn(api, 'BenhNhan', PATIENT);
  return api;
}

const pressedState = () => ({
  like: screen
    .getByRole('button', { name: /^Thích \(\d+\)$/ })
    .getAttribute('aria-pressed'),
  dislike: screen
    .getByRole('button', { name: /^Không thích \(\d+\)$/ })
    .getAttribute('aria-pressed'),
});

beforeEach(() => resetSession());

describe('khối đánh giá: phiếu hiện có (ABU-02)', () => {
  it('ABU-02 đã Thích ⇒ nút Thích aria-pressed="true", nút kia "false"', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'Thich');
    renderPublicPages({ api, path: PATH });

    await findEnabledButton('Thích (6)', true);
    expect(pressedState()).toEqual({ like: 'true', dislike: 'false' });
  });

  it('ABU-02 đã Không thích ⇒ ngược lại', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'KhongThich');
    renderPublicPages({ api, path: PATH });

    await findEnabledButton('Không thích (3)', true);
    expect(pressedState()).toEqual({ like: 'false', dislike: 'true' });
  });

  it('ABU-02 chưa có phiếu ⇒ cả hai nút "false"', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });

    await findEnabledButton('Thích (5)', false);
    expect(pressedState()).toEqual({ like: 'false', dislike: 'false' });
  });

  it('ABU-02 biên: lúc đang tải phiếu của mình cả hai nút bị khoá (aria-disabled), nhóm aria-busy, bấm không gửi gì; tải xong thì dùng được', async () => {
    const api = setup();
    const gate = api.hold('getMyRating');
    renderPublicPages({ api, path: PATH });

    const group = await screen.findByRole('group', { name: GROUP });
    const like = within(group).getByRole('button', { name: 'Thích (5)' });
    const dislike = within(group).getByRole('button', {
      name: 'Không thích (2)',
    });
    expect(like).toHaveAttribute('aria-disabled', 'true');
    expect(dislike).toHaveAttribute('aria-disabled', 'true');
    expect(group).toHaveAttribute('aria-busy', 'true');

    fireEvent.click(like);
    fireEvent.click(dislike);
    expect(api.callsTo('setRating')).toHaveLength(0);
    expect(api.callsTo('clearRating')).toHaveLength(0);

    gate.release();
    await findEnabledButton('Thích (5)');
    expect(group).toHaveAttribute('aria-busy', 'false');
  });

  it('ABU-05 Bệnh nhân gọi GET phiếu đúng MỘT lần, đúng bài 12', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });

    await findEnabledButton('Thích (5)');
    expect(api.callsTo('getMyRating')).toHaveLength(1);
    expect(api.callsTo('getMyRating')[0].args[0]).toBe('12');
  });
});

describe('khối đánh giá: bấm nút (ABU-03)', () => {
  it('ABU-03 nút chưa chọn ⇒ PUT loại đó; số đếm và phiếu lấy từ thân trả về', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });

    fireEvent.click(await findEnabledButton('Thích (5)'));

    await screen.findByRole('button', { name: 'Thích (6)', pressed: true });
    expect(
      screen.getByRole('button', { name: 'Không thích (2)', pressed: false }),
    ).toBeInTheDocument();
    expect(api.callsTo('setRating').map((call) => call.args)).toEqual([
      ['12', 'Thich'],
    ]);
    expect(api.callsTo('clearRating')).toHaveLength(0);
    expect(api.ratingOf('12', PATIENT)).toBe('Thich');
  });

  it('ABU-03 bấm lại nút đang chọn ⇒ DELETE; CẢ HAI nút tắt và số đếm trở về (không rơi về phiếu cũ)', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    fireEvent.click(await findEnabledButton('Thích (5)'));
    fireEvent.click(await findEnabledButton('Thích (6)', true));

    await screen.findByRole('button', { name: 'Thích (5)', pressed: false });
    expect(pressedState()).toEqual({ like: 'false', dislike: 'false' });
    expect(api.callsTo('clearRating').map((call) => call.args)).toEqual([
      ['12'],
    ]);
    // Chỉ MỘT PUT (lần đầu): bấm lại không gửi PUT cùng loại
    expect(api.callsTo('setRating')).toHaveLength(1);
    expect(api.ratingOf('12', PATIENT)).toBeNull();
  });

  it('ABU-03 đang Thích mà bấm Không thích ⇒ PUT loại kia (không DELETE trước); Thích −1, Không thích +1', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'Thich');
    renderPublicPages({ api, path: PATH });

    fireEvent.click(await findEnabledButton('Không thích (2)', false));

    await screen.findByRole('button', {
      name: 'Không thích (3)',
      pressed: true,
    });
    expect(
      screen.getByRole('button', { name: 'Thích (5)', pressed: false }),
    ).toBeInTheDocument();
    expect(api.callsTo('setRating').map((call) => call.args)).toEqual([
      ['12', 'KhongThich'],
    ]);
    expect(api.callsTo('clearRating')).toHaveLength(0);
  });

  it('ABU-03 đang Không thích mà bấm Thích ⇒ PUT Thich', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'KhongThich');
    renderPublicPages({ api, path: PATH });

    fireEvent.click(await findEnabledButton('Thích (5)', false));

    await screen.findByRole('button', { name: 'Thích (6)', pressed: true });
    expect(
      screen.getByRole('button', { name: 'Không thích (2)', pressed: false }),
    ).toBeInTheDocument();
    expect(api.callsTo('setRating')[0].args).toEqual(['12', 'Thich']);
  });

  it('ABU-03 vòng đầy đủ: Thích ⇒ Không thích ⇒ bỏ Không thích; mỗi bước đúng một lời gọi và số đếm theo thân trả về', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });

    fireEvent.click(await findEnabledButton('Thích (5)'));
    fireEvent.click(await findEnabledButton('Không thích (2)', false));
    await screen.findByRole('button', {
      name: 'Không thích (3)',
      pressed: true,
    });
    fireEvent.click(await findEnabledButton('Không thích (3)', true));
    await screen.findByRole('button', {
      name: 'Không thích (2)',
      pressed: false,
    });

    expect(
      screen.getByRole('button', { name: 'Thích (5)' }),
    ).toBeInTheDocument();
    expect(
      api.calls
        .filter(
          (call) =>
            call.method === 'setRating' || call.method === 'clearRating',
        )
        .map((call) => [call.method, ...call.args]),
    ).toEqual([
      ['setRating', '12', 'Thich'],
      ['setRating', '12', 'KhongThich'],
      ['clearRating', '12'],
    ]);
  });

  it('ABU-03 số đếm LẤY TỪ THÂN TRẢ VỀ, không cộng trừ ở web: người khác bấm xen vào thì hiện số của máy chủ', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    // Trong lúc Bệnh nhân đang xem, ba người khác đã Thích (máy chủ là 8 chứ không phải 5)
    api.seedRatings('12', { thich: 3 });

    fireEvent.click(like);

    // Máy chủ: 8 + 1 = 9. Phép cộng trừ ở web sẽ ra 6
    await screen.findByRole('button', { name: 'Thích (9)', pressed: true });
    expect(screen.queryByRole('button', { name: 'Thích (6)' })).toBeNull();
  });

  it('ABU-03 biên: đang hiện "đã chọn" mà phiếu đã mất ở máy chủ (tab khác thu hồi) ⇒ DELETE vẫn 200 (idempotent), nút tắt, số đếm của máy chủ', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'Thich');
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (6)', true);
    // Tab khác đã thu hồi
    await api.clearRating('12');

    fireEvent.click(like);

    await screen.findByRole('button', { name: 'Thích (5)', pressed: false });
    expect(api.callsTo('clearRating')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ABU-03 biên: số đếm 0 hiển thị là 0 (không để trống)', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '12', tieuDe: 'Sốt xuất huyết' }),
    ]);
    signIn(api, 'BenhNhan', PATIENT);
    renderPublicPages({ api, path: PATH });

    expect(await findEnabledButton('Thích (0)')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Không thích (0)' }),
    ).toBeInTheDocument();
  });
});

describe('khối đánh giá: trình đọc màn hình (ABU-07)', () => {
  it('ABU-07 nhóm có tên "Bài viết có ích không?", hai nút có tên chứa số đếm; tên đổi theo số mới', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });

    const group = await screen.findByRole('group', { name: GROUP });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
    expect(
      within(group).getByRole('button', { name: 'Thích (5)' }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole('button', { name: 'Không thích (2)' }),
    ).toBeInTheDocument();

    fireEvent.click(await findEnabledButton('Thích (5)'));
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: 'Thích (6)' }),
      ).toBeInTheDocument(),
    );
    expect(
      within(group).queryByRole('button', { name: 'Thích (5)' }),
    ).toBeNull();
  });

  it('ABU-07 khách cũng có nhóm đúng tên và hai nút tên chứa số đếm', async () => {
    const api = setup();
    signOutAsGuest(api);
    renderPublicPages({ api, path: PATH });

    const group = await screen.findByRole('group', { name: GROUP });
    expect(
      within(group).getByRole('button', { name: 'Thích (5)' }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole('button', { name: 'Không thích (2)' }),
    ).toBeInTheDocument();
  });

  it('ABU-07 vai chỉ xem số đếm vẫn có nhóm đúng tên; số đếm là chữ trong nhóm', async () => {
    const api = setup();
    signIn(api, 'LeTan', 'nv-1');
    renderPublicPages({ api, path: PATH });

    const group = await screen.findByRole('group', { name: GROUP });
    expect(within(group).getByText('5 lượt Thích')).toBeInTheDocument();
    expect(within(group).getByText('2 lượt Không thích')).toBeInTheDocument();
  });

  it('ABU-07 nhãn nhóm không phải đề mục (trang vẫn chỉ MỘT h1, không thêm đề mục)', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });

    await screen.findByRole('group', { name: GROUP });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: GROUP })).toBeNull();
  });
});
