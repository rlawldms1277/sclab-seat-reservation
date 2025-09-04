// js/seat.js

import { renderLoggedInUser} from "./user.js";

// ----------------- 서버 주소 -----------------
const BASE_URL = "https://lab-reserve-backend.onrender.com";


// ----------------- 상태 관리 -----------------
const state = { room: "901", seat: null, time: null, user: null, reservations: [], allowSeatPick: false };

// 전역 플래그 동기화(모달 스크립트에서 사용)
function setAllowSeatPick(v) {
  state.allowSeatPick = v;
  window.__allowSeatPick = v;
}

// 시간 포맷/범위 표시
function two(n){ return String(n).padStart(2,"0"); }
function fmtHM(d){ return `${two(d.getHours())}:${two(d.getMinutes())}`; }
function displayRange(startISO, endISO){
  const st = new Date(startISO);
  // 화면 표시는 xx:59로 보이도록 1분 뺀 값을 사용
  const ed = new Date(new Date(endISO).getTime() - 60*1000);
  return `${fmtHM(st)}~${fmtHM(ed)}`;
}

// 학번(또는 사용자 식별값) 추출
function getStudentLabel(rec){
  const raw = rec.raw || {};
  const u = raw.user || raw.User || {};
  return rec.studentId || u.studentId || raw.studentId || u.username || (rec.userId != null ? String(rec.userId) : "-");
}

// 좌석의 '지금 진행 중' 예약(우선) 또는 '다음 예정' 예약 찾기
function getActiveOrNextReservationForSeat(seatId){
  const now = new Date();
  const todayStr = localDateStr(now);

  const list = (state.reservations || []).filter(r =>
    r.startDateOnly === todayStr &&
    String(r.room) === String(state.room) &&
    String(r.seatId ?? r.seat) === String(seatId) &&
    r.startTime && r.endTime
  );

  // 현재 진행 중 먼저
  const active = list.find(r => new Date(r.startTime) <= now && now < new Date(r.endTime));
  if (active) return active;

  // 없으면 가장 가까운 다음 예약
  return list.sort((a,b)=> new Date(a.startTime) - new Date(b.startTime))[0] || null;
}

// 우측 카드에 선택 좌석 정보 렌더
function renderSelectedSeatInfo(seatId){
  const infoEl  = $("#currentResv");
  const labelEl = $("#selSeatLabel");
  if (!infoEl) return;

    // 좌석 라벨(캔버스에서 가져오기)
  const seatEl =
    $(`#room-${state.room} .seat[data-seat-id="${seatId}"]`) ||
    document.querySelector(`.seat[data-seat-id="${seatId}"]`);
  const seatLabel = seatEl ? (seatEl.dataset.seatLabel || seatEl.textContent.trim() || seatId) : seatId;

  if (labelEl) labelEl.textContent = `선택 좌석 ${seatLabel}`;

  const rec = getActiveOrNextReservationForSeat(seatId);
  if (!rec) { infoEl.textContent = "현재 예약 없음"; return; }

  const stu = getStudentLabel(rec);
  const range = displayRange(rec.startTime, rec.endTime);
  infoEl.textContent = `학번 ${stu} · ${range}`;
}

// ==== 조용한 로그인(토큰 발급 + user 저장) ====
// ✓ /login 로 맞추고, studentId 숫자로 보냄
async function silentLoginByStudent(studentId, password){
  try{
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        username: String(studentId).trim(),   // 학번을 username/userId로 같이 보냄
        userId:   String(studentId).trim(),
        password
      })
    });

    const data = await res.json().catch(()=>null);
    if (!res.ok) {
      // 디버깅에 도움 되도록 서버 메시지 보여주기
      const msg = (data && (data.error || data.message)) || `로그인 실패 (${res.status})`;
      return { ok:false, message: msg };
    }
    // 토큰/유저 저장(키 이름이 다를 수도 있어 대비)
    const token = data.token || data.accessToken || data.jwt;
    const uid   = data.userId || (data.user && data.user.id);
    // 프런트 로직에서 id가 필요하므로 꼭 채워넣기
    const user  = data.user || { id: uid, studentId: String(studentId).trim() };
    if (token) localStorage.setItem("token", token);

    const u = await hydrateMe();
    if (!u) {
      // 최소한 학번은 저장
      const fallback = { id: data.userId, studentId: String(studentId).trim() };
      localStorage.setItem("user", JSON.stringify(fallback));
    }
    return { ok:true, user: JSON.parse(localStorage.getItem("user")||"null") };
  }catch(e){
    console.error(e);
    return { ok:false, message:"네트워크 오류" };
  }
}

async function hydrateMe(){
  try{
    const res = await fetch(`${BASE_URL}/me`, { headers: authHeaders() });
    const data = await res.json().catch(()=>null);
    if (!res.ok) return null;
    const user = data.user || data;
    if (user) localStorage.setItem("user", JSON.stringify(user));
    // (선택) 우측 인사말 이름도 갱신
    const hello = document.getElementById("helloName");
    if (hello && user) hello.textContent = user.name || user.studentId || user.userId || "사용자";
    return user;
  }catch(e){ return null; }
}



