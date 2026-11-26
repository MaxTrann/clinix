# Tracking — scope #11 `chat` Nhắn tin (Nhắn tin với bác sĩ, Nhắn tin với lễ tân, Nhắn tin với bệnh nhân)

Nhật ký tiến độ riêng của scope #11 (mã nằm trong `apps/api/src/chat/` và `apps/web/src/features/chat/`; scope commit `chat`). Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass, chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge. **Người làm scope này: Trung (`junUTE`); Đại (`MaxTrann`) review.**

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`, `B*`, `F*`, `D*`, `X*` theo PLAN.md mục 6; ngoài file này luôn viết "chat B2" để không nhầm với booking B2, reschedule B2 hay notification B2), mới nhất ở cuối.
- "Test case": liệt kê mã ở mục 7 của PLAN.md; "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Ca đồng thời ghi thêm số vòng chạy và số lỗi 1213, 1205, 503 đo được; sau mỗi ca đồng thời ghi kết quả IVC-01…IVC-08.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Quyết định của nhóm ghi ở mục 3. **Chỉ ghi "ĐÃ TRẢ LỜI" khi Đại trả lời trực tiếp** (tin của phiên kiểm độc lập chỉ duyệt kế hoạch từng giai đoạn và trả lời câu kỹ thuật).
- Số đo thật (PLAN.md mục 5.15) ghi ở mục 6 **sau khi đặt tiêu chí trước**; việc còn chờ ghi ở mục 7.
- **Không dán nội dung tin nhắn, tên tệp hay dữ liệu bệnh nhân vào file này** (kể cả dữ liệu thử).
- Khi cả scope xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 26/11/2026 | **Lập kế hoạch scope #11, giai đoạn 1** (Đại `MaxTrann`; nhánh `docs/chat-plan`, worktree `clinix-app-doctor-exam`, `origin/main` `5598e8a`). Đọc nguyên văn 2.4.20, 2.4.21, 2.4.29 bằng `python-docx` (chỉ đọc), so từng dòng với `Drive_Hien_Tai` (2.4.28); đọc các use case chạm vào (2.4.7, 2.4.8, 2.4.26, 2.4.37, 2.4.40, 2.4.59, 2.4.68, 2.4.76), 1.2.1, 1.3.10, 2.1_2.2; đối chiếu `docs/database/*` (`hoi_thoai`, `tai_khoan_hoi_thoai`, `tin_nhan`, quy tắc 16 và 14), PLAN thông báo, đổi lịch, ADR 0001, `docs/TECH_DEBT.md`, mã `apps/api/src/{auth,rbac,notification,appointments,patient,common,database}`, `apps/web/src/{router,shared,features}`, hạ tầng compose, Dockerfile, nginx, Vite và mã Make của Figma. **Hỏi Đại bằng bảy hộp câu hỏi** (25 câu, mục 3.1): 22 câu theo đề xuất; Q1 (ảnh và PDF), Q2 (WebSocket), Q8 (gửi và nhận qua socket) chọn khác. Tạo `PLAN.md` (mục 0 đến 10, Phụ lục A và B nguyên văn; 172 mã test case, 20 task, 104 giờ cộng 3 giờ dự phòng) và file này. **Không** chạy `npm`, test, build, Docker, MySQL; **không** đọc `.env`; **không** sửa file nào khác; git chỉ đọc và `git fetch`. | — (tài liệu; chưa có mã) | — | **Phát hiện khi đối chiếu (PLAN mục 2, 3.3, 3.5):** (1) ba bảng chat có DDL nhưng **chưa có migration và entity**; (2) ba use case đòi thông báo tin mới nhưng danh sách sự kiện của 2.4.68 không có; (3) bảng không có ràng buộc duy nhất cho cặp, không mã gửi, không thông tin tệp; (4) nút "Nhắn tin" ở tra cứu đang vô hiệu và có ca test khẳng định; (5) `nginx.conf` đặt `Connection ""` nên chưa chuyển tiếp nâng cấp WebSocket; client web chưa tải được dữ liệu nhị phân; (6) ca DMS-13 bắt mọi hằng `…_EVENTS` trong `apps/api/src`; (7) 1.2.1 viết Bệnh nhân "tự chọn chi nhánh" khác 2.4.21 "chi nhánh đang chọn". Ước chi tiết **104 giờ**, cao hơn 97 giờ đã nêu trong hộp câu hỏi Q20. Phiên kiểm độc lập gửi ba tin đổi số nháp ghi chép (cuối cùng: AI log 203, TECH_DEBT 323 đến 325, `AI-BUG` 114 đến 115) và **không** trả lời câu quyết định nào. Trong lúc viết, `main` thêm PR 700, 702, 703, 701 (đến `08965d2`); đã so `git diff`: không đổi file mã kế hoạch dựa vào, chỉ chữ ở `docs/database/*` và `docs/TECH_DEBT.md`; PLAN đã cập nhật. |
| 26/11/2026 | **Phiên kiểm độc lập duyệt kỹ thuật T1 đến T14** (theo ủy quyền của Đại; không phải Đại trả lời trực tiếp), kèm bổ sung: T1/P4 (location nginx và proxy Vite thuộc P4, ca SOC-16 chuyển từ F2 sang P4), T6 (chỉ mục `(nguoi_gui_id, thoi_diem_gui)` là P2(b), quyết theo M4), T7 (chữ), T10 (PR nhỏ riêng trong F1, không sửa test cũ); T12 và MH1 đến MH9 giữ mặc định, phiên kiểm sẽ báo Đại. Cập nhật `PLAN.md` và file này; đối chiếu lại với `origin/main` `08965d2` (F5, F4b, X2, notification D1 PR 701): cập nhật số dòng DDL, thêm L15, B6 thêm việc ghi quy tắc DB. **Không** thêm hay bỏ task, mã test case (vẫn 20 và 172), giờ không đổi. | SOC-16 (đổi nội dung và task), M4 | — | Một câu của tin duyệt không khớp mã: `nginx.conf` **đã có** `proxy_http_version 1.1` (dòng 18); thứ còn thiếu là header `Upgrade` và `Connection "upgrade"` (đang đặt `Connection ""`). PLAN ghi theo mã. P4 nay chạm `apps/web/nginx.conf`, `vite.config.ts` (ngoại lệ của luật "một task một phía"). |
| 27/11/2026 | **chat P1 (#706): migration và entity ba bảng chat** (Trung `junUTE` với Claude Code, Claude Opus 5.5; nhánh `feat/chat-p1-migration-entity`, từ `origin/main` `02cd8a4`). `docs/database/*` (`[ĐỒNG BỘ TL]`): `tin_nhan` thêm `ma_gui` char(36), `tep_ten_goc`, `tep_loai`, `tep_dung_luong`, COMMENT cho `noi_dung`, `tep_dinh_kem`, UNIQUE `tin_nhan_index_nguoi_gui_ma_gui`, CHECK `chk_tin_nhan_tep`, `chk_tin_nhan_noi_dung`; quy tắc DB mục 1 thêm 44 đến 46, mục 2 thêm 65 (một hội thoại mỗi cặp, khoá tài khoản Bệnh nhân) và 66 (mã gửi); đếm lại đầu file: 46 bảng, 32 enum, 41 CHECK. Migration `TaoBangChat1794225600000` (19 câu chép nguyên văn: ba bảng, bốn chỉ mục, hai COMMENT, bảy khoá ngoại, ba CHECK; `down` TỪ CHỐI khi `tin_nhan` còn dòng); entity `chat/entities/` `HoiThoai`, `TaiKhoanHoiThoai`, `TinNhan`, enum `LOAI_HOI_THOAI`; đăng ký `entities.ts`, `migrations/index.ts`; scope `chat` vào `commitlint.config.cjs` và AGENTS (T9). Test mới: MCH-01, MCH-11 (`migration-source.spec.ts`), MCH-03 (`schema-parity.int-spec.ts`), MCH-02 (`migrations.int-spec.ts`), MCH-04 đến MCH-09 (`chat-schema.int-spec.ts` mới); MCH-10 do `registry.spec.ts`. Sửa ca cũ vì có migration mới đứng sau: MTB-10 (hai chỗ: bỏ "P2 đứng cuối sổ", `revertAfter` không còn rỗng), MOC-04 (danh sách migration đứng sau thêm chat), ca "hoàn tác hết" nới thời gian chờ riêng lên 120 giây (đo: khoảng 23 giây khi chạy riêng, vượt 30 giây khi chạy cả bộ). Đã chạy: lint 0 cảnh báo, build đạt, `npm test` 436 file / 8.569 ca Pass; `test:int -- src/database` 15 file (sau khi nới thời gian chờ: ba file migration và schema 43/43) Pass trên MySQL thật. | MCH-01…MCH-11 | 11 Pass | **Giả định PLAN 5.2 (b) đã đo:** nội dung toàn dấu cách (`'   '`) không tệp bị `chk_tin_nhan_noi_dung` chặn (collation đệm khoảng trắng), MCH-07. `NULL` ở `tep_dung_luong` bị chặn nhờ vế `IS NOT NULL` viết riêng (MCH-06). |
| 26/11/2026 | **chat X1 (#710) phần 1: đo thật M1 đến M7** (Trung `junUTE` với Claude Code, Claude Opus 5.5; từ `origin/main` `294a476`). Chỉ đo M1 đến M7 (cần P1, đã merge); **M8 chờ P3 (#708), M9 và M10 chờ P4 (#709)**, cả hai chưa merge nên issue chưa đóng được. Spec đo tạm `apps/api/src/chat/x1.measure.int-spec.ts` và cấu hình tạm `apps/api/vitest.config.x1.ts` (không `globalSetup` nên không dựng lại `clinix_test`) trên DB tạm `clinix_chat_x1_test` dựng bằng migration; khoá ngoại **bật** suốt lúc nạp và đo. Câu SQL đo là **phương án thiết kế** theo PLAN 5.4, 5.5, 5.6, 5.9 (B1, B2 chưa có mã); các ca khoá chạy qua `withBookingTransaction` thật (READ COMMITTED, thử lại 1213/1205 hai lần, chờ khoá 3 giây, 503) và "đánh dấu tất cả" dùng đúng `MARK_ALL_BATCH_SQL`, lô 500 của Trung tâm thông báo. Tiêu chí lấy nguyên văn PLAN 5.15 (đặt trước, không đổi). Chạy **hai lần** (lần 2 vì spec M7 dừng ở lỗi 1052, xem cột cuối); **kết quả chính là lần 1**, lần 2 ghi để thấy độ dao động; hai lần cùng kết luận. Spec tạm, cấu hình tạm và DB tạm đã xoá (`SHOW DATABASES` không còn DB `x1`). Sửa PLAN 5.4 quy tắc 5 (câu upsert, theo M7). Không có mã sản phẩm, migration hay đổi schema. | — (số đo) | M1 PASS, M2 PASS, M3 FAIL (theo chữ: chỉ mục), M4 FAIL, M5 PASS, M6 PASS, M7 PASS; M8, M9, M10 chưa đo | **Kết luận:** (1) **P2 làm phần (b)** (chỉ mục `tin_nhan (nguoi_gui_id, thoi_diem_gui)`) **trước khi merge B1** (T6); **không** làm P2(a) (M1, M2 đạt). (2) M1 đạt **sát ngưỡng** ở một ca (Lễ tân mới, lọc chưa đọc: p95 99,0 ms lần 1, 96,0 ms lần 2, max 112,9 và 122,8 ms): **cần Đại xem** có muốn làm P2(a) phòng trước hay không (tiêu chí không đòi). (3) M3: ba câu đều ≤ 2,4 ms nhưng ca `truoc`, `sau` ở hội thoại 20.000 tin optimizer chọn `range` trên `PRIMARY` chứ không phải `tin_nhan_index_28` như tiêu chí ghi; không có P2 gắn với M3: **B2 quyết** (gợi ý `FORCE INDEX (tin_nhan_index_28)`, đã đo thông tin p95 1,9 ms). (4) Câu upsert mốc **đúng nguyên văn PLAN 5.4 bị MySQL 8.4 từ chối** (1052, cột trùng tên với bí danh `moi`); phải viết `tai_khoan_hoi_thoai.tin_nhan_cuoi_da_doc_id`: đã sửa PLAN. **Lỗi của spec đo đã sửa trong phiên:** lần 1 ca M7 dừng ở chính lỗi 1052 trên (phát hiện, không phải lỗi spec); thêm `try/catch` để ghi lỗi rồi chạy lại cả file. Dữ liệu giả có một điểm lệch: ở 48 hội thoại bác sĩ của Bệnh nhân 50 hội thoại, hội thoại id lẻ chỉ có tin của chính Bệnh nhân nên số chưa đọc của Bệnh nhân này chỉ là 2 (không ảnh hưởng ca Lễ tân, Bác sĩ). |

## 2. Kết quả test theo use case (mã ở PLAN.md mục 7)

| Nhóm | Mã | Số ca | Task | Trạng thái |
|---|---|---|---|---|
| Nhắn tin với bác sĩ (2.4.20) | NBS-01…NBS-11 | 11 | B2, B3 | chưa chạy |
| Nhắn tin với lễ tân (2.4.21) | NLE-01…NLE-10 | 10 | B3 | chưa chạy |
| Nhắn tin với bệnh nhân (2.4.29) | NBN-01…NBN-15 | 15 | B2, B3 | chưa chạy |
| Lõi gửi tin | LOI-01…LOI-18 | 18 | B1 | chưa chạy |
| Quyền và phạm vi | QCH-01…QCH-12 | 12 | B2, B3, B4, B5 | chưa chạy |
| Migration và schema | MCH-01…MCH-12 | 12 | P1, P2 | 11 Pass (MCH-01…MCH-11: P1, 27/11/2026); MCH-12 chờ P2 (chỉ khi X1 vượt ngưỡng) |
| Tệp đính kèm | TEP-01…TEP-14 | 14 | P3, B4 | chưa chạy |
| WebSocket | SOC-01…SOC-16 | 16 | P4, B5 | chưa chạy |
| Thông báo tin mới | TBC-01…TBC-10 | 10 | B6, F1 | chưa chạy |
| Bảo mật dữ liệu và log | BCH-01…BCH-06 | 6 | B1 đến B6, F3 | chưa chạy |
| Hợp đồng và kiến trúc | HCH-01…HCH-06 | 6 | P3, B1, B3, B5, B6 | chưa chạy |
| Đồng thời | CCH-01…CCH-11 | 11 | X2 | chưa chạy |
| Giao diện | WCH-01…WCH-19 | 19 | F1 đến F6 | chưa chạy |
| Kiểm tay | KCH-01…KCH-12 | 12 | X3 | chưa chạy |
| **Tổng** | | **172** | | **0 đã chạy** |

Đột biến bắt buộc (PLAN 5.15): 30, chưa chạy. Bất biến IVC-01…IVC-08: chưa viết.

## 3. Quyết định đã chốt

### 3.1 Quyết định của nhóm cho scope này

**Đại trả lời trực tiếp ngày 26/11/2026**, qua bảy hộp câu hỏi trong phiên lập kế hoạch (mỗi câu có đề xuất kèm theo; câu hỏi đầy đủ và hệ quả ở PLAN mục 4.2).

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q1 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): làm gửi ảnh và PDF** | **Khác đề xuất** (không làm); trái chữ "văn bản" của 2.4, `[ĐỒNG BỘ TL]` |
| Q2 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): WebSocket** | **Khác đề xuất** (thăm dò); repo có hai cơ chế tức thời |
| Q3 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): bên bị khoá: đọc được, chặn gửi** | |
| Q4 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): lịch còn hiệu lực sắp tới, rồi lịch Hoàn thành gần nhất, rồi chi nhánh đang chọn** | Định nghĩa chi tiết ở PLAN MH2 `[đề xuất]` |
| Q5 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): volume Docker riêng** | |
| Q6 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): JPEG, PNG, WebP, PDF; 1 tệp, ≤ 10 MB; không quét virus** | Ghi nợ |
| Q7 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): thêm ba cột thông tin tệp** | Tên cột `[đề xuất]` |
| Q8 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): gửi và nhận qua socket** | **Khác đề xuất** (chỉ báo hiệu); chuông giữ thăm dò |
| Q9 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): khoá hàng tài khoản Bệnh nhân khi mở hội thoại** | Không đổi schema |
| Q10 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): cột `ma_gui` và UNIQUE theo người gửi** | |
| Q11 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): thông báo gộp theo hội thoại, mã gắn sau `loai_su_kien`** | Không email, không nội dung, không đổi schema |
| Q12 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): cho thêm cột, chỉ mục nếu đo vượt ngưỡng** | P2 có điều kiện |
| Q13 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): Quản trị viên không đọc hội thoại** | |
| Q14 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): giữ mãi; không sửa, xoá, thu hồi** | Ghi nợ |
| Q15 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): giữ công thức chưa đọc, thêm nhãn trả lời** | |
| Q16 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): tính cả "Đã tiếp đón", gồm lịch người thân** | `[ĐỒNG BỘ TL]` |
| Q17 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): 1 đến 2000 ký tự, 20 tin mỗi phút; tin chỉ có tệp được phép** | |
| Q18 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): Bệnh nhân thấy "Lễ tân · chi nhánh"** | |
| Q19 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): chat là scope #11** | Danh sách chờ lùi sau |
| Q20 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): giả định 40 giờ mỗi tuần cho Trung** | **Giả định**, chưa phải số thật |
| Q21 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): thêm hai CHECK cho `tin_nhan`** | |
| Q22 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): tệp qua HTTP; socket mất thì REST và thăm dò 15 giây** | |
| Q23 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): Lễ tân thấy họ tên và SĐT Bệnh nhân** | |
| Q24 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): chọn bác sĩ qua trang tra cứu** | |
| Q25 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): Bác sĩ có ô tìm theo họ tên** | |

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

Schema 26/09/2026: hội thoại luôn hoạt động, không trạng thái đóng; hộp thư chung Lễ tân mỗi người một mốc đã đọc; quy tắc 16 và mục 2 dòng 14. Auth: migration viết tay, access JWT 15 phút. Booking 5.3: READ COMMITTED, thử lại, thứ tự khoá, tác dụng phụ sau commit. Notification: chuông thăm dò 30 giây, danh mục chỉ đọc, module tự ghi `thong_bao`. Patient: luật từ khoá, khung chỉ thêm `to` và route. Admin Q40: ngoài phạm vi ⇒ 404.

### 3.3 Điểm kỹ thuật đã duyệt (PLAN 4.3, T1 đến T14)

**Đã duyệt kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 26/11/2026; Đại chưa trả lời trực tiếp):** T1 thư viện WebSocket (bổ sung: proxy nginx và Vite thuộc P4, ca SOC-16); T2 đường dẫn API; T3 404 thay 403; T4 chỗ đặt entity; T5 giao dịch và tầng khoá; T6 giới hạn tốc độ mềm (bổ sung: chỉ mục là P2(b) theo M4); T7 thêm `ImageProcessor` vào `exports` của `UploadModule`; T8 các con số; T9 scope `chat` ở commitlint; T10 hook thăm dò dùng chung (bổ sung: PR nhỏ riêng trong F1, không sửa test cũ); T11 `down` chặn khi còn dữ liệu; T13 từ khoá tìm ở query; T14 ADR. **T12 (chi tiết giao diện) và MH1 đến MH9:** chi tiết sản phẩm nhỏ, giữ mặc định `[đề xuất]`; phiên kiểm sẽ báo Đại một lần.

## 4. Ghi chú AI

**Phiên lập kế hoạch KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (Đại quyết ghi ở PR sau). Dưới đây là **bản nháp**; kiểm lại số lớn nhất trên `main` lúc ghi. Lúc soạn xong (`origin/main` `08965d2`) AI log có đến hàng 202, TECH_DEBT đến dòng 318, `AI-BUG` đến 112. Dải số phiên kiểm cấp cho chat (tránh trùng các task đang chạy): **AI log hàng 203, nợ kỹ thuật 323 đến 325, `AI-BUG` 114 đến 115**.

### 4.1 Nháp dòng AI log (bảng 1, mười cột)

| # | Ngày | Người dùng | Công cụ / model | Phạm vi (module/file) | Prompt chính | Phần AI sinh | Phần tự sửa/viết | Cách kiểm chứng | Commit/PR |
|---|------|-----------|-----------------|-----------------------|--------------|--------------|------------------|-----------------|-----------|
| 203 | 26/11/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | `docs/features/chat/PLAN.md`, `docs/features/chat/TRACKING.md` (MỚI; chỉ hai file này; kế hoạch scope #11 chat) | Lập kế hoạch (chỉ tài liệu, không viết mã) cho scope "Chat": Nhắn tin với bác sĩ (2.4.20), Nhắn tin với lễ tân (2.4.21), Nhắn tin với bệnh nhân (2.4.29); đối chiếu 2.4 với schema, PLAN các module và mã; hỏi Đại các quyết định sản phẩm và schema; danh sách issue đề xuất | Toàn bộ PLAN (mục 0 đến 10, 172 mã test case, 20 task, 104 giờ cộng 3 giờ dự phòng) và TRACKING; Phụ lục A và B sao chép bằng script từ file Word; bản nháp commit, PR, AI log, nợ kỹ thuật | Đại trả lời trực tiếp bảy hộp câu hỏi (Q1 đến Q25; 22 theo đề xuất, Q1, Q2, Q8 chọn khác); phiên kiểm độc lập đổi số nháp ghi chép; phiên kiểm duyệt kỹ thuật T1 đến T14 (26/11/2026) kèm bổ sung; PLAN còn chờ Đại, Trung review | Đọc nguyên văn 2.4 bằng `python-docx` (chỉ đọc) và so hai bản từng dòng; đối chiếu tên hàm, đường dẫn, số dòng DDL với mã trên `origin/main` `5598e8a`, rồi so `git diff` tới `08965d2`, cập nhật số dòng DDL và đối chiếu lại `nginx.conf`, `upload.module.ts`; script kiểm 42 đoạn trích 2.4 trong bảng đúng từng chữ, số cột bảng, mã test case không trùng và mỗi mã có task nhận, mã ở bảng task khớp ô "Đóng khi", 30 đột biến được giao đúng task, tiêu đề issue và PR ≤ 100 ký tự, tổng giờ; không chạy `npm`, test, build, Docker, MySQL; không đọc `.env`; không lệnh git ghi | `[cần điền]` (PR tài liệu của Đại) |

### 4.2 Nháp dòng nợ kỹ thuật (323 đến 325; chỉ ghi khi lối tắt có thật trong mã; cột đúng bảng của `docs/TECH_DEBT.md`)

Dải được cấp có ba số nên các lối tắt gom theo ba nhóm; nếu muốn mỗi lối tắt một dòng thì xin thêm số lúc ghi.

| # | Ngày | Mô tả nợ | Vì sao chấp nhận | Rủi ro | Kế hoạch xử lý (khi nào) | Trạng thái |
|---|---|---|---|---|---|---|
| 323 | `[ngày merge chat B4]` | **Tệp đính kèm của chat:** (a) không quét virus; (b) volume tệp tách khỏi sao lưu DB, chưa có quy trình sao lưu và khôi phục đồng bộ | Q6: không thêm container ClamAV, chỉ nhận bốn loại theo nội dung, ảnh mã hoá lại, PDF chỉ tải xuống; Q5 chọn volume, đồ án chưa có sao lưu tự động | PDF độc hại tới được máy người nhận; khôi phục DB thiếu volume thì tin trỏ tệp mất | Thêm quét trước khi mở công khai; viết quy trình sao lưu cả hai | Mở |
| 324 | `[ngày merge chat B5]` | **Kênh tức thời của chat:** (a) WebSocket chỉ chạy một tiến trình API (danh sách kết nối ở bộ nhớ); (b) hai cơ chế tức thời: chuông thông báo thăm dò 30 giây, chat dùng WebSocket | Đồ án chạy một tiến trình, không có Redis; Q2, Q8 chọn WebSocket cho chat và giữ quyết định Q1 của thông báo | Nhiều tiến trình thì mất đẩy giữa các tiến trình (web tải lại bằng REST mới thấy); hai đường phải bảo trì | Adapter Redis khi cần nhiều tiến trình; chuyển chuông sang cùng kênh nếu muốn thống nhất | Mở |
| 325 | `[ngày merge chat B2]` | **Hộp thư chat:** (a) tin và tệp giữ mãi, không sửa, xoá, thu hồi, không job dọn; (b) giới hạn 20 tin mỗi phút là mềm giữa các hội thoại, không giới hạn theo IP; (c) từ khoá Lễ tân tìm (họ tên, SĐT, email) nằm ở query nên vào log truy cập của nginx; (d) Lễ tân mới được gán thấy mọi hội thoại cũ là chưa đọc | Q14; khoá tài khoản người gửi mỗi lần gửi tạo chu trình chờ (PLAN 5.4); cùng nếp tra cứu hồ sơ (patient B6); công thức chưa đọc đã chốt ở schema (Q15) | Bảng và volume chỉ tăng, gửi nhầm không rút lại được; gửi dồn vượt vài tin; dữ liệu cá nhân ở log máy chủ; số ở menu lớn ngay ngày đầu | Quy định thời gian giữ và thu hồi; throttling (việc X3 auth/admin); đổi sang `POST` hay lọc log; "đánh dấu tất cả đã đọc" cho hộp thư | Mở |

Cập nhật dòng có sẵn khi mã có: **dòng 62** (từ PR 701 phần còn lại là số đếm "Tin nhắn" và của đổi lịch): phần "Tin nhắn" đóng khi chat F1 xong.

### 4.3 Nháp lỗi AI (`AI-BUG-114`, `[đề xuất]`; chỉ ghi nếu Đại muốn, vì mọi lỗi do AI tự phát hiện và sửa trước khi giao, chưa vào commit nào)

| Mã | Ngày | Mô tả lỗi | Nguyên nhân (phân tích) | Cách phát hiện | Commit sửa |
|---|---|---|---|---|---|
| `AI-BUG-114` | 26/11/2026 | Ở chat (lập kế hoạch, MaxTrann, Claude Code Claude Sonnet 5.5): các sai sót trong bản nháp PLAN, đều sửa trước khi giao: (1) nêu "khoảng 97 giờ" trong hộp câu hỏi Q20 trong khi bảng task chi tiết ra 104 giờ; (2) sáu đoạn đặt trong ngoặc kép ở bảng use case không đúng từng chữ 2.4 (mất dấu nháy bên trong hay chữ "Với", một đoạn diễn giải lại); (3) bỏ trống mã NLE-09; (4) đặt phần "tự làm tươi 15 giây" chỉ ở task socket F2 trong khi mốc nhắn tin chữ (trước F2) cần nó; (5) mã test case và đột biến ở bảng task lệch với ô "Đóng khi" của bảng issue | Ước giờ trong hộp câu hỏi làm trước khi chia task; chép câu trích bằng tay; sửa bảng này mà quên bảng kia | (1) cộng bảng task; (2) đọc lại toàn văn và script đối chiếu câu trích; (3), (5) script kiểm mã; (4) đọc lại sơ đồ lát cắt | `[cần điền]` (chưa vào commit) |

(Mục (1) đã báo Đại ở báo cáo cuối; con số đúng là 104 giờ.)

## 5. Phối hợp với module khác

| Với | Điểm | Cần gì | Trạng thái |
|---|---|---|---|
| Đại (database) | P1, (P2): ba file `docs/database/*`, `entities.ts`, `migrations/index.ts` | Đại approve; mốc migration mới nhất; làm trên `main` có PR 701 (ba file vừa đổi chữ) | chờ |
| Đại (patient, search) | F1: khung Bệnh nhân, Lễ tân; F4: nút "Nhắn tin" và ba ca test | Đại approve PR tài liệu coi là xác nhận | chờ |
| Đại (đổi lịch) | `router/role-routes.tsx` (F5, PR 702 đã merge), `app.module.ts` | làm trên `main` mới | không chờ |
| Trung (notification) | B6, F1: danh mục, liên kết, biểu tượng, DMS-13; T10 hook thăm dò | Trung là người làm; D1 đã merge, còn X3 | không chờ |
| Trung (upload, doctor) | B4: export `ImageProcessor`; F1: khung Bác sĩ | Trung là người làm | không cần |
| Chung (hạ tầng) | P3: compose, Dockerfile, `.env.example`, `.gitignore`; P4: thư viện API, nginx, Vite; F2: thư viện web | báo người kia khi đổi | chờ |
| Phiên kiểm | T1 đến T14 | duyệt kỹ thuật | đã duyệt 26/11/2026 (T12, MH1 đến MH9 giữ mặc định, chờ Đại) |
| Đại (GitHub) | nhãn `module:chat`, milestone `chat`, Epic, script sinh issue; seed demo (X3); sửa Word (4.6) | sau khi PR tài liệu merge | chờ |
| AI (scope sau) | đường dẫn trang Tin nhắn; bảng riêng | chỉ ghi | không chặn |

## 6. Số đo thật (PLAN.md mục 5.15, task X1; **tiêu chí đặt TRƯỚC khi chạy, không đổi sau khi thấy số**)

Đo 26/11/2026 (M1 đến M7; M8 chờ P3, M9 và M10 chờ P4). Môi trường: MySQL 8.4.13 trong Docker Desktop (Windows 11), buffer pool 128 MB, mặc định `REPEATABLE-READ` (luồng ghi tự đặt READ COMMITTED qua `withBookingTransaction`), pool `mysql2` 10 kết nối; DB tạm `clinix_chat_x1_test` dựng bằng migration, khoá ngoại bật, `ANALYZE TABLE` trước khi đo; mỗi câu làm nóng 5 lần rồi đo 100 lần. Dữ liệu: 100.000 `tin_nhan` (id xen kẽ giữa các hội thoại), 8.048 hội thoại (hộp thư chi nhánh A 5.000, chi nhánh B 1.000), 91.096 dòng thành viên; một hội thoại 20.000 tin; một Bệnh nhân 50 hội thoại; một Bác sĩ 2.000 hội thoại; một Lễ tân gửi 20.000 tin; 16 Lễ tân chi nhánh A đã đọc hết, 14 chưa có dòng nào. Spec đo tạm `chat/x1.measure.int-spec.ts`, cấu hình tạm và DB tạm đã xoá. Chạy hai lần; số chính là lần 1.

| Mã | Câu hỏi | Tiêu chí đạt | Kết quả |
|---|---|---|---|
| M1 | Danh sách hội thoại ở 100.000 tin | p95 ≤ 100 ms, không quét toàn bảng `tin_nhan`; FAIL ⇒ P2(a) | **ĐẠT** (26/11/2026; sát ngưỡng ở một ca). Hai bước như B2 sẽ làm: (1) chọn trang: `MAX(tin_nhan_id)` từng hội thoại bằng truy vấn con, sắp theo tin cuối, con trỏ bằng `HAVING tin_cuoi_id < ?`; (2) chi tiết 20 dòng (tin cuối, người gửi, đối tác, chi nhánh, số tin chưa đọc trần 100). Thời gian là **tổng hai bước**, p95 (100 lần). Hộp thư Lễ tân 5.000: trang đầu 23,0; trang thứ 4.000 22,7; chưa đọc (Lễ tân đã đọc hết, 0 dòng) 14,7; **chưa đọc của Lễ tân mới chưa có dòng nào 99,0 ms (max 112,9; lần 2: 96,0, max 122,8)**; tìm họ tên 17,4; tìm SĐT 17,3; tìm không khớp 11,7. Bác sĩ 2.000: trang đầu 11,7; trang thứ 1.500 11,4; chưa đọc 20,8 (lần 2: 38,3); tìm họ tên 10,7. Bệnh nhân 50: mọi ca ≤ 5,2 (lần 2 ≤ 6,1). EXPLAIN: `hoi_thoai_index_26` (Lễ tân), khoá chính `tai_khoan_hoi_thoai` (Bác sĩ), chỉ mục khoá ngoại `nguoi_tao_id` (Bệnh nhân); `tin_nhan` chỉ đọc qua `tin_nhan_index_28` (`ref`, `Using index`), **không ca nào quét toàn bảng `tin_nhan`**; mọi ca có `Using temporary; Using filesort` trên tập hội thoại thấy được (tiêu chí không cấm) ⇒ **không làm P2(a)**. Chưa đo phần `quanHe` (cần `lich_hen`, DB tạm không có lịch). |
| M2 | Số hội thoại chưa đọc và chi phí thăm dò dự phòng (200 phiên, 30 Lễ tân cùng hộp thư, mỗi 15 giây) | câu đếm p95 ≤ 50 ms; dưới tải 0 lỗi, p95 ≤ 100 ms; FAIL ⇒ P2(a), đổi câu hoặc giãn chu kỳ | **ĐẠT**. Câu đếm `COUNT(*)` trên `LIMIT 100` các hội thoại có `EXISTS` tin chưa đọc: Lễ tân mới chưa có dòng nào (100, chạm trần) p95 2,9 ms; Lễ tân đã đọc hết (0, phải xét cả 5.000 hội thoại) **13,6 ms**; Bác sĩ 2.000 (100) 4,1 ms; Bệnh nhân 50: 2,3 ms. EXPLAIN: `tin_nhan_index_28`, `FirstMatch`. Tải 200 phiên (30 Lễ tân hộp thư A, 20 phiên Bác sĩ 2.000, 150 phiên Bệnh nhân 50), mỗi phiên mỗi 15 giây gọi số đếm rồi danh sách trang đầu, 60 giây, pool `mysql2` 10 kết nối: 1.600 yêu cầu, **0 lỗi**; số đếm p95 16,8 ms (max 40,0), danh sách p95 26,1 ms (max 46,7), gộp **p95 22,9 ms**; CPU container DB 9,5 đến 29,4 % (rảnh 0,7 %); `Threads_connected` tối đa 6 (kể cả kết nối theo dõi). Lần 2: số đếm p95 15,3, danh sách 26,5, CPU tối đa 32,9 %. ⇒ giữ chu kỳ 15 giây (T8). |
| M3 | Tin theo con trỏ ở hội thoại 20.000 tin | dùng chỉ mục, không `filesort`, p95 ≤ 20 ms | **KHÔNG ĐẠT theo chữ của tiêu chí** (vế "dùng chỉ mục"); vế thời gian và filesort đạt. Hội thoại 20.000 tin, 30 tin mỗi trang kèm tên người gửi: mới nhất `ref` trên `tin_nhan_index_28`, `Backward index scan`, p95 1,5 ms; **`truoc` và `sau`: optimizer chọn `range` trên `PRIMARY`** (ước 49.759 hàng; hội thoại này chiếm 20 % bảng nên quét khoá chính gặp 30 tin rất nhanh), p95 1,3 và 1,4 ms; không ca nào `filesort`. Lần 2: 2,4 / 1,6 / 1,2 ms, cùng kế hoạch. **Thông tin (không phải tiêu chí):** ở hội thoại 4 tin, `truoc`, `sau` dùng `tin_nhan_index_28` (p95 1,3 và 1,2 ms); sắp theo cả hai cột `(hoi_thoai_id, tin_nhan_id)` vẫn chọn `PRIMARY`; `FORCE INDEX (tin_nhan_index_28)` cho `range` trên chỉ mục, p95 1,9 ms. Không có P2 gắn với M3 ⇒ **B2 quyết** cách viết câu (gợi ý `FORCE INDEX`), ca EXPLAIN của B2 kiểm lại. |
| M4 | Đếm giới hạn tốc độ, người gửi 20.000 tin (chỉ có UNIQUE theo người gửi) | p95 ≤ 10 ms; FAIL ⇒ P2(b) chỉ mục `(nguoi_gui_id, thoi_diem_gui)` trước khi merge B1 | **KHÔNG ĐẠT** ⇒ **làm P2(b) trước khi merge B1**. Chỉ mục có trên `tin_nhan`: `PRIMARY`, `tin_nhan_index_28`, `tin_nhan_index_nguoi_gui_ma_gui` (đúng dự đoán PLAN 5.2 (c): khoá ngoại `nguoi_gui_id` dùng lại UNIQUE, không có chỉ mục riêng). Câu đếm của PLAN 5.5 với Lễ tân đã gửi 20.000 tin: `ref` trên `tin_nhan_index_nguoi_gui_ma_gui` (ước 41.226 hàng) rồi đọc từng hàng để lọc `thoi_diem_gui`: không có tin trong 60 giây **p95 18,2 ms** (max 20,6); đủ 20 tin trong cửa sổ p95 17,5 ms (thứ tự UUID nên không dừng sớm). Lần 2: 17,8 và 17,5 ms. **Thông tin:** thêm tạm chỉ mục `(nguoi_gui_id, thoi_diem_gui)` trên DB tạm (đã xoá): `range`, `Using index`, p95 0,8 và 1,1 ms (lần 2: 1,1 và 1,2). |
| M5 | Mở hội thoại đồng thời, có và không khoá | có khoá: 0 trùng, 0 lần 503; đối chứng: ≥ 1 trùng | **ĐẠT**. Tìm-hoặc-tạo theo PLAN 5.4 quy tắc 1 trong `withBookingTransaction`, khoá ngoại bật. Có khoá tài khoản Bệnh nhân, 300 vòng × 2 lần mở cùng cặp: 300 tạo + 300 thấy đã có rồi gửi thường, **0 hội thoại trùng**, 600 tin, **0 lần 503**, 0 lần 1213, 0 lần 1205 (7,2 giây). Đối chứng không khoá: 600 lần tạo, **300 cặp trùng** (≥ 1: khoá là cần). Mở (bác sĩ mới) × Bác sĩ gửi vào hội thoại đã có × Bệnh nhân gửi vào hội thoại đã có, cùng Bệnh nhân, 300 vòng: 0 trùng, đủ 1.200/1.200 tin, 0 lần 503, 0 lần 1213, 0 lần 1205. Lần 2 giống hệt. |
| M6 | Gửi × đánh dấu đọc × đánh dấu tất cả | 0 lần 503; không dòng thông báo chưa đọc trùng | **ĐẠT**. 300 vòng, mỗi vòng thêm 600 thông báo chưa đọc khác rồi chạy cùng lúc: hai lần Bác sĩ gửi, Bệnh nhân đánh dấu đọc (khoá `FOR SHARE`, upsert, đánh dấu thông báo khi hết tin chưa đọc), "đánh dấu tất cả" của Trung tâm (lô 500, READ COMMITTED, không thử lại): đủ 601/601 tin, **0 lần 503**, 0 lần 1213, 0 lần 1205, "đánh dấu tất cả" 0 lỗi; IVC-06 (tối đa một thông báo `TinNhanMoi:{id}` chưa đọc) đúng sau **mọi** vòng, cuối cùng 0 dòng trùng (13,1 giây). Lần 2 giống hệt. |
| M7 | Upsert mốc (bí danh dòng, `GREATEST`) | mốc không lùi, chạy được | **ĐẠT với câu đã sửa** (câu đúng nguyên văn PLAN 5.4 trước đó **không chạy**: 1052 `ER_NON_UNIQ_ERROR`, cột `tin_nhan_cuoi_da_doc_id` trong `COALESCE` trùng tên với cột của bí danh `moi`; PLAN đã sửa thành `tai_khoan_hoi_thoai.tin_nhan_cuoi_da_doc_id`). Câu có tiền tố trên MySQL 8.4: chèn mới ⇒ `affectedRows` 1; mốc tiến ⇒ 2; mốc lùi ⇒ 1, mốc **giữ nguyên**; bằng ⇒ 1; dòng có mốc NULL ⇒ 2, mốc nhận giá trị mới; trong giao dịch qua `EntityManager` cùng kết quả; `changedRows` luôn 0, `info` rỗng (không dùng `affectedRows` để biết đổi hay không). Upsert thành viên "không đổi gì" (`ON DUPLICATE KEY UPDATE tai_khoan_id = tai_khoan_id`) giữ nguyên mốc, `affectedRows` 1. Thông tin: đánh dấu × đánh dấu cùng người 300 vòng (nửa chưa có dòng): mốc cuối luôn bằng giá trị lớn nhất, 0 lần 1213, 1205, 503. |
| M8 | Bốn tải tệp 10 MB đồng thời | bộ nhớ đỉnh tăng ≤ 300 MB, ≤ 10 giây | chưa đo |
| M9 | 200 kết nối socket, đẩy tới 30 Lễ tân; guard và pipe toàn cục; ngắt phiên | p95 ≤ 500 ms, 0 lỗi, ngắt ≤ 60 giây | chưa đo |
| M10 | Nâng cấp WebSocket qua Vite proxy và nginx, rảnh 5 phút | nối được cả hai, không bị đóng | chưa đo |

## 7. Cảnh báo và việc chờ (cập nhật khi có thay đổi)

- **Sau X1 phần 1 (26/11/2026):** **P2 có việc, chỉ phần (b)** (chỉ mục `tin_nhan (nguoi_gui_id, thoi_diem_gui)`, M4 không đạt): mở issue P2 (`[CHỜ X1]` gỡ được), làm **trước khi merge B1**; P2(a) không làm (M1, M2 đạt). **Hỏi Đại:** M1 đạt sát ngưỡng ở ca Lễ tân mới lọc chưa đọc (p95 99,0 và 96,0 ms) — có muốn làm P2(a) phòng trước không. **B2 cần quyết:** câu tin theo con trỏ ở hội thoại lớn optimizer chọn `PRIMARY` (M3, xem mục 6). **Issue #710 chưa đóng:** M8 chờ P3 (#708), M9 và M10 chờ P4 (#709); PR phần này dùng `Refs #710`.
- **P1 làm trên `main` đã có PR 701** (ba file `docs/database/*` vừa đổi chữ); số dòng DDL ở PLAN mục 2 đã cập nhật theo `08965d2`.
- **Hai phần mới trong repo** (WebSocket, kho tệp trên volume): đọc PLAN 3.5 R1 đến R9 trước khi viết mã.
- **Đặt tên hằng:** không dùng đuôi `_EVENTS` cho tên sự kiện socket (ca DMS-13).
- **`[ĐỒNG BỘ TL]` ngoài repo (Đại):** 2.4.20, 2.4.21, 2.4.29, 2.4.68, 1.2.1, 1.3.10 (PLAN 4.6); chưa sửa.
- **Nhãn `module:chat` và milestone `chat` chưa có** trên GitHub.
- **Hạn mức giờ của Trung** đang là giả định 40 giờ mỗi tuần (Q20); đệm khoảng 11 giờ trong Iteration 8 đến 10.
- Danh sách chờ (scope sau chat) và Trợ lý AI: không chặn.
