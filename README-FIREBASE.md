# ย้ายหลังบ้าน MT Asset Tracker ไป Firebase

> **สถานะ (15 ต.ค. 2026):** ตั้งค่าแล้วที่ Firebase project `mt-asset-tracker-3948` (Firestore อยู่ที่ asia-southeast1)
> ย้ายข้อมูลแล้ว ตรวจนับครบทุกประเภท และเนื้อหาอุปกรณ์ทุกรายการตรงกับระบบเดิม 100%
> `firebase-config.js` ใส่ค่าไว้แล้ว
> **ไฟล์แนบใหม่** เก็บใน Storage ของโปรเจกต์ `maintenance-system-e6ed7` เฉพาะโฟลเดอร์ `mt-asset-tracker/` (แยกจากไฟล์ของ Maintenance-System)
> ทดสอบอัปโหลด/ดาวน์โหลดจริงแล้วใช้งานได้ (rules ปัจจุบันของ Maintenance-System เปิด read/write ทุก path อยู่แล้ว)
> `storage.rules` คือ rules เดิมรวมกับ block ของ `mt-asset-tracker/` ยังไม่ได้ deploy เพราะตอนนี้ไม่เปลี่ยนผลอะไร ใช้ตอนจะปิดสิทธิ์ให้รัดกุมขึ้น
> ถ้าอัปโหลดไม่ได้ด้วยเหตุใดก็ตาม ระบบจะเก็บรูปแบบย่อไว้ใน Firestore แทน จึงไม่สะดุด

## ไฟล์ในชุดนี้

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | แอปเดิม แก้เฉพาะจุดที่เรียก Google Apps Script ให้มาเรียก Firebase แทน (หน้าตาและการทำงานเหมือนเดิม) |
| `pm-documents.js` | โมดูลเอกสาร PM เดิม แก้เฉพาะจุดเรียก API |
| `firebase-config.js` | **ไฟล์เดียวที่ต้องแก้** ใส่ค่า config ของ Firebase project |
| `firebase-api.js` | หลังบ้านใหม่ ทำงานแทน Apps Script ครบทุกคำสั่ง (บันทึกอุปกรณ์ ประวัติซ่อม Spare Part ตาราง PM แม่แบบ/เอกสาร PM แผนก) |
| `migrate.html` | หน้าย้ายข้อมูลเก่าทั้งหมดจากระบบเดิมเข้า Firebase |
| `firestore.rules`, `storage.rules` | กฎความปลอดภัยสำหรับวางใน Firebase Console |

`Logo.png` และ `tailwind.js` ใช้ของเดิมใน repo ได้เลย ไม่ต้องเปลี่ยน

## ขั้นตอน

### 1. สร้าง Firebase project
1. เข้า https://console.firebase.google.com → **Add project**
2. **Build → Firestore Database → Create database** เลือก location `asia-southeast1` (สิงคโปร์) → Production mode
3. แท็บ **Rules** วางเนื้อหาจาก `firestore.rules` แล้ว **Publish**
4. (แนะนำ) **Build → Storage → Get started** แล้ววาง `storage.rules`
   - Storage ต้องอัปเกรดเป็นแพ็กเกจ **Blaze** (ผูกบัตร) แต่มีโควตาฟรี 5GB ปกติใช้งานระดับนี้ไม่มีค่าใช้จ่าย
   - ถ้าไม่อยากเปิด Storage ให้ตั้ง `window.MTA_USE_STORAGE = false` ใน `firebase-config.js` ระบบจะย่อรูปเก็บใน Firestore แทน แต่ PDF จะเก็บได้แค่ไฟล์ไม่เกิน ~700KB
5. **Project settings (⚙️) → General → Your apps → เพิ่ม Web app (</>)** คัดลอกค่า `firebaseConfig` มาใส่ใน `firebase-config.js`

### 2. ย้ายข้อมูลเก่า
1. อัปโหลดไฟล์ทั้งหมดขึ้น repo (หรือเปิดผ่าน local server) แล้วเปิด `migrate.html`
2. กด **ดึงข้อมูลจากระบบเดิม** — จะดึงทุกอย่าง: แผนก, อุปกรณ์, ประวัติซ่อม (รวมรายการอะไหล่), Spare Part, ตาราง PM, แม่แบบ PM, เอกสาร PM, การผูกแม่แบบกับอุปกรณ์
3. กด **ดาวน์โหลดไฟล์สำรอง (.json)** เก็บไว้ก่อน (ใช้นำเข้าใหม่ได้แม้ระบบเดิมปิดไปแล้ว)
4. กด **เริ่มย้ายข้อมูลไป Firestore** — เสร็จแล้วจะแสดงตารางเทียบจำนวน ระบบเดิม / Firebase ทุกประเภทต้องขึ้น ✓
5. เปิด `index.html` ตรวจดูข้อมูลว่าครบ

กดย้ายซ้ำได้ ไม่เกิดข้อมูลซ้ำ (ใช้รหัสเดิมเป็นรหัสเอกสาร) ระบบเดิมไม่ถูกแก้ไขใด ๆ

### 3. สลับใช้งานจริง
- แนะนำให้หยุดบันทึกข้อมูลในระบบเดิมระหว่างย้าย หรือกดย้ายซ้ำอีกครั้งก่อนสลับ เพื่อให้ได้ข้อมูลล่าสุด
- หลังสลับแล้ว **อย่าลบ Google Sheet/Drive เดิม** (ดูหัวข้อถัดไป)

## สิ่งที่ควรรู้

- **รูปและ PDF เก่า** ยังเป็นลิงก์ Google Drive เดิม (เช่น `drive.google.com/thumbnail?id=...`) ข้อมูลทุกรายการย้ายมาครบ แต่ไฟล์จริงยังอยู่บน Drive จึงต้องเก็บโฟลเดอร์ Drive เดิมไว้และคงสิทธิ์แชร์ไว้เหมือนเดิม ไฟล์ที่อัปโหลดใหม่จะไปอยู่บน Firebase Storage
- **วัน PM ถัดไป** (`nextPmDate`) ย้ายค่าเดิมมาตามที่เป็นอยู่ เมื่อมีการเพิ่ม/แก้/ลบตาราง PM ระบบใหม่จะคำนวณให้อัตโนมัติ = วันแผนที่ใกล้ที่สุดของรายการสถานะ "รอเป้าหมาย"
- **ความปลอดภัย** ตอนนี้เท่ากับระบบเดิม คือใครมีลิงก์ก็อ่าน/เขียนได้ ถ้าต้องการให้เฉพาะเจ้าหน้าที่บันทึกได้ ควรเพิ่มหน้าล็อกอิน (Firebase Authentication) ในขั้นถัดไป
- โครงสร้างข้อมูลใน Firestore: `departments`, `assets` (เก็บ `history` และ `spareParts` ไว้ในอุปกรณ์เหมือนเดิม), `pmSchedules`, `pmTemplates`, `pmDocuments`, `assetPmTemplates`
