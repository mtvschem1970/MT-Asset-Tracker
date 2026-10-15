// ====== FIREBASE BACKEND ADAPTER ======
// แทนที่ Google Apps Script เดิม โดยรับ payload {action, ...} แบบเดียวกันทุกประการ
// และคืนค่า JSON รูปแบบเดิม เพื่อให้หน้าเว็บส่วนอื่นไม่ต้องแก้ไข
//
// โครงสร้าง Firestore:
//   departments/{code}        {name, code}
//   assets/{id}               ข้อมูลอุปกรณ์ + history[] + spareParts[] (รูปแบบเดียวกับระบบเดิม)
//   pmSchedules/{schId}       {assetId, assetName, schId, topic, planDate, status, ...}
//   pmTemplates/{id}          แม่แบบ PM
//   pmDocuments/{id}          เอกสาร PM
//   assetPmTemplates/{assetId} {assetId, templateIds[]}
(function () {
    if (!window.firebase || !window.MTA_FIREBASE_CONFIG) {
        console.error('ไม่พบ Firebase SDK หรือ firebase-config.js');
        return;
    }
    if (!firebase.apps.length) firebase.initializeApp(window.MTA_FIREBASE_CONFIG);
    const db = firebase.firestore();
    const useStorage = window.MTA_USE_STORAGE !== false && !!firebase.storage;
    // Storage อาจอยู่คนละโปรเจกต์ (MTA_STORAGE_CONFIG) และทุกไฟล์อยู่ใต้ MTA_STORAGE_PREFIX
    const storageApp = window.MTA_STORAGE_CONFIG
        ? (firebase.apps.find(a => a.name === 'mta-storage') || firebase.initializeApp(window.MTA_STORAGE_CONFIG, 'mta-storage'))
        : firebase.app();
    const storage = useStorage ? storageApp.storage() : null;
    const storagePrefix = (window.MTA_STORAGE_PREFIX || '').replace(/^\/+|\/+$/g, '');

    const C = {
        depts: 'departments', assets: 'assets', pm: 'pmSchedules',
        templates: 'pmTemplates', docs: 'pmDocuments', assetTpl: 'assetPmTemplates'
    };
    // ข้อมูลระบบ (เช่น สถานะการสำรองข้อมูล) แยกจากข้อมูลงาน และไม่รวมในไฟล์สำรอง
    const META = 'meta';

    // Firestore ห้ามมี undefined และห้ามมี '/' ใน document id
    const clean = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
    const docId = (v) => String(v).trim().replace(/\//g, '_');
    const listAll = async (col) => (await db.collection(col).get()).docs.map(d => d.data());
    // แผน PM: แนบรหัสเอกสารจริง (_docId) ไว้ด้วย รายการเก่าที่ย้ายมาจากระบบเดิมบางรายการไม่มี schId หรือ schId ไม่ตรงกับรหัสเอกสาร
    const pmFromSnap = (snap) => snap.docs.map(d => { const x = d.data(); return { ...x, schId: x.schId || d.id, _docId: d.id }; });
    const pmRef = (p) => db.collection(C.pm).doc(p && p._docId ? p._docId : docId(p && p.schId));

    // ====== FILES ======
    const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:');
    const MAX_INLINE = 700 * 1024;

    const dataUrlToBlob = (dataUrl) => {
        const [head, body] = dataUrl.split(',');
        const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
        const bin = atob(body);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    };

    const compressImage = (dataUrl, maxSide = 1280, quality = 0.75) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });

    // รับค่า base64 data URL แล้วคืนเป็น URL ที่เก็บถาวร; ค่าอื่น (เช่นลิงก์ Google Drive เดิม) คืนค่าเดิม
    const storeFile = async (value, folder) => {
        if (!isDataUrl(value)) return value || '';
        const blob = dataUrlToBlob(value);
        if (storage) {
            try {
                const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
                const ref = storage.ref(`${storagePrefix ? storagePrefix + '/' : ''}${folder}/${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`);
                await ref.put(blob, { contentType: blob.type });
                return await ref.getDownloadURL();
            } catch (e) {
                // Storage ยังไม่เปิดใช้หรืออัปโหลดไม่ได้ → เก็บแบบย่อใน Firestore แทน
                console.warn('Storage upload failed, storing inline', e);
            }
        }
        let out = value;
        if (blob.type.startsWith('image/')) {
            out = await compressImage(value);
            if (out.length > MAX_INLINE) out = await compressImage(value, 800, 0.6);
        }
        if (out.length > MAX_INLINE) throw new Error('ไฟล์ใหญ่เกินไป (เปิดใช้ Firebase Storage เพื่อเก็บไฟล์ขนาดใหญ่)');
        return out;
    };

    // แปลงทุก data URL ใน object (เช่น responses ของเอกสาร PM) เป็นไฟล์ที่เก็บถาวร
    const storeFilesDeep = async (v, folder) => {
        if (isDataUrl(v)) return storeFile(v, folder);
        if (Array.isArray(v)) return Promise.all(v.map(x => storeFilesDeep(x, folder)));
        if (v && typeof v === 'object') {
            const out = {};
            for (const k of Object.keys(v)) out[k] = await storeFilesDeep(v[k], folder);
            return out;
        }
        return v;
    };

    // ลิงก์ PDF แบบ data URL (กรณีไม่ใช้ Storage) เบราว์เซอร์จะไม่ยอมเปิดในแท็บใหม่ จึงแปลงเป็น blob URL ตอนคลิก
    document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href^="data:"]');
        if (!a) return;
        e.preventDefault();
        window.open(URL.createObjectURL(dataUrlToBlob(a.getAttribute('href'))), '_blank');
    });

    // ====== HELPERS ======
    const sortHistory = (list) => [...list].sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || '')) || Number(b.id || 0) - Number(a.id || 0));

    const updateAsset = (assetId, fn) => db.runTransaction(async (tx) => {
        const ref = db.collection(C.assets).doc(docId(assetId));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('ไม่พบอุปกรณ์ ' + assetId);
        tx.update(ref, clean(fn(snap.data())));
    });

    // วัน PM ถัดไป = วันแผนที่ใกล้ที่สุดของรายการที่ยังรอดำเนินการ
    const refreshNextPm = async (assetId) => {
        const list = (await db.collection(C.pm).where('assetId', '==', String(assetId)).get()).docs.map(d => d.data());
        const next = list.filter(p => p.status === 'รอเป้าหมาย' && p.planDate).map(p => p.planDate).sort()[0] || '';
        const ref = db.collection(C.assets).doc(docId(assetId));
        if ((await ref.get()).exists) await ref.update({ nextPmDate: next });
    };

    // แผน PM ที่ยัง "รอเป้าหมาย" แต่มีเอกสาร PM ของเครื่องเดียวกันในเดือนเดียวกันแล้ว -> เปลี่ยนเป็น "ดำเนินการแล้ว"
    // ใช้ทั้งตอนบันทึกเอกสาร (รวมเอกสารย้อนหลัง) และตอนโหลดแผน เพื่อแก้ข้อมูลเก่าให้ตรงกันอัตโนมัติ
    const reconcilePmWithDocuments = async (pmList, docs) => {
        const byMonth = new Map();
        docs.forEach(d => {
            if (!d.assetId || !d.inspectionDate) return;
            const k = `${d.assetId}|${String(d.inspectionDate).slice(0, 7)}`;
            if (!byMonth.has(k)) byMonth.set(k, d);
        });
        const fixes = pmList.filter(p => p.status === 'รอเป้าหมาย' && p.planDate && (p.schId || p._docId) &&
            byMonth.has(`${p.assetId}|${String(p.planDate).slice(0, 7)}`));
        if (!fixes.length) return pmList;
        const batch = db.batch();
        fixes.forEach(p => {
            const d = byMonth.get(`${p.assetId}|${String(p.planDate).slice(0, 7)}`);
            Object.assign(p, { status: 'ดำเนินการแล้ว', doneDate: d.inspectionDate, pmDocumentId: d.id || '' });
            batch.update(pmRef(p), { status: p.status, doneDate: p.doneDate, pmDocumentId: p.pmDocumentId });
        });
        await batch.commit();
        for (const id of new Set(fixes.map(p => String(p.assetId)))) await refreshNextPm(id);
        return pmList;
    };

    // แผน PM ที่ถูกปิดด้วยเอกสารนี้ -> กลับเป็น "รอเป้าหมาย" (ใช้ตอนลบ/แก้ไขเอกสาร)
    const unlinkPmDocument = async (pmDocId) => {
        if (!pmDocId) return;
        const linked = (await db.collection(C.pm).where('pmDocumentId', '==', String(pmDocId)).get()).docs;
        if (!linked.length) return;
        const batch = db.batch();
        linked.forEach(d => batch.update(d.ref, { status: 'รอเป้าหมาย', doneDate: '', pmDocumentId: '' }));
        await batch.commit();
        for (const id of new Set(linked.map(d => String(d.data().assetId)))) await refreshNextPm(id);
    };

    // ====== ACTIONS ======
    const actions = {
        async save_dept(p) {
            if (!p.name || !p.code) throw new Error('กรอกข้อมูลให้ครบ');
            const ref = db.collection(C.depts).doc(docId(p.code));
            const snap = await ref.get();
            await ref.set({ name: p.name, code: p.code, sortOrder: snap.exists ? snap.data().sortOrder ?? Date.now() : Date.now() });
        },

        // แก้ชื่อ/รหัสแผนก: อัปเดต location ของอุปกรณ์ทุกเครื่องในแผนกตามชื่อใหม่ด้วย
        async update_dept(p) {
            const name = String(p.name || '').trim(), code = String(p.code || '').trim();
            if (!name || !code) throw new Error('กรอกข้อมูลให้ครบ');
            const oldRef = db.collection(C.depts).doc(docId(p.oldCode));
            const oldSnap = await oldRef.get();
            const prev = oldSnap.exists ? oldSnap.data() : {};
            const batch = db.batch();
            if (docId(code) !== docId(p.oldCode)) {
                if ((await db.collection(C.depts).doc(docId(code)).get()).exists) throw new Error('รหัสแผนก ' + code + ' มีอยู่แล้ว');
                batch.delete(oldRef);
            }
            batch.set(db.collection(C.depts).doc(docId(code)), clean({ ...prev, name, code }));
            if (p.oldName && p.oldName !== name) {
                (await db.collection(C.assets).where('location', '==', p.oldName).get()).docs.forEach(d => batch.update(d.ref, { location: name }));
            }
            await batch.commit();
        },

        async delete_dept(p) {
            const used = await db.collection(C.assets).where('location', '==', p.name).get();
            if (used.docs.length) throw new Error(`ยังมีอุปกรณ์ ${used.docs.length} เครื่องในแผนกนี้ ย้ายหรือลบอุปกรณ์ก่อน`);
            await db.collection(C.depts).doc(docId(p.code)).delete();
        },

        async save_asset(p) {
            const { action, ...form } = p;
            if (!form.id || form.id === 'รอสร้างอัตโนมัติ...') throw new Error('กรุณาเลือกแผนกเพื่อสร้างรหัสอุปกรณ์');
            const ref = db.collection(C.assets).doc(docId(form.id));
            const image = await storeFile(form.image, `assets/${docId(form.id)}`);
            const receiptPdf = await storeFile(form.receiptPdf, `assets/${docId(form.id)}`);
            const snap = await ref.get();
            const prev = snap.exists ? snap.data() : { history: [], spareParts: [], nextPmDate: '', sortOrder: Date.now() };
            await ref.set(clean({ ...prev, ...form, image, receiptPdf, id: String(form.id) }));
        },

        async delete_asset(p) {
            const batch = db.batch();
            batch.delete(db.collection(C.assets).doc(docId(p.id)));
            batch.delete(db.collection(C.assetTpl).doc(docId(p.id)));
            (await db.collection(C.pm).where('assetId', '==', String(p.id)).get()).docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        },

        async save_log(p) {
            const folder = `assets/${docId(p.assetId)}/logs`;
            const parts = await Promise.all((p.log.parts || []).map(async part => ({
                ...part,
                image: await storeFile(part.image, folder),
                pdf: await storeFile(part.pdf, folder)
            })));
            const log = { ...p.log, parts };
            await updateAsset(p.assetId, a => {
                const rest = (a.history || []).filter(h => String(h.id) !== String(log.id));
                return { history: sortHistory([...rest, log]) };
            });
        },

        async delete_log(p) {
            await updateAsset(p.assetId, a => ({ history: (a.history || []).filter(h => String(h.id) !== String(p.logId)) }));
        },

        async save_spare_part(p) {
            const { removeImage, ...spare } = p.sparePart;
            spare.image = removeImage ? '' : await storeFile(spare.image, `assets/${docId(p.assetId)}/spares`);
            await updateAsset(p.assetId, a => {
                const list = a.spareParts || [];
                const exists = list.some(s => String(s.id) === String(spare.id));
                return { spareParts: exists ? list.map(s => String(s.id) === String(spare.id) ? spare : s) : [...list, spare] };
            });
        },

        async delete_spare_part(p) {
            await updateAsset(p.assetId, a => ({ spareParts: (a.spareParts || []).filter(s => String(s.id) !== String(p.spareId)) }));
        },

        async get_pm_schedules(p) {
            const list = pmFromSnap(await db.collection(C.pm).where('assetId', '==', String(p.assetId)).get());
            return { pmSchedules: list.sort((a, b) => String(a.planDate).localeCompare(String(b.planDate))) };
        },

        async save_pm_schedule(p) {
            const { _docId, ...s } = p.schedule;
            s.schId = s.schId || 'SCH-' + Date.now();
            const folder = `assets/${docId(p.assetId)}/pm`;
            s.image = await storeFile(s.image, folder);
            s.pdf = await storeFile(s.pdf, folder);
            await (_docId ? db.collection(C.pm).doc(_docId) : db.collection(C.pm).doc(docId(s.schId))).set(clean({ ...s, assetId: String(p.assetId), assetName: p.assetName || '' }));
            await refreshNextPm(p.assetId);
        },

        async delete_pm_schedule(p) {
            await pmRef({ _docId: p.docId, schId: p.schId }).delete();
            await refreshNextPm(p.assetId);
        },

        // บันทึกแผน PM ทั้งปีจากหน้า "ตั้งแผน PM ประจำปี" ในครั้งเดียว
        // creates: [{assetId, assetName, schedule}], updates: [{schId, patch}], deletes: [schId] (เฉพาะรายการที่ยังรอเป้าหมาย)
        async save_pm_plan(p) {
            const ops = [];
            (p.creates || []).forEach((c, i) => {
                const s = { ...c.schedule, schId: c.schedule.schId || `SCH-${Date.now()}-${i}` };
                ops.push(b => b.set(db.collection(C.pm).doc(docId(s.schId)), clean({ ...s, assetId: String(c.assetId), assetName: c.assetName || '' })));
            });
            (p.updates || []).forEach(u => ops.push(b => b.update(pmRef({ _docId: u.docId, schId: u.schId }), clean(u.patch))));
            (p.deletes || []).forEach(id => ops.push(b => b.delete(db.collection(C.pm).doc(docId(id)))));
            for (let i = 0; i < ops.length; i += 400) {
                const batch = db.batch();
                ops.slice(i, i + 400).forEach(op => op(batch));
                await batch.commit();
            }
            const assetIds = new Set([...(p.assetIds || []), ...(p.creates || []).map(c => String(c.assetId))]);
            for (const id of assetIds) await refreshNextPm(id);
            return { created: (p.creates || []).length, deleted: (p.deletes || []).length, updated: (p.updates || []).length };
        },

        // ลบแผน PM ที่ค้างอยู่ของอุปกรณ์ที่ไม่มีในทะเบียนแล้ว
        async delete_orphan_pm() {
            const ids = new Set((await db.collection(C.assets).get()).docs.map(d => String(d.data().id ?? d.id)));
            (await db.collection(C.assets).get()).docs.forEach(d => ids.add(String(d.id)));
            const orphans = (await db.collection(C.pm).get()).docs.filter(d => !ids.has(String(d.data().assetId)));
            for (let i = 0; i < orphans.length; i += 400) {
                const batch = db.batch();
                orphans.slice(i, i + 400).forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            return { deleted: orphans.length };
        },

        async get_all_pm_dashboard() {
            const [pm, docs] = await Promise.all([db.collection(C.pm).get().then(pmFromSnap), listAll(C.docs)]);
            try { await reconcilePmWithDocuments(pm, docs); } catch (e) { console.warn('reconcile PM', e); }
            return { allPm: pm };
        },

        async get_pm_templates() {
            return { templates: await listAll(C.templates) };
        },

        async save_pm_template(p) {
            const t = { ...p.template, id: p.template.id || 'PMT-' + Date.now() };
            await db.collection(C.templates).doc(docId(t.id)).set(clean(t));
        },

        async delete_pm_template(p) {
            await db.collection(C.templates).doc(docId(p.templateId)).delete();
        },

        async get_pm_documents() {
            const docs = await listAll(C.docs);
            return { documents: docs.sort((a, b) => String(b.inspectionDate || '').localeCompare(String(a.inspectionDate || ''))) };
        },

        async delete_pm_document(p) {
            await unlinkPmDocument(p.id);
            await db.collection(C.docs).doc(docId(p.id)).delete();
        },

        async save_pm_document(p) {
            if (p.document.id) await unlinkPmDocument(p.document.id);   // แก้ไขเอกสาร: ปลดแผนที่เคยผูกไว้ก่อน แล้วผูกใหม่ตามวันที่ล่าสุด
            const d = await storeFilesDeep({ ...p.document, id: p.document.id || 'PMDOC-' + Date.now() }, 'pm-documents');
            await db.collection(C.docs).doc(docId(d.id)).set(clean(d));
            if (d.assetId) {
                const pmList = (await db.collection(C.pm).where('assetId', '==', String(d.assetId)).get()).docs.map(x => x.data());
                await reconcilePmWithDocuments(pmList, [d]);
            }
        },

        async get_asset_pm_templates(p) {
            const snap = await db.collection(C.assetTpl).doc(docId(p.assetId)).get();
            return { templateIds: snap.exists ? (snap.data().templateIds || []) : [] };
        },

        async save_asset_pm_templates(p) {
            await db.collection(C.assetTpl).doc(docId(p.assetId)).set({ assetId: String(p.assetId), templateIds: (p.templateIds || []).map(String) });
        },

        // ====== BACKUP ======
        // ดึงข้อมูลทุก collection พร้อม document id เพื่อใช้กู้คืนได้ตรงตามเดิม
        async export_backup() {
            const names = Object.values(C);
            const collections = {};
            const counts = {};
            for (const name of names) {
                const snap = await db.collection(name).get();
                collections[name] = snap.docs.map(d => ({ id: d.id, data: d.data() }));
                counts[name] = snap.size;
            }
            return {
                backup: {
                    format: 'mt-asset-tracker-backup',
                    formatVersion: 1,
                    exportedAt: new Date().toISOString(),
                    projectId: (window.MTA_FIREBASE_CONFIG || {}).projectId || '',
                    counts,
                    collections
                }
            };
        },

        async get_backup_status() {
            const snap = await db.collection(META).doc('backup').get();
            return { backupStatus: snap.exists ? snap.data() : { lastBackupAt: '', history: [] } };
        },

        // ====== ISO DOCUMENT SETTINGS (หัวกระดาษ เลขที่เอกสาร Rev. ผู้ลงนาม) ======
        async get_doc_settings() {
            const snap = await db.collection(META).doc('docSettings').get();
            return { docSettings: snap.exists ? snap.data() : null };
        },

        async save_doc_settings(p) {
            await db.collection(META).doc('docSettings').set(clean({ ...p.settings, updatedAt: new Date().toISOString() }));
        },

        async record_backup(p) {
            const ref = db.collection(META).doc('backup');
            const snap = await ref.get();
            const prev = snap.exists ? (snap.data().history || []) : [];
            const entry = { at: new Date().toISOString(), by: String(p.by || '').slice(0, 60), counts: p.counts || {}, sizeKb: Number(p.sizeKb) || 0 };
            await ref.set(clean({ lastBackupAt: entry.at, lastBackupBy: entry.by, history: [entry, ...prev].slice(0, 20) }));
        }
    };

    window.mtaApi = {
        db,
        // เทียบเท่า GET API_URL เดิม
        async getAll() {
            const [assets, departments] = await Promise.all([listAll(C.assets), listAll(C.depts)]);
            // sortOrder เก็บลำดับแถวจาก Google Sheet เดิม รายการที่เพิ่มใหม่จะต่อท้าย
            const bySort = (a, b) => Number(a.sortOrder ?? Infinity) - Number(b.sortOrder ?? Infinity);
            assets.sort(bySort);
            departments.sort(bySort);
            return { assets, departments };
        },
        // เทียบเท่า POST API_URL เดิม: คืน {status:'success', ...} หรือ {status:'error', message}
        async call(payload) {
            const fn = actions[payload && payload.action];
            if (!fn) return { status: 'error', message: 'ไม่รู้จักคำสั่ง ' + (payload && payload.action) };
            try {
                return { status: 'success', ...((await fn(payload)) || {}) };
            } catch (e) {
                console.error(payload.action, e);
                return { status: 'error', message: e.message || String(e) };
            }
        }
    };
})();
