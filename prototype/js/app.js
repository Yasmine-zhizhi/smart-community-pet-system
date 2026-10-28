/* ================================================
   智慧社区宠物管理系统 - 共享存储 + 交互逻辑
   核心修复：mock 数据统一走 localStorage 持久化
   ================================================ */

// ============ 初始种子数据 ============
const SEED_DATA = {
  owner: { id: 'OW001', name: '张先生', phone: '138****5678', building: '3栋2单元', room: '1502' },
  reviewer: { id: 'RV001', name: '李审核员' },
  pets: [
    { id: 'PET001', type: 'DOG', name: '豆豆', breed: '金毛寻回犬', size: 'LARGE',
      vaccineExpiry: '2026-11-15', certStatus: 'VALID', certExpiry: '2027-03-20',
      certNo: 'CERT-2025-1002', violations365: 0 },
    { id: 'PET002', type: 'CAT', name: '咪咪', breed: '英国短毛猫', size: null,
      vaccineExpiry: '2026-08-01', certStatus: 'EXPIRED', certExpiry: '2026-09-01',
      certNo: 'CERT-2025-0876', violations365: 1 },
    { id: 'PET003', type: 'DOG', name: '旺财', breed: '柯基', size: 'SMALL',
      vaccineExpiry: '2026-05-20', certStatus: 'FROZEN', certExpiry: '2026-12-01',
      certNo: 'CERT-2025-0543', violations365: 3 }
  ],
  reservations: [
    { id: 'RSV-001', petId: 'PET001', date: '2026-10-28', slot: '07:00-07:30',
      zone: 'LARGE_DOG', zoneName: '大型犬遛狗区', status: 'CONFIRMED' },
    { id: 'RSV-002', petId: 'PET001', date: '2026-10-25', slot: '08:00-08:30',
      zone: 'LARGE_DOG', zoneName: '大型犬遛狗区', status: 'COMPLETED' },
    { id: 'RSV-003', petId: 'PET003', date: '2026-10-27', slot: '19:00-19:30',
      zone: 'SMALL_DOG', zoneName: '小型犬遛狗区', status: 'CANCELLED' }
  ],
  applications: [
    { id: 'APP-20261026-001', type: 'DOG', petName: '旺财', breed: '柯基',
      owner: '王先生', phone: '139****1111', submittedAt: '2026-10-25 18:40', status: 'PENDING' },
    { id: 'APP-20261026-002', type: 'CAT', petName: '雪球', breed: '布偶猫',
      owner: '陈女士', phone: '137****2222', submittedAt: '2026-10-26 09:15', status: 'PENDING' },
    { id: 'APP-20261026-003', type: 'RENEW', petName: '咪咪', breed: '英国短毛猫',
      owner: '李女士', phone: '136****3333', submittedAt: '2026-10-26 10:32', status: 'SUPPLEMENT', petId: 'PET002' }
  ],
  violations: [
    { id: 'V-001', owner: '王先生', pet: '旺财', petId: null, type: '未牵绳遛狗',
      date: '2026-09-15', status: 'CONFIRMED' },
    { id: 'V-002', owner: '王先生', pet: '旺财', petId: null, type: '大型犬进入小型犬区',
      date: '2026-10-05', status: 'CONFIRMED' },
    { id: 'V-003', owner: '王先生', pet: '旺财', petId: null, type: '未及时清理粪便',
      date: '2026-10-20', status: 'CONFIRMED' }
  ]
};

const STORAGE_KEY = 'petstore_data_v1';

// ============ 全局存储 API ============
function storeGet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) { console.warn('storeGet error', e); }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
  return JSON.parse(JSON.stringify(SEED_DATA));
}

function storeSet(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function storeReset() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
  return JSON.parse(JSON.stringify(SEED_DATA));
}

// 所有页面用 data() 函数获取最新数据（每次都从 localStorage 读，保证跨页面同步）
function data() { return storeGet(); }

// ============ 业务操作（自动持久化）============
function operation(fn, msg) {
  const d = storeGet();
  fn(d);
  storeSet(d);
  if (msg) showToast(msg, 'success');
}

// 物业端：审核申请
function reviewApplication(appId, action) {
  operation(d => {
    const app = d.applications.find(a => a.id === appId);
    if (!app) return;
    app.status = action === 'APPROVED' ? 'APPROVED' : action;

    // ★ 联动影响宠物：审核通过 → 生成电子证 / 年审顺延
    if (action === 'APPROVED') {
      if (app.type === 'DOG' || app.type === 'CAT') {
        // 新登记：添加宠物档案 + 生成电子证
        const newPet = {
          id: 'PET' + String(Date.now()).slice(-6),
          type: app.type, name: app.petName, breed: app.breed, size: app.type === 'DOG' ? 'LARGE' : null,
          vaccineExpiry: fmtDate(new Date(Date.now() + 86400000*180)),
          certStatus: 'VALID',
          certExpiry: fmtDate(new Date(Date.now() + 86400000*365)),
          certNo: 'CERT-' + String(Date.now()).slice(-8),
          violations365: 0
        };
        d.pets.push(newPet);
      } else if (app.type === 'RENEW' && app.petId) {
        // 年审通过：顺延有效期 365 天
        const pet = d.pets.find(p => p.id === app.petId);
        if (pet) {
          const orig = new Date(pet.certExpiry);
          orig.setFullYear(orig.getFullYear() + 1);
          pet.certExpiry = fmtDate(orig);
          pet.certStatus = 'VALID';
        }
      }
    }
  }, `审核${action==='APPROVED'?'通过':action==='SUPPLEMENT'?'改为补交':'驳回'}成功，已通知业主`);
}

