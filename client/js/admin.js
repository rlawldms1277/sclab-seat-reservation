// js/admin.js
// 좌석 현황 표시 + 관리자 인증 후 사용자 등록/삭제

const BASE_URL = "https://lab-reserve-backend.onrender.com";

// ===== 공통(시계/언어 토글 – 간단) =====
(function(){
  function tick(){
    const n=new Date();
    const y=n.getFullYear(), m=String(n.getMonth()+1).padStart(2,"0"), d=String(n.getDate()).padStart(2,"0");
    const h=n.getHours(), M=String(n.getMinutes()).padStart(2,"0");
    const ampm = h<12? "AM":"PM";
    const hh = String((h%12)||12).padStart(2,"0");
    document.getElementById("nowDate").textContent = `${y}.${m}.${d}`;
    document.getElementById("nowTime").textContent = `${ampm} ${hh}:${M}`;
  }
  tick(); setInterval(tick, 15000);

  const lang = document.querySelector('.lang');
  const trig = document.querySelector('.lang-trigger');
  if (lang && trig) {
    trig.addEventListener('click', ()=> lang.classList.toggle('open'));
    document.addEventListener('click', (e)=>{ if(!lang.contains(e.target)) lang.classList.remove('open'); });
  }
})();

// ===== 유틸 =====
const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
const two = n=> String(n).padStart(2,"0");
const localDateStr = d => `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}`;

function normalizeReservationRaw(raw, fallbackRoom="901"){
  const room = raw.room || raw.roomId || (raw.seat && raw.seat.room) || fallbackRoom;
  let seatId = raw.seatId ?? (raw.seat && raw.seat.id) ?? raw.seatNumber ?? (raw.seat && raw.seat.seatNumber);
  if (seatId != null) seatId = String(seatId);
  const start = raw.startTime ? new Date(raw.startTime) : null;
  const end   = raw.endTime   ? new Date(raw.endTime)   : null;
  return {
    room:String(room),
    seatId: seatId,
    status: String(raw.status||""),
    startTime: start? start.toISOString():null,
    endTime:   end?   end.toISOString():null,
    startDateOnly: start? localDateStr(start):null
  };
}

// ===== 좌석 현황(보기 전용) =====
async function apiFetchReservations(room){
  try{
    const url = room ? `${BASE_URL}/reservations?room=${room}` : `${BASE_URL}/reservations`;
    const res = await fetch(url, { method:"GET" }); // 헤더 없음(프리플라이트 회피)
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    const list = (data.reservations || data || []).map(r => normalizeReservationRaw(r, room||"901"));
    return list;
  }catch(e){
    console.warn("apiFetchReservations error", e);
    return [];
  }
}

// ‘지금 시간 기준’ 사용중(CHECKED_IN)인 좌석을 회색/파랑으로 표시
function paintSeatUsage(room, reservations){
  const now = new Date();
  const today = localDateStr(now);
  const seats = $$("#room-" + room + " .seat");
  seats.forEach(seat=>{
    if (seat.dataset.fixed === "true"){
      seat.classList.remove("available","used"); seat.classList.add("fixed"); return;
    }
    seat.classList.remove("used"); seat.classList.add("available");
    const sid = seat.dataset.seatId;
    const used = reservations.some(r =>
      r.startDateOnly === today &&
      String(r.room) === String(room) &&
      String(r.seatId) === String(sid) &&
      r.status.toUpperCase() === "CHECKED_IN" &&
      r.startTime && r.endTime &&
      new Date(r.startTime) <= now && now < new Date(r.endTime)
    );
    if (used){ seat.classList.remove("available"); seat.classList.add("used"); }
  });
}

async function refreshAllRooms(){
  const r901 = await apiFetchReservations("901");
  paintSeatUsage("901", r901);
  const r907 = await apiFetchReservations("907").catch(()=>[]);
  paintSeatUsage("907", r907);
}
setInterval(refreshAllRooms, 10000);
document.addEventListener("DOMContentLoaded", refreshAllRooms);

// ===== 관리자 인증 & 사용자 관리 =====
const ADMIN_TOKEN_KEY = "adminToken"; // sessionStorage 권장
function getAdminToken(){ return sessionStorage.getItem(ADMIN_TOKEN_KEY); }
function setAdminToken(t){ t? sessionStorage.setItem(ADMIN_TOKEN_KEY, t) : sessionStorage.removeItem(ADMIN_TOKEN_KEY); }
function authHeaders(){
  const t = getAdminToken();
  return t ? { "Content-Type":"application/json", "Authorization": `Bearer ${t}` } : { "Content-Type":"application/json" };
}
function updateAdminBadge(){
  const el = $("#adminState");
  if (!el) return;
  if (getAdminToken()){
    el.textContent = "인증됨";
    el.style.background = "#dcfce7"; el.style.color = "#166534";
  }else{
    el.textContent = "미인증";
    el.style.background = "#eef2ff"; el.style.color = "#312e81";
  }
}
updateAdminBadge();