// ----------------- 유틸 함수 -----------------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function loadLocalReservations() {
  try { return JSON.parse(localStorage.getItem("reservations") || "[]"); }
  catch (e) { return []; }
}
function saveLocalReservations(arr) {
  localStorage.setItem("reservations", JSON.stringify(arr));
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

function clearSession(){
  ["token","user","lastReservationId","myReservation"].forEach(k =>
    localStorage.removeItem(k)
  );
}

function isAdminUser(u){
  if (!u) return false;
  // 대표 키들을 모두 확인
  const roleOne = String(u.role || u.course || u.type || "").toUpperCase();
  const roles   = Array.isArray(u.roles) ? u.roles.map(r => String(r).toUpperCase()) : [];

  return Boolean(
    u.isAdmin || u.admin ||                      // 불리언 플래그
    roleOne.includes("ADMIN")    ||
    roleOne.includes("PROFESSOR")||
    roleOne.includes("DOCTOR")   ||
    roles.some(r => ["ADMIN","PROFESSOR","DOCTOR"].includes(r))
  );
}

function syncHelloName(){
  const u = JSON.parse(localStorage.getItem("user") || "null");
  const hello = document.getElementById("helloName");
  if (hello) hello.textContent = (u?.name || u?.studentId || u?.userId || "사용자");
}

// 시간 라벨 "9:00" → 9
function hourFromLabel(label) {
  const m = String(label).match(/^(\d{1,2})/);
  return m ? parseInt(m[1], 10) : null;
}

// 로컬 날짜를 YYYY-MM-DD 로 반환
function localDateStr(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function hasMyReservationToday() {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (isAdminUser(user)) return false;
  const myId = user ? Number(user.id) : null;
  if (!myId) return false;

  const todayStr = localDateStr(new Date());

  // ‘하루 1회’로 셀 상태들(정책에 맞춰 조정 가능)
  const COUNT_STATUSES = new Set(["PENDING","CHECKED_IN","FINISHED","EXPIRED"]);

  return (state.reservations || []).some(r =>
    r.startDateOnly === todayStr &&
    r.userId != null && Number(r.userId) === myId &&
    COUNT_STATUSES.has(String(r.status || "").toUpperCase())
  );
}

// seat.js 적당한 곳
function pubHM(dateLike){ const d=new Date(dateLike); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function minus1min(dateLike){ return new Date(new Date(dateLike).getTime() - 60*1000); }

// ADD: PENDING 20분 TTL
const PENDING_TTL_MIN = 20;
const ONE_MIN = 60 * 1000;


const EXTEND_WINDOW_MIN = 20; // 종료 20분 전~종료까지 연장 가능
const EXTEND_MAX_HOURS  = 3;  // 최대 3시간(서버와 의미 일치, 참고용)


function getCreatedAt(rec) {
  const v = rec.createdAt || (rec.raw && rec.raw.createdAt);
  return v ? new Date(v) : null;
}

function isActivePending(rec) {
  const s = String(rec.status || "").toUpperCase();
  if (s !== "PENDING") return false;            // ← CREATED 제거
  const ca = getCreatedAt(rec);
  if (!ca) return true;
  return (Date.now() - ca.getTime()) < (PENDING_TTL_MIN * 60 * 1000);
}

function updateExtendButtonState() {
  const extendBtn = $("#btnExtend");
  if (!extendBtn) return;

  let title = "";
  let isBlocked = false;

  if (!state.seat) {
    title = "좌석을 먼저 선택하세요.";
    isBlocked = true;
  } else {
    const base = findMyActiveReservationForSeat(state.seat);
    if (!base) {
      title = "체크인된 내 예약이 없습니다.";
      isBlocked = true;
    } else {
      const now = new Date(), end = new Date(base.endTime);
      const earliest = new Date(end.getTime() - EXTEND_WINDOW_MIN * 60 * 1000);
      if (!(now >= earliest && now <= end)) {
        title = `연장은 종료 ${EXTEND_WINDOW_MIN}분 전부터 종료 시까지 가능합니다.`;
        isBlocked = true;
      }
    }
  }

  // 클릭은 가능하게 두고, 시각적으로만 비활성처럼 보이게 처리
  extendBtn.title = title;
  extendBtn.classList.toggle("is-disabled", isBlocked);
  extendBtn.setAttribute("aria-disabled", isBlocked ? "true" : "false");

  // ❌ 금지: 클릭 막히니 절대 쓰지 마세요
  // extendBtn.disabled = true/false;
}

function getStudentIdFromRec(rec){
  const raw = rec.raw || {};
  const u = raw.user || raw.User || {};
  return u.studentId || raw.studentId || null;
}
function isNowBetween(stISO, edISO){
  const now = Date.now();
  const st = new Date(stISO).getTime();
  const ed = new Date(edISO).getTime();
  return st <= now && now < ed;
}

// 학번으로 '오늘 진행 중' 예약 찾기 → reservationId 반환
async function findActiveReservationIdByStudent(studentId){
  try {
    // 모든 방의 예약을 받아와서(백엔드가 전체 반환 지원)
    const res  = await fetch(`${BASE_URL}/reservations`);
    const data = await res.json().catch(()=>({ reservations: [] }));
    const list = (data.reservations || data || []).map(normalizeReservationRaw);

    const today = localDateStr(new Date());

    // 1) 지금 시간대에 진행 중인 예약 우선
    const active = list.find(r =>
      r.startDateOnly === today &&
      getStudentIdFromRec(r) == studentId &&
      r.startTime && r.endTime &&
      isNowBetween(r.startTime, r.endTime)
    );
    if (active) return active.id;

    // 2) 없다면, 오늘 해당 학번 예약 중 가장 최근 것
    const todays = list
      .filter(r => r.startDateOnly === today && getStudentIdFromRec(r) == studentId);
    if (todays.length){
      todays.sort((a,b)=> new Date(b.startTime) - new Date(a.startTime));
      return todays[0].id;
    }
    return null;
  } catch(e){
    console.error(e);
    return null;
  }
}


// ----------------- 서버 호출 -----------------
async function apiFetchReservations(room) {
  try {
    const url = room 
      ? `${BASE_URL}/reservations?room=${room}`   // 숫자로 전달
      : `${BASE_URL}/reservations`;

    const res = await fetch(url, { method: "GET"});

    if (!res.ok) throw new Error("fetch reservations failed");
    const data = await res.json();
    return data.reservations || data || [];
  } catch (err) {
    console.warn("apiFetchReservations failed, using local fallback", err);
    return loadLocalReservations().filter(r => String(r.room) === String(room));
  }
}

async function apiCreateReservation({ seat, startTimeISO, endTimeISO }) {
  try {
    const body = {
      seatId: Number(seat),
      startTime: startTimeISO,
      endTime: endTimeISO
    };

    const res = await fetch(`${BASE_URL}/reservations?dev=1`, {
      method: "POST",
      headers: authHeaders(),  // ✅ 반드시 토큰 포함
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, reason: data.error || data.message || "server error", body: data };
    }
    return {
      ok: true,
      rec: data.reservation || data,
      pin: data.devPin || null
    };
  } catch (err) {
    console.warn("apiCreateReservation failed:", err);
    return { ok: false, reason: "network" };
  }
}

async function apiCheckin(reservationId){
  try{
    // 1) 신형 경로 먼저 시도
    let res = await fetch(`${BASE_URL}/reservations/${reservationId}/checkin`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({})
    });

    // 2) 없으면(404) 구형 경로로 재시도
    if (res.status === 404) {
      res = await fetch(`${BASE_URL}/checkin`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reservationId: Number(reservationId) })
      });
    }

    const data = await res.json().catch(()=>null);
    if (!res.ok) return { ok:false, reason: data?.error || data?.message || "server error" };
    return { ok:true, rec: data.reservation || data };
  }catch(e){
    console.warn("apiCheckin failed:", e);
    return { ok:false, reason:"network" };
  }
}