// 物业端：确认违规 → 自动重算 pet.violations365 → 达 3 次自动冻结
function recordViolation(violation) {
  operation(d => {
    d.violations.push({ id: 'V-' + String(Date.now()).slice(-6), status: 'CONFIRMED', ...violation });
    // 重新计算每只宠物的违规次数（365 天内）
    const today = new Date();
    d.pets.forEach(pet => {
      const count = d.violations.filter(v =>
        v.petName === pet.name && v.status === 'CONFIRMED' &&
        (today - new Date(v.date)) < 86400000*365
      ).length;
      pet.violations365 = count;
      if (count >= 3 && pet.certStatus !== 'FROZEN') {
        pet.certStatus = 'FROZEN';
        showToast(`⚠️ ${pet.name} 违规累计达 3 次，电子证已自动冻结！`, 'warning');
      }
    });
  });
}

// 物业端：解除冻结
function unfreezePet(petId) {
  operation(d => {
    const pet = d.pets.find(p => p.id === petId);
    if (pet && pet.certStatus === 'FROZEN') pet.certStatus = 'VALID';
  }, '已解除冻结');
}

// 业主端：提交登记 → 新增 APPLICATION
function submitRegistration(type, petName, breed, size) {
  operation(d => {
    d.applications.push({
      id: 'APP-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(Math.floor(Math.random()*9000)+1000),
      type, petName, breed, size: size || null,
      owner: d.owner.name, phone: d.owner.phone,
      submittedAt: new Date().toLocaleString('zh-CN'),
      status: 'PENDING'
    });
  }, '申请已提交，等待物业审核');
}

// 业主端：提交年审
function submitRenewal(petId) {
  const pet = storeGet().pets.find(p => p.id === petId);
  if (!pet) return;
  operation(d => {
    d.applications.push({
      id: 'APP-RENEW-' + String(Date.now()).slice(-8),
      type: 'RENEW', petId,
      petName: pet.name, breed: pet.breed,
      owner: d.owner.name, phone: d.owner.phone,
      submittedAt: new Date().toLocaleString('zh-CN'),
      status: 'PENDING'
    });
  }, '年审申请已提交');
}

// 业主端：预约（原子扣减模拟）
function makeReservation(petId, date, slot, zone) {
  const pet = storeGet().pets.find(p => p.id === petId);
  if (!pet) return false;
  const cap = { SMALL_DOG: 10, LARGE_DOG: 6 }[zone];
  const left = cap - storeGet().reservations.filter(r => r.date===date && r.slot===slot && r.zone===zone && r.status==='CONFIRMED').length;
  if (left <= 0) return 'FULL';
  operation(d => {
    d.reservations.push({
      id: 'RSV-' + String(Date.now()).slice(-8),
      petId, date, slot, zone,
      zoneName: zone === 'LARGE_DOG' ? '大型犬遛狗区' : '小型犬遛狗区',
      status: 'CONFIRMED'
    });
  }, `预约成功！编号 RSV-${String(Date.now()).slice(-8)}`);
  return true;
}

// 业主端：取消预约
function cancelReservation(rsvId) {
  operation(d => {
    const r = d.reservations.find(x => x.id === rsvId);
    if (r && r.status === 'CONFIRMED') r.status = 'CANCELLED';
  }, '预约已取消，名额已释放');
}

// ============ 状态映射（不变）============
function certStatusLabel(s) {
  return { VALID: '✅ 有效', EXPIRED: '⚠️ 已过期', FROZEN: '🔒 已冻结', INVALID: '❌ 无效' }[s] || s;
}
function certStatusBadge(s) {
  return { VALID: 'badge-success', EXPIRED: 'badge-warning', FROZEN: 'badge-danger', INVALID: 'badge-gray' }[s] || 'badge-gray';
}
function certCardClass(s) {
  return { VALID: '', EXPIRED: 'expired', FROZEN: 'frozen' }[s] || '';
}
function petTypeLabel(t) { return { DOG: '🐕 犬类', CAT: '🐈 猫类' }[t] || t; }
function sizeLabel(s) { return { SMALL: '小型犬', LARGE: '大型犬' }[s] || s; }
function reserveStatusLabel(s) {
  return { CONFIRMED: '已确认', CANCELLED: '已取消', COMPLETED: '已完成', PENDING: '候补中' }[s] || s;
}
function reserveStatusBadge(s) {
  return { CONFIRMED: 'badge-success', CANCELLED: 'badge-gray', COMPLETED: 'badge-info', PENDING: 'badge-warning' }[s] || 'badge-gray';
}

