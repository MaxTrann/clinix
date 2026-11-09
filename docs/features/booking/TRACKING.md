# Tracking — module `booking`

Nhật ký tiến độ riêng của module `booking` (Đặt lịch khám, Hủy lịch hẹn, Tra cứu danh sách / lịch sử lịch hẹn, Cập nhật trạng thái lịch hẹn, Xem danh sách lịch hẹn, Xem danh sách lịch hẹn được phân công).
Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass,
chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge.

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`/`B*`/`F*`/`D*`/`X*` theo PLAN.md mục 6), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md (ví dụ `DL-01, DL-03`); "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối).
  Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Ca đồng thời (`DT-*`) ghi thêm số vòng chạy và số lỗi 1213/1205 đo được; sau mỗi ca đồng thời ghi kết quả INV-01…INV-05.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Câu hỏi Q1–Q46 (PLAN.md mục 4.2) được trả lời thì ghi vào mục 3 rồi bỏ thẻ `[CHỜ Qn]` trong PLAN.md.
- Số đo thật (M1–M11, PLAN.md mục 5.15) ghi ở mục 6; cổng còn là bản `Noop` ghi ở mục 7 cho tới khi thay bằng cổng thật.
- Khi cả module xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 08/11/2026 | Lập `PLAN.md` bản nháp 1: kiểm mã thật ở `a3f26b1` (= `origin/main`, PR 220); đọc Figma `1OsOfwD5myNNRv7FPCD9YC` (trang `63:2`, ~40 frame liên quan); dựng 46 câu hỏi Q1–Q46, 33 chỗ lệch L1–L33, 8 nhóm task (P1–P8, B1–B17, F1–F11, D1–D3, X1–X4), 229 test case dự kiến, mục 5.10 "Hợp đồng với module song song `doctor`" | Không áp dụng (chỉ tài liệu) | n/a | Phát hiện chính: `moc_hoan_tien` **chưa có migration/entity**; `thong_bao` không có `lich_hen_id`; `AuditEntry` chưa có `OverrideLichHen`; `rbac` chưa có phạm vi Lễ tân; `SearchModule` không `exports` `ExamPriceReader`; PLAN `search` Q18 giao "khung giờ còn trống" cho `booking` còn prompt 08/11 giao `doctor`; 2.4 ĐLK b8 tự mâu thuẫn về lúc giữ chỗ. Việc đo thật (M1–M11) chưa làm: mọi nhận định về khoá/thời gian trong PLAN ghi "chưa đo" |
| 08/11/2026 | **Phiên kiểm độc lập bản nháp 1: đạt.** Nhóm trả lời đủ Q1–Q46 (38 câu đồng ý nguyên văn, 8 câu kèm điều kiện: Q7, Q13, Q15, Q17, Q21, Q28, Q29, Q44) ⇒ cập nhật `PLAN.md` thành bản nháp 2 (ghi chú "Đã trả lời" cuối từng câu có điều kiện, mục 3 ở dưới). Áp dụng 8 chỗ sửa: (1) bỏ "dòng 83" của `TECH_DEBT` ở Q28 và D3 (dùng số kế tiếp trên `main`, hiện 84); (2) Q44/L3 khôi phục đoạn 2.4 HLH, ví dụ mốc `≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%` ghi vào Q15, Q16; (3) D5 thêm yêu cầu chạy lại idempotent cho `doctor` và ca DT-17 (mất tiến trình giữa hai bước duyệt nghỉ); (4) gắn `[CHỜ Trung]` cho Q7, Q15, Q29 và các task B6, P6, P7, B8, B15, D1; (5) mục 8 thêm "Gợi ý MVP cho demo"; (6) mục 3 của file này ghi quyết định; (7) thêm dòng #61 vào `AI_USAGE_LOG.md`; (8) `git diff` đọc lại | Không áp dụng (chỉ tài liệu) | n/a | Người kiểm đã độc lập xác nhận thứ tự khoá 5.3 không có chu trình (luồng tạo xin tầng 2–6, huỷ xin tầng 5–6, duyệt nghỉ giữ `bac_si` X chỉ ở bước (1) rồi commit mới gọi huỷ), cột sinh `khung_gio_dang_giu` gồm `HoanThanh`, `VangMat`, và không có CHECK nào ràng buộc `han_thanh_toan`/`giu_cho_den` theo trạng thái (nên Q2 hợp lệ); vẫn "chưa đo" (M1–M11 làm ở X1). Đoạn 2.4 HLH bị cắt do khung nội dung (content control) của Word, không phải do dán; "(3 )" ở ĐLK A3/11a là nguyên văn 2.4. **Chưa đối chiếu mục 5.10 với PLAN `doctor`** (chưa có bản). Test case: 230 (thêm DT-17) |
| 08/11/2026 | **Đồng bộ mục 5.10 với PLAN `doctor`** (chỉ tài liệu; đối chiếu với `docs/features/doctor/PLAN.md` mục 5.10 bản 08/11/2026 chưa merge, đọc ở worktree `clinix-app-doctor`) và ghi quyết định của Trung về Q7, Q15, Q29 (gỡ thẻ `[CHỜ Trung]`). Sửa `PLAN.md`: D5 thêm `now` (chỉ lấy lịch `thoi_gian > now`); D3 ghi nhận `listMany` và `trangThaiNgay` 4 giá trị; thêm D13 `listAffectedByLeave`, D14 `countActiveByShifts` (gán B11); làm rõ D7 (`DELETE khung_gio` còn bị khoá ngoại chặn, kể cả lịch `DaHuy`), D8 (doctor F1 tạo mục `BacSi`, F11 chỉ thêm một dòng, F1 merge trước F11), D9 (`seed:doctor-demo`), D11 và bảng khoá 5.3 (tầng 4b `dich_vu_kham` `FOR SHARE` của doctor, booking không xin khoá nào); B14 (`TargetFor` đổi thành bảng tra theo hành động, đụng `doctor` P4; ca `C2-03` không ghi số cứng); P6, P7 theo Q15, Q29 | CG-11…CG-17 (mới, chỉ viết kế hoạch) | n/a | Test case 230 → 237. `DH-04` của `doctor` (vòng khoá với `ServiceService.update` của admin) cần MySQL thật, chưa chạy. Không ghi dòng `AI_USAGE_LOG.md` (kế hoạch đã có dòng #61) |
| 08/11/2026 | Đổi tiền tố mã test CP, LS, LT thành CG, LSH, LTN vì trùng mã ở `auth` (tiền tố CP ở `change-password-form.test.tsx`, LS ở `login.service.spec.ts`, LT ở `login.load.int-spec.ts`, cả ba cũng ở `docs/features/auth/TRACKING.md`); giữ nguyên số; thêm ghi chú tiền tố ở PLAN mục 0. Phiên kiểm vòng 1 sửa thêm: Q15, P6 ghi rõ Trung báo Đại khi bắt đầu task admin | CG-01…CG-17, LSH-01…LSH-14, LTN-01…LTN-05 (chỉ đổi tên, vẫn 237 ca) | n/a | `KT-` (dùng chung với patient X3) giữ; `AR-`, `DT-` do `doctor` trích dẫn nên giữ. `LH-0001` ở test của patient là mã lịch hẹn mẫu (4 chữ số), không phải mã test |
| 09/11/2026 | **Cập nhật PLAN theo ba lưu ý của Trung sau doctor X1** (chỉ tài liệu; tin Trung 09/11/2026, số đo M4, M10, M12 ở `docs/features/doctor/TRACKING.md` mục 6): (1) khoá `lich_hen` chỉ theo khoá chính hoặc `ma_lich_hen`, không theo `khung_gio_id` (5.3 tầng 6 và quy tắc 7, luồng huỷ 5.6, hết hạn lười 5.5 ghi `[đề xuất]` đọc thường rồi khoá theo khoá chính, H2, B10); (2) `findAffectedByLeave`/`listAffectedByLeave` dùng khoảng nửa mở trên `thoi_gian`, không bọc `DATE()`, cột `DATE` đọc bằng `DATE_FORMAT` (D13, H13, B11); (3) P7: timestamp migration lớn hơn mọi migration đã merge (nay là `1793361600000`, không phải `1793275200000`). Thêm ba ca test HL-18, AR-05, CG-18 (237 ⇒ 240 ca). P8 bỏ vì `doctor` đã merge `BranchHoursReader` và `checkSlotWithinBranchHours` (D2 đánh dấu đã merge; B6 import từ `scheduling/`). | HL-18, AR-05, CG-18 (mới, chưa chạy) | n/a (chỉ tài liệu) | Điểm lệch: Trung nêu mốc `1793275200000` nhưng `main` đã có `1793361600000-nhat-ky-phan-cong-nghi-phep.ts` (doctor P4, PR 317); PLAN ghi theo `main`. Mục hết hạn lười khoá `lich_hen` qua chỉ mục `khung_gio_dang_giu`: chưa có số đo riêng, ghi `[đề xuất]` và chốt bằng ca đo ở B6 |
| 09/11/2026 | **P3 — lập kế hoạch** (issue #228, nhánh `refactor/booking-p3`; chỉ tài liệu, **chưa chuyển file**). Đọc mã ở `8411326` (= `origin/main`, 0 PR mở); đếm lại nơi dùng `ExamPriceReader`: đúng 10 file mã (2 file chuyển, 8 file sửa 1 dòng import), không worktree khác có mã dùng đường dẫn cũ. Baseline: đơn vị toàn `apps/api` 158 file / 2497 ca xanh (`src/search` + `src/pricing`: 15 file / 129 ca), `npm run lint` và `tsc --noEmit` sạch. Kế hoạch ở `PLAN.md` mục 6.2 (dưới bảng), quyết định đề xuất P3-A…P3-E ở mục 3.1 | Không áp dụng (chỉ tài liệu) | n/a | Phát hiện: int-spec của reader import `SearchFixtures` (`search/testing/`) nên sau khi chuyển thành import ngược `pricing/` sang `search/`, chỉ ở file test (P3-C). Dòng cuối mục 1 của file này và `AI_USAGE_LOG.md` dễ xung đột với P1, P5. Chưa chạy `test:int`/`test:e2e` (chờ xác nhận DB `clinix_test` rảnh, P3-E) |
| 09/11/2026 | **P3 — chuyển `ExamPriceReader` sang `pricing/` xong** (issue #228; nhóm đã duyệt kế hoạch P3-A…P3-E; người dùng chạy `git mv` sau khi đo baseline). Chuyển 2 file `exam-price.reader.ts` và `exam-price.reader.int-spec.ts` từ `search/pricing/` sang `apps/api/src/pricing/` (2 file đó chỉ sửa đường dẫn import: reader 2 dòng, int-spec khối import), sửa đúng 1 dòng import ở 8 file của `search/` (`search.module.ts`, 4 file ở `search/doctors/`, 3 file ở `search/specialties/` (kể cả `starting-price.ts`)). Không đổi tên class, hàm, chữ ký, hằng, nội dung test; `SearchModule` vẫn là provider của `ExamPriceReader` (P3-A), không `PricingModule`. Trước ⇒ sau: đơn vị toàn `apps/api` 158 file / 2497 ca ⇒ 158 / 2497 xanh; `src/search` + `src/pricing` 15 file / 129 ca ⇒ 15 / 129; tích hợp giá 4 file / 25 ca ⇒ 4 / 25; e2e giá 2 file / 19 ca ⇒ 2 / 19 (so theo tên ca: giống hệt). Chạy thêm trọn bộ sau khi chuyển: `test:int` 89 file / 996 ca xanh, `test:e2e` 41 file / 636 ca xanh. `npm run lint`, `tsc --noEmit`, `nest build` thoát 0; Prettier sạch. jscpd (container `node:22-alpine`): 751 file, 134 cặp trùng, 1,88% dòng / 2,14% token, `newClones` 0, danh sách cặp giống hệt baseline (không cặp nào ở `pricing/`) | `B4 — ExamPriceReader`: TBS-08a, TBS-08b, TBS-08c (giữ nguyên); TBS-08 ở `public-doctor.int-spec.ts`, `public-doctor-detail.int-spec.ts`, `search-doctors.e2e-spec.ts`, `search-specialties.e2e-spec.ts` | Pass (số thật ở cột Việc) | (1) Prettier gộp khối import `./surcharge.calculator.js` của int-spec thành một dòng (vừa 80 cột), vẫn chỉ là câu `import` (diff +3/−6). (2) Int-spec của reader vẫn import `SearchFixtures` từ `search/testing/`: `pricing/` chỉ phụ thuộc `search/` ở file test (P3-C); mã chạy của `pricing/` không import `search/`. (3) Lỗi của AI trong phiên: dùng `grep -c $'\r$'` kiểm xuống dòng nên báo nhầm file `.ts` là CRLF và từng ép Prettier ghi CRLF cho int-spec; Prettier báo lại, đã đưa về LF (`apps/**` là LF theo `.gitattributes` và `.editorconfig`, chỉ `docs/**` là CRLF) và xác nhận bằng `git ls-files --eol`; không lọt vào diff. Người dùng quyết định không gán AI-BUG (tự bắt, không lọt vào diff). (4) Không sửa tài liệu và nhật ký lịch sử của `search` (P3-D). Dòng #71 đã ghi ở `AI_USAGE_LOG.md` (09/11/2026; số PR `[cần điền]`; đổi số nếu PR khác merge trước và dùng #71) |
| | | | Pass / Fail | |

## 2. Kết quả test theo use case

Cập nhật lần chạy mới nhất; chi tiết từng ca xem mục 1. **Chưa có ca nào chạy** (mới có kế hoạch).

| Nhóm test (PLAN.md mục 7) | Tổng số ca | Pass | Fail | Chưa chạy | Ngày chạy gần nhất |
|---|---|---|---|---|---|
| Đặt lịch khám (`DL-*`, 7.1) | 29 | 0 | 0 | 29 | |
| Hết hạn giữ chỗ, xác nhận thanh toán (`HG-*`, 7.2) | 14 | 0 | 0 | 14 | |
| Hủy lịch hẹn (`HL-*`, 7.3) | 18 | 0 | 0 | 18 | |
| Tra cứu của Bệnh nhân (`LSH-*`, 7.4) | 14 | 0 | 0 | 14 | |
| Ma trận và cập nhật trạng thái (`MT-*`, `CT-*`, 7.5) | 26 | 0 | 0 | 26 | |
| Vắng mặt tự động và no-show (`VM-*`, 7.6) | 16 | 0 | 0 | 16 | |
| Danh sách Lễ tân và Quản trị viên (`DSV-*`, 7.7) | 12 | 0 | 0 | 12 | |
| Danh sách Bác sĩ (`DSB-*`, 7.8) | 9 | 0 | 0 | 9 | |
| Phân quyền và sở hữu (`QB-*`, 7.9) | 10 | 0 | 0 | 10 | |
| Đồng thời (`DT-*`, 7.10) | 17 | 0 | 0 | 17 | |
| Bất biến và kiến trúc (`INV-*`, `AR-*`, 7.11) | 10 | 0 | 0 | 10 | |
| Hợp đồng khoá với `patient` (`KT-*`, 7.12) | 5 | 0 | 0 | 5 | |
| Cổng với module khác (`CG-*`, 7.13) | 18 | 0 | 0 | 18 | |
| Thông báo và email (`TB-*`, 7.14) | 8 | 0 | 0 | 8 | |
| Giao diện (`WZ-*`, `LH-*`, `LTN-*`, `QT-*`, `BSI-*`, 7.15) | 29 | 0 | 0 | 29 | |
| Bảo mật dùng chung (`BB-*`, 7.16) | 5 | 0 | 0 | 5 | |
| **Tổng** | **240** | 0 | 0 | 240 | |

## 3. Quyết định đã chốt

Ghi câu trả lời cho các câu hỏi ở PLAN.md mục 4.2 và ngày chốt, để PLAN.md có thể bỏ thẻ `[CHỜ …]`. Quyết định ở đây là **quyết định cuối**, ưu tiên hơn đề xuất trong PLAN.md.
Trả lời ngày **08/11/2026** (từ phiên kiểm độc lập bản nháp 1, Đại xác nhận bằng cách dán). **Trung đã trả lời Q7, Q15, Q29 ngày 08/11/2026** (ghi ở bảng dưới, đã gỡ thẻ `[CHỜ Trung]`). Mục 5.10 **đã đối chiếu** với PLAN `doctor` của Trung ngày 08/11/2026 (dòng "Phân ranh `doctor`/`booking`" ở 3.2); `doctor` ghi cùng kết quả ở mục 3 của họ.

### 3.1 Quyết định của nhóm cho module này

| Mã câu hỏi | Quyết định | Ngày chốt | Ghi chú (khác đề xuất? hệ quả cho task) |
|---|---|---|---|
| Q1★ | Như đề xuất: giữ chỗ lúc Bệnh nhân bấm Xác nhận (b13–b14), cùng MỘT giao dịch với việc tạo lịch hẹn; b8 và b11 chỉ kiểm không khoá | 08/11/2026 | Sửa 2.4 ĐLK b8 theo quyết định này (D2) |
| Q2★ | Như đề xuất: hạn = `thoi_gian_giu_cho` từ cấu hình; `han_thanh_toan` = `giu_cho_den`; NULL khi `DaXacNhan` | 08/11/2026 | Người kiểm xác nhận không có CHECK nào cản |
| Q3 | Như đề xuất: booking không ghi `HetHan`, suy ra khi đọc | 08/11/2026 | D2 ghi chú cột `khung_gio.trang_thai` |
| Q4★ | Như đề xuất: hết hạn và `confirmPaid` cùng khoá hàng `lich_hen`, ai trước thắng; lịch còn `ChoThanhToan` thì vẫn xác nhận; đã `DaHuy` thì `HetHanGiuCho` | 08/11/2026 | B11 `[CHỜ payment]` cho tích hợp thật |
| Q5 | Như đề xuất: giờ bắt đầu khung giờ `> now` | 08/11/2026 | |
| Q6 | Như đề xuất: `DaHuy` + `ly_do_huy` hằng, không thông báo | 08/11/2026 | |
| Q7★ | **Đồng ý (Đại và Trung, 08/11/2026):** `doctor` sở hữu "khung giờ còn trống" và bộ sinh `khung_gio`; PLAN `search` Q18 (đã đồng ý 03/11 giao cho `booking`) do Trung sửa ở task D1 của PLAN `doctor`; đã đối chiếu với PLAN `doctor` (3.2) | 08/11/2026 (Đại, Trung) | B6, D1: đã gỡ `[CHỜ Trung]` |
| Q8★ | Như đề xuất: K1 trả `khungGioId`; API đặt lịch nhận `khungGioId` | 08/11/2026 | Sửa PLAN `search` 5.6 (D1) |
| Q9 | Như đề xuất: lý do khám không bắt buộc, 1–500 ký tự khi có | 08/11/2026 | Sửa 2.4 b10 (D2) |
| Q10★ | Như đề xuất: trùng/chồng lấn theo cùng hồ sơ đi khám, chạm đầu mút không tính | 08/11/2026 | |
| Q11 | Như đề xuất: khoá công khai `maLichHen`, sai/không có/ngoài phạm vi ⇒ 404 cùng thân | 08/11/2026 | |
| Q12★ | Như đề xuất: giới hạn lấy từ `so_lich_hen_toi_da_moi_ho_so`, **PLAN không đặt số** | 08/11/2026 | "(3 )" ở 2.4 A3/11a là nguyên văn, giá trị thật do cấu hình |
| Q13★ | **Đồng ý kèm điều kiện:** `CLX-yyyyMMdd-XXXXX` (5 ký tự Crockford base32 từ CSPRNG) | 08/11/2026 | Nhóm sửa hai kiểu còn lại ở Figma (`CX…` Bước 5–6, `CP…` các màn danh sách) |
| Q14 | Như đề xuất: khoá và đếm no-show theo tài khoản đặt | 08/11/2026 | |
| Q15★ | **Giao cho TRUNG (Trung đã trả lời 08/11/2026):** Trung làm migration + entity `moc_hoan_tien` trong task admin "Đặt cọc & Hoàn tiền"; P6 chỉ làm **tạm** khi tới B8 (cọc > 0) mà Trung chưa xong; Trung báo Đại trước khi bắt đầu task admin, để P6 không viết trùng. Ví dụ mốc 2.4 `≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%` | 08/11/2026 (Đại, Trung) | B8 (cọc > 0), B10, P6: đã gỡ `[CHỜ Trung]` |
| Q16★ | Như đề xuất: mốc lớn nhất ≤ số giờ còn lại, làm tròn xuống 0,01 | 08/11/2026 | Khớp ví dụ 2.4 (đúng 24 giờ được 100%, đúng 2 giờ được 50%) |
| Q17★ | **Đồng ý kèm điều kiện:** Bệnh nhân huỷ và Lễ tân huỷ theo bậc; duyệt nghỉ phép và QTV override sang Đã hủy hoàn 100% và không mời danh sách chờ khi bác sĩ nghỉ; hết hạn giữ chỗ không có gì hoàn | 08/11/2026 | **Quyết định CHÍNH SÁCH của nhóm**, đã có xác nhận của Đại |
| Q18 | Như đề xuất: server tính lại lúc xác nhận, trả số thực tế | 08/11/2026 | |
| Q19 | Như đề xuất: cổng `PaymentPort.recordZeroPayment`; chi tiết ghi của `payment` | 08/11/2026 | Ghi vào PLAN `payment` khi lập |
| Q20★ | Như đề xuất: `payment` gọi `confirmPaid` trong giao dịch của nó; `PaymentSummaryPort.remainingToCollect` | 08/11/2026 | |
| Q21★ | **Đồng ý theo 2.4:** Lễ tân **không** huỷ lịch `DaTiepDon` (cần thì QTV override) | 08/11/2026 | **Nhóm sửa Figma `495:2`** (bỏ nút `Hủy lịch` ở "Đã tiếp đón") |
| Q22★ | Như đề xuất: cửa sổ tiếp đón đóng hai đầu; Vắng mặt chỉ sau hết cửa sổ | 08/11/2026 | **Số phút lấy từ cấu hình, PLAN không đặt số** |
| Q23★ | Như đề xuất: tự Vắng mặt mỗi 5 phút theo giờ kết thúc ca của chi nhánh | 08/11/2026 | Giá trị chu kỳ là `[đề xuất]`; không số cứng khác |
| Q24★ | Như đề xuất: ma trận override (không khôi phục từ `DaHuy`; không tự trừ no-show) | 08/11/2026 | `[ĐỤNG audit]` thêm `OverrideLichHen` (B14) |
| Q25 | Như đề xuất: sau mở khoá, lần Vắng mặt kế tiếp khoá lại ngay | 08/11/2026 | Trả lời nốt phần 2 của admin Q31 |
| Q26 | Như đề xuất: kiểm khoá no-show hai lần (cổng vào và dưới khoá lúc tạo) | 08/11/2026 | |
| Q27 | Như đề xuất: Bệnh nhân không nhập lý do; Lễ tân huỷ bắt buộc; Vắng mặt không có lý do; QTV override bắt buộc | 08/11/2026 | |
| Q28 | **Đồng ý:** Lễ tân không ghi nhật ký hành động, không lưu người thực hiện | 08/11/2026 | Ghi `TECH_DEBT` theo **số kế tiếp trên `main` lúc ghi (hiện 84; KHÔNG dùng 83)** |
| Q29★ | **Đồng ý phương án A (Trung đồng ý 08/11/2026):** thêm `thong_bao.lich_hen_id` + UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)` (bảng của admin; có mẫu tương tự `thong_bao_index_yeu_cau_chi_nhanh`) | 08/11/2026 (Đại, Trung) | P7 làm: sửa cả ba file `docs/database/*` cộng migration, xếp theo timestamp với `doctor` P1, P4 (H15); P7, B15: đã gỡ `[CHỜ Trung]` |
| Q30 | Như đề xuất: 4 mẫu email của module | 08/11/2026 | |
| Q31 | Như đề xuất: `nhom` Sắp tới/Lịch sử, `demTheoTrangThai`, ẩn `DaDoiLich` | 08/11/2026 | Nhóm thêm "Sắp tới/Lịch sử" vào Figma hoặc sửa 2.4 (L23) |
| Q32 | Như đề xuất: bộ lọc và trường XDS | 08/11/2026 | |
| Q33 | Như đề xuất: **giữ SĐT, bỏ email, giá, cọc, thanh toán** | 08/11/2026 | |
| Q34 | Như đề xuất: `ReceptionScopeService` | 08/11/2026 | `[ĐỤNG rbac]` (P4) |
| Q35 | Như đề xuất: có ô tìm `q`, phân trang offset | 08/11/2026 | Ghi ô tìm vào 2.4 (D2) |
| Q36★ | Như đề xuất: Bước 4–6 trong khung công khai, bọc `RequireAuth` `BenhNhan` | 08/11/2026 | Figma đã xác nhận bố cục công khai |
| Q37 | Như đề xuất: không làm đặt lịch hộ; bỏ `Kênh`/`Tại quầy` | 08/11/2026 | Nhóm sửa Figma |
| Q38★ | Như đề xuất: id trên URL; hồ sơ và lý do khám trong bộ nhớ trang | 08/11/2026 | |
| Q39 | Như đề xuất: điểm vào `?khungGioId=`, đăng nhập rồi quay lại | 08/11/2026 | Đo M10 ở F3 |
| Q40 | Như đề xuất: F3–F7 chạy trên khung giờ seed/fixture | 08/11/2026 | |
| Q41 | Như đề xuất: `doctor` seed lịch và khung giờ; booking seed mốc hoàn và dịch vụ cọc | 08/11/2026 | Số cọc `[cần điền]` |
| Q42★ | Như đề xuất (`READ COMMITTED`, thử lại, timeout) **nhưng chỉ chốt SAU khi đo M3 (và M1) ở X1**, trước khi viết lõi | 08/11/2026 | P1, B6 |
| Q43 | Như đề xuất: tên endpoint ở PLAN.md 5.9 | 08/11/2026 | |
| Q44 | **Đã giải quyết:** nội dung 2.4 HLH khôi phục từ XML (ví dụ `≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%` ở HĐK thành công và b3); L3 đã giải quyết; không còn `[cần điền]` ở HLH | 08/11/2026 | Nguyên nhân: khung nội dung Word; chỉ hai đoạn này bị cắt trong 2.4 |
| Q45 | Như đề xuất: cho phép huỷ lịch `ChoThanhToan` trên giao diện | 08/11/2026 | Nhóm bổ sung frame Figma |
| Q46 | Như đề xuất: Bước 5 thêm dòng "Phụ phí bác sĩ" và câu chính sách huỷ/hoàn; email chỉ `Tổng giá` | 08/11/2026 | **Nhóm bổ sung Figma** dòng "Phụ phí bác sĩ" ở Bước 5 |
| P3-A | Giữ `ExamPriceReader` là provider của `SearchModule`; không thêm `PricingModule`, không đổi `exports`. Khi B8 (hoặc P1) cần, `AppointmentsModule` tự thêm đúng lớp này vào `providers` (không có trạng thái, `DataSource` có sẵn toàn cục như ở `PatientModule` và `SearchModule`); chỉ tạo `PricingModule` nếu lúc đó thấy cần, và phải báo Trung (đổi cấu trúc DI) | 09/11/2026 | Thuần chuyển file, không đổi hành vi (PLAN 6.2 P3). Ưu: không đụng DI của `search`. Nhược: hai module cùng liệt kê một provider (hai thể hiện, vô hại vì không có trạng thái) |
| P3-B | Người dùng chạy hai lệnh `git mv` ở gốc worktree **sau khi đo baseline** (đổi thứ tự theo yêu cầu 09/11/2026: chuyển trước thì import hỏng, baseline vô nghĩa), rồi mới sửa nội dung; chỉ sửa tại chỗ sau đó, không chạy lệnh git nào làm đổi repo | 09/11/2026 | Hai file chỉ đổi 2–3 dòng import nên Git vẫn nhận ra đổi tên khi `git add -A`; `git mv` chỉ để tường minh |
| P3-C | Int-spec của reader giữ nguyên việc dùng `SearchFixtures.surchargeRule`, import `../search/testing/search-fixtures.js` | 09/11/2026 | Chỉ ở file test; mã chạy trong `pricing/` không import `search/`. Phương án loại: tự `INSERT` trong int-spec (đổi nội dung test), chuyển `surchargeRule` sang `AdminFixtures` (đụng `admin/**`) |
| P3-D | Không sửa tài liệu của `search` **và không sửa nhật ký lịch sử** (`search/TRACKING.md` dòng B4 06/11, `TRUNG_AI_USAGE_LOG.md` dòng 50): sơ đồ thư mục và dòng task B4 của PLAN `search` còn ghi `pricing/exam-price.reader.ts` nằm trong `search/`. Báo Trung (mục 5) sửa cùng task D1 | 09/11/2026 | PR P3 chỉ sửa PLAN và TRACKING của `booking` |
| P3-E | Không chạy `test:int` hay `test:e2e` khi chưa được xác nhận không có phiên nào khác dùng DB `clinix_test` (P1 làm ở cây `clinix-app`); đo nhóm test giá trước và sau, rồi chạy trọn bộ một lần | 09/11/2026 | Người dùng xác nhận DB `clinix_test` rảnh và giữ cửa sổ P1 không chạy `test:int`/`test:e2e` tới khi P3 báo xong. AGENTS mục 8; PLAN mục 9 điểm 5 |

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

| Quyết định | Nguồn | Hệ quả cho module này |
|---|---|---|
| Tập "đang hoạt động" = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` (một hằng `ACTIVE_APPOINTMENT_STATES`) | patient Q12 | Dùng để đếm giới hạn và kiểm chồng lấn; không đổi entity admin |
| Hợp đồng khoá `benh_nhan` → `ho_so_nguoi_than` → `lich_hen`; không câu đọc thường trước hai khoá | patient Q13, PLAN patient 5.3 | **Xác nhận** ở PLAN.md 5.3 (mở rộng thêm `bac_si`, `khung_gio`, không đảo); người kiểm xác nhận không có chu trình; patient X3 kiểm bằng KT-01…KT-05 |
| `booking` chặn đặt và đổi lịch vào vùng bị loại bởi thay đổi chi nhánh đã duyệt chưa áp dụng (kể cả quá hạn) | admin Q6, Q48, B10 | `PendingBranchChangesPort` (B16 `[CHỜ admin B10]`) |
| Tài nguyên ngoài phạm vi ⇒ 404 | admin Q40 (4.2a) | Lễ tân/QTV Chi nhánh ngoài phạm vi trả 404 |
| `booking` khoá `bac_si` `FOR SHARE` khi tạo lịch | PLAN admin 3.3 (b), H2 | Tầng 4 của bảng khoá (PLAN.md 5.3) |
| Tự Vắng mặt không giải phóng khung giờ, không mời danh sách chờ | Nhóm 25/10/2026 (2.4 CNTT b8) | `markNoShow` giữ `DaDat`, không gọi `WaitlistPort` |
| Giá = `computeExamPrice` của `pricing/`; không công thức thứ hai | admin Q21, search Q15 | B8 dùng `ExamPriceReader` (P3) |
| Phân ranh `doctor`/`booking` | Prompt 08/11/2026 mục C; **5.10 đối chiếu với doctor xong 08/11/2026 (phiên kiểm): Khớp D1, D2, D4, D6 đến D12; sửa D3, D5; thêm D13, D14** | PLAN.md 5.10 (đã đối chiếu); chi tiết ở dòng nhật ký 08/11/2026 cuối mục 1 |
| Ba lưu ý của Trung sau doctor X1 (khoá `lich_hen` theo khoá chính hoặc `ma_lich_hen`, khoảng nửa mở không bọc `DATE()`, timestamp migration P7) | Trung 09/11/2026 (số đo M4, M10, M12 của doctor) | PLAN.md 5.3 quy tắc 7, 5.5, 5.6, D13, H2, H13, B10, B11, P7; bỏ P8; ca HL-18, AR-05, CG-18; điểm lệch số timestamp ở mục 1 |

## 4. Ghi chú AI

- Lần lập kế hoạch này dùng Claude Code (model Claude Sonnet 5.5) ngày 08/11/2026: **đã ghi dòng #61 ở `AI_USAGE_LOG.md` bảng 1** (08/11/2026; số PR chưa có thì ghi ở PR kế tiếp). Đã gộp `origin/main` `3143568` (PR 221, patient B7): dòng #60 của main đứng trước dòng #61 này, không sửa chữ dòng nào. Nếu bản nháp dòng AI log của patient B7 cũng dùng số 61 thì báo Đại để đổi số một bên.
- Mỗi task sinh mã bằng AI: một dòng ở bảng 1 (ghi ở PR kế tiếp nếu chưa có số). Lỗi AI phát hiện: bảng 2, mã `AI-BUG-nnn` trong commit sửa; số dòng nợ kỹ thuật tiếp theo ở `docs/TECH_DEBT.md` kiểm lại trên `main` trước khi ghi (lúc trả lời là 84; dòng 83 đã bị patient B7 dùng).
- Lỗi AI đã biết ở repo này cần tránh (AGENTS mục 7): chỉ đọc cú pháp rồi báo "xong" (phải chạy thật lint/build/test), ghi version Action/thư viện theo trí nhớ, `hashFiles()` ở cấp job, hook husky gọi `npx` trên Windows. Với module này thêm: tuyên bố "không deadlock" mà chưa chạy DT-* nhiều vòng; viết "suy ra từ mã" như sự thật khi chưa đo (M1–M11).
- Sai sót của AI trong lần lập kế hoạch này (không gán mã AI-BUG): bản nháp 1 ghi `TECH_DEBT` "từ dòng 83" mà chưa kiểm số dòng trên `main` (phiên kiểm phát hiện, đã sửa thành số kế tiếp); suy đoán đoạn 2.4 HLH "bị cắt do dán" (thực tế do khung nội dung của Word); tự phát hiện khi rà: tham chiếu chéo sai (test ở "mục 8" thay vì mục 7; mã task `P3` dùng cho hai việc; dải test không tồn tại `HL-19`, `CT-24`, `MT-10`), một ô bảng DL-15 hỏng chữ, "10 tài khoản bác sĩ demo" (thực tế 9).

| Ngày | Task | Dòng `AI_USAGE_LOG.md` | Lỗi AI phát hiện (`AI-BUG-nnn`) |
|---|---|---|---|
| 08/11/2026 | Lập kế hoạch module `booking` | #61 | Không gán mã (xem ghi chú trên) |
| 09/11/2026 | P3 (backend: chuyển `ExamPriceReader` sang `pricing/`) | #71 (đã ghi 09/11/2026) | Không gán mã (lỗi kiểm kiểu xuống dòng tự bắt trước khi vào diff, ghi ở ô "Cách kiểm chứng" của dòng #71 và ở mục 1, dòng P3 chuyển file xong) |

## 5. Phối hợp với module khác

Việc chưa làm; cập nhật cột "Trạng thái" khi hai bên đã thống nhất.

| Với | Việc | Task / mục PLAN | Trạng thái |
|---|---|---|---|
| `doctor` (Trung) | Ba lưu ý 09/11/2026 đã ghi vào PLAN (khoá `lich_hen`, khoảng nửa mở, timestamp P7); `BranchHoursReader` và `checkSlotWithinBranchHours` đã merge nên bỏ P8; nhờ Trung xem lại điểm lệch mốc timestamp (`1793361600000` của doctor P4 thay cho `1793275200000`) | 5.3, 5.10 D2, D13, P7, P8 | Đã ghi vào PLAN; chờ Trung xác nhận khi review PR |
| `doctor` (Trung) | **Đối chiếu mục 5.10** (D1–D14): tên và hình dạng `checkSlotWithinBranchHours`, `AvailableSlotsReader`, `LeaveReader`, `DoctorLeaveApprovalService` (khoá `bac_si` `FOR UPDATE` trước), `AppointmentTransitionService.complete`, `AppointmentCancellationService.cancel` + `CancelOutcome`, quy tắc ghi `khung_gio`, seed, trang Bác sĩ. **Thêm (08/11/2026):** bước (2) của duyệt nghỉ phép (huỷ hàng loạt sau commit) phải **chạy lại idempotent** nếu bị dừng giữa chừng (job quét yêu cầu `DaDuyet` còn lịch bị ảnh hưởng, hoặc gọi lại `findAffectedByLeave`); ca đồng thời DT-17 | 5.10, D5, P8, B11, B16, F11, DT-17 | **Đã đối chiếu 08/11/2026** (3.2): khớp D1, D2, D4, D6 đến D12; sửa D3, D5; thêm D13, D14. Còn chờ: F1 của `doctor` merge trước F11; D13, D14 ở B11 |
| Trung | Hỏi và ghi câu trả lời: **Q7** (`doctor` sở hữu "khung giờ còn trống", sửa PLAN `search` Q18), **Q15** (Trung làm migration + entity `moc_hoan_tien`), **Q29** (đồng ý phương án A) | Q7, Q15, Q29; B6, B8, B15, P6, P7, D1 | **Đã trả lời 08/11/2026** (3.1) |
| `search` (Trung) | Q18 đổi chủ "khung giờ còn trống"; K1 trả `khungGioId`; chuyển `ExamPriceReader` (P3) và `BOOKING_PATH` (P5); điểm vào A1 (K3) | D1, P3, P5 | Chưa (Q7 đã đồng ý; Trung sửa PLAN `search` ở task D1 của PLAN `doctor`) |
| `search` (Trung) | **P3 `[ĐỤNG search]`:** chuyển `search/pricing/exam-price.reader.ts` và int-spec sang `pricing/`, sửa 1 dòng import ở 8 file của `search`, không đổi hành vi. Báo Trung trước khi nhờ review; nhờ Trung sửa PLAN `search` (sơ đồ thư mục, dòng task B4) cùng task D1 (P3-D) | P3 | **Đã báo Trung 09/11/2026:** Trung không sửa dở `search/` hay `features/search/`, đồng ý cho làm và sẽ review (soi: P3 không đổi hành vi; chạy lại toàn bộ test giá của `search` kèm hai int-spec của `search/doctors`) |
| `admin` (Trung) | `moc_hoan_tien` (Q15, P6); `getPendingEffectiveChanges` (B10); `thong_bao.lich_hen_id` (Q29, P7); seed `booking-demo` (P2); `admin-sidebar.tsx` thêm `to` (F10); worker thông báo B9 | P6, P7, B16, B15 | Chưa (Q15: Trung làm trong task admin "Đặt cọc & Hoàn tiền"; Q29: P7 theo phương án A) |
| `rbac`, `audit` (Trung) | `ReceptionScopeService` (P4); `OverrideLichHen` ở `AuditEntry` (B14) | P4, B14 | Chưa |
| `patient` (Đại) | X3 chạy KT-01…KT-05; nối liên kết "Lịch hẹn của tôi" ở `relative-errors.ts` (F2); không đổi hành vi ba file `appointments/` đã có | X3, F2 | Chưa |
| `payment` | `confirmPaid` trong giao dịch của payment; `checkIn` cho thanh toán offline; giao dịch 0đ; lựa chọn cọc/toàn bộ; khoá `lich_hen` trước `vi_noi_bo`; trang Bước 5 Thanh toán | 5.10 B, B11, B17, F6 | Chưa (module chưa có) |
| `wallet` | `RefundPort`; thử lại 3 lần/5 phút; quét hoàn bị mất dùng `RefundCalculator`; `WalletBalancePort` | 5.10 B, B10, B17 | Chưa (module chưa có) |
| `waitlist` | `WaitlistPort`, `holdForInvitation`/`releaseInvitationHold` (thả có điều kiện W3) | 5.10 B, B17 | Chưa (module chưa có) |
| `notification` | `AppointmentNotifier`, mẫu thư, worker gửi | B15 | Chưa (module chưa có) |
| Nhóm (Figma, 2.4) | Sửa Figma: `495:2` bỏ nút Hủy lịch ở "Đã tiếp đón" (Q21); thống nhất mã lịch hẹn `CLX-…` (Q13); bỏ `Kênh`/`Tại quầy` (Q37); bổ sung "Phụ phí bác sĩ" Bước 5 (Q46) và các frame còn thiếu (PLAN 4.5). Sửa 2.4 (repo `TLCN_CLINIX`) theo D2 | D2, D3 | Chưa |

## 6. Số đo thật (PLAN.md mục 5.15; làm ở task X1 trước B6)

| # | Cần đo | Kết quả | Ngày | Hệ quả cho PLAN |
|---|---|---|---|---|
| M1 | Tỉ lệ 1213/1205 của luồng tạo, `READ COMMITTED` so với `REPEATABLE READ` | | | |
| M2 | Lỗi 1062 của `khung_gio_dang_giu` và `ma_lich_hen` (errno, nội dung) | | | |
| M3 | `innodb_lock_wait_timeout` so với trải nghiệm (**chốt Q42**) | | | |
| M4 | Múi giờ: tham số `Date` so với cột `datetime`; biên nửa mở | | | |
| M5 | `EXPLAIN` quét hết hạn `(trang_thai, han_thanh_toan)` ≥ 100.000 hàng | | | |
| M6 | `EXPLAIN` và tính đúng của truy vấn Vắng mặt (4 bảng, `WEEKDAY + 1`) | | | |
| M7 | Cột JSON `chinh_sach_hoan_snapshot` đọc/ghi qua SQL thô | | | |
| M8 | `ValidationPipe` với `trangThai[]`, query lạ, `maLichHen` chữ thường | | | |
| M9 | Collation `ma_lich_hen` không phân biệt hoa/thường | | | |
| M10 | Cơ chế quay lại trang trước sau đăng nhập của auth | | | |
| M11 | Chỉ mục khi `ho_so_nguoi_than_id <=> ?` với hồ sơ bản thân (`NULL`) | | | |

## 7. Cổng còn là bản `Noop`/`Fake` (cập nhật khi thay bằng cổng thật)

| Cổng | Chờ ai | Hành vi tạm | Ngày thay bằng cổng thật |
|---|---|---|---|
| `DoctorLeavePort` | `doctor` D4 | Không chặn nghỉ phép | |
| `PendingBranchChangesPort` | `admin` B10 | Không chặn vùng bị loại | |
| `PaymentPort`, `PaymentSummaryPort` | `payment` | `conPhaiThu = gia_snapshot`, `amountPaid = 0`, không ghi giao dịch 0đ | |
| `RefundPort`, `WalletBalancePort` | `wallet` | Không hoàn, số dư `null` | |
| `WaitlistPort` | `waitlist` | Không mời | |
| `AppointmentNotifier` | `notification`, Q29 | Không gửi | |