async function apiExtendReservation(reservationId) {
  try {
    const res = await fetch(`${BASE_URL}/reservations/${reservationId}/extend`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}) // 바디는 비워도 OK
    });
    const data = await res.json();
    if (!res.ok) return { ok:false, reason: data.error || data.message || "server error", body:data };
    return { ok:true, rec: data.reservation || data };
  } catch (e) {
    console.warn("apiExtendReservation failed:", e);
    return { ok:false, reason: "network" };
  }
}


// ----------------- 정규화 함수 -----------------
function normalizeReservationRaw(raw) {
  const room = raw.room || raw.roomId || (raw.seat && raw.seat.room) || state.room;
  const userId = (raw.userId ?? (raw.user && raw.user.id)) ?? null;
  let seat = raw.seat || raw.seatId;
  if (seat && typeof seat === "object") seat = seat.seatNumber || seat.id;

    // ✅ 응답이 seatId/seat.id 또는 seatNumber/seat.seatNumber 로 올 경우 모두 수용
  const seatId     = (raw.seatId ?? (raw.seat && raw.seat.id)) ?? null;
  const seatNumber = (raw.seatNumber ?? (raw.seat && raw.seat.seatNumber)) ?? null;

  const start = raw.startTime;
  const end   = raw.endTime;
  const startDate = start ? new Date(start) : null;
  const endDate   = end ? new Date(end) : null;

  let endHourExclusive = null;
  if (endDate) {
    endHourExclusive = endDate.getHours();
    if (endDate.getMinutes() > 0 || endDate.getSeconds() > 0 || endDate.getMilliseconds() > 0) {
      endHourExclusive += 1; // ← 여기 보정
    }
  }

  return {
    id: raw.id || `${room}-${seat}-${start}`,
    room: String(room),
    seat: seatId != null ? String(seatId) : (seatNumber != null ? String(seatNumber) : null),
    seatId: seatId != null ? String(seatId) : null,
    seatNumber: seatNumber != null ? String(seatNumber) : null,

    studentId: raw.studentId || (raw.user && raw.user.studentId) || (raw.User && raw.User.studentId) || null,

    startTime: startDate ? startDate.toISOString() : null,
    endTime: endDate ? endDate.toISOString() : null,
    startHour: startDate ? startDate.getHours() : null,
    endHourExclusive, // ← 보정값 사용
    status: raw.status || "",
    pin: raw.pin || null,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : null, 
    startDateOnly: startDate ? localDateStr(startDate) : null,
    userId: userId != null ? Number(userId) : null,
    raw
  };
}