// ============ 预约名额（动态计算）============
const zoneCapacity = { SMALL_DOG: 10, LARGE_DOG: 6 };

function getSlotAvailability(date, slot, zone) {
  const d = storeGet();
  const cap = zoneCapacity[zone] || 10;
  const used = d.reservations.filter(r => r.date===date && r.slot===slot && r.zone===zone && r.status==='CONFIRMED').length;
  return { used, cap, left: cap - used };
}

// ============ UI 通用（不变）============
function showModal(title, message, onConfirm, confirmText='确定', cancelText='取消') {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal"><h3>${title}</h3><p>${message}</p>
    <div class="modal-actions">
      <button class="btn btn-outline" data-act="cancel">${cancelText}</button>
      <button class="btn btn-primary" data-act="confirm">${confirmText}</button>
    </div></div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('[data-act=cancel]').onclick = () => backdrop.remove();
  backdrop.querySelector('[data-act=confirm]').onclick = () => { backdrop.remove(); onConfirm && onConfirm(); };
}

function showToast(msg, type='success') {
  const colors = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' };
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%) translateY(-20px);
    background: ${colors[type]||'var(--primary)'}; color: white; padding: 12px 24px;
    border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    z-index: 9999; opacity: 0; transition: all 0.25s; font-weight: 500;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; });
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(-20px)'; }, 2500);
  setTimeout(() => el.remove(), 2800);
}

function validateForm(formEl) {
  let ok = true;
  formEl.querySelectorAll('[required]').forEach(el => {
    const errDiv = el.parentElement.querySelector('.form-error');
    if (!el.value.trim()) { el.classList.add('error');
      errDiv || el.parentElement.insertAdjacentHTML('beforeend','<div class="form-error">此字段不能为空</div>');
      ok = false; }
    else { el.classList.remove('error'); if (errDiv) errDiv.remove(); }
  });
  return ok;
}

// ============ 导航栏（增加重置按钮）============
function injectNavbar(role='owner') {
  const isOwner = role === 'owner';
  const pages = isOwner
    ? { home:'index.html', profile:'owner-profile.html', reserve:'owner-reserve.html',
        myRes:'owner-my-reservations.html', renew:'owner-renew.html' }
    : { home:'reviewer-list.html', review:'reviewer-list.html', violation:'admin-violation.html',
        settings:'admin-settings.html' };
  const current = location.pathname.split('/').pop();
  const menuItems = isOwner
    ? [{a:pages.home,label:'首页'},{a:pages.profile,label:'宠物档案'},{a:pages.reserve,label:'预约遛狗区'},
       {a:pages.myRes,label:'我的预约'},{a:pages.renew,label:'年审申请'}]
    : [{a:pages.review,label:'审核管理'},{a:pages.violation,label:'违规管理'},{a:pages.settings,label:'系统设置'}];

  const nav = `<nav class="navbar"><div class="navbar-inner">
    <a href="${pages.home}" class="logo"><span class="logo-icon">🐾</span><span>智慧宠物社区</span></a>
    <div class="nav-menu">${menuItems.map(m=>`<a href="${m.a}" class="${current===m.a?'active':''}">${m.label}</a>`).join('')}</div>
    <div class="navbar-right">
      <div class="role-switch">
        <a href="index.html" class="${isOwner?'active':''}">业主端</a>
        <a href="reviewer-list.html" class="${!isOwner?'active':''}">物业端</a>
      </div>
      <button class="btn btn-outline btn-sm" onclick="storeReset(); location.reload();" title="重置演示数据">↺重置</button>
      <a href="login.html" class="btn btn-outline btn-sm">退出</a>
    </div></div></nav>`;
  document.body.insertAdjacentHTML('afterbegin', nav);
}

function injectFooter() {
  document.body.insertAdjacentHTML('beforeend',
    `<footer class="footer">© 2026 智慧社区宠物管理系统 · 软件工程实验项目 · 所有数据已接入 <strong>localStorage</strong> 全局共享</footer>`);
}

// ============ 工具 ============
function fmtDate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}
function genDates(n=5) {
  const arr = []; const today = new Date();
  for (let i=0; i<n; i++) {
    const d = new Date(today); d.setDate(today.getDate()+i+1);
    const dow = ['日','一','二','三','四','五','六'][d.getDay()];
    arr.push({ date: fmtDate(d), dow: `周${dow}`, d: d.getDate(), mo: d.getMonth()+1 });
  }
  return arr;
}
const timeSlots = ['07:00-07:30','07:30-08:00','08:00-08:30','08:30-09:00','09:00-09:30','09:30-10:00',
                   '17:00-17:30','17:30-18:00','18:00-18:30','18:30-19:00','19:00-19:30','19:30-20:00'];
