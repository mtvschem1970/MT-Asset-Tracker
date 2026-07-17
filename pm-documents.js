const PMDocumentsView = ({ data }) => {
  const { useState, useEffect } = React;
  const launchContext = window.pmLaunchContext || null;
  const blankItem = () => ({id:'ITEM-'+Date.now()+'-'+Math.random().toString(16).slice(2),label:'',type:'radio',options:['ปกติ','ไม่ปกติ','อื่นๆ'],unit:'',required:true});
  const blankTemplate = () => ({id:null,name:'',category:'ปั๊ม',description:'',items:[blankItem()]});
  const blankDocument = () => ({templateId:launchContext?.templateId||'',assetId:launchContext?.assetId||'',inspectionDate:new Date().toISOString().slice(0,10),inspector:'',overallStatus:'ผ่าน',notes:'',responses:{}});
  const [page,setPage] = useState(launchContext?'run':'templates');
  const [templates,setTemplates] = useState([]);
  const [documents,setDocuments] = useState([]);
  const [template,setTemplate] = useState(blankTemplate());
  const [documentForm,setDocumentForm] = useState(blankDocument());
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');

  const api = async (action,payload={}) => {
    const res = await fetch(window.MTA_API_URL,{method:'POST',body:JSON.stringify({action,...payload})});
    const json = await res.json();
    if(json.status==='error') throw new Error(json.message||'เกิดข้อผิดพลาด');
    return json;
  };
  const load = async () => {
    setBusy(true);
    try {
      const [t,d] = await Promise.all([api('get_pm_templates'),api('get_pm_documents')]);
      setTemplates(t.templates||[]); setDocuments(d.documents||[]);
    } catch(e) { setMessage(e.message); }
    setBusy(false);
  };
  useEffect(()=>{load();return()=>{window.pmLaunchContext=null;}},[]);

  const saveTemplate = async () => {
    if(!template.name.trim()) return alert('กรุณาระบุชื่อแม่แบบ');
    if(!template.items.length || template.items.some(x=>!x.label.trim())) return alert('กรุณาระบุชื่อหัวข้อตรวจทุกข้อ');
    setBusy(true);
    try { await api('save_pm_template',{template}); setMessage('บันทึกแม่แบบสำเร็จ'); setTemplate(blankTemplate()); setPage('templates'); await load(); }
    catch(e){setMessage(e.message);setBusy(false);}
  };
  const deleteTemplate = async id => {
    if(!confirm('ลบแม่แบบนี้? เอกสารเก่าจะยังคงอยู่')) return;
    setBusy(true); try{await api('delete_pm_template',{templateId:id});await load();}catch(e){setMessage(e.message);setBusy(false);}
  };
  const updateItem = (id,key,value) => setTemplate(t=>({...t,items:t.items.map(x=>x.id===id?{...x,[key]:value}:x)}));
  const selectedTemplate = templates.find(x=>String(x.id)===String(documentForm.templateId));
  const selectedAsset = data.assets.find(x=>String(x.id)===String(documentForm.assetId));
  const setResponse = (id,value) => setDocumentForm(f=>({...f,responses:{...f.responses,[id]:value}}));
  const imageToBase64 = file => new Promise((resolve,reject)=>{if(file.size>5*1024*1024)return reject(new Error('รูปต้องไม่เกิน 5MB'));const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  const saveDocument = async () => {
    if(!selectedTemplate||!selectedAsset||!documentForm.inspector.trim()) return alert('กรุณาเลือกแม่แบบ อุปกรณ์ และระบุผู้ตรวจ');
    const missing=selectedTemplate.items.find(x=>x.required&&(documentForm.responses[x.id]===undefined||documentForm.responses[x.id]===''));
    if(missing) return alert('กรุณากรอก: '+missing.label);
    const snapshot={...documentForm,id:'PMDOC-'+Date.now(),templateName:selectedTemplate.name,assetName:selectedAsset.name,templateSnapshot:selectedTemplate};
    setBusy(true);
    try{await api('save_pm_document',{document:snapshot});setMessage('บันทึกเอกสาร PM สำเร็จ');setDocumentForm(blankDocument());setPage('records');await load();}
    catch(e){setMessage(e.message);setBusy(false);}
  };

  const inputStyle={fontSize:12,color:'var(--text2)',fontWeight:700,display:'block',marginBottom:6};
  const Nav = () => <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:12,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
    {[['templates','แม่แบบ PM'],['builder','สร้างแม่แบบ'],['run','ทำรายการ PM'],['records','ประวัติเอกสาร']].map(([id,label])=><button key={id} className={page===id?'btn btn-primary':'btn btn-ghost'} style={{whiteSpace:'nowrap'}} onClick={()=>{setPage(id);if(id==='builder')setTemplate(blankTemplate());}}>{label}</button>)}
  </div>;

  return <div style={{height:'100%',overflowY:'auto',padding:24}} className="fade-up pb-nav">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:18,flexWrap:'wrap'}}><div><h2 style={{fontSize:22,fontWeight:800}}>ระบบเอกสาร PM</h2><p style={{fontSize:13,color:'var(--text2)',marginTop:4}}>สร้างแม่แบบ ตรวจเช็ก และนำกลับมาใช้กับอุปกรณ์หลายตัว</p></div>{busy&&<span className="badge badge-blue">กำลังบันทึก...</span>}</div>
    {message&&<div style={{padding:12,marginBottom:14,border:'1px solid var(--border)',background:'var(--surface)',borderRadius:7,display:'flex',justifyContent:'space-between'}}><span>{message}</span><button onClick={()=>setMessage('')}>×</button></div>}
    <Nav/>

    {page==='templates'&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:12}}>
      {!templates.length&&<div className="card-static" style={{padding:35,textAlign:'center',color:'var(--text3)'}}>ยังไม่มีแม่แบบ PM</div>}
      {templates.map(t=><div className="card" key={t.id} style={{padding:16}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><div><span className="badge badge-blue">{t.category}</span><div style={{fontWeight:800,fontSize:16,marginTop:8}}>{t.name}</div></div><span style={{fontSize:12,color:'var(--text3)'}}>{t.items?.length||0} ข้อ</span></div><p style={{fontSize:12,color:'var(--text2)',marginTop:8,minHeight:34}}>{t.description||'ไม่มีรายละเอียด'}</p><div style={{display:'flex',gap:6,marginTop:12}}><button className="btn btn-primary" style={{flex:1,justifyContent:'center'}} onClick={()=>{setDocumentForm({...blankDocument(),templateId:t.id});setPage('run');}}>นำไปใช้</button><button className="btn btn-ghost" onClick={()=>{setTemplate(JSON.parse(JSON.stringify(t)));setPage('builder');}}>แก้ไข</button><button className="btn btn-danger" onClick={()=>deleteTemplate(t.id)}>ลบ</button></div></div>)}
    </div>}

    {page==='builder'&&<div className="card-static" style={{padding:18,maxWidth:950,margin:'0 auto'}}>
      <div style={{fontWeight:800,fontSize:18,marginBottom:15}}>{template.id?'แก้ไขแม่แบบ PM':'สร้างแม่แบบ PM ใหม่'}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10}}><div><label style={inputStyle}>ชื่อแม่แบบ *</label><input className="inp" value={template.name} onChange={e=>setTemplate({...template,name:e.target.value})} placeholder="เช่น แบบตรวจปั๊มน้ำรายเดือน"/></div><div><label style={inputStyle}>ประเภทอุปกรณ์</label><input className="inp" value={template.category} onChange={e=>setTemplate({...template,category:e.target.value})} placeholder="ปั๊ม"/></div></div>
      <div style={{marginTop:10}}><label style={inputStyle}>รายละเอียด</label><textarea className="inp" rows="2" value={template.description} onChange={e=>setTemplate({...template,description:e.target.value})}/></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'20px 0 10px'}}><b>หัวข้อตรวจสอบ</b><button className="btn btn-ghost" onClick={()=>setTemplate(t=>({...t,items:[...t.items,blankItem()]}))}>+ เพิ่มหัวข้อ</button></div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>{template.items.map((it,index)=><div key={it.id} style={{padding:14,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7}}>
        <div style={{display:'grid',gridTemplateColumns:'40px minmax(180px,2fr) minmax(150px,1fr) minmax(100px,1fr)',gap:8,alignItems:'end'}} className="pm-builder-row"><b style={{paddingBottom:11}}>{index+1}</b><div><label style={inputStyle}>รายการตรวจ *</label><input className="inp" value={it.label} onChange={e=>updateItem(it.id,'label',e.target.value)} placeholder="เช่น เสียงมอเตอร์"/></div><div><label style={inputStyle}>รูปแบบคำตอบ</label><select className="inp" value={it.type} onChange={e=>updateItem(it.id,'type',e.target.value)}><option value="radio">เลือกหนึ่งคำตอบ</option><option value="checkbox">เลือกหลายคำตอบ</option><option value="passfail">ผ่าน / ไม่ผ่าน</option><option value="text">ข้อความ</option><option value="number">ตัวเลข</option><option value="image">รูปภาพ</option></select></div><div><label style={inputStyle}>หน่วย</label><input className="inp" value={it.unit||''} onChange={e=>updateItem(it.id,'unit',e.target.value)} placeholder="A, °C, bar"/></div></div>
        {['radio','checkbox'].includes(it.type)&&<div style={{marginTop:8}}><label style={inputStyle}>ตัวเลือก (คั่นด้วยเครื่องหมาย ,)</label><input className="inp" value={(it.options||[]).join(', ')} onChange={e=>updateItem(it.id,'options',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}/></div>}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}><label style={{fontSize:12}}><input type="checkbox" checked={it.required} onChange={e=>updateItem(it.id,'required',e.target.checked)}/> จำเป็นต้องตอบ</label><button className="btn btn-danger" style={{padding:'5px 9px'}} onClick={()=>setTemplate(t=>({...t,items:t.items.filter(x=>x.id!==it.id)}))}>ลบหัวข้อ</button></div>
      </div>)}</div>
      <button className="btn btn-primary" style={{marginTop:16,width:'100%',justifyContent:'center'}} onClick={saveTemplate} disabled={busy}>บันทึกแม่แบบ PM</button>
    </div>}

    {page==='run'&&<div className="card-static" style={{padding:18,maxWidth:950,margin:'0 auto'}}>
      <div style={{fontWeight:800,fontSize:18,marginBottom:15}}>บันทึกผลการตรวจ PM</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}><div><label style={inputStyle}>แม่แบบ PM *</label><select className="inp" value={documentForm.templateId} disabled={!!launchContext?.templateId} onChange={e=>setDocumentForm({...blankDocument(),templateId:e.target.value})}><option value="">-- เลือกแม่แบบ --</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><label style={inputStyle}>อุปกรณ์ *</label>{launchContext?.assetId?<div className="inp" style={{background:'var(--surface2)',fontWeight:700}}>{selectedAsset?.name||launchContext.assetId} ({launchContext.assetId})</div>:<select className="inp" value={documentForm.assetId} onChange={e=>setDocumentForm({...documentForm,assetId:e.target.value})}><option value="">-- เลือกอุปกรณ์ --</option>{data.assets.map(a=><option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}</select>}</div><div><label style={inputStyle}>วันที่ตรวจ</label><input type="date" className="inp" value={documentForm.inspectionDate} onChange={e=>setDocumentForm({...documentForm,inspectionDate:e.target.value})}/></div><div><label style={inputStyle}>ผู้ตรวจ *</label><input className="inp" value={documentForm.inspector} onChange={e=>setDocumentForm({...documentForm,inspector:e.target.value})}/></div></div>
      {selectedTemplate&&<div style={{marginTop:18,display:'flex',flexDirection:'column',gap:10}}>{selectedTemplate.items.map((it,index)=><div key={it.id} style={{padding:14,border:'1px solid var(--border)',borderRadius:7}}><div style={{fontWeight:700,marginBottom:8}}>{index+1}. {it.label} {it.required&&<span style={{color:'var(--red)'}}>*</span>}</div>
        {it.type==='radio'&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{it.options.map(o=><label key={o} className="btn btn-ghost"><input type="radio" name={it.id} checked={documentForm.responses[it.id]===o} onChange={()=>setResponse(it.id,o)}/>{o}</label>)}</div>}
        {it.type==='checkbox'&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{it.options.map(o=>{const arr=documentForm.responses[it.id]||[];return <label key={o} className="btn btn-ghost"><input type="checkbox" checked={arr.includes(o)} onChange={e=>setResponse(it.id,e.target.checked?[...arr,o]:arr.filter(x=>x!==o))}/>{o}</label>})}</div>}
        {it.type==='passfail'&&<select className="inp" value={documentForm.responses[it.id]||''} onChange={e=>setResponse(it.id,e.target.value)}><option value="">-- เลือก --</option><option>ผ่าน</option><option>ไม่ผ่าน</option><option>ไม่เกี่ยวข้อง</option></select>}
        {it.type==='text'&&<textarea className="inp" rows="2" value={documentForm.responses[it.id]||''} onChange={e=>setResponse(it.id,e.target.value)}/>} {it.type==='number'&&<div style={{display:'flex',alignItems:'center',gap:8}}><input type="number" className="inp" value={documentForm.responses[it.id]||''} onChange={e=>setResponse(it.id,e.target.value)}/><b>{it.unit}</b></div>}
        {it.type==='image'&&<label className="btn btn-ghost" style={{cursor:'pointer'}}>{documentForm.responses[it.id]?'✓ เลือกรูปแล้ว':'เลือกรูปภาพ'}<input type="file" accept="image/*" style={{display:'none'}} onChange={async e=>{try{setResponse(it.id,await imageToBase64(e.target.files[0]));}catch(err){alert(err.message)}}}/></label>}
      </div>)}</div>}
      {selectedTemplate&&<><div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10,marginTop:14}} className="pm-result-footer"><div><label style={inputStyle}>ผลโดยรวม</label><select className="inp" value={documentForm.overallStatus} onChange={e=>setDocumentForm({...documentForm,overallStatus:e.target.value})}><option>ผ่าน</option><option>ไม่ผ่าน</option><option>ต้องติดตาม</option></select></div><div><label style={inputStyle}>หมายเหตุ</label><textarea className="inp" rows="2" value={documentForm.notes} onChange={e=>setDocumentForm({...documentForm,notes:e.target.value})}/></div></div><button className="btn btn-primary" style={{marginTop:14,width:'100%',justifyContent:'center'}} onClick={saveDocument} disabled={busy}>บันทึกเอกสาร PM</button></>}
    </div>}

    {page==='records'&&<div style={{display:'flex',flexDirection:'column',gap:8}}>{!documents.length&&<div className="card-static" style={{padding:35,textAlign:'center',color:'var(--text3)'}}>ยังไม่มีเอกสาร PM</div>}{documents.map(d=><div key={d.id} className="card" style={{padding:14,display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><div style={{fontWeight:800}}>{d.templateName}</div><div style={{fontSize:12,color:'var(--text2)',marginTop:4}}>{d.assetName} ({d.assetId}) · ผู้ตรวจ {d.inspector}</div><div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>{d.inspectionDate}</div></div><span className={`badge ${d.overallStatus==='ผ่าน'?'badge-green':d.overallStatus==='ไม่ผ่าน'?'badge-red':'badge-orange'}`}>{d.overallStatus}</span></div>)}</div>}
  </div>;
};
window.PMDocumentsView = PMDocumentsView;

const AssetPMTemplatesPanel = ({ asset, onLaunch }) => {
  const {useState,useEffect}=React;
  const [templates,setTemplates]=useState([]),[selected,setSelected]=useState([]),[busy,setBusy]=useState(true),[msg,setMsg]=useState('');
  const api=async(action,payload={})=>{const r=await fetch(window.MTA_API_URL,{method:'POST',body:JSON.stringify({action,...payload})});const j=await r.json();if(j.status==='error')throw new Error(j.message||'เกิดข้อผิดพลาด');return j;};
  const load=async()=>{setBusy(true);try{const [t,a]=await Promise.all([api('get_pm_templates'),api('get_asset_pm_templates',{assetId:asset.id})]);setTemplates(t.templates||[]);setSelected((a.templateIds||[]).map(String));}catch(e){setMsg(e.message)}setBusy(false);};
  useEffect(()=>{load();},[asset.id]);
  const toggle=id=>setSelected(s=>s.includes(String(id))?s.filter(x=>x!==String(id)):[...s,String(id)]);
  const save=async()=>{setBusy(true);try{await api('save_asset_pm_templates',{assetId:asset.id,templateIds:selected});setMsg('บันทึกแม่แบบสำหรับอุปกรณ์นี้แล้ว');}catch(e){setMsg(e.message)}setBusy(false);};
  const allowed=templates.filter(t=>selected.includes(String(t.id)));
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:14,flexWrap:'wrap'}}><div><div style={{fontWeight:800,fontSize:17}}>แม่แบบ PM ของอุปกรณ์</div><div style={{fontSize:12,color:'var(--text3)',marginTop:3}}>เลือกแม่แบบที่อนุญาตให้ใช้กับ {asset.name}</div></div><button className="btn btn-primary" onClick={save} disabled={busy}>บันทึกการตั้งค่า</button></div>
    {msg&&<div style={{padding:10,borderRadius:7,background:'var(--surface2)',marginBottom:12}}>{msg}</div>}
    {busy&&!templates.length?<div style={{padding:30,textAlign:'center',color:'var(--text3)'}}>กำลังโหลด...</div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8}}>{templates.map(t=><label key={t.id} className="card" style={{padding:13,cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start',borderColor:selected.includes(String(t.id))?'var(--accent)':'var(--border)'}}><input type="checkbox" checked={selected.includes(String(t.id))} onChange={()=>toggle(t.id)} style={{marginTop:4}}/><div><div style={{fontWeight:700}}>{t.name}</div><div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>{t.category} · {t.items?.length||0} หัวข้อตรวจ</div></div></label>)}</div>}
    <div style={{borderTop:'1px solid var(--border)',marginTop:18,paddingTop:16}}><div style={{fontWeight:800,marginBottom:10}}>เริ่มตรวจ PM จากแม่แบบที่เลือกไว้</div>{!allowed.length?<div style={{color:'var(--text3)',fontSize:13}}>ยังไม่ได้เลือกแม่แบบสำหรับอุปกรณ์นี้</div>:<div style={{display:'flex',flexDirection:'column',gap:7}}>{allowed.map(t=><div key={t.id} className="card" style={{padding:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><div><div style={{fontWeight:700}}>{t.name}</div><div style={{fontSize:11,color:'var(--text3)'}}>{t.items?.length||0} รายการตรวจ</div></div><button className="btn btn-primary" onClick={()=>onLaunch(t.id)}>เริ่มตรวจ PM</button></div>)}</div>}</div>
  </div>;
};
window.AssetPMTemplatesPanel=AssetPMTemplatesPanel;