function cleanupLocalReservation() {
  try {
    const m = JSON.parse(localStorage.getItem("myReservation") || "null");
    if (!m) return;

    const now = new Date();
    const end = m.endTime ? new Date(m.endTime) : null;
    const status = String(m.status || "").toUpperCase();

    // ADD: PENDING TTL 만료 체크
    const ca = m.createdAt ? new Date(m.createdAt).getTime() : null;
    const ttlExpired = ca ? (now - ca) >= (PENDING_TTL_MIN * ONE_MIN) : false;
    if ((status === "PENDING" || status === "CREATED") && ttlExpired) {
      localStorage.removeItem("myReservation");
      return;
    }  

    // 끝났거나(시간 지남) 종료 상태면 로컬에서 삭제
    if (!end || now >= end ||
        status === "FINISHED" || status === "EXPIRED" || status === "CANCELED") {
      localStorage.removeItem("myReservation");
    }
  } catch (e) {}
}


// 로컬에 저장된 내 예약(PENDING)을 state.reservations에 합쳐 넣어 새로고침해도 초록 유지
function mergeLocalPendingReservation() {
  try {
    const m = JSON.parse(localStorage.getItem("myReservation") || "null");
    if (!m) return;
    if (String(m.room) !== String(state.room)) return;

    const status = String(m.status || "").toUpperCase();
    if (status !== "PENDING") return;

    const start = m.startTime ? new Date(m.startTime) : null;
    const end   = m.endTime ? new Date(m.endTime) : null;
    if (!start || !end) return;

    const startDateOnly = localDateStr(start);

    let endHourExclusive = end.getHours();
    if (end.getMinutes() > 0 || end.getSeconds() > 0 || end.getMilliseconds() > 0) {
      endHourExclusive += 1;
    }

    const id = m.id || `${m.room}-${m.seat}-${m.startTime}`;
    const createdAt = m.createdAt ? new Date(m.createdAt) : new Date(); // ADD
    const pending = {
      id,
      room: String(m.room),
      seat: String(m.seat),
      seatId: String(m.seat),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      startHour: start.getHours(),
      startDateOnly,
      endHourExclusive,
      status: "PENDING",
      pin: m.pin || null,
      createdAt: createdAt.toISOString(),
      raw: m
    };

    const idx = state.reservations.findIndex(r => r.id === id);
    if (idx >= 0) state.reservations[idx] = pending;
    else state.reservations.push(pending);
  } catch (e) {}
}


function findMyActiveReservationForSeat(seatId) {
  if (!seatId) return null;
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const myId = user ? Number(user.id) : null;

  const now = new Date();
  const todayStr = localDateStr(now);

  const candidates = (state.reservations || []).filter(r => {
    if (r.startDateOnly !== todayStr) return false;
    if (String(r.room) !== String(state.room)) return false;
    if (String(r.seatId ?? r.seat) !== String(seatId)) return false;
    if (!r.startTime || !r.endTime) return false;
    const st = new Date(r.startTime), et = new Date(r.endTime);
    if (!(st <= now && now < et)) return false;     // 지금 시간대
    if (r.userId != null && myId != null && Number(r.userId) !== myId) return false; // 내 예약만
    return true;
  });

  // 서버 정책: CHECKED_IN만 연장 가능 → 그걸 우선 선택
  return candidates.find(r => String(r.status).toUpperCase() === "CHECKED_IN") || null;
}


