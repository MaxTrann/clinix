import { UnexpectedResponseError } from '../../../shared/api/errors';
import { createStaff, loadCreateOptions } from './staff-create-service';
import type { CreateBody } from './staff-create-model';

// admin F8 PR2, lời gọi tạo tài khoản và nạp tuỳ chọn (mã NSF8-79 đến 81 là [đề xuất], TRACKING admin 9A.21 mục 3). Phủ NS-18 (thân đúng tập khoá), NS-19 (gửi thư lỗi
// không bao giờ thành "đã gửi") và nguồn tuỳ chọn của NS-13. `fetch` giả ở mức hợp đồng B15 và B7; không dữ liệu thật.

interface Call {
  method: string;
  path: string;
  search: string;
  body: unknown;
  contentType: string | null;
}

function stubFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const call: Call = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        search: url.search,
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
        contentType: new Headers(init?.headers).get('Content-Type'),
      };
      calls.push(call);
      return respond(call);
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const doctorBody: CreateBody = {
  vaiTro: 'BacSi',
  hoTen: 'Lê Văn An',
  email: 'an@example.invalid',
  soDienThoai: '0912345678',
  chiNhanhId: '5',
  chuyenKhoaId: '1',
  dichVuKhamId: '11',
  chucDanh: 'TS_BS',
  hocVi: 'TS',
  soNamKinhNghiem: 12,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NSF8-79 createStaff: lời gọi và bộ đọc phản hồi 201 (NS-18, NS-19)', () => {
  it('NSF8-79 MỘT POST /admin/staff-accounts, thân JSON đúng nguyên văn và đúng TẬP KHOÁ (không khoá thừa)', async () => {
    const calls = stubFetch(() =>
      json(
        {
          taiKhoanId: '77',
          loaiTaiKhoan: 'BacSi',
          trangThai: 'ChoKichHoat',
          guiEmail: { ketQua: 'DaGui' },
        },
        201,
      ),
    );
    await createStaff(doctorBody);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/admin/staff-accounts',
      contentType: 'application/json',
      body: doctorBody,
    });
    expect(Object.keys(calls[0].body as object).sort()).toEqual(
      Object.keys(doctorBody).sort(),
    );
  });

  it('NSF8-79 DaGui: sent kèm id; chỉ hai khoá, KHÔNG token hay liên kết dù API lỡ trả thừa', async () => {
    stubFetch(() =>
      json(
        {
          taiKhoanId: '77',
          guiEmail: { ketQua: 'DaGui' },
          token: 'khong-duoc-ve',
          lienKet: 'https://x.example.invalid/kich-hoat#token=bi-mat',
        },
        201,
      ),
    );
    const result = await createStaff(doctorBody);
    expect(result).toEqual({ kind: 'sent', taiKhoanId: '77' });
    expect(JSON.stringify(result)).not.toMatch(/token|bi-mat|khong-duoc-ve/);
  });

  it('NSF8-79 HTTP 201 mà gửi thư lỗi (ThatBai): mailFailed, tài khoản ĐÃ tạo (NS-19)', async () => {
    stubFetch(() =>
      json(
        {
          taiKhoanId: '78',
          guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
        },
        201,
      ),
    );
    expect(await createStaff(doctorBody)).toEqual({
      kind: 'mailFailed',
      taiKhoanId: '78',
    });
  });

  it.each<[string, unknown]>([
    ['thiếu taiKhoanId', { guiEmail: { ketQua: 'DaGui' } }],
    ['taiKhoanId là số', { taiKhoanId: 77, guiEmail: { ketQua: 'DaGui' } }],
    ['taiKhoanId rỗng', { taiKhoanId: '', guiEmail: { ketQua: 'DaGui' } }],
    ['thiếu guiEmail', { taiKhoanId: '77' }],
    ['guiEmail là chuỗi', { taiKhoanId: '77', guiEmail: 'DaGui' }],
    ['ketQua lạ', { taiKhoanId: '77', guiEmail: { ketQua: 'ChoGui' } }],
    ['thân là chuỗi', 'DaGui'],
    ['thân null', null],
    ['thân là mảng', [{ taiKhoanId: '77' }]],
  ])('NSF8-79 %s: unknown, KHÔNG BAO GIỜ thành đã gửi', async (_name, body) => {
    stubFetch(() => json(body, 201));
    expect(await createStaff(doctorBody)).toEqual({ kind: 'unknown' });
  });

  it('NSF8-79 thân 2xx rỗng: unknown', async () => {
    stubFetch(() => new Response('', { status: 201 }));
    expect(await createStaff(doctorBody)).toEqual({ kind: 'unknown' });
  });

  it('NSF8-79 lỗi HTTP được ném nguyên cho nơi gọi chọn chữ theo mã (409 EMAIL_DA_DUNG)', async () => {
    stubFetch(() => json({ maLoi: 'EMAIL_DA_DUNG', thongBao: 'x' }, 409));
    await expect(createStaff(doctorBody)).rejects.toMatchObject({
      status: 409,
      maLoi: 'EMAIL_DA_DUNG',
    });
  });

  it('NSF8-79 thân không phải JSON ở lời gọi thành công: ném UnexpectedResponseError (không coi là đã tạo)', async () => {
    stubFetch(
      () =>
        new Response('<html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    );
    await expect(createStaff(doctorBody)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});

describe('NSF8-79 createStaff chờ lâu hơn mặc định vì gửi thư ngay trong lời gọi (NS-19, NS-45)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('NSF8-79 chưa hết hạn chờ ở giây thứ 20 (mặc định 15 giây) mà vẫn nhận được kết quả; hết hạn chờ ở giây thứ 45 thì TimeoutError', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            release = () =>
              resolve(
                json(
                  {
                    taiKhoanId: '77',
                    guiEmail: { ketQua: 'DaGui' },
                  },
                  201,
                ),
              );
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const slow = createStaff(doctorBody);
    await vi.advanceTimersByTimeAsync(20_000);
    release?.();
    expect(await slow).toEqual({ kind: 'sent', taiKhoanId: '77' });

    const never = createStaff(doctorBody);
    const outcome = never.then(
      () => 'resolved',
      (error: unknown) => (error as Error).name,
    );
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await outcome).toBe('TimeoutError');
  });
});

