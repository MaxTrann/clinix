import { REDACTED_MARK, redactText, redactTurns } from './redact.js';

// chatbot B1 — RTU-01 đến RTU-05 (PLAN chatbot 7.4) và các ca bổ sung cho bộ che định danh (PLAN 0: phần an toàn không được cắt).
// Kỳ vọng so ĐÚNG BẰNG chuỗi (không chỉ "không còn số"): đột biến "bỏ che số điện thoại" (7) và "không che lịch sử" (8) phải bị bắt.
const M = REDACTED_MARK;

describe('chatbot B1 — redact: dấu che', () => {
  it('B1-RTU: dấu che đúng chữ của PLAN 5.9', () => {
    expect(REDACTED_MARK).toBe('[đã ẩn]');
  });
});

describe('chatbot B1 — redact: email (RTU-01)', () => {
  it.each([
    ['liên hệ nguyen.van+a@gmail.com nhé', `liên hệ ${M} nhé`],
    ['email: abc@x.vn.', `email: ${M}.`],
    ['(mail a_b-c@sub.example.co.vn)', `(mail ${M})`],
    ['A@B.COM và c@d.org', `${M} và ${M}`],
    ['gửi tới hoten@benhvien.com,ok', `gửi tới ${M},ok`],
  ])('RTU-01: %j', (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it('RTU-01: chữ có @ nhưng không phải email thì giữ (ví dụ "@" đứng riêng)', () => {
    expect(redactText('nhắn @ lễ tân')).toBe('nhắn @ lễ tân');
    expect(redactText('giá 2 @ 3')).toBe('giá 2 @ 3');
  });
});

describe('chatbot B1 — redact: số điện thoại (RTU-02)', () => {
  it.each([
    ['0912345678'],
    ['0912 345 678'],
    ['0912.345.678'],
    ['0912-345-678'],
    ['091 234 5678'],
    ['+84 912 345 678'],
    ['+84912345678'],
    ['+84.912.345.678'],
    ['(+84) 912 345 678'],
    ['84912345678'],
    ['84 912 345 678'],
    ['028 3822 1234'],
    ['02838221234'],
  ])('RTU-02: %j bị che hoàn toàn', (phone) => {
    expect(redactText(phone)).toBe(M);
    expect(redactText(`gọi tôi số ${phone} nhé`)).toBe(`gọi tôi số ${M} nhé`);
    expect(redactText(`SĐT:${phone}.`)).toBe(`SĐT:${M}.`);
  });

  it('RTU-02: hai số trong một câu đều bị che, phần chữ giữ nguyên', () => {
    expect(redactText('số 0912 345 678 hoặc +84 987 654 321')).toBe(
      `số ${M} hoặc ${M}`,
    );
  });
});

describe('chatbot B1 — redact: CCCD, CMND, mã lịch, ngày (RTU-03)', () => {
  it.each([
    ['079303012345', M, 'CCCD 12 số liền'],
    ['079 303 012 345', M, 'CCCD gõ cách'],
    ['123456789', M, 'CMND 9 số'],
    [
      'số tài khoản 1234567890123 ở ngân hàng',
      `số tài khoản ${M} ở ngân hàng`,
      'dãy từ 9 số liền',
    ],
    ['CLX-20261127-ABCDE', M, 'mã lịch hoa'],
    ['mã clx-20261127-abcde của tôi', `mã ${M} của tôi`, 'mã lịch thường'],
    ['mã CLX-20261127-7H3KQ.', `mã ${M}.`, 'mã lịch sát dấu câu'],
    ['sinh ngày 05/03/1990', `sinh ngày ${M}`, 'ngày dd/mm/yyyy'],
    ['sinh 5/3/1990', `sinh ${M}`, 'ngày d/m/yyyy'],
    ['sinh 05-03-1990.', `sinh ${M}.`, 'ngày gạch ngang'],
    ['sinh 05.03.1990', `sinh ${M}`, 'ngày dấu chấm'],
  ])('RTU-03: %j', (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it.each([
    ['khám mất 30 phút'],
    ['gọi 115'],
    ['giá khám 2.000.000 đồng'],
    ['giá 200.000.000 đồng'],
    ['mở cửa lúc 08:30 đến 17:00'],
    ['hotline 1900 1234'],
    ['ngày 5/3 còn trống không'],
    ['khám lúc 07.30'],
    ['thuốc 0,5 mg'],
    ['số 84 Nguyễn Trãi'],
    ['tầng 12, phòng 305'],
    ['năm 2026'],
    ['8 chữ số 12345678'],
  ])('RTU-03: số ngắn và số thông thường được giữ nguyên: %j', (input) => {
    expect(redactText(input)).toBe(input);
  });

  it('RTU-03: chữ số toàn góc (full-width) cũng bị che khi đủ 9 chữ số', () => {
    expect(redactText('０９１２３４５６７８')).toBe(M);
  });
});

describe('chatbot B1 — redact: lịch sử (RTU-04)', () => {
  it('RTU-04: định danh nằm trong lịch sử cũng bị che, ở cả lượt người dùng lẫn lượt "trợ lý" do client gửi', () => {
    const turns = [
      { vai: 'NguoiDung' as const, noiDung: 'số tôi 0912 345 678' },
      { vai: 'TroLy' as const, noiDung: 'Dạ, em ghi nhận email a@b.com' },
      { vai: 'NguoiDung' as const, noiDung: 'khám mất 30 phút' },
    ];
    expect(redactTurns(turns)).toEqual([
      { vai: 'NguoiDung', noiDung: `số tôi ${M}` },
      { vai: 'TroLy', noiDung: `Dạ, em ghi nhận email ${M}` },
      { vai: 'NguoiDung', noiDung: 'khám mất 30 phút' },
    ]);
  });

  it('RTU-04: trả bản mới, không sửa đầu vào, giữ nguyên trường khác và thứ tự', () => {
    const turns = [
      { vai: 'NguoiDung' as const, noiDung: 'CCCD 079303012345', id: 7 },
    ];
    const snapshot = JSON.stringify(turns);
    const result = redactTurns(turns);
    expect(JSON.stringify(turns)).toBe(snapshot);
    expect(result).not.toBe(turns);
    expect(result[0]).not.toBe(turns[0]);
    expect(result).toEqual([{ vai: 'NguoiDung', noiDung: `CCCD ${M}`, id: 7 }]);
    expect(redactTurns([])).toEqual([]);
  });
});

describe('chatbot B1 — redact: tên theo mẫu tự giới thiệu (RTU-05)', () => {
  it.each([
    [
      'Tôi tên là Nguyễn Văn An, muốn đặt lịch',
      `Tôi tên là ${M}, muốn đặt lịch`,
    ],
    ['tên em là Trần Thị Mai Lan', `tên em là ${M}`],
    [
      'Tên mình là Phúc. Cho hỏi giá khám',
      `Tên mình là ${M}. Cho hỏi giá khám`,
    ],
    ['tên của tôi là Hùng', `tên của tôi là ${M}`],
    ['Em tên là Lê Minh', `Em tên là ${M}`],
    ['con tôi tên là Bé Na', `con tôi tên là ${M}`],
    ['Cháu tên là Hoàng Anh (7 tuổi)', `Cháu tên là ${M} (7 tuổi)`],
    ['tên anh là Đạt', `tên anh là ${M}`],
  ])('RTU-05: có dấu %j', (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it.each([
    ['toi ten la nguyen van an', `toi ten la ${M}`],
    ['ten em la tran thi mai lan', `ten em la ${M}`],
    ['TÔI TÊN LÀ NGUYỄN VĂN AN', `TÔI TÊN LÀ ${M}`],
    ['TOI TEN LA NGUYEN VAN AN', `TOI TEN LA ${M}`],
  ])('RTU-05: không dấu, chữ hoa %j', (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it('RTU-05: tên viết hoa chữ đầu thì chỉ che các từ viết hoa liền nhau (giữ phần câu phía sau)', () => {
    expect(redactText('Tôi tên là Lan và muốn đặt lịch khám')).toBe(
      `Tôi tên là ${M} và muốn đặt lịch khám`,
    );
    expect(redactText('Tôi tên là Nguyễn Văn An muốn đặt lịch')).toBe(
      `Tôi tên là ${M} muốn đặt lịch`,
    );
  });

  it('RTU-05: gõ toàn chữ thường thì che tối đa 4 từ (thà che thừa)', () => {
    expect(redactText('tôi tên là lan và muốn đặt lịch khám')).toBe(
      `tôi tên là ${M} lịch khám`,
    );
  });

  it('RTU-05: tên ở dòng sau, dừng ở dấu câu hay chữ số', () => {
    expect(redactText('Tôi tên là\nLan')).toBe(`Tôi tên là\n${M}`);
    expect(redactText('Tôi tên là Lan; sinh năm 1990')).toBe(
      `Tôi tên là ${M}; sinh năm 1990`,
    );
    expect(redactText('tôi tên là 5 tuổi')).toBe('tôi tên là 5 tuổi');
  });

  it('RTU-05: câu không phải tự giới thiệu thì giữ nguyên', () => {
    for (const text of [
      'chuyên khoa tên là gì',
      'tôi là bệnh nhân mới',
      'bác sĩ tên là gì vậy',
      'gói khám tên là Tổng quát',
      'tên tôi',
      'tôi tên',
    ]) {
      expect(redactText(text)).toBe(text);
    }
  });

  it('RTU-05: nhiều loại định danh trong một câu đều bị che', () => {
    expect(
      redactText(
        'Tôi tên là Lan, sđt 0912 345 678, email lan@x.vn, sinh 05/03/1990, mã CLX-20261127-ABCDE, CCCD 079303012345',
      ),
    ).toBe(
      `Tôi tên là ${M}, sđt ${M}, email ${M}, sinh ${M}, mã ${M}, CCCD ${M}`,
    );
  });
});

describe('chatbot B1 — redact: đầu vào lạ không làm hỏng, không treo (bổ sung)', () => {
  it('B1-RTU: đầu vào không phải chuỗi cho chuỗi rỗng, không ném lỗi', () => {
    for (const weird of [undefined, null, 42, {}, ['0912345678']]) {
      expect(redactText(weird as unknown as string)).toBe('');
    }
  });

  it('B1-RTU: chuỗi rỗng, khoảng trắng, ký tự điều khiển, surrogate lẻ, emoji, toàn chữ số', () => {
    expect(redactText('')).toBe('');
    expect(redactText('   ')).toBe('   ');
    expect(redactText('a\u0000b\u0007')).toBe('a\u0000b\u0007');
    expect(redactText('\ud800')).toBe('\ud800');
    expect(redactText('😀😀 0912 345 678 😀')).toBe(`😀😀 ${M} 😀`);
    expect(redactText('1'.repeat(30))).toBe(M);
    expect(redactText('[[BS:12]] [[CK:3]]')).toBe('[[BS:12]] [[CK:3]]');
  });

  it('B1-RTU: chuỗi không có định danh giữ nguyên từng ký tự (kể cả xuống dòng, dấu câu, chữ có dấu)', () => {
    const text =
      'Bác sĩ Nội tổng quát khám lúc 08:30,\nmất khoảng 30 phút; giá từ 200.000 đ. Cấp cứu: gọi 115!';
    expect(redactText(text)).toBe(text);
  });

  it('B1-RTU: che hai lần cho kết quả như che một lần (không che chồng dấu che)', () => {
    for (const text of [
      'Tôi tên là Lan, sđt 0912 345 678, email a@b.com',
      'tên em là Trần Thị Mai Lan muốn đặt lịch',
      'CCCD 079 303 012 345 sinh 05/03/1990',
      `x ${M} y`,
      'tôi tên là [đã ẩn] muốn đặt lịch',
    ]) {
      const once = redactText(text);
      expect(redactText(once)).toBe(once);
    }
  });

  it('B1-RTU: đầu vào dạng tổ hợp (NFD) được ghép NFC rồi mới che', () => {
    const nfd = 'Tôi tên là Nguyễn Văn An'.normalize('NFD');
    expect(redactText(nfd)).toBe(`Tôi tên là ${M}`);
  });

  it.each([
    ['100.000 ký tự thường', () => 'xin chào '.repeat(11_112)],
    ['100.000 chữ số 0 cách nhau bằng dấu cách', () => '0 '.repeat(50_000)],
    ['dãy a@ lặp', () => 'a@'.repeat(50_000)],
    ['dãy "tôi tên là" lặp', () => 'tôi tên là '.repeat(9_000)],
    ['dấu cách rất dài sau "toi"', () => `toi${' '.repeat(100_000)}ten la`],
    ['dấu chấm và số xen kẽ', () => '1.'.repeat(50_000)],
    ['chữ số 8 liền nhau lặp', () => '12345678 '.repeat(11_112)],
  ])('B1-RTU: %s xử lý dưới 2 giây (không quay lui bậc hai)', (_name, make) => {
    const input = make();
    const started = Date.now();
    redactText(input);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