// === 남은시간 표시용 유틸 ===
function findMyCurrentCheckedInReservation() {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const myId = user ? Number(user.id) : null;
  if (!myId) return null;

  const now = new Date();
  const todayStr = localDateStr(now);

  return (state.reservations || []).find(r =>
    r.startDateOnly === todayStr &&
    r.userId != null && Number(r.userId) === myId &&
    String(r.status || "").toUpperCase() === "CHECKED_IN" &&
    r.startTime && r.endTime &&
    new Date(r.startTime) <= now && now < new Date(r.endTime)
  ) || null;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${m}:${String(s).padStart(2,"0")}`;
}

let __remainTimer = null;
function updateRemainTimeBox() {
  const box = document.getElementById("remainTime");
  if (!box) return;

  const rec = findMyCurrentCheckedInReservation();
  if (!rec) {
    box.textContent = "";
    const ext = document.getElementById("btnExtend");
    if (ext) ext.textContent = "연장";
    return;
  }

  const left = Math.max(0, new Date(rec.endTime).getTime() - Date.now());
  const seatLabel = rec.seatNumber || rec.seat || "";
  box.textContent = `남은 시간: ${formatDuration(left)} (좌석 ${seatLabel})`;

  const ext = document.getElementById("btnExtend");
  if (ext) ext.textContent = `연장 (${formatDuration(left)})`;
}


function startRemainTimer() {
  if (__remainTimer) clearInterval(__remainTimer);
  updateRemainTimeBox();
  __remainTimer = setInterval(updateRemainTimeBox, 1000);
}

// ----------------- UI 렌더링 -----------------
function renderTimeStatusForSeat(seatId) {
  const timeButtons = $$(".time-grid button");
  const reservations = state.reservations || [];
  const todayStr = localDateStr(new Date());
  
  const now = new Date();
  const nowHour = now.getHours();

  // 초기화
  timeButtons.forEach(btn => {
    btn.classList.remove("reserved", "done", "picked");
    btn.disabled = false;
  });

  if (!seatId) return;

  timeButtons.forEach(btn => {
    const btnHour = hourFromLabel(btn.textContent);
    if (btnHour === null) return;

    // 지난 '시'는 비활성화 (같은 시는 허용)
    if (btnHour < nowHour) {
      btn.disabled = true;
    }
    // 동일 좌석/방 + 해당 시간에 겹치는 모든 예약 수집
    const matches = reservations.filter(r =>
      r.startDateOnly === todayStr && 
      String(r.room) === String(state.room) &&
      String(r.seatId ?? r.seat) === String(seatId) &&
      r.startHour != null && r.endHourExclusive != null &&
      btnHour >= r.startHour && btnHour < r.endHourExclusive
    );

    if (!matches.length) return;

    // 우선순위: CHECKED_IN > PENDING/CREATED
    const hasCheckedIn   = matches.some(r => String(r.status).toUpperCase() === "CHECKED_IN");
    const hasActivePend  = matches.some(r => isActivePending(r)); // CHANGE

    if (hasCheckedIn) { btn.classList.add("done");     btn.disabled = true; return; }
    if (hasActivePend){ btn.classList.add("reserved"); btn.disabled = true; return; }
    // FINISHED/EXPIRED/CANCELED 등만 있으면 선택 가능(표시/차단 없음)
  });
}


async function refreshReservationsForRoom(room) {
    if (__refreshing) return;          // 겹치기 방지
    __refreshing = true;
    try {
      cleanupLocalReservation();

      const raw = await apiFetchReservations(room);
      state.reservations = raw.map(normalizeReservationRaw);

      mergeLocalPendingReservation();
      updateSeatUI(room);
      renderTimeStatusForSeat(state.seat);
      updateExtendButtonState();
      startRemainTimer();
      if (state.seat) renderSelectedSeatInfo(state.seat);
    } finally {
      __refreshing = false;
    }
  }
  
function updateSeatUI(room) {
  const reservations = state.reservations || [];
  const seats = $$("#room-" + room + " .seat");
  const now = new Date(); // ← 현재 시각
  const todayStr = localDateStr(now);

  seats.forEach(seatEl => {
    // ✅ 고정석은 항상 회색 + 선택 불가
    if (seatEl.dataset.fixed === "true") {
      seatEl.classList.remove("available","used");
      seatEl.classList.add("fixed");
      seatEl.style.pointerEvents = "none";
      return;
    }

    const seatId = seatEl.dataset.seatId; // ← 필요합니다 (예약 매칭에 사용)

    // 기본값: 사용 가능
    seatEl.classList.remove("used");
    seatEl.classList.add("available");

    // 지금 시각에 겹치는 CHECKED_IN 예약이 있으면 used
    const isUsedNow = reservations.some(r =>
      r.startDateOnly === todayStr && 
      String(r.room) === String(room) &&
      String(r.seatId ?? r.seat) === String(seatId) &&
      String(r.status).toUpperCase() === "CHECKED_IN" &&
      r.startTime && r.endTime &&
      new Date(r.startTime) <= now && now < new Date(r.endTime)
    );

    if (isUsedNow) {
      seatEl.classList.remove("available");
      seatEl.classList.add("used");
    }
  });
}


// ----------------- 좌석/시간 선택 -----------------
async function onSeatClick(e) {
  const seat = e.currentTarget;

  // ✅ [예약하기]를 누르기 전에는 좌석 선택/모달 금지
  if (!state.allowSeatPick) {
    alert("예약하려면 우측의 [예약하기] 버튼을 먼저 눌러주세요.");
    return;
  }

  // 🔽 클릭한 좌석이 속한 방으로 state.room 자동 변경
  const roomEl = seat.closest('.seats-canvas');
  if (roomEl && roomEl.id.startsWith('room-')) {
    const clickedRoom = roomEl.id.replace('room-', '');
    if (state.room !== clickedRoom) {
      state.room = clickedRoom;
      await refreshReservationsForRoom(state.room);
    }
  }

  if (seat.dataset.fixed === "true") {
    alert("고정석은 선택할 수 없습니다.");
    return;
  }

  $$(".seat.selected").forEach(s => s.classList.remove("selected"));
  seat.classList.add("selected");

  state.seat = seat.dataset.seatId;

  renderTimeStatusForSeat(state.seat);
  updateExtendButtonState();
  renderSelectedSeatInfo(state.seat);
}

function onTimeClick(e) {
  const btn = e.currentTarget;
  if (btn.disabled) { alert("이미 지난 시간대입니다."); return; }
  if (btn.classList.contains("reserved") || btn.classList.contains("done")) {
    alert("이미 예약된 시간입니다.");
    return;
  }
  $$(".time-grid button").forEach(b => b.classList.remove("picked"));
  btn.classList.add("picked");
  state.time = btn.textContent.trim();
}

//--------------퇴실---------------------------------
async function apiCheckout(reservationId, password) {
  const idNum = Number(reservationId);
  if (Number.isNaN(idNum)) return { ok:false, message:"예약 ID가 올바르지 않습니다." };

  try {
    const res = await fetch(`${BASE_URL}/checkout`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reservationId: idNum, password })
    });
    const data = await res.json().catch(()=>null);
    if (!res.ok) return { ok:false, message: (data && (data.error || data.message)) || "퇴실 실패" };
    return { ok:true, data };
  } catch (e) {
    console.error(e);
    return { ok:false, message:"네트워크 오류" };
  }
}


// 표시용 시간 범위(xx:59 보정)
function __fmt2(n){ return String(n).padStart(2,"0"); }
function __rangeText(stISO, edISO){
  const st = new Date(stISO);
  const ed = new Date(new Date(edISO).getTime() - 60*1000);
  return `${__fmt2(st.getHours())}:${__fmt2(st.getMinutes())}~${__fmt2(ed.getHours())}:${__fmt2(ed.getMinutes())}`;
}
function __getStudent(rec){
  const raw = rec.raw || {};
  const u = raw.user || raw.User || {};
  return u.studentId || raw.studentId || u.username || (rec.userId != null ? String(rec.userId) : "-");
}




// ----------------- 예약 버튼 액션 -----------------
function bindActions() {
  const reserveBtn = $("#btnReserve");
  const leaveBtn   = $("#btnLeave");
  const extendBtn  = $("#btnExtend");

  // [예약하기]: 1) 선택모드 ON → (첫 클릭) 좌석/시간 안내만
  //            2) 좌석+시간 고른 상태(두 번째 클릭)면 로그인→예약 실행
  reserveBtn.addEventListener("click", async () => {
    setAllowSeatPick(true); // 좌석 선택 허용

    // 좌석/시간 아직이면 안내만 하고 끝 (로그인 시도 X)
    if (!state.seat || !state.time) {
      const info = $("#currentResv");
      if (info) info.textContent = "좌석을 클릭하고 시간대를 선택하세요.";
      return;
    }

    // 여기 들어왔다는 건 좌석과 시간까지 선택 끝난 상태(두 번째 클릭)
    // 1) 토큰 없으면 모달의 학번/비번으로 '조용히 로그인'
    if (!localStorage.getItem("token")) {
      const sid = (document.getElementById("rm-student")?.value || "").trim();
      const pw  = (document.getElementById("rm-pw")?.value || "").trim();
      if (!sid || !pw) { alert("학번과 비밀번호를 입력해주세요."); return; }

      const login = await silentLoginByStudent(sid, pw);
      if (!login.ok) { alert(login.message || "로그인 실패"); return; }
    }

    // 2) 서버 최신 예약 불러오고(중복/겹침 체크)
    await refreshReservationsForRoom(state.room);
    if (hasMyReservationToday()) { alert("이미 오늘 1회 예약을 사용했습니다."); return; }

    const selHour = hourFromLabel(state.time);
    const today   = new Date();
    const now     = new Date();

    let startLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate(), selHour, 0, 0, 0);
    if (startLocal < now) {
      if (now.getHours() === selHour) {
        startLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate(), now.getHours(), now.getMinutes(), 0, 0);
      } else { alert("이미 지난 시간대는 예약할 수 없습니다."); return; }
    }

    let endLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate(), selHour + 4, 0, 0, 0);
    endLocal = new Date(endLocal.getTime() - 60 * 1000); // xx:59

    // 뒤 예약과 겹치면 끝 시간 당겨주기
    const future = state.reservations.filter(r =>
      r.startDateOnly === localDateStr(today) &&
      String(r.room) === String(state.room) &&
      String(r.seatId ?? r.seat) === String(state.seat) &&
      r.startHour != null && r.startHour >= selHour &&
      (String(r.status || "").toUpperCase() === "CHECKED_IN" || isActivePending(r))
    );
    if (future.length) {
      const nextStartHour = Math.min(...future.map(r => r.startHour));
      const nextStartDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), nextStartHour, 0, 0, 0);
      if (nextStartDate < endLocal) endLocal = new Date(nextStartDate.getTime());
    }

    // 3) 예약 생성
    const apiResult = await apiCreateReservation({ seat: state.seat, startTimeISO: startLocal.toISOString(), endTimeISO: endLocal.toISOString() });
    if (!apiResult.ok) { alert("예약 실패: " + (apiResult.reason || "서버 오류")); await refreshReservationsForRoom(state.room); return; }

    // 4) 즉시 체크인 (PIN 없이)
    const made = normalizeReservationRaw(apiResult.rec);
    localStorage.setItem("lastReservationId", String(made.id));
    const chk = await apiCheckin(made.id); // ← 여기서 바로 입실
    if (!chk.ok) {
      alert("예약은 생성됐지만 체크인은 실패했습니다. 다시 시도해주세요.");
    }

    // 5) UI 갱신
    await refreshReservationsForRoom(state.room);
    renderSelectedSeatInfo(state.seat);

    // 6) 안내 (PIN 문구 제거)
    alert(`예약 및 입실 완료!\n좌석: ${made.seat}\n시간: ${state.time}`);
    setAllowSeatPick(false);
  });

  // 시간 버튼
  $$(".time-grid button").forEach(b => b.addEventListener("click", onTimeClick));

  // ====== 퇴실 모달 오픈 ======
  leaveBtn.addEventListener("click", () => {
    const modal = document.getElementById("checkoutModal");
    const sidEl = document.getElementById("cm-student");
    const pwEl  = document.getElementById("cm-pw");

    // 입력 초기화 + 학번 자동 채우기(로그인 정보 있으면)
    if (sidEl) {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      sidEl.value = u?.studentId || "";
    }
    if (pwEl) pwEl.value = "";

    // 좌석 라벨 채우기
    const seatSpan = document.getElementById("cm-seat");
    if (seatSpan) {
      if (state.seat) {
        const seatEl =
          document.querySelector(`#room-${state.room} .seat[data-seat-id="${state.seat}"]`)
          || document.querySelector(`.seat[data-seat-id="${state.seat}"]`);
        const label = seatEl ? (seatEl.dataset.seatLabel || seatEl.textContent.trim() || state.seat) : state.seat;
        seatSpan.textContent = label;
      } else {
        seatSpan.textContent = "-";
      }
    }

    // 내 활성 예약 id 미리 세팅(있으면)
    if (modal) {
      const rec = state.seat ? findMyActiveReservationForSeat(state.seat) : null;
      if (rec) modal.dataset.reservationId = rec.id;
      else delete modal.dataset.reservationId;
      modal.classList.add("show");
    }
  });

  // ====== 연장 모달 오픈 ======
  extendBtn.addEventListener("click", async () => {
    if (!state.seat) { alert("연장할 좌석을 먼저 선택해주세요(현재 사용 중인 좌석)."); return; }

    await refreshReservationsForRoom(state.room);
    const base = findMyActiveReservationForSeat(state.seat);
    if (!base) { alert("현재 시간에 사용 중인 내 예약을 찾을 수 없습니다.\n(체크인 상태 + 같은 좌석이어야 합니다.)"); return; }

    // 종료 20분 전 ~ 종료까지 허용
    const now = new Date(), endTime = new Date(base.endTime);
    const earliest = new Date(endTime.getTime() - EXTEND_WINDOW_MIN * 60 * 1000);
    if (now < earliest || now > endTime) {
      alert(`연장은 종료 ${EXTEND_WINDOW_MIN}분 전부터 종료 시각까지 가능합니다.\n(현재 종료: ${endTime.toLocaleTimeString()})`);
      return;
    }

    // 모달 채우기
    const mdl = document.getElementById("extendModal");
    const seatEl = document.querySelector(`#room-${state.room} .seat[data-seat-id="${state.seat}"]`)
                 || document.querySelector(`.seat[data-seat-id="${state.seat}"]`);
    const label = seatEl ? (seatEl.dataset.seatLabel || seatEl.textContent.trim() || state.seat) : state.seat;

    document.getElementById("em-seat").textContent  = label;
    document.getElementById("em-start").textContent = pubHM(base.startTime);
    document.getElementById("em-end").textContent   = pubHM(minus1min(base.endTime));

    const u = JSON.parse(localStorage.getItem("user") || "null");
    document.getElementById("em-student").value = u?.studentId || "";
    document.getElementById("em-pw").value = "";

    mdl.dataset.reservationId = base.id;
    mdl.classList.add("show");
  });
}