// --- 모달 열닫 ---
function openModal(id){ $(id).classList.add("show"); }
function closeModal(id){ $(id).classList.remove("show"); }
["adminAuthModal","userManageModal"].forEach(mid=>{
  const m = document.getElementById(mid);
  if (!m) return;
  m.querySelector(".rm-close")?.addEventListener("click", ()=> closeModal("#"+mid));
  m.addEventListener("click", (e)=>{ if(e.target===m) closeModal("#"+mid); });
});

// --- 관리자 로그인(비밀번호 확인) ---
async function apiAdminLogin(password){
  // 백엔드 제안 엔드포인트: POST /admin/login { password } -> { token }
  try{
    const res = await fetch(`${BASE_URL}/admin/login`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json().catch(()=>null);
    if (!res.ok) return { ok:false, message:(data && (data.error||data.message)) || "인증 실패" };
    const token = data.token || data.adminToken;
    if (!token) return { ok:false, message:"토큰 없음" };
    return { ok:true, token };
  }catch(e){
    return { ok:false, message:"네트워크 오류" };
  }
}

$("#btnAdminLogin")?.addEventListener("click", ()=> openModal("#adminAuthModal"));
$("#adminLoginGo")?.addEventListener("click", async ()=>{
  const pw = ($("#adminPw")?.value || "").trim();
  if (!pw) { alert("관리자 비밀번호를 입력하세요."); return; }
  const r = await apiAdminLogin(pw);
  if (!r.ok){ alert(r.message); return; }
  setAdminToken(r.token);
  updateAdminBadge();
  closeModal("#adminAuthModal");
  alert("관리자 인증 완료");
});

// --- 사용자 관리 API (제안 스펙) ---
async function apiListUsers(){
  try{
    const res = await fetch(`${BASE_URL}/admin/users`, { method:"GET", headers: authHeaders() });
    const data = await res.json().catch(()=>({ users:[] }));
    return data.users || data || [];
  }catch(e){ return []; }
}
async function apiAddUser({studentId, name, password}){
  try{
    const res = await fetch(`${BASE_URL}/admin/users`, {
      method:"POST", headers: authHeaders(),
      body: JSON.stringify({ studentId:String(studentId), name, password })
    });
    const data = await res.json().catch(()=>null);
    return res.ok ? { ok:true, user: data.user || data } : { ok:false, message: (data && (data.error||data.message)) || "등록 실패" };
  }catch(e){ return { ok:false, message:"네트워크 오류" }; }
}
async function apiDeleteUser(studentId){
  // 백엔드가 DELETE /admin/users/:studentId 혹은 body 방식 둘다 수용하면 좋습니다.
  try{
    let res = await fetch(`${BASE_URL}/admin/users/${encodeURIComponent(String(studentId))}`, { method:"DELETE", headers: authHeaders() });
    if (res.status === 404){ // 경로 방식 미구현이면 body로 재시도
      res = await fetch(`${BASE_URL}/admin/users`, { method:"DELETE", headers: authHeaders(), body: JSON.stringify({ studentId:String(studentId) }) });
    }
    const data = await res.json().catch(()=>null);
    return res.ok ? { ok:true } : { ok:false, message:(data && (data.error||data.message)) || "삭제 실패" };
  }catch(e){ return { ok:false, message:"네트워크 오류" }; }
}

// --- 사용자 관리 모달 열기(인증 필요) ---
$("#btnUserManage")?.addEventListener("click", async ()=>{
  if (!getAdminToken()){
    alert("먼저 관리자 인증이 필요합니다.");
    openModal("#adminAuthModal");
    return;
  }
  await renderUserTable();
  openModal("#userManageModal");
});

async function renderUserTable(){
  const tbody = $("#um-table tbody"); if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='3'>로딩중...</td></tr>";
  const list = await apiListUsers();
  if (!Array.isArray(list) || list.length===0){
    tbody.innerHTML = "<tr><td colspan='3'>사용자 없음</td></tr>";
    return;
  }
  tbody.innerHTML = list.map(u =>
    `<tr><td>${u.id ?? ""}</td><td>${u.studentId ?? ""}</td><td>${u.name ?? u.username ?? ""}</td></tr>`
  ).join("");
}
$("#um-refresh")?.addEventListener("click", renderUserTable);

// 추가
$("#um-add")?.addEventListener("click", async ()=>{
  const studentId = ($("#um-student")?.value || "").trim();
  const name      = ($("#um-name")?.value || "").trim();
  const password  = ($("#um-pw")?.value || "").trim();
  if (!studentId || !name || !password){
    alert("학번/이름/비밀번호를 모두 입력하세요."); return;
  }
  const r = await apiAddUser({ studentId, name, password });
  if (!r.ok){ alert(r.message); return; }
  alert("추가 완료");
  $("#um-student").value = $("#um-name").value = $("#um-pw").value = "";
  renderUserTable();
});

// 삭제
$("#um-del")?.addEventListener("click", async ()=>{
  const studentId = ($("#um-del-student")?.value || "").trim();
  if (!studentId){ alert("삭제할 학번을 입력하세요."); return; }
  if (!confirm(`${studentId} 사용자를 삭제할까요?`)) return;
  const r = await apiDeleteUser(studentId);
  if (!r.ok){ alert(r.message); return; }
  alert("삭제 완료");
  $("#um-del-student").value = "";
  renderUserTable();
});
