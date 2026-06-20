// ════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════
const AUTH = './auth.php';
const API  = './save.php';
let csrfToken = '';
let currentUser = '';
let failedAttempts = 0;
let lockTimer = null;
let htmlContent = '';
let landingUsers = [];

// ════════════════════════════════════════════════
// CAPTCHA
// ════════════════════════════════════════════════
let captchaAnswer = 0;
function newCaptcha() {
  const a = Math.floor(Math.random()*10)+1;
  const b = Math.floor(Math.random()*10)+1;
  captchaAnswer = a + b;
  document.getElementById('captcha-q').textContent = `${a} + ${b} = ?`;
  document.getElementById('captcha-ans').value = '';
}

// ════════════════════════════════════════════════
// AUTH API
// ════════════════════════════════════════════════
async function authCall(action, body={}) {
  if (action === 'login' && !csrfToken) await getCsrf();

  const r = await fetch(`${AUTH}?action=${action}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({action, csrf: csrfToken, ...body})
  });

  if (r.status === 403 && action === 'login') {
    await getCsrf();
    const retry = await fetch(`${AUTH}?action=${action}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({action, csrf: csrfToken, ...body})
    });
    return retry.json();
  }

  return r.json();
}

// ════════════════════════════════════════════════
// CSRF
// ════════════════════════════════════════════════
async function getCsrf() {
  try {
    const r = await fetch(`${AUTH}?action=get_csrf&t=${Date.now()}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({action:'get_csrf'})
    });
    const d = await r.json();
    if (d.ok) csrfToken = d.csrf;
  } catch { /* PHP نیست */ }
}

// ════════════════════════════════════════════════
// PASSWORD VISIBILITY
// ════════════════════════════════════════════════
function togglePass(inputId, iconEl) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  const icon = typeof iconEl === 'string' ? document.getElementById(iconEl) : iconEl;
  if (icon) icon.textContent = inp.type === 'password' ? '👁' : '🙈';
}

// ════════════════════════════════════════════════
// PASSWORD STRENGTH
// ════════════════════════════════════════════════
function checkStrength(pass, prefix='') {
  const rules = [
    { id: 'rule-len',     ok: pass.length >= 8,                    label: '○ ۸ کاراکتر' },
    { id: 'rule-upper',   ok: /[A-Z]/.test(pass),                  label: '○ حرف بزرگ' },
    { id: 'rule-num',     ok: /[0-9]/.test(pass),                   label: '○ عدد' },
    { id: 'rule-special', ok: /[^a-zA-Z0-9]/.test(pass),            label: '○ کاراکتر خاص' },
  ];
  let score = rules.filter(r=>r.ok).length;
  // update rule indicators (only on mandatory change screen)
  rules.forEach(r => {
    const el = document.getElementById(r.id);
    if (el) el.className = 'rule' + (r.ok ? ' ok' : '');
    if (el) el.textContent = (r.ok ? '✓ ' : '○ ') + el.textContent.replace(/^[✓○] /,'');
  });
  // strength bar
  const barId = prefix + 'str-bar';
  const lblId = prefix + 'str-lbl';
  const bar = document.getElementById(barId);
  const lbl = document.getElementById(lblId);
  if (!bar) return;
  const colors = ['var(--red)','var(--orange)','var(--orange)','var(--gold)','var(--accent)'];
  const labels = ['','خیلی ضعیف','ضعیف','متوسط','قوی','خیلی قوی'];
  bar.querySelectorAll('div').forEach((d,i) => d.style.background = i < score ? colors[score-1] : 'var(--dark-3)');
  if (lbl) { lbl.textContent = labels[score]; lbl.style.color = colors[score-1]||'var(--muted)'; }
}

// ════════════════════════════════════════════════
// ATTEMPT DOTS
// ════════════════════════════════════════════════
function updateDots(used) {
  const el = document.getElementById('attempt-dots');
  el.innerHTML = Array.from({length:5},(_, i) => {
    const cls = i < used ? (used >= 4 ? 'used' : 'warn') : '';
    return `<div class="attempt-dot ${cls}"></div>`;
  }).join('');
}

// ════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════
async function doLogin() {
  const username = document.getElementById('inp-user').value.trim();
  const password = document.getElementById('inp-pass').value;
  const loginBtn = document.getElementById('login-btn');
  const btnText  = document.getElementById('login-btn-text');

  hideMsg('login-err'); hideMsg('login-warn');

  if (!username || !password) {
    showMsg('login-err', 'نام کاربری و رمز عبور را وارد کنید');
    return;
  }

  // بررسی کپچا اگر نمایش داده شده
  const captchaWrap = document.getElementById('captcha-wrap');
  if (captchaWrap.style.display !== 'none') {
    const ans = parseInt(document.getElementById('captcha-ans').value);
    if (ans !== captchaAnswer) {
      showMsg('login-err', 'پاسخ کپچا اشتباه است');
      newCaptcha();
      return;
    }
  }

  loginBtn.disabled = true;
  btnText.innerHTML = '<div class="spin"></div>';

  try {
    const r = await authCall('login', {username, password});

    if (r.ok) {
      currentUser = r.username;
      failedAttempts = 0;
      updateDots(0);
      document.getElementById('captcha-wrap').style.display = 'none';

      if (r.must_change_pass) {
        showScreen('screen-change-pass');
      } else {
        enterApp();
      }
    } else if (r.locked) {
      showMsg('login-err', r.msg);
      startLockTimer(r.remaining || 15);
      loginBtn.disabled = true;
    } else {
      failedAttempts++;
      updateDots(failedAttempts);
      showMsg('login-err', r.msg);
      document.getElementById('inp-pass').value = '';
      document.getElementById('inp-pass').classList.add('err-input');
      setTimeout(() => document.getElementById('inp-pass').classList.remove('err-input'), 800);
      if (failedAttempts >= 3) {
        document.getElementById('captcha-wrap').style.display = 'flex';
        newCaptcha();
      }
      loginBtn.disabled = false;
      btnText.textContent = 'ورود';
    }
  } catch {
    // حالت local (بدون PHP)
    if (username === 'admin' && password === 'Mazdex@1404') {
      currentUser = 'admin';
      localStorage.setItem('mx_local_mode','1');
      enterApp();
    } else if (localStorage.getItem('mx_local_mode')) {
      showMsg('login-err', 'رمز اشتباه است');
      failedAttempts++;
      updateDots(failedAttempts);
    } else {
      showMsg('login-warn', 'فایل auth.php یافت نشد — حالت محلی فعال (رمز: Mazdex@1404)');
    }
    loginBtn.disabled = false;
    btnText.textContent = 'ورود';
  }
}

function startLockTimer(minutes) {
  let secs = minutes * 60;
  const cdEl = document.getElementById('lock-countdown');
  cdEl.style.display = 'block';
  if (lockTimer) clearInterval(lockTimer);
  lockTimer = setInterval(() => {
    secs--;
    const m = Math.floor(secs/60), s = secs%60;
    cdEl.textContent = `⏱ ${m}:${String(s).padStart(2,'0')} مانده`;
    if (secs <= 0) {
      clearInterval(lockTimer);
      cdEl.style.display = 'none';
      hideMsg('login-err');
      document.getElementById('login-btn').disabled = false;
      document.getElementById('login-btn-text').textContent = 'ورود';
      failedAttempts = 0;
      updateDots(0);
    }
  }, 1000);
}

// ════════════════════════════════════════════════
// CHANGE PASSWORD (اجباری)
// ════════════════════════════════════════════════
async function doChangePass() {
  const current = document.getElementById('cp-current').value;
  const newP    = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  hideMsg('cp-err'); hideMsg('cp-ok');

  if (newP !== confirm) { showMsg('cp-err','رمز جدید و تکرار آن یکسان نیستند'); return; }

  try {
    const r = await authCall('change_password', {current_password:current, new_password:newP, confirm_password:confirm});
    if (r.ok) {
      showMsg('cp-ok','رمز عبور تغییر کرد! در حال ورود...');
      setTimeout(enterApp, 1200);
    } else {
      showMsg('cp-err', r.msg);
    }
  } catch {
    // local mode
    if (current === 'Mazdex@1404') {
      localStorage.setItem('mx_admin_pass', newP);
      showMsg('cp-ok','رمز تغییر کرد (local)');
      setTimeout(enterApp, 1200);
    } else {
      showMsg('cp-err','رمز فعلی اشتباه است');
    }
  }
}

// ════════════════════════════════════════════════
// CHANGE PASS MODAL
// ════════════════════════════════════════════════
async function doModalChangePass() {
  const current = document.getElementById('mcp-current').value;
  const newP    = document.getElementById('mcp-new').value;
  const confirm = document.getElementById('mcp-confirm').value;
  hideMsg('mcp-err'); hideMsg('mcp-ok');

  try {
    const r = await authCall('change_password', {current_password:current, new_password:newP, confirm_password:confirm});
    if (r.ok) {
      showMsg('mcp-ok','رمز عبور با موفقیت تغییر کرد ✓');
      notify('رمز عبور تغییر کرد ✓');
      setTimeout(() => closeModal('modal-change-pass'), 1500);
    } else {
      showMsg('mcp-err', r.msg);
    }
  } catch {
    const stored = localStorage.getItem('mx_admin_pass') || 'Mazdex@1404';
    if (current === stored) { localStorage.setItem('mx_admin_pass',newP); showMsg('mcp-ok','ذخیره شد (local)'); }
    else showMsg('mcp-err','رمز فعلی اشتباه');
  }
}

// ════════════════════════════════════════════════
// ADD USER
// ════════════════════════════════════════════════
function genTempPass() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$!';
  let pass = '';
  for (let i=0;i<12;i++) pass += chars[Math.floor(Math.random()*chars.length)];
  document.getElementById('au-pass').value = pass;
}

async function doAddUser() {
  const username = document.getElementById('au-user').value.trim();
  const password = document.getElementById('au-pass').value;
  hideMsg('au-err');
  try {
    const r = await authCall('add_user', {username, password});
    if (r.ok) { notify(r.msg); closeModal('modal-add-user'); loadAdminUsers(); }
    else showMsg('au-err', r.msg);
  } catch { showMsg('au-err','auth.php در دسترس نیست'); }
}

async function loadAdminUsers() {
  const el = document.getElementById('admin-users-list');
  try {
    const r = await authCall('list_users');
    if (!r.ok) { el.innerHTML = '<span style="color:var(--muted)">دسترسی ندارید</span>'; return; }
    el.innerHTML = r.users.map(u => `
      <div class="admin-user-card">
        <div class="auc-avatar">${u.username[0].toUpperCase()}</div>
        <div class="auc-info">
          <div class="auc-name">${u.username} ${u.username==='admin'?'<span class="badge badge-gold">ادمین اصلی</span>':''}</div>
          <div class="auc-meta">آخرین ورود: ${u.last_login||'هنوز وارد نشده'} | ساخته شده: ${u.created_at}
          ${u.must_change_pass?'<span class="badge badge-red" style="margin-right:4px">باید رمز عوض کند</span>':''}</div>
        </div>
        ${u.username!=='admin' ? `<button class="btn btn-red" style="font-size:0.72rem;padding:3px 8px" onclick="deleteAdminUser('${u.username}')">حذف</button>` : ''}
      </div>`).join('') || '<span style="color:var(--muted)">هیچ ادمینی یافت نشد</span>';
  } catch { el.innerHTML = '<span style="color:var(--muted)">auth.php در دسترس نیست</span>'; }
}

async function deleteAdminUser(username) {
  if (!confirm(`آیا کاربر ${username} حذف شود؟`)) return;
  const r = await authCall('delete_user', {username});
  if (r.ok) { notify(r.msg); loadAdminUsers(); }
  else notify(r.msg, true);
}

// ════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════
async function doLogout() {
  try { await authCall('logout'); } catch {}
  localStorage.removeItem('mx_local_mode');
  location.reload();
}

// ════════════════════════════════════════════════
// ENTER APP
// ════════════════════════════════════════════════
function enterApp() {
  showScreen(null);
  document.getElementById('app').classList.add('active');
  document.getElementById('sb-uname').textContent = currentUser;
  document.getElementById('sb-av').textContent = currentUser[0].toUpperCase();
  document.getElementById('tb-user').textContent = currentUser;
  if (currentUser === 'admin') document.getElementById('sb-admin-users').style.display = 'flex';
  renderSecurityStatus();
  initApp();
}

// ════════════════════════════════════════════════
// SCREENS
// ════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (id) document.getElementById(id).classList.add('active');
}

// ════════════════════════════════════════════════
// SECURITY STATUS
// ════════════════════════════════════════════════
function renderSecurityStatus() {
  const el = document.getElementById('security-status');
  const isPhp = !localStorage.getItem('mx_local_mode');
  const items = [
    { ok: isPhp,  label: 'PHP backend', desc: isPhp ? 'متصل — session امن فعال' : 'غیرفعال — حالت local (auth.php آپلود شود)' },
    { ok: isPhp,  label: 'Bcrypt hash', desc: isPhp ? 'رمزها با bcrypt هش می‌شوند' : 'فقط در PHP فعال است' },
    { ok: true,   label: 'CSRF protection', desc: 'فعال' },
    { ok: isPhp,  label: 'Brute-force lock', desc: isPhp ? `بعد از ${5} تلاش ۱۵ دقیقه قفل` : 'فقط در PHP' },
    { ok: isPhp,  label: 'Session timeout', desc: isPhp ? '۸ ساعت بی‌فعالیت = logout خودکار' : 'فقط در PHP' },
  ];
  el.innerHTML = items.map(i => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.5rem">
      <span style="color:${i.ok?'var(--accent)':'var(--red)'};font-size:0.85rem">${i.ok?'✓':'✗'}</span>
      <span style="font-weight:600;min-width:130px">${i.label}</span>
      <span style="color:var(--muted)">${i.desc}</span>
    </div>`).join('');
}

// ════════════════════════════════════════════════
// MSG HELPERS
// ════════════════════════════════════════════════
function showMsg(id, msg) {
  const el = document.getElementById(id);
  const txt = document.getElementById(id+'-text');
  if (txt) txt.textContent = msg; else el.querySelector('span:last-child').textContent = msg;
  el.classList.add('show');
}
function hideMsg(id) { document.getElementById(id)?.classList.remove('show'); }

// ════════════════════════════════════════════════
// MODAL
// ════════════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ════════════════════════════════════════════════
// APP INIT
// ════════════════════════════════════════════════
async function initApp() {
  await loadLandingUsers();
  renderDash();
  renderSteps();
  renderFaq();
}

// ════════════════════════════════════════════════
// API (save.php)
// ════════════════════════════════════════════════
async function apiCall(action, body=null) {
  if (localStorage.getItem('mx_local_mode') && action !== 'read' && action !== 'save') {
    return localApi(action, body);
  }
  const opts = {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}?action=${action}`, opts);
  if (r.status === 401) {
    notify('نشست منقضی شد. لطفاً دوباره وارد شوید.', true);
    setTimeout(() => location.reload(), 2000);
    return { ok: false, msg: 'unauthorized' };
  }
  return r.json();
}
function localApi(action, body) {
  if (action==='read') return Promise.resolve({ok:true, html: localStorage.getItem('mx_html')||''});
  if (action==='save') { localStorage.setItem('mx_html',body.html); return Promise.resolve({ok:true}); }
  if (action==='get_users') return Promise.resolve({ok:true, users: JSON.parse(localStorage.getItem('mx_users')||'[]')});
  if (action==='update_kyc') {
    const us=JSON.parse(localStorage.getItem('mx_users')||'[]');
    us.forEach(u=>{if(u.phone===body.phone){u.kyc=body.kyc;if(body.kyc==='تأیید شده'&&u.points<5)u.points=5;}});
    localStorage.setItem('mx_users',JSON.stringify(us));
    return Promise.resolve({ok:true});
  }
  if (action==='get_settings') return Promise.resolve({ok:true,settings:JSON.parse(localStorage.getItem('mx_settings')||'{}')});
  if (action==='save_settings') { localStorage.setItem('mx_settings',JSON.stringify(body)); return Promise.resolve({ok:true}); }
  return Promise.resolve({ok:false});
}

// ════════════════════════════════════════════════
// LANDING USERS
// ════════════════════════════════════════════════
async function loadLandingUsers() {
  const r = await apiCall('get_users');
  if (r.ok) landingUsers = r.users;
  // mock seed
  if (!landingUsers.length) {
    landingUsers = [
      {phone:'09121234567',email:'',date:new Date(Date.now()-2*86400000).toISOString(),kyc:'تأیید شده',points:480,trades:12,invites:4,source:'پیامک'},
      {phone:'09351234567',email:'',date:new Date(Date.now()-86400000).toISOString(),kyc:'تأیید شده',points:320,trades:8,invites:2,source:'پیامک'},
      {phone:'09011234567',email:'',date:new Date().toISOString(),kyc:'در انتظار',points:45,trades:1,invites:0,source:'پیامک'},
    ];
    localStorage.setItem('mx_users',JSON.stringify(landingUsers));
  }
  document.getElementById('ub').textContent = landingUsers.length;
}

function renderUsers(filter='') {
  const rows = landingUsers.filter(u=>!filter||u.phone.includes(filter));
  document.getElementById('users-body').innerHTML = rows.map(u=>`
    <tr>
      <td>${u.phone}</td>
      <td>${new Date(u.date).toLocaleDateString('fa-IR')}</td>
      <td><span class="badge ${u.kyc==='تأیید شده'?'badge-green':'badge-gray'}">${u.kyc}</span></td>
      <td style="color:var(--gold);font-weight:600">${u.points}</td>
      <td><span class="badge badge-gold">${u.source||'—'}</span></td>
      <td>
        <button class="btn ${u.kyc==='تأیید شده'?'btn-red':'btn-green'}" style="font-size:0.68rem;padding:2px 7px"
          onclick="toggleKyc('${u.phone}','${u.kyc}')">
          ${u.kyc==='تأیید شده'?'لغو KYC':'تأیید KYC'}
        </button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem">کاربری یافت نشد</td></tr>';
}
function filterUsers(v) { renderUsers(v); }

async function toggleKyc(phone, current) {
  const newKyc = current==='تأیید شده'?'در انتظار':'تأیید شده';
  await apiCall('update_kyc',{phone,kyc:newKyc});
  await loadLandingUsers();
  renderUsers(); renderDash();
  notify('KYC آپدیت شد ✓');
}

// ════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════
function renderDash() {
  document.getElementById('s-total').textContent = landingUsers.length;
  document.getElementById('s-kyc').textContent = landingUsers.filter(u=>u.kyc==='تأیید شده').length;
  document.getElementById('s-pts').textContent = landingUsers.reduce((a,u)=>a+u.points,0).toLocaleString('fa-IR');
  const now = new Date();
  document.getElementById('s-days').textContent = Math.ceil((new Date(now.getFullYear(),now.getMonth()+1,1)-now)/86400000);
  document.getElementById('s-today').textContent = '+' + landingUsers.filter(u=>new Date(u.date).toDateString()===now.toDateString()).length + ' امروز';
  const recent = [...landingUsers].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  document.getElementById('dash-users').innerHTML = recent.map(u=>`
    <tr><td>${u.phone}</td><td>${new Date(u.date).toLocaleDateString('fa-IR')}</td>
    <td><span class="badge ${u.kyc==='تأیید شده'?'badge-green':'badge-gray'}">${u.kyc}</span></td>
    <td style="color:var(--gold)">${u.points}</td></tr>`).join('');
}

// ════════════════════════════════════════════════
// LEADERBOARD
// ════════════════════════════════════════════════
function renderLb() {
  const s = [...landingUsers].sort((a,b)=>b.points-a.points);
  document.getElementById('lb-pts').textContent = s.reduce((a,u)=>a+u.points,0).toLocaleString('fa-IR');
  document.getElementById('lb-act').textContent = s.filter(u=>u.points>0).length;
  if (s[0]) { document.getElementById('lb-top').textContent=s[0].points; document.getElementById('lb-top-n').textContent=s[0].phone; }
  const m=['🥇','🥈','🥉'];
  document.getElementById('lb-body').innerHTML = s.map((u,i)=>`
    <tr><td style="color:var(--gold)">${m[i]||(i+1)}</td>
    <td>${u.phone.replace(/(\d{4})\d{4}(\d{3})/,'$1****$2')}</td>
    <td style="color:var(--gold);font-weight:700">${u.points}</td>
    <td>${u.trades||0}</td><td>${u.invites||0}</td></tr>`).join('');
}

// ════════════════════════════════════════════════
// HTML EDITOR
// ════════════════════════════════════════════════
async function loadHtml() {
  const editor = document.getElementById('html-editor');
  editor.value = 'در حال بارگذاری فایل لندینگ از سرور...';
  document.getElementById('char-count').textContent = '';

  try {
    const r = await apiCall('read');
    if (r.ok && r.html) {
      htmlContent = r.html;
      editor.value = r.html;
      updateCharCount();
      notify('فایل لندینگ بارگذاری شد ✓ — حالا می‌تونی ادیت کنی');
    } else {
      editor.value = '';
      notify('خطا: ' + (r.msg || 'فایل یافت نشد'), true);
    }
  } catch(e) {
    editor.value = '';
    notify('خطا در اتصال: ' + e.message, true);
  }
}
async function saveHtml() {
  let html = document.getElementById('html-editor').value;
  const saveStatus = document.getElementById('save-status');
  const saveBtn = document.getElementById('save-btn');

  // اگر editor خالیه، اول فایل رو load کن
  if (!html.trim() || html === 'در حال بارگذاری...') {
    notify('ابتدا روی «↻ بارگذاری» کلیک کن تا فایل لود بشه', true);
    return;
  }

  // بررسی اینکه واقعاً HTML معتبره
  if (html.indexOf('<html') === -1 && html.indexOf('<!DOCTYPE') === -1) {
    notify('محتوا HTML معتبر نیست', true);
    return;
  }

  if (saveStatus) saveStatus.textContent = '⏳ ذخیره...';
  if (saveBtn) saveBtn.disabled = true;

  try {
    const r = await apiCall('save', { html });
    if (r.ok) {
      htmlContent = html;
      notify('فایل لندینگ ذخیره شد ✓');
      if (saveStatus) saveStatus.textContent = '✓ ذخیره شد';
    } else {
      notify('خطا: ' + (r.msg || 'نامشخص'), true);
      if (saveStatus) saveStatus.textContent = '⚠ خطا';
    }
  } catch(e) {
    notify('خطا در اتصال به سرور: ' + e.message, true);
    if (saveStatus) saveStatus.textContent = '⚠ خطا';
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}
function updateCharCount() {
  document.getElementById('char-count').textContent = document.getElementById('html-editor').value.length.toLocaleString('fa-IR') + ' کاراکتر';
}
function insertTag(tag) {
  const el=document.getElementById('html-editor'),s=el.selectionStart,e=el.selectionEnd;
  el.value=el.value.substring(0,s)+`<${tag}>${el.value.substring(s,e)}</${tag}>`+el.value.substring(e);
}
function findReplace() {
  const f=prompt('جستجو:'); if(!f) return;
  const r=prompt('جایگزین:')||'';
  const el=document.getElementById('html-editor');
  const n=(el.value.match(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length;
  el.value=el.value.replaceAll(f,r);
  notify(`${n} مورد جایگزین شد`);
}

// ════════════════════════════════════════════════
// VISUAL EDITOR
// ════════════════════════════════════════════════
async function applyVisual() {
  // اگه هنوز HTML لندینگ لود نشده، اول لودش کن
  if (!htmlContent || htmlContent.length < 100) {
    notify('در حال بارگذاری فایل از سرور...', false);
    await loadHtml();
    if (!htmlContent || htmlContent.length < 100) {
      notify('فایل لندینگ لود نشد. به صفحه «ویرایش HTML» برو و دکمه بارگذاری بزن.', true);
      return;
    }
  }

  let html = htmlContent;

  // اعمال تغییرات هیرو
  const h1 = document.getElementById('ve-h1')?.value;
  const h2 = document.getElementById('ve-h2')?.value;
  const h3 = document.getElementById('ve-h3')?.value;
  const desc = document.getElementById('ve-hdesc')?.value;
  const ft = document.getElementById('ve-ft')?.value;
  const fs = document.getElementById('ve-fs')?.value;
  const fg = document.getElementById('ve-fg')?.value;
  const fbtn = document.getElementById('ve-fbtn')?.value;

  // جایگزینی تیتر h1
  if (h1 && h2 && h3) {
    html = html.replace(
      /<h1[^>]*>[\s\S]*?<\/h1>/m,
      `<h1>${h1}<br>${h2}<br><span class="highlight">${h3}</span></h1>`
    );
  }

  // جایگزینی توضیحات هیرو
  if (desc) {
    html = html.replace(
      /(<p class="hero-desc">)[\s\S]*?(<\/p>)/,
      `$1${desc}$2`
    );
  }

  // جایگزینی عنوان فرم
  if (ft) {
    html = html.replace(
      /(<div class="form-title">)[\s\S]*?(<\/div>)/,
      `$1${ft}$2`
    );
  }

  // جایگزینی زیرعنوان فرم
  if (fs) {
    html = html.replace(
      /(<div class="form-subtitle">)[\s\S]*?(<\/div>)/,
      `$1${fs}$2`
    );
  }

  // جایگزینی متن هدیه
  if (fg) {
    html = html.replace(
      /(<strong[^>]*>)[\s\S]*?(<\/strong>)/,
      `$1${fg}$2`
    );
  }

  // جایگزینی متن دکمه ثبت‌نام
  if (fbtn) {
    html = html.replace(
      /(<button type="submit"[^>]*>)[\s\S]*?(<\/button>)/,
      `$1${fbtn}$2`
    );
  }

  htmlContent = html;
  document.getElementById('html-editor').value = html;

  // ذخیره روی سرور
  await saveHtml();
}

// ════════════════════════════════════════════════
// STEPS / FAQ
// ════════════════════════════════════════════════
let steps=JSON.parse(localStorage.getItem('mx_steps')||JSON.stringify([
  {title:'ثبت‌نام',desc:'ثبت‌نام و احراز هویت',reward:'۵ توکن'},
  {title:'اولین معامله',desc:'حداقل ۱۰ توکن',reward:'۵ توکن'},
  {title:'معامله روزانه',desc:'هر روز معامله = امتیاز',reward:'۱۰ امتیاز/۱M'},
  {title:'دعوت دوست',desc:'هر دعوت موفق',reward:'۱۰ امتیاز'},
  {title:'قرعه‌کشی',desc:'آخر هر ماه',reward:'۱۰ شمش طلا'},
]));
let faqs=JSON.parse(localStorage.getItem('mx_faqs')||JSON.stringify([
  {q:'چطور هدیه بگیرم؟',a:'ثبت‌نام و احراز هویت ظرف ۲۴ ساعت'},
  {q:'حداقل معامله؟',a:'۱۰ توکن اهرم'},
  {q:'امتیازات چطور؟',a:'ثبت‌نام=۵ | هر ۱M معامله=۱۰ | هر دعوت=۱۰'},
]));
const inpStyle='width:100%;background:var(--dark-2);border:0.5px solid var(--border-dim);border-radius:7px;padding:0.45rem 0.7rem;color:var(--text);font-family:\'Vazirmatn\',sans-serif;font-size:0.79rem;outline:none;direction:rtl';
function renderSteps(){
  document.getElementById('steps-list').innerHTML=steps.map((s,i)=>`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:0.5rem">
      <input type="text" value="${s.title}" oninput="steps[${i}].title=this.value;saveStepsL()" style="${inpStyle}">
      <input type="text" value="${s.desc}" oninput="steps[${i}].desc=this.value;saveStepsL()" style="${inpStyle}">
      <input type="text" value="${s.reward}" oninput="steps[${i}].reward=this.value;saveStepsL()" style="${inpStyle};color:var(--gold)">
      <button class="btn btn-red" style="font-size:0.68rem;padding:3px 7px" onclick="removeStep(${i})">✕</button>
    </div>`).join('');}
function addStep(){steps.push({title:'مرحله',desc:'توضیح',reward:'جایزه'});saveStepsL();renderSteps();}
function removeStep(i){steps.splice(i,1);saveStepsL();renderSteps();}
function saveStepsL(){localStorage.setItem('mx_steps',JSON.stringify(steps));}

function renderFaq(){
  document.getElementById('faq-list').innerHTML=faqs.map((f,i)=>`
    <div style="background:var(--dark-3);border-radius:8px;padding:0.75rem;margin-bottom:0.5rem">
      <div style="display:flex;gap:6px;margin-bottom:5px">
        <input type="text" value="${f.q}" oninput="faqs[${i}].q=this.value;saveFaqL()" placeholder="سوال" style="${inpStyle};flex:1">
        <button class="btn btn-red" style="font-size:0.68rem;padding:3px 7px" onclick="removeFaq(${i})">✕</button>
      </div>
      <textarea oninput="faqs[${i}].a=this.value;saveFaqL()" style="${inpStyle};min-height:50px;resize:vertical">${f.a}</textarea>
    </div>`).join('');}
function addFaq(){faqs.push({q:'سوال جدید',a:'پاسخ'});saveFaqL();renderFaq();}
function removeFaq(i){faqs.splice(i,1);saveFaqL();renderFaq();}
function saveFaqL(){localStorage.setItem('mx_faqs',JSON.stringify(faqs));}

// ════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════
async function saveSettings(){
  const r=await apiCall('save_settings',{
    crm_webhook:document.getElementById('wh-reg').value,
    crm_kyc:document.getElementById('wh-kyc').value,
    api_key:document.getElementById('wh-key').value,
  });
  notify(r.ok?'تنظیمات ذخیره شد ✓':'خطا',!r.ok);
}

// ════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════
function exportUsers(){dl('mazdex-users.csv','\uFEFFموبایل,تاریخ,KYC,امتیاز,معاملات,دعوت,منبع\n'+landingUsers.map(u=>`${u.phone},${new Date(u.date).toLocaleDateString('fa-IR')},${u.kyc},${u.points},${u.trades||0},${u.invites||0},${u.source||''}`).join('\n'));}
function exportLeaderboard(){const s=[...landingUsers].sort((a,b)=>b.points-a.points);dl('lb.csv','\uFEFFرتبه,موبایل,امتیاز\n'+s.map((u,i)=>`${i+1},${u.phone},${u.points}`).join('\n'));}
function exportSettings(){dl('settings.json',JSON.stringify({steps,faqs},null,2));}
function dl(name,content){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));a.download=name;a.click();notify('دانلود شروع شد ✓');}
function runLottery(){
  const el=landingUsers.filter(u=>u.points>0&&u.kyc==='تأیید شده');
  if(!el.length){notify('کاربر واجد شرایط نیست',true);return;}
  const pool=[];el.forEach(u=>{for(let i=0;i<u.points;i++)pool.push(u.phone);});
  const w=new Set();
  while(w.size<Math.min(10,el.length))w.add(pool[Math.floor(Math.random()*pool.length)]);
  alert('🏆 برندگان:\n\n'+[...w].join('\n'));
}

// ════════════════════════════════════════════════
// SAVE ALL
// ════════════════════════════════════════════════
async function saveChanges() {
  const currentPage = document.querySelector('.page.active')?.id || '';

  // اگر توی HTML editor هستیم، فایل رو ذخیره کن
  if (currentPage === 'page-html') {
    await saveHtml();
    return;
  }

  // اگر توی visual editor هستیم
  if (currentPage === 'page-visual') {
    await applyVisual();
    return;
  }

  // بقیه صفحات: تنظیمات local رو ذخیره کن
  saveStepsL();
  saveFaqL();
  notify('تغییرات ذخیره شد ✓');
}

// ════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════
const titles={dashboard:'داشبورد',visual:'ویرایش بصری',html:'ویرایش HTML',users:'کاربران',leaderboard:'لیدربورد','admin-users':'مدیریت ادمین‌ها',settings:'تنظیمات',export:'خروجی داده'};
function nav(id,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s=>s.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(el) el.classList.add('active');
  document.getElementById('ttl').textContent=titles[id]||id;
  if(id==='users')renderUsers();
  if(id==='leaderboard')renderLb();
  if(id==='html'&&!htmlContent)loadHtml();
  if(id==='admin-users')loadAdminUsers();
}

// ════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════
function switchTab(btn,id){
  btn.closest('.page').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  ['ve-hero','ve-form','ve-steps','ve-faq'].forEach(t=>{
    const el=document.getElementById(t);
    if(el)el.style.display=t===id?'block':'none';
  });
}

// ════════════════════════════════════════════════
// NOTIFY
// ════════════════════════════════════════════════
function notify(msg,isErr=false,isWarn=false){
  const n=document.getElementById('notify-bar');
  n.textContent=(isErr?'⚠ ':isWarn?'⚡ ':'✓ ')+msg;
  n.className='notify'+(isErr?' err':isWarn?' warn':'');
  void n.offsetWidth; n.classList.add('show');
  setTimeout(()=>n.classList.remove('show'),2800);
}

// ════════════════════════════════════════════════
// STARTUP
// ════════════════════════════════════════════════
(async()=>{
  await getCsrf();
  // بررسی session فعال
  try {
    const r = await authCall('check');
    if (r.ok) {
      currentUser = r.username;
      if (r.must_change_pass) { showScreen('screen-change-pass'); }
      else { enterApp(); }
      return;
    }
  } catch {}
  // نمایش صفحه لاگین
  showScreen('screen-login');
  updateDots(0);
  document.getElementById('inp-user').focus();
})();