// 모달 내부 버튼 바인딩 (최초 1회면 충분)
(function bindCheckoutModalOnce(){
  const modal = document.getElementById("checkoutModal");
  if (!modal || modal.__bound) return;
  modal.__bound = true;

  const close = () => modal.classList.remove("show");
  modal.querySelector(".rm-close")?.addEventListener("click", close);
  modal.addEventListener("click", (e)=>{ if(e.target === modal) close(); });

  document.getElementById("cm-do")?.addEventListener("click", async ()=> {
    const sid = (document.getElementById("cm-student")?.value || "").trim();
    const pw  = (document.getElementById("cm-pw")?.value || "").trim();
    if (!sid || !pw) { alert("학번/비밀번호를 입력해주세요."); return; }

    // 토큰 없으면 조용히 로그인
    if (!localStorage.getItem("token")) {
      const login = await silentLoginByStudent(sid, pw);
      if (!login.ok) { alert(login.message || "로그인 실패"); return; }
    }

  // reservationId: 모달에 저장된 값 → localStorage → 학번으로 조회
  // 1) 모달에 세팅된 값(좌석을 직접 선택했다면)
  let rid = modal.dataset.reservationId || "";
  // 2) 현재 체크인 중인 내 예약에서 찾기(좌석 미선택이어도 OK)
  if (!rid) {
    const cur = findMyCurrentCheckedInReservation();
    if (cur) rid = cur.id;
  }
  // 3) 방금 만든 예약 id (같은 탭/세션이면 있음)
  if (!rid) {
    rid = localStorage.getItem("lastReservationId") || "";
  }
  // 4) 서버에서 '오늘 내 예약'을 학번으로 조회 (최후)
  if (!rid) {
    rid = await findActiveReservationIdByStudent(sid);
  }

  if (!rid) { alert("퇴실할 예약을 찾지 못했습니다."); return; }

    const res = await apiCheckout(rid, pw);
    if (!res.ok) { alert("퇴실 실패: " + (res.message || "알 수 없는 오류")); return; }

    alert("퇴실이 완료되었습니다. 이용해주셔서 감사합니다!");
    localStorage.setItem("reservationUpdate", Date.now().toString());
    localStorage.removeItem("lastReservationId");
    localStorage.removeItem("myReservation");

    // 🔽 추가: 세션 종료 + 인사말 리셋
    clearSession();        // token / user 삭제
    syncHelloName();       // "사용자"로 즉시 반영
    setAllowSeatPick(false);

    close();
    await refreshReservationsForRoom(state.room);
  });
})();

