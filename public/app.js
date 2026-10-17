'use strict';

/* ─────────────────────────────────────────
   CONFIG
───────────────────────────────────────── */
const AM_BASE  = 'https://am.neonode.my.id/api';
const GM_API   = 'https://api.guerrillamail.com/ajax.php';
const GM_DOMS  = ['guerrillamail.com','guerrillamail.net','guerrillamail.org',
                  'guerrillamail.de','grr.la','sharklasers.com','spam4.me'];
const AM_HDR   = {'Accept':'application/json,text/plain,*/*','Content-Type':'application/json',
                  'User-Agent':'Mozilla/5.0'};
const SESS_KEY = 'am_user'; // { token, email, premium, premium_until }

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let ownEmail = '';
let bRunning = false, bStop = false, bRes = [];

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const sess = getSession();
  if (sess) {
    showApp(sess);
  }
  loadDomains();
  document.getElementById('o-email')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') ownSend(); });
});

/* ─────────────────────────────────────────
   SESSION
───────────────────────────────────────── */
function getSession() {
  try {
    const raw = localStorage.getItem(SESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

function saveSession(data) {
  localStorage.setItem(SESS_KEY, JSON.stringify(data));
}

function clearSessionData() {
  localStorage.removeItem(SESS_KEY);
}

/* ─────────────────────────────────────────
   AUTH — SWITCH TAB
───────────────────────────────────────── */
window.switchAuth = mode => {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', ['login','register'][i] === mode));
  document.getElementById('form-login').style.display    = mode === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = mode === 'register' ? 'block' : 'none';
};

/* ─────────────────────────────────────────
   AUTH — LOGIN
───────────────────────────────────────── */
window.doLogin = async () => {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  if (!email || !pass) return toast('l-toast','error','⚠️','Email dan password wajib diisi');

  setLoad('l-btn','l-sp',true); clearToast('l-toast');
  try {
    const r = await post('/api/auth/login', { email, password: pass });
    saveSession({
      token:         r.token,
      email:         r.user.email,
      premium:       r.user.premium,
      premium_until: r.user.premium_until,
    });
    showApp(getSession());
  } catch(e) {
    toast('l-toast','error','❌', e.message);
  } finally { setLoad('l-btn','l-sp',false); }
};

/* ─────────────────────────────────────────
   AUTH — REGISTER
───────────────────────────────────────── */
window.doRegister = async () => {
  const email = document.getElementById('r-email').value.trim();
  const pass  = document.getElementById('r-pass').value;
  const pass2 = document.getElementById('r-pass2').value;

  if (!email || !pass) return toast('r-toast','error','⚠️','Email dan password wajib diisi');
  if (pass.length < 6) return toast('r-toast','error','⚠️','Password minimal 6 karakter');
  if (pass !== pass2)  return toast('r-toast','error','⚠️','Konfirmasi password tidak cocok');

  setLoad('r-btn','r-sp',true); clearToast('r-toast');
  try {
    const r = await post('/api/auth/register', { email, password: pass });
    toast('r-toast','success','✅', r.message || 'Cek email untuk verifikasi.');
    document.getElementById('r-email').value = '';
    document.getElementById('r-pass').value  = '';
    document.getElementById('r-pass2').value = '';
  } catch(e) {
    toast('r-toast','error','❌', e.message);
  } finally { setLoad('r-btn','r-sp',false); }
};

/* ─────────────────────────────────────────
   AUTH — LOGOUT
───────────────────────────────────────── */
window.doLogout = () => {
  clearSessionData();
  document.getElementById('app-screen').style.display  = 'none';
  document.getElementById('auth-screen').style.display = 'block';
};

/* ─────────────────────────────────────────
   SHOW APP
───────────────────────────────────────── */
function showApp(sess) {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'block';
  document.getElementById('user-email-disp').textContent = sess.email;

  const premiumActive = sess.premium && sess.premium_until &&
    new Date(sess.premium_until) > new Date();

  if (premiumActive) {
    document.getElementById('activate-section').style.display = 'none';
    document.getElementById('premium-section').style.display  = 'block';
    const exp = new Date(sess.premium_until);
    document.getElementById('prem-until').textContent =
      exp.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  } else {
    document.getElementById('activate-section').style.display = 'block';
    document.getElementById('premium-section').style.display  = 'none';
  }
}

/* ─────────────────────────────────────────
   ACTIVATE CODE
───────────────────────────────────────── */
window.fmtCode = input => {
  let v = input.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,16);
  let o = '';
  for (let i=0;i<v.length;i++) { if(i>0&&i%4===0) o+='-'; o+=v[i]; }
  input.value = o;
};

window.doActivate = async () => {
  const code = document.getElementById('act-code').value.trim();
  if (!code) return toast('act-toast','error','⚠️','Masukkan kode aktivasi');

  setLoad('act-btn','act-sp',true); clearToast('act-toast');
  const sess = getSession();
  try {
    const r = await authPost('/api/activate', { code }, sess.token);
    toast('act-toast','success','✅', r.message);

    // Update session with premium info
    const updated = { ...sess, premium: true, premium_until: r.expires_at };
    saveSession(updated);

    // Wait a moment then show premium UI
    setTimeout(() => showApp(updated), 1500);
  } catch(e) {
    toast('act-toast','error','❌', e.message);
  } finally { setLoad('act-btn','act-sp',false); }
};

/* ─────────────────────────────────────────
   DOMAINS
───────────────────────────────────────── */
async function loadDomains() {
  let doms = GM_DOMS;
  try {
    const r = await fetch(`${GM_API}?f=get_email_address&lang=en`,
      { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    if (d?.email_addr) {
      const dom = d.email_addr.split('@')[1];
      if (dom && !doms.includes(dom)) doms = [dom, ...doms];
    }
  } catch(_) {}
  const sel = document.getElementById('b-domain');
  if (sel) sel.innerHTML = doms.map(d=>`<option value="${d}">${d}</option>`).join('');
}

/* ─────────────────────────────────────────
   MODE TABS
───────────────────────────────────────── */
window.switchMode = m => {
  document.querySelectorAll('.mode-tab').forEach((t,i)=>
    t.classList.toggle('active',['own','temp'][i]===m));
  ['mode-own','mode-temp'].forEach(id=>
    document.getElementById(id).classList.remove('active'));
  document.getElementById('mode-'+m).classList.add('active');
};

/* ─────────────────────────────────────────
   MODE 1 — EMAIL SENDIRI
───────────────────────────────────────── */
window.ownSend = async () => {
  const email = document.getElementById('o-email').value.trim();
  if (!email) return toast('o-t1','error','⚠️','Email wajib diisi');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return toast('o-t1','error','⚠️','Format email tidak valid');

  setLoad('o-btn1','o-sp1',true); clearToast('o-t1');
  try {
    const r = await fetch(`${AM_BASE}/send-link`,
      {method:'POST',headers:AM_HDR,body:JSON.stringify({email})});
    const d = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(d?.message||d?.error||`Error ${r.status}`);
    ownEmail = email;
    document.getElementById('o-email-ro').value = email;
    setStep('o',2); showPanel('op',2);
  } catch(e) { toast('o-t1','error','❌',e.message);
  } finally { setLoad('o-btn1','o-sp1',false); }
};

window.ownVerify = async () => {
  const link = document.getElementById('o-link').value.trim();
  if (!link) return toast('o-t2','error','⚠️','Magic link wajib diisi');
  if (!link.startsWith('http')) return toast('o-t2','error','⚠️','Link harus diawali https://');

  setLoad('o-btn2','o-sp2',true); clearToast('o-t2');
  try {
    const r = await fetch(`${AM_BASE}/verify-link`,
      {method:'POST',headers:AM_HDR,body:JSON.stringify({email:ownEmail,magicLink:link})});
    const d = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(d?.message||d?.error||`Error ${r.status}`);
    renderResult('o-result', d);
    setStep('o',3); showPanel('op',3);
  } catch(e) { toast('o-t2','error','❌',e.message);
  } finally { setLoad('o-btn2','o-sp2',false); }
};

window.ownBack  = () => { clearToast('o-t2'); document.getElementById('o-link').value=''; setStep('o',1); showPanel('op',1); };
window.ownReset = () => {
  ownEmail='';
  ['o-email','o-email-ro','o-link'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('o-result').innerHTML='';
  clearToast('o-t1'); clearToast('o-t2');
  setStep('o',1); showPanel('op',1);
};

/* ─────────────────────────────────────────
   MODE 2 — TEMP EMAIL BULK
───────────────────────────────────────── */
const rand  = (n=8) => { const c='abcdefghijklmnopqrstuvwxyz0123456789'; return Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join(''); };
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function findLinks(text) {
  const pats = [
    /https?:\/\/[^\s"'<>]+alightcreative[^\s"'<>]*/gi,
    /https?:\/\/[^\s"'<>]*firebaseapp[^\s"'<>]*mode=signIn[^\s"'<>]*/gi,
    /https?:\/\/alightmotion[^\s"'<>]*/gi,
  ];
  return [...new Set(pats.flatMap(p=>[...(text||'').matchAll(p)].map(m=>m[0].replace(/['"\\>]+$/,''))))];
}

async function gmGetInbox(email) {
  try {
    const [user,domain] = email.split('@');
    await fetch(`${GM_API}?f=set_email_user&email_user=${encodeURIComponent(user)}&lang=en&site=${encodeURIComponent(domain)}`,
      {signal:AbortSignal.timeout(8000)});
    const r = await fetch(`${GM_API}?f=get_email_list&offset=0&seq=0`,
      {signal:AbortSignal.timeout(8000)});
    const d   = await r.json();
    const txt = (d?.list||[]).map(m=>(m.mail_excerpt||'')+(m.mail_body||'')).join(' ');
    return { links: findLinks(txt) };
  } catch(_) { return {links:[]}; }
}

function logRow(n,email,status,cls) {
  const log=document.getElementById('b-log');
  const ex =log.querySelector(`[data-r="${n}"]`);
  if(ex){ ex.querySelector('.log-status').className=`log-status ${cls}`; ex.querySelector('.log-status').textContent=status; return; }
  const row=document.createElement('div');
  row.className='log-row'; row.dataset.r=n;
  row.innerHTML=`<span class="log-num">#${n}</span><span class="log-email" title="${email}">${email}</span><span class="log-status ${cls}">${status}</span>`;
  log.appendChild(row); log.scrollTop=log.scrollHeight;
}

function updProg(done,total,ok,fail) {
  document.getElementById('b-bar').style.width    = `${(done/total)*100}%`;
  document.getElementById('b-stat-l').textContent = `${done} / ${total}`;
  document.getElementById('b-stat-r').textContent = `✅ ${ok} · ❌ ${fail}`;
}

window.bulkStart = async () => {
  if (bRunning) return;
  const count = Math.min(50,Math.max(1,parseInt(document.getElementById('b-count').value)||5));
  const dom   = document.getElementById('b-domain').value;
  const delay = parseInt(document.getElementById('b-delay').value)||8000;
  if (!dom) return toast('b-t','error','⚠️','Pilih domain dulu');

  bRunning=true; bStop=false; bRes=[];
  document.getElementById('b-btn-start').style.display='none';
  document.getElementById('b-btn-stop').style.display ='flex';
  document.getElementById('b-prog').style.display     ='block';
  document.getElementById('b-export').style.display   ='none';
  document.getElementById('b-log').innerHTML           ='';
  clearToast('b-t'); updProg(0,count,0,0);

  let ok=0, fail=0;

  for (let i=1;i<=count;i++) {
    if (bStop) { toast('b-t','warn','⏹','Bulk dihentikan.'); break; }

    const email = `${rand(8)}@${dom}`;
    logRow(i,email,'Mengirim link...','running'); updProg(i-1,count,ok,fail);

    let sent=false;
    try {
      const r = await fetch(`${AM_BASE}/send-link`,
        {method:'POST',headers:AM_HDR,body:JSON.stringify({email})});
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d?.message||`Error ${r.status}`);
      logRow(i,email,'Polling inbox...','wait'); sent=true;
    } catch(e) {
      logRow(i,email,`Send gagal: ${e.message}`,'fail');
      bRes.push({no:i,email,status:'send_failed',detail:e.message});
      fail++; updProg(i,count,ok,fail); continue;
    }

    if (sent) {
      let mlink=null;
      for (let p=0;p<4;p++) {
        if (bStop) break;
        await sleep(p===0?12000:15000);
        logRow(i,email,`Polling (${p+1}/4)...`,'wait');
        const {links} = await gmGetInbox(email);
        if (links.length) { mlink=links[0]; break; }
      }

      if (!mlink) {
        logRow(i,email,'Link tidak ditemukan','fail');
        bRes.push({no:i,email,status:'no_link',detail:'inbox timeout'});
        fail++; updProg(i,count,ok,fail);
      } else {
        try {
          const r = await fetch(`${AM_BASE}/verify-link`,
            {method:'POST',headers:AM_HDR,body:JSON.stringify({email,magicLink:mlink})});
          const d = await r.json().catch(()=>({}));
          if (!r.ok) throw new Error(d?.message||`Error ${r.status}`);
          logRow(i,email,'✅ Berhasil!','ok');
          bRes.push({no:i,email,status:'success',detail:JSON.stringify(d)});
          ok++; updProg(i,count,ok,fail);
        } catch(e) {
          logRow(i,email,`Verify gagal: ${e.message}`,'fail');
          bRes.push({no:i,email,status:'verify_failed',detail:e.message});
          fail++; updProg(i,count,ok,fail);
        }
      }
    }

    if (i<count&&!bStop) await sleep(delay);
  }

  bRunning=false;
  document.getElementById('b-btn-start').style.display='flex';
  document.getElementById('b-btn-stop').style.display ='none';
  document.getElementById('b-export').style.display   ='flex';

  const rOk=bRes.filter(r=>r.status==='success').length;
  toast('b-t',rOk>0?'success':'error',rOk>0?'✅':'❌',
    `Selesai! ${rOk} berhasil, ${bRes.length-rOk} gagal.`);
};

window.bulkStop  = () => { bStop=true; document.getElementById('b-btn-stop').disabled=true; };
window.bulkReset = () => {
  bRes=[]; bRunning=false; bStop=false;
  document.getElementById('b-log').innerHTML          ='';
  document.getElementById('b-prog').style.display     ='none';
  document.getElementById('b-export').style.display   ='none';
  document.getElementById('b-btn-stop').style.display ='none';
  document.getElementById('b-btn-start').style.display='flex';
  document.getElementById('b-btn-stop').disabled      =false;
  clearToast('b-t'); updProg(0,1,0,0);
};
window.bulkExport = () => {
  if (!bRes.length) return;
  const csv='No,Email,Status,Detail\n'+bRes.map(r=>
    `${r.no},"${r.email}","${r.status}","${r.detail.replace(/"/g,"'")}"`).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=`bulk_${Date.now()}.csv`; a.click();
};

/* ─────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────── */
function setLoad(bid,sid,v) {
  const b=document.getElementById(bid),s=document.getElementById(sid);
  b.disabled=v; v?b.classList.add('loading'):b.classList.remove('loading');
}
function toast(id,type,icon,msg) {
  const el=document.getElementById(id);
  el.className=`toast ${type} show`;
  el.querySelector('.toast-icon').textContent=icon;
  el.querySelector('.toast-msg').textContent =msg;
}
function clearToast(id) { document.getElementById(id).className='toast'; }
function setStep(p,n,t=3) {
  for(let i=1;i<=t;i++){
    const s=document.getElementById(`${p}s${i}`); if(!s)continue;
    s.classList.remove('active','done');
    if(i<n)s.classList.add('done'); if(i===n)s.classList.add('active');
  }
  for(let i=1;i<t;i++){
    const l=document.getElementById(`${p}sl${i}`);
    if(l)l.classList.toggle('done',i<n);
  }
}
function showPanel(pfx,n,t=3) {
  for(let i=1;i<=t;i++){
    const p=document.getElementById(`${pfx}${i}`);
    if(p)p.classList.toggle('active',i===n);
  }
}
function renderResult(cid,data) {
  const box=document.getElementById(cid);
  box.innerHTML='<div class="result-label">RESPONSE DATA</div>';
  const flat=(obj,pfx='')=>{
    for(const [k,v] of Object.entries(obj)){
      const key=pfx?`${pfx}.${k}`:k;
      if(v&&typeof v==='object'&&!Array.isArray(v)){flat(v,key);continue;}
      const val=Array.isArray(v)?JSON.stringify(v):String(v??'-');
      const isOk=['true','1','ok','success','premium','active'].some(x=>val.toLowerCase().includes(x));
      const isBad=['false','0','error','fail'].includes(val.toLowerCase());
      const row=document.createElement('div'); row.className='result-row';
      row.innerHTML=`<span class="result-key">${key}</span><span class="result-val ${isOk?'ok':isBad?'fail':''}">${val}</span>`;
      box.appendChild(row);
    }
  };
  if(typeof data==='object'&&data) flat(data);
}
window.toggleFaq = btn => {
  const item=btn.closest('.faq-item'),isOpen=item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(el=>el.classList.remove('open'));
  if(!isOpen)item.classList.add('open');
};

/* ─────────────────────────────────────────
   HTTP HELPERS
───────────────────────────────────────── */
async function post(url,body) {
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
async function authPost(url,body,token) {
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
