// ====== ISO 14001 DOCUMENT EXPORT ======
// สร้างเอกสารแบบควบคุม (Documented Information ตาม ISO 14001 ข้อ 7.5) จากข้อมูลในระบบ
// ทุกแผ่นมีหัวกระดาษ: ชื่อองค์กร, ชื่อเอกสาร, เลขที่เอกสาร, Rev., วันที่บังคับใช้, หน้า x/y
// และท้ายเอกสารมีช่องลงนาม ผู้จัดทำ / ผู้ตรวจสอบ / ผู้อนุมัติ + ระยะเวลาจัดเก็บ
// เปิดเป็นหน้าต่างใหม่ แล้วสั่งพิมพ์หรือ "บันทึกเป็น PDF" จากเบราว์เซอร์
(function () {
    const DEFAULT_SETTINGS = {
        companyName: 'ชื่อบริษัท / หน่วยงาน',
        department: 'แผนกซ่อมบำรุง',
        signers: { prepared: 'ผู้จัดทำ', reviewed: 'ผู้ตรวจสอบ', approved: 'ผู้อนุมัติ' },
        forms: {
            register:   { code: 'FM-MT-01', title: 'ทะเบียนเครื่องจักรและอุปกรณ์', rev: '00', effective: '', retention: 'จนกว่าจะยกเลิกการใช้งานเครื่องจักร' },
            history:    { code: 'FM-MT-02', title: 'ประวัติเครื่องจักรและอุปกรณ์', rev: '00', effective: '', retention: 'ตลอดอายุการใช้งาน + 3 ปี' },
            repairLog:  { code: 'FM-MT-03', title: 'บันทึกการซ่อมบำรุง', rev: '00', effective: '', retention: '3 ปี' },
            pmPlan:     { code: 'FM-MT-04', title: 'แผนการบำรุงรักษาเชิงป้องกันประจำปี', rev: '00', effective: '', retention: '3 ปี' },
            pmRecord:   { code: 'FM-MT-05', title: 'บันทึกการตรวจเช็คบำรุงรักษาเชิงป้องกัน', rev: '00', effective: '', retention: '3 ปี' },
            spareParts: { code: 'FM-MT-06', title: 'ทะเบียนอะไหล่สำรอง', rev: '00', effective: '', retention: '1 ปี' }
        }
    };

    // ผสานค่าที่ผู้ใช้ตั้งไว้กับค่าเริ่มต้น (ฟิลด์ที่ไม่ได้ตั้งจะใช้ค่าเริ่มต้น)
    const mergeSettings = (s) => {
        s = s || {};
        const forms = {};
        Object.keys(DEFAULT_SETTINGS.forms).forEach(k => { forms[k] = { ...DEFAULT_SETTINGS.forms[k], ...((s.forms || {})[k] || {}) }; });
        return { ...DEFAULT_SETTINGS, ...s, signers: { ...DEFAULT_SETTINGS.signers, ...(s.signers || {}) }, forms };
    };

    // ====== helpers ======
    const esc = (v) => String(v === undefined || v === null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const dash = (v) => (v === undefined || v === null || v === '') ? '-' : esc(v);
    const thDate = (s) => { if (!s) return '-'; const d = new Date(s); return isNaN(d) ? esc(s) : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }); };
    const thDateTime = (d) => d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const num = (n) => Number(n || 0).toLocaleString('th-TH');
    const sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0);
    const isUrl = (v) => typeof v === 'string' && /^(https?:|data:image\/)/.test(v);
    const logoUrl = () => new URL('./Logo.png', location.href).href;

    // footLeft เป็น CSS string literal ที่ใส่ใน margin box ของ @page (ตัวแปร CSS ใช้ใน @page ไม่ได้)
    // เอกสารแต่ละชนิดใช้แนวกระดาษเดียวทั้งฉบับ (ไม่ใช้ named page เพราะทำให้เกิดหน้าว่างท้ายเอกสาร)
    const LANDSCAPE = ['register', 'repairLog', 'pmPlan', 'spareParts'];
    const css = (footLeft, landscape) => `
        @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm 12mm 16mm;
            @bottom-left { content: ${footLeft}; font: 8pt 'IBM Plex Sans Thai', sans-serif; color: #555; }
            @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font: 8pt 'IBM Plex Sans Thai', sans-serif; color: #555; } }
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #e9ecf1; }
        body { font-family: 'IBM Plex Sans Thai', system-ui, sans-serif; font-size: 10pt; color: #111; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px; align-items: center; padding: 10px 16px; background: #0f2744; color: #fff; font-size: 13px; }
        .toolbar b { flex: 1; font-weight: 600; }
        .toolbar button { font: inherit; font-weight: 600; border: 0; border-radius: 8px; padding: 8px 16px; cursor: pointer; background: #fff; color: #0f2744; }
        .toolbar .hint { opacity: .7; font-size: 12px; }
        .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 16px auto; padding: 12mm; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
        .sheet.landscape { width: 297mm; min-height: 210mm; }
        table { width: 100%; border-collapse: collapse; }
        .doc-head td { border: 1px solid #333; padding: 4px 8px; vertical-align: middle; }
        .doc-head .logo { width: 26mm; text-align: center; }
        .doc-head .logo img { max-width: 22mm; max-height: 16mm; }
        .doc-head .org { text-align: center; }
        .doc-head .org .company { font-size: 11pt; font-weight: 700; }
        .doc-head .org .title { font-size: 13pt; font-weight: 700; margin-top: 2px; }
        .doc-head .org .dept { font-size: 9pt; color: #444; }
        .doc-head .meta { width: 52mm; font-size: 8.5pt; padding: 0; }
        .doc-head .meta div { padding: 2px 8px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; gap: 6px; }
        .doc-head .meta div:last-child { border-bottom: 0; }
        .scope { margin: 8px 0 10px; font-size: 9.5pt; display: flex; flex-wrap: wrap; gap: 4px 18px; }
        .scope b { font-weight: 600; }
        .grid th, .grid td { border: 1px solid #555; padding: 4px 6px; vertical-align: top; }
        .grid thead th { background: #e8edf4; font-weight: 600; text-align: center; font-size: 9pt; }
        .grid td { font-size: 9pt; }
        .grid tr { break-inside: avoid; }
        .grid .c { text-align: center; } .grid .r { text-align: right; white-space: nowrap; } .grid .mono { font-family: 'IBM Plex Mono', monospace; font-size: 8.5pt; }
        .grid .total td { font-weight: 700; background: #f4f6f9; }
        .kv { margin-bottom: 10px; }
        .kv td { border: 1px solid #555; padding: 4px 8px; font-size: 9.5pt; }
        .kv td.k { background: #f4f6f9; width: 26%; font-weight: 600; }
        .section { font-size: 11pt; font-weight: 700; margin: 14px 0 6px; padding-left: 8px; border-left: 4px solid #1d4e89; break-after: avoid; }
        .photo { width: 52mm; height: 62mm; object-fit: cover; border: 1px solid #555; flex-shrink: 0; }
        .muted { color: #666; } .empty { text-align: center; color: #777; padding: 14px; }
        .pass { color: #067647; font-weight: 700; } .fail { color: #b42318; font-weight: 700; }
        .sign { margin-top: 18px; break-inside: avoid; }
        .sign td { border: 1px solid #333; width: 33.33%; text-align: center; padding: 6px; font-size: 9pt; vertical-align: bottom; height: 26mm; }
        .sign .role { font-weight: 600; } .sign .line { margin: 0 auto 4px; width: 80%; border-bottom: 1px dotted #333; height: 12mm; }
        .doc-foot { margin-top: 8px; font-size: 8pt; color: #555; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .page-break { break-before: page; }
        .pm-cell { width: 4.4%; text-align: center; font-weight: 700; padding-left: 2px !important; padding-right: 2px !important; }
        .info-wrap { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
        .info-wrap .kv { flex: 1; margin-bottom: 0; }
        .pm-P { color: #1d4e89; } .pm-D { color: #067647; } .pm-X { color: #b42318; } .pm-O { color: #c2410c; }
        .legend { margin-top: 6px; font-size: 8.5pt; display: flex; gap: 16px; flex-wrap: wrap; }
        @media print {
            html, body { background: #fff; }
            .toolbar { display: none; }
            .sheet, .sheet.landscape { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
            .sheet + .sheet { break-before: page; }
        }`;

    // หัวกระดาษ (อยู่ใน <thead> ของตารางครอบ เพื่อให้พิมพ์ซ้ำทุกหน้า)
    const header = (S, form) => `
        <table class="doc-head"><tr>
            <td class="logo"><img src="${esc(logoUrl())}" alt=""></td>
            <td class="org">
                <div class="company">${esc(S.companyName)}</div>
                <div class="title">${esc(form.title)}</div>
                <div class="dept">${esc(S.department)}</div>
            </td>
            <td class="meta">
                <div><span>เลขที่เอกสาร</span><b>${esc(form.code)}</b></div>
                <div><span>แก้ไขครั้งที่ (Rev.)</span><b>${esc(form.rev)}</b></div>
                <div><span>วันที่บังคับใช้</span><b>${form.effective ? thDate(form.effective) : '-'}</b></div>
            </td>
        </tr></table>`;

    const signBlock = (S, opts = {}) => `
        <table class="sign"><tr>
            ${['prepared', 'reviewed', 'approved'].map(k => `
                <td><div class="line"></div>
                <div>(${opts[k] ? esc(opts[k]) : '..................................................'})</div>
                <div class="role">${esc(S.signers[k])}</div>
                <div class="muted">วันที่ ......../......../........</div></td>`).join('')}
        </tr></table>`;

    const footer = (form, printedAt) => `
        <div class="doc-foot">
            <span>ระยะเวลาจัดเก็บ: ${esc(form.retention)}</span>
            <span>พิมพ์จากระบบ MT Asset Tracker เมื่อ ${esc(thDateTime(printedAt))} · เอกสารที่พิมพ์ออกถือเป็นสำเนาไม่ควบคุม เว้นแต่ลงนามรับรอง</span>
        </div>`;

    // ห่อเนื้อหาหนึ่งเอกสาร: หัวกระดาษซ้ำทุกหน้า + เนื้อหา + ลงนาม + ท้ายเอกสาร
    const sheet = (S, form, scopeHtml, bodyHtml, printedAt, { landscape = false, sign = {} } = {}) => `
        <section class="sheet${landscape ? ' landscape' : ''}">
            <table><thead><tr><td style="padding:0 0 6px">${header(S, form)}</td></tr></thead>
            <tbody><tr><td style="padding:0">
                ${scopeHtml ? `<div class="scope">${scopeHtml}</div>` : ''}
                ${bodyHtml}
                <div style="break-inside: avoid">${signBlock(S, sign)}${footer(form, printedAt)}</div>
            </td></tr></tbody></table>
        </section>`;

    const scope = (pairs) => pairs.filter(p => p[1] !== undefined && p[1] !== null && p[1] !== '').map(([k, v]) => `<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join('');
    const inRange = (d, from, to) => (!from || String(d) >= from) && (!to || String(d) <= to);
    const rangeText = (from, to) => (from || to) ? `${from ? thDate(from) : 'เริ่มต้น'} ถึง ${to ? thDate(to) : 'ปัจจุบัน'}` : 'ทั้งหมด';
    const assetLabel = (a) => `${a.id} ${a.name || ''}`.trim();

    // ====== document builders ======
    const builders = {
        // FM-MT-01 ทะเบียนเครื่องจักร
        register(S, ctx, f, now) {
            const list = ctx.assets.filter(a => !f.dept || a.location === f.dept);
            const rows = list.map((a, i) => `<tr>
                <td class="c">${i + 1}</td><td class="mono">${esc(a.id)}</td><td>${dash(a.name)}</td><td>${dash(a.model)}</td>
                <td>${dash(a.location)}</td><td>${dash(a.vendor)}</td><td class="c">${thDate(a.purchaseDate)}</td>
                <td class="c">${a.electrical && a.electrical.uses ? '✓' : ''}</td><td class="c">${a.water && a.water.uses ? '✓' : ''}</td>
                <td class="c">${a.nextPmDate ? thDate(a.nextPmDate) : '-'}</td><td class="c">${dash(a.status)}</td></tr>`).join('');
            return sheet(S, S.forms.register,
                scope([['แผนก', f.dept || 'ทุกแผนก'], ['จำนวน', `${num(list.length)} รายการ`], ['ข้อมูล ณ วันที่', thDate(now)]]),
                `<table class="grid"><thead><tr><th>ลำดับ</th><th>รหัสเครื่อง</th><th>ชื่อเครื่องจักร/อุปกรณ์</th><th>รุ่น</th><th>แผนก/ที่ตั้ง</th><th>ผู้จำหน่าย</th><th>วันที่ซื้อ</th><th>ไฟฟ้า</th><th>น้ำ</th><th>PM ถัดไป</th><th>สถานะ</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="11" class="empty">ไม่มีข้อมูล</td></tr>`}</tbody></table>`,
                now, { landscape: true });
        },

        // FM-MT-02 ประวัติเครื่องจักร (หนึ่งเครื่องต่อหนึ่งเอกสาร)
        history(S, ctx, f, now) {
            const targets = f.assetId ? ctx.assets.filter(a => String(a.id) === String(f.assetId)) : ctx.assets.filter(a => !f.dept || a.location === f.dept);
            return targets.map(a => {
                const logs = (a.history || []).filter(h => inRange(h.date, f.from, f.to)).slice().sort((x, y) => String(x.date).localeCompare(String(y.date)));
                const pm = (ctx.pmSchedules || []).filter(p => String(p.assetId) === String(a.id)).sort((x, y) => String(x.planDate).localeCompare(String(y.planDate)));
                const spares = a.spareParts || [];
                const e = a.electrical || {}, w = a.water || {};
                const info = `<div class="info-wrap">
                    <table class="kv">
                        <tr><td class="k">รหัสเครื่อง</td><td>${dash(a.id)}</td></tr>
                        <tr><td class="k">ชื่อเครื่องจักร/อุปกรณ์</td><td>${dash(a.name)}</td></tr>
                        <tr><td class="k">รุ่น / Model</td><td>${dash(a.model)}</td></tr>
                        <tr><td class="k">แผนก / ที่ตั้ง</td><td>${dash(a.location)}</td></tr>
                        <tr><td class="k">ผู้จำหน่าย</td><td>${dash(a.vendor)}</td></tr>
                        <tr><td class="k">วันที่ซื้อ</td><td>${thDate(a.purchaseDate)}</td></tr>
                        <tr><td class="k">สถานะปัจจุบัน</td><td>${dash(a.status)}</td></tr>
                        <tr><td class="k">ระบบไฟฟ้า</td><td>${e.uses ? `ใช้ไฟฟ้า · ${[e.watt && e.watt + ' W', e.amp && e.amp + ' A', e.hp && e.hp + ' HP', e.breaker && 'Breaker ' + e.breaker].filter(Boolean).map(esc).join(' · ') || '-'}` : 'ไม่ใช้'}</td></tr>
                        <tr><td class="k">ระบบน้ำ</td><td>${w.uses ? `ใช้น้ำ · ${[w.type, w.pump && 'Pump ' + w.pump].filter(Boolean).map(esc).join(' · ') || '-'}` : 'ไม่ใช้'}</td></tr>
                    </table>
                    ${isUrl(a.image) ? `<img class="photo" src="${esc(a.image)}" alt="">` : ''}
                </div>`;
                const logRows = logs.map((h, i) => `<tr>
                    <td class="c">${i + 1}</td><td class="c">${thDate(h.date)}</td><td class="c">${dash(h.type)}</td>
                    <td>${dash(h.description)}${(h.parts || []).length ? `<div class="muted">อะไหล่: ${(h.parts || []).map(p => `${esc(p.name)}${p.price ? ' (' + money(p.price) + ')' : ''}`).join(', ')}</div>` : ''}</td>
                    <td class="r">${money(h.laborCost)}</td><td class="r">${money(h.totalCost)}</td><td></td></tr>`).join('');
                const pmRows = pm.map((p, i) => `<tr><td class="c">${i + 1}</td><td class="c">${thDate(p.planDate)}</td><td>${dash(p.topic)}</td><td class="c">${dash(p.pmType)}${p.pmVendorName ? `<div class="muted">${esc(p.pmVendorName)}</div>` : ''}</td><td class="c">${dash(p.status)}</td><td>${dash(p.note)}</td></tr>`).join('');
                const spareRows = spares.map((s, i) => `<tr><td class="c">${i + 1}</td><td>${dash(s.name)}</td><td>${dash(s.vendor)}</td><td class="r">${money(s.price)}</td><td class="c">${num(s.stock)}</td><td class="c">${num(s.minStock)}</td></tr>`).join('');
                return sheet(S, S.forms.history,
                    scope([['เครื่อง', assetLabel(a)], ['ช่วงประวัติ', rangeText(f.from, f.to)]]),
                    `${info}
                    <div class="section">ประวัติการซ่อมบำรุง</div>
                    <table class="grid"><thead><tr><th style="width:6%">ลำดับ</th><th style="width:13%">วันที่</th><th style="width:11%">ประเภท</th><th>รายละเอียดงาน / อะไหล่ที่เปลี่ยน</th><th style="width:11%">ค่าแรง (บาท)</th><th style="width:11%">รวม (บาท)</th><th style="width:10%">ผู้ตรวจรับ</th></tr></thead>
                    <tbody>${logRows || `<tr><td colspan="7" class="empty">ไม่มีประวัติการซ่อมในช่วงนี้</td></tr>`}</tbody>
                    ${logs.length ? `<tbody class="total"><tr><td colspan="5" class="r">รวมค่าใช้จ่าย</td><td class="r">${money(sum(logs, h => h.totalCost))}</td><td></td></tr></tbody>` : ''}</table>
                    <div class="section">แผนบำรุงรักษาเชิงป้องกัน (PM)</div>
                    <table class="grid"><thead><tr><th style="width:6%">ลำดับ</th><th style="width:14%">วันที่ตามแผน</th><th>หัวข้อ</th><th style="width:18%">ดำเนินการโดย</th><th style="width:13%">สถานะ</th><th style="width:20%">หมายเหตุ</th></tr></thead>
                    <tbody>${pmRows || `<tr><td colspan="6" class="empty">ยังไม่มีแผน PM</td></tr>`}</tbody></table>
                    ${spares.length ? `<div class="section">อะไหล่สำรองประจำเครื่อง</div>
                    <table class="grid"><thead><tr><th style="width:6%">ลำดับ</th><th>รายการ</th><th>ผู้จำหน่าย</th><th>ราคา (บาท)</th><th>คงเหลือ</th><th>จุดสั่งซื้อ</th></tr></thead><tbody>${spareRows}</tbody></table>` : ''}`,
                    now);
            }).join('') || `<section class="sheet"><div class="empty">ไม่พบอุปกรณ์</div></section>`;
        },

        // FM-MT-03 บันทึกการซ่อมบำรุง (ทุกเครื่อง ตามช่วงวันที่)
        repairLog(S, ctx, f, now) {
            const logs = ctx.assets.filter(a => !f.dept || a.location === f.dept)
                .flatMap(a => (a.history || []).map(h => ({ ...h, asset: a })))
                .filter(h => inRange(h.date, f.from, f.to))
                .sort((x, y) => String(x.date).localeCompare(String(y.date)));
            const rows = logs.map((h, i) => `<tr>
                <td class="c">${i + 1}</td><td class="c">${thDate(h.date)}</td><td class="mono">${esc(h.asset.id)}</td><td>${dash(h.asset.name)}</td><td>${dash(h.asset.location)}</td>
                <td class="c">${dash(h.type)}</td><td>${dash(h.description)}${(h.parts || []).length ? `<div class="muted">อะไหล่: ${(h.parts || []).map(p => esc(p.name)).join(', ')}</div>` : ''}</td>
                <td class="r">${money(h.totalCost)}</td></tr>`).join('');
            return sheet(S, S.forms.repairLog,
                scope([['แผนก', f.dept || 'ทุกแผนก'], ['ช่วงวันที่', rangeText(f.from, f.to)], ['จำนวน', `${num(logs.length)} รายการ`]]),
                `<table class="grid"><thead><tr><th style="width:5%">ลำดับ</th><th style="width:10%">วันที่</th><th style="width:13%">รหัสเครื่อง</th><th style="width:15%">ชื่อเครื่อง</th><th style="width:11%">แผนก</th><th style="width:9%">ประเภท</th><th>รายละเอียดงาน</th><th style="width:10%">ค่าใช้จ่าย (บาท)</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="8" class="empty">ไม่มีบันทึกการซ่อมในช่วงนี้</td></tr>`}</tbody>
                ${logs.length ? `<tbody class="total"><tr><td colspan="7" class="r">รวมค่าใช้จ่ายทั้งสิ้น</td><td class="r">${money(sum(logs, h => h.totalCost))}</td></tr></tbody>` : ''}</table>`,
                now, { landscape: true });
        },

        // FM-MT-04 แผน PM ประจำปี (ตาราง 12 เดือน: P = ตามแผน, ✓ = ทำแล้ว, ✗ = ยกเลิก, ! = เลยกำหนด)
        pmPlan(S, ctx, f, now) {
            const year = Number(f.year) || now.getFullYear();
            const assetsById = new Map(ctx.assets.map(a => [String(a.id), a]));
            const items = (ctx.pmSchedules || [])
                .filter(p => p.planDate && new Date(p.planDate).getFullYear() === year)
                .filter(p => !f.dept || (assetsById.get(String(p.assetId)) || {}).location === f.dept);
            const groups = new Map();
            items.forEach(p => { const k = `${p.assetId}||${p.topic || ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
            const today = new Date().toISOString().slice(0, 10);
            const monthEnd = (d) => { const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); return `${d.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
            const mark = (p) => p.status === 'ดำเนินการแล้ว' ? ['D', '✓'] : p.status === 'ยกเลิก' ? ['X', '✗'] : monthEnd(String(p.planDate)) < today ? ['O', '!'] : ['P', 'P'];
            const rows = [...groups.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([k, list], i) => {
                const a = assetsById.get(String(list[0].assetId)) || { id: list[0].assetId, name: list[0].assetName };
                const cells = Array.from({ length: 12 }, (_, m) => {
                    const inMonth = list.filter(p => new Date(p.planDate).getMonth() === m);
                    return `<td class="pm-cell">${inMonth.map(p => { const [c, t] = mark(p); return `<span class="pm-${c}">${t}</span>`; }).join(' ')}</td>`;
                }).join('');
                return `<tr><td class="c">${i + 1}</td><td class="mono">${esc(a.id)}</td><td>${dash(a.name)}</td><td>${dash(list[0].topic)}</td><td class="c">${dash(list[0].pmType)}</td>${cells}</tr>`;
            }).join('');
            const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            return sheet(S, S.forms.pmPlan,
                scope([['ประจำปี', `${year + 543} (ค.ศ. ${year})`], ['แผนก', f.dept || 'ทุกแผนก'], ['จำนวนรายการ', `${num(items.length)} ครั้ง`]]),
                `<table class="grid"><thead><tr><th style="width:4%">ลำดับ</th><th style="width:11%">รหัสเครื่อง</th><th style="width:13%">ชื่อเครื่อง</th><th>หัวข้อ PM</th><th style="width:6%">ทำโดย</th>${months.map(m => `<th class="pm-cell">${m}</th>`).join('')}</tr></thead>
                <tbody>${rows || `<tr><td colspan="17" class="empty">ไม่มีแผน PM ในปีนี้</td></tr>`}</tbody></table>
                <div class="legend"><span><b class="pm-P">P</b> = ตามแผน</span><span><b class="pm-D">✓</b> = ดำเนินการแล้ว</span><span><b class="pm-O">!</b> = เลยกำหนด ยังไม่ดำเนินการ</span><span><b class="pm-X">✗</b> = ยกเลิก</span></div>`,
                now, { landscape: true });
        },

        // FM-MT-05 บันทึกการตรวจเช็ค PM (หนึ่งเอกสารต่อหนึ่งใบตรวจ)
        pmRecord(S, ctx, f, now) {
            const assetsById = new Map(ctx.assets.map(a => [String(a.id), a]));
            const docs = (ctx.pmDocuments || [])
                .filter(d => inRange(d.inspectionDate, f.from, f.to))
                .filter(d => !f.assetId || String(d.assetId) === String(f.assetId))
                .filter(d => !f.dept || (assetsById.get(String(d.assetId)) || {}).location === f.dept)
                .sort((x, y) => String(x.inspectionDate).localeCompare(String(y.inspectionDate)));
            if (!docs.length) return sheet(S, S.forms.pmRecord, scope([['ช่วงวันที่', rangeText(f.from, f.to)]]), `<div class="empty">ไม่มีบันทึกการตรวจเช็ค PM ในช่วงนี้</div>`, now);
            return docs.map(d => {
                const tpl = d.templateSnapshot || (ctx.pmTemplates || []).find(t => String(t.id) === String(d.templateId)) || { items: [] };
                const a = assetsById.get(String(d.assetId)) || { id: d.assetId, name: d.assetName };
                const show = (it, v) => {
                    if (v === undefined || v === null || v === '') return '-';
                    if (Array.isArray(v)) return v.map(esc).join(', ');
                    if (it.type === 'image' && isUrl(v)) return `<img src="${esc(v)}" style="max-width:40mm;max-height:30mm" alt="">`;
                    const cls = v === 'ปกติ' || v === 'ผ่าน' ? 'pass' : v === 'ไม่ปกติ' || v === 'ไม่ผ่าน' ? 'fail' : '';
                    return `<span class="${cls}">${esc(v)}${it.unit && it.type === 'number' ? ' ' + esc(it.unit) : ''}</span>`;
                };
                const rows = (tpl.items || []).map((it, i) => `<tr><td class="c">${i + 1}</td><td>${dash(it.label)}${it.required ? ' <span class="muted">*</span>' : ''}</td><td>${show(it, (d.responses || {})[it.id])}</td></tr>`).join('');
                const overallCls = d.overallStatus === 'ผ่าน' ? 'pass' : 'fail';
                return sheet(S, S.forms.pmRecord,
                    scope([['เลขที่บันทึก', d.id], ['แม่แบบ', d.templateName || tpl.name]]),
                    `<table class="kv">
                        <tr><td class="k">เครื่องจักร/อุปกรณ์</td><td>${esc(assetLabel(a))}</td></tr>
                        <tr><td class="k">แผนก</td><td>${dash(a.location)}</td></tr>
                        <tr><td class="k">วันที่ตรวจ</td><td>${thDate(d.inspectionDate)}</td></tr>
                        <tr><td class="k">ผู้ตรวจ</td><td>${dash(d.inspector)}</td></tr>
                    </table>
                    <table class="grid"><thead><tr><th style="width:7%">ลำดับ</th><th>รายการตรวจ</th><th style="width:38%">ผลการตรวจ</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="empty">ไม่มีรายการตรวจ</td></tr>`}</tbody></table>
                    <table class="kv" style="margin-top:10px">
                        <tr><td class="k">ผลการตรวจโดยรวม</td><td class="${overallCls}">${dash(d.overallStatus)}</td></tr>
                        <tr><td class="k">หมายเหตุ / การแก้ไข</td><td>${dash(d.notes)}</td></tr>
                    </table>`,
                    now, { sign: { prepared: d.inspector } });
            }).join('');
        },

        // FM-MT-06 ทะเบียนอะไหล่สำรอง
        spareParts(S, ctx, f, now) {
            const list = ctx.assets.filter(a => !f.dept || a.location === f.dept)
                .flatMap(a => (a.spareParts || []).map(s => ({ ...s, asset: a })));
            const rows = list.map((s, i) => {
                const low = Number(s.stock) < Number(s.minStock);
                return `<tr><td class="c">${i + 1}</td><td>${dash(s.name)}</td><td class="mono">${esc(s.asset.id)}</td><td>${dash(s.asset.name)}</td><td>${dash(s.vendor)}</td>
                    <td class="r">${money(s.price)}</td><td class="c">${num(s.stock)}</td><td class="c">${num(s.minStock)}</td><td class="c">${thDate(s.lastPurchaseDate)}</td>
                    <td class="c ${low ? 'fail' : 'pass'}">${low ? 'ต่ำกว่าจุดสั่งซื้อ' : 'ปกติ'}</td></tr>`;
            }).join('');
            return sheet(S, S.forms.spareParts,
                scope([['แผนก', f.dept || 'ทุกแผนก'], ['จำนวน', `${num(list.length)} รายการ`], ['ต่ำกว่าจุดสั่งซื้อ', `${num(list.filter(s => Number(s.stock) < Number(s.minStock)).length)} รายการ`], ['ข้อมูล ณ วันที่', thDate(now)]]),
                `<table class="grid"><thead><tr><th style="width:5%">ลำดับ</th><th>รายการอะไหล่</th><th style="width:13%">รหัสเครื่อง</th><th style="width:15%">ใช้กับเครื่อง</th><th style="width:12%">ผู้จำหน่าย</th><th style="width:9%">ราคา (บาท)</th><th style="width:7%">คงเหลือ</th><th style="width:7%">จุดสั่งซื้อ</th><th style="width:9%">ซื้อล่าสุด</th><th style="width:10%">สถานะ</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="10" class="empty">ไม่มีข้อมูลอะไหล่สำรอง</td></tr>`}</tbody></table>`,
                now, { landscape: true });
        }
    };

    // เปิดหน้าต่างก่อน (กันเบราว์เซอร์บล็อก popup) แล้วค่อยเขียนเอกสารเมื่อดึงข้อมูลเสร็จ
    const openWindow = () => {
        const w = window.open('', '_blank');
        if (!w) { alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up สำหรับเว็บนี้'); return null; }
        w.document.write(`<!doctype html><meta charset="utf-8"><title>กำลังสร้างเอกสาร...</title><body style="font-family:system-ui,sans-serif;padding:40px;color:#444">กำลังสร้างเอกสาร...</body>`);
        return w;
    };

    const render = (type, settings, ctx, filters = {}) => {
        const S = mergeSettings(settings);
        const build = builders[type];
        if (!build) throw new Error('ไม่รู้จักเอกสาร ' + type);
        const now = new Date();
        const form = S.forms[type];
        const body = build(S, ctx, filters, now);
        const footLeft = `"${(form.code + ' Rev.' + form.rev).replace(/["\\<>{};]/g, '')}"`;
        const fileTitle = `${form.code} ${form.title}${filters.assetId ? ' ' + filters.assetId : ''} ${now.toISOString().slice(0, 10)}`;
        return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(fileTitle)}</title>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
            <style>${css(footLeft, LANDSCAPE.includes(type))}</style></head><body>
            <div class="toolbar"><b>${esc(form.code)} · ${esc(form.title)}</b><span class="hint">เลือก "บันทึกเป็น PDF" ในหน้าพิมพ์เพื่อเก็บเป็นไฟล์</span><button onclick="window.print()">พิมพ์ / บันทึก PDF</button></div>
            ${body}</body></html>`;
    };

    const open = async (type, settings, loadCtx, filters) => {
        const w = openWindow();
        if (!w) return;
        try {
            const ctx = await loadCtx();
            const html = render(type, settings || ctx.settings, ctx, filters);
            w.document.open(); w.document.write(html); w.document.close();
        } catch (e) {
            w.document.body.textContent = 'สร้างเอกสารไม่สำเร็จ: ' + (e.message || e);
        }
    };

    window.MTADocs = { DEFAULT_SETTINGS, mergeSettings, render, open, types: Object.keys(DEFAULT_SETTINGS.forms) };
})();