(function bindExtendModalOnce(){
  const modal = document.getElementById("extendModal");
  if (!modal || modal.__bound) return;
  modal.__bound = true;

  const close = () => modal.classList.remove("show");
  modal.querySelector(".rm-close")?.addEventListener("click", close);
  modal.addEventListener("click", (e)=>{ if(e.target === modal) close(); });

  document.getElementById("em-do")?.addEventListener("click", async () => {
    const sid = (document.getElementById("em-student")?.value || "").trim();
    const pw  = (document.getElementById("em-pw")?.value || "").trim();
    if (!sid || !pw) { alert("학번/비밀번호를 입력해주세요."); return; }

    // 토큰 없으면 조용히 로그인
    if (!localStorage.getItem("token")) {
      const login = await silentLoginByStudent(sid, pw);
      if (!login.ok) { alert(login.message || "로그인 실패"); return; }
    }

    await refreshReservationsForRoom(state.room);
    const rid = modal.dataset.reservationId;
    if (!rid) { alert("연장할 예약을 찾을 수 없습니다."); return; }

    // (선택) 다음 예약 있는지 프런트 선검사 – 서버도 최종 검증함
    const base = (state.reservations || []).find(r => String(r.id) === String(rid));
    if (!base) { alert("연장할 예약을 찾을 수 없습니다."); return; }

    const nextBlock = (state.reservations || []).some(r => {
      if (String(r.room) !== String(state.room)) return false;
      if (String(r.seatId ?? r.seat) !== String(base.seatId ?? base.seat)) return false;
      if (!r.startTime || !r.endTime) return false;
      const st = new Date(r.startTime).getTime();
      const end = new Date(base.endTime).getTime();
      const until = end + 3*60*60*1000; // 3시간
      const stat = String(r.status || "").toUpperCase();
      const counts = (stat === "PENDING" || stat === "CHECKED_IN"); // '다음 예약자' 정의
      return counts && st >= end && st < until && r.id !== base.id;
    });
    if (nextBlock) { alert("다음 예약자가 있어 연장할 수 없습니다."); return; }

    // 실제 연장 API 호출
    const api = await apiExtendReservation(rid);
    if (!api.ok) { alert("연장 실패: " + (api.reason || "서버 오류")); await refreshReservationsForRoom(state.room); return; }

    close();
    await refreshReservationsForRoom(state.room);
    const updated = (state.reservations || []).find(r => String(r.id) === String(api.rec.id));
    alert(`연장 완료! 새 종료시각: ${updated ? new Date(updated.endTime).toLocaleTimeString() : "(갱신됨)"}`);
  });
})();