describe('NSF8-80 loadCreateOptions: hai lời gọi, không /admin/services (NS-13)', () => {
  const branches = {
    items: [
      {
        chiNhanhId: '5',
        ten: 'Chi nhánh Quận 1',
        diaChi: 'khong-duoc-ve',
        dichVuKham: [
          { dichVuKhamId: '11', ten: 'Khám tổng quát', giaMacDinh: '1' },
          { dichVuKhamId: '12', ten: 'Khám tim mạch' },
        ],
      },
      { chiNhanhId: '6', ten: 'Chi nhánh Quận 3', dichVuKham: [] },
    ],
    total: 2,
    page: 1,
    pageSize: 100,
  };
  const specialties = {
    items: [
      { chuyenKhoaId: '1', ten: 'Tim mạch', moTa: 'khong-duoc-ve' },
      { chuyenKhoaId: '2', ten: 'Nhi khoa' },
    ],
    total: 2,
    page: 1,
    pageSize: 100,
  };

  it('NSF8-80 đúng hai GET (chuyên khoa và chi nhánh), trang 1 cỡ 100; giữ đúng khoá cần, bỏ khoá lạ', async () => {
    const calls = stubFetch((call) =>
      call.path === '/admin/branches' ? json(branches) : json(specialties),
    );
    const options = await loadCreateOptions();

    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual([
      'GET /admin/branches',
      'GET /admin/options/specialties',
    ]);
    for (const call of calls) {
      expect(call.search).toContain('page=1');
      expect(call.search).toContain('pageSize=100');
    }
    expect(options).toEqual({
      specialties: [
        { chuyenKhoaId: '1', ten: 'Tim mạch' },
        { chuyenKhoaId: '2', ten: 'Nhi khoa' },
      ],
      branches: [
        {
          chiNhanhId: '5',
          ten: 'Chi nhánh Quận 1',
          dichVuKham: [
            { dichVuKhamId: '11', ten: 'Khám tổng quát' },
            { dichVuKhamId: '12', ten: 'Khám tim mạch' },
          ],
        },
        { chiNhanhId: '6', ten: 'Chi nhánh Quận 3', dichVuKham: [] },
      ],
    });
    expect(JSON.stringify(options)).not.toContain('khong-duoc-ve');
  });

  it('NSF8-80 chi nhánh thiếu id hay tên, dịch vụ sai hình dạng: bị bỏ, không ném', async () => {
    stubFetch((call) =>
      call.path === '/admin/branches'
        ? json({
            items: [
              { ten: 'Thiếu id', dichVuKham: [] },
              { chiNhanhId: 7, ten: 'Id là số', dichVuKham: [] },
              {
                chiNhanhId: '8',
                ten: 'Dịch vụ hỏng',
                dichVuKham: [{ dichVuKhamId: '1' }, null, { ten: 'x' }, 5],
              },
              { chiNhanhId: '9', ten: 'Không có dịch vụ' },
            ],
            total: 4,
            page: 1,
            pageSize: 100,
          })
        : json(specialties),
    );
    const { branches: result } = await loadCreateOptions();
    expect(result).toEqual([
      { chiNhanhId: '8', ten: 'Dịch vụ hỏng', dichVuKham: [] },
      { chiNhanhId: '9', ten: 'Không có dịch vụ', dichVuKham: [] },
    ]);
  });

  it('NSF8-80 một trong hai lời gọi lỗi thì cả lần nạp lỗi (nơi gọi hiện "Thử lại")', async () => {
    stubFetch((call) =>
      call.path === '/admin/branches'
        ? json({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500)
        : json(specialties),
    );
    await expect(loadCreateOptions()).rejects.toMatchObject({ status: 500 });
  });

  it('NSF8-80 huỷ qua AbortSignal: lời gọi bị huỷ, không ném lỗi lạ', async () => {
    stubFetch(() => json(specialties));
    const controller = new AbortController();
    controller.abort();
    await expect(loadCreateOptions(controller.signal)).rejects.toMatchObject({
      name: 'RequestAbortedError',
    });
  });
});
