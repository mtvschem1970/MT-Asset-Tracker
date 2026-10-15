// ====== FIREBASE CONFIG ======
// คัดลอกค่าจาก Firebase Console > Project settings > General > Your apps > SDK setup and configuration (Config)
window.MTA_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBm8GsXBD6FeQ3bx3-35L8sZtp9fk4K_ZE",
    authDomain: "mt-asset-tracker-3948.firebaseapp.com",
    projectId: "mt-asset-tracker-3948",
    storageBucket: "mt-asset-tracker-3948.firebasestorage.app",
    messagingSenderId: "440354197118",
    appId: "1:440354197118:web:1f6f616e4b3b40e2d2522f"
};

// true  = อัปโหลดรูป/PDF ใหม่ไปที่ Firebase Storage
// false = ไม่ใช้ Storage: ย่อรูปแล้วเก็บใน Firestore โดยตรง, PDF เก็บได้เฉพาะไฟล์ไม่เกิน ~700KB
window.MTA_USE_STORAGE = true;

// ไฟล์แนบเก็บใน Storage ของโปรเจกต์ Maintenance-System
// แยกไว้ในโฟลเดอร์ MTA_STORAGE_PREFIX เท่านั้น ไม่ปนกับไฟล์ของ Maintenance-System
window.MTA_STORAGE_CONFIG = {
    apiKey: "AIzaSyAQ6zJ7_s__e3iLpQE8bSCuXUgVVGbYOAU",
    authDomain: "maintenance-system-e6ed7.firebaseapp.com",
    projectId: "maintenance-system-e6ed7",
    storageBucket: "maintenance-system-e6ed7.firebasestorage.app",
    messagingSenderId: "323374959927",
    appId: "1:323374959927:web:3e4be4eac6f569c0d05eb2"
};
window.MTA_STORAGE_PREFIX = "mt-asset-tracker";

// URL ระบบเดิม (Google Apps Script) ใช้เฉพาะหน้า migrate.html สำหรับย้ายข้อมูล
window.MTA_LEGACY_API_URL = "https://script.google.com/macros/s/AKfycbxrg3L1Kvzbjh5U0WlFve8ExsGYcC8YTte2qB8Rs5Ckkza4aDjQ4QRFpCtz599s1NdE/exec";