// ----------------- 초기화 -----------------
function init() {
  //requireLogin();       // ✅ 로그인 안 했으면 index.html로 이동
  renderLoggedInUser(); // ✅ 로그인 사용자 아이디 표시
  if (localStorage.getItem("token") && !localStorage.getItem("user")) { hydrateMe(); }
  syncHelloName();

  setAllowSeatPick(false);          // ✅ 첫 진입은 좌석 선택 불가

  $$(".seat").forEach(seat => seat.addEventListener("click", onSeatClick));

  bindActions();
  startRemainTimer(); // 페이지 진입 시에도 시작

    // ✅ 탭을 다시 볼 때 즉시 서버에서 최신 예약을 가져와 반영
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshReservationsForRoom(state.room);
  });

  window.addEventListener("storage", (ev) => {
    if (["myReservation", "reservationUpdate", "lastReservationId"].includes(ev.key)) {
      refreshReservationsForRoom(state.room);
    }
     if (["user","token"].includes(ev.key)) syncHelloName(); 
  });

   // ✅ 선택(권장): 주기적 새로고침 (중복 방지 가드)
  if (!window.__seatPoll) {
    window.__seatPoll = setInterval(() => refreshReservationsForRoom(state.room), 3000);
  }


  refreshReservationsForRoom(state.room);
}

document.addEventListener("DOMContentLoaded", init);
