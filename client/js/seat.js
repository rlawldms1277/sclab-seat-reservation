// js/seat.js


import { renderLoggedInUser, requireLogin } from "./user.js";



// ----------------- 서버 주소 -----------------
const BASE_URL = "https://lab-reserve-backend.onrender.com";


// ----------------- 상태 관리 -----------------
const state = { room: "901", seat: null, time: null, user: null, reservations: [] };

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
  if (s !== "PENDING" && s !== "CREATED") return false;
  const ca = getCreatedAt(rec);
  // createdAt이 없으면(백엔드 미포함) 안전하게 ‘차단’으로 간주
  if (!ca) return true;
  return (Date.now() - ca.getTime()) < (PENDING_TTL_MIN * ONE_MIN);
}

function updateExtendButtonState() {
  const extendBtn = $("#btnExtend");
  if (!extendBtn) return;
  if (!state.seat) { extendBtn.disabled = true; extendBtn.title = "좌석을 먼저 선택하세요."; return; }

  const base = findMyActiveReservationForSeat(state.seat);
  if (!base) { extendBtn.disabled = true; extendBtn.title = "체크인된 내 예약이 없습니다."; return; }

  const now = new Date(), end = new Date(base.endTime);
  const earliest = new Date(end.getTime() - EXTEND_WINDOW_MIN * 60 * 1000);
  const ok = (now >= earliest && now <= end);
  extendBtn.disabled = !ok;
  extendBtn.title = ok ? "" : `연장은 종료 ${EXTEND_WINDOW_MIN}분 전부터 종료 시까지 가능합니다.`;
}



// ----------------- 서버 호출 -----------------
async function apiFetchReservations(room) {
  try {
    const url = room 
      ? `${BASE_URL}/reservations?room=${room}`   // 숫자로 전달
      : `${BASE_URL}/reservations`;

    const res = await fetch(url, {
      method: "GET",
      headers: authHeaders()
    });

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


// ----------------- UI 렌더링 -----------------
function renderTimeStatusForSeat(seatId) {
  const timeButtons = $$(".time-grid button");
  const reservations = state.reservations || [];
  const todayStr = localDateStr(new Date());

  // 초기화
  timeButtons.forEach(btn => {
    btn.classList.remove("reserved", "done", "picked");
    btn.disabled = false;
  });

  if (!seatId) return;

  timeButtons.forEach(btn => {
    const btnHour = hourFromLabel(btn.textContent);
    if (btnHour === null) return;

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
  cleanupLocalReservation(); // ← 이 줄을 맨 앞에 추가

  const raw = await apiFetchReservations(room);
  state.reservations = raw.map(normalizeReservationRaw);

  // ✅ 로컬 PENDING 합치기 (새로고침해도 '예약중' 유지)
  mergeLocalPendingReservation();

  // ✅ 좌석 현황 업데이트
  updateSeatUI(room);
  renderTimeStatusForSeat(state.seat);
  updateExtendButtonState();
}

function updateSeatUI(room) {
  const reservations = state.reservations || [];
  const seats = $$("#room-" + room + " .seat");
  const now = new Date(); // ← 현재 시각
  const todayStr = localDateStr(now);

  seats.forEach(seatEl => {
    // ✅ 고정석은 항상 회색 + 선택 불가
    if (seatEl.dataset.fixed === "true") {
      seatEl.classList.remove("available");
      seatEl.classList.add("used");
      seatEl.style.pointerEvents = "none";
      return; // 고정석이면 아래 로직은 건너뜀
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
function onSeatClick(e) {
  const seat = e.currentTarget;
  if (seat.dataset.fixed === "true") {  // ✅ 고정석 클릭 방지
    alert("고정석은 선택할 수 없습니다.");
    return;
  }

  $$(".seat.selected").forEach(s => s.classList.remove("selected"));
  seat.classList.add("selected");

  state.seat = seat.dataset.seatId;
  renderTimeStatusForSeat(state.seat);
  updateExtendButtonState();
  
}

function onTimeClick(e) {
  const btn = e.currentTarget;
  if (btn.classList.contains("reserved") || btn.classList.contains("done")) {
    alert("이미 예약된 시간입니다.");
    return;
  }
  $$(".time-grid button").forEach(b => b.classList.remove("picked"));
  btn.classList.add("picked");
  state.time = btn.textContent.trim();
}

function switchRoom(room) {
  const btn = $(`.room-btn[data-room="${room}"]`);
  $$(".room-btn").forEach(b => b.classList.remove("active"));
  btn && btn.classList.add("active");

  $$(".room").forEach(r => r.classList.remove("active"));
  $(`#room-${room}`).classList.add("active");

  state.room = room;
  state.seat = null;
  $$(".seat.selected").forEach(s => s.classList.remove("selected"));

  refreshReservationsForRoom(room);
}

// ----------------- 예약 버튼 액션 -----------------
function bindActions() {
  const reserveBtn = $("#btnReserve");
  const leaveBtn   = $("#btnLeave");
  const extendBtn  = $("#btnExtend");

reserveBtn.addEventListener("click", async () => {
  if (!state.seat || !state.time) {
    alert("좌석과 시간을 모두 선택해주세요.");
    return;
  }

  await refreshReservationsForRoom(state.room);

  // 로그인 사용자 확인
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const userId = user ? Number(user.id) : null;
  if (!userId) {
    alert("로그인 정보가 없습니다. 다시 로그인해주세요.");
    return;
  }

  // 1) 시작/종료(로컬 기준) 계산
  const selHour = hourFromLabel(state.time);               // 예: "9:00" -> 9
  const today   = new Date();
  const startLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate(), selHour, 0, 0, 0);
  let   endLocal   = new Date(startLocal.getTime() + 4 * 60 * 60 * 1000); // 기본 4시간

  // 2) 같은 좌석에서 '막는 상태'의 이후 예약이 있으면 종료를 앞당김
  //    (CHECKED_IN 이거나, TTL 내의 PENDING 만 ‘막는 예약’으로 간주)
  const future = state.reservations.filter(r =>
    r.startDateOnly === localDateStr(today) &&
    String(r.room) === String(state.room) &&
    String(r.seatId ?? r.seat) === String(state.seat) &&
    r.startHour != null &&
    r.startHour >= selHour &&
    (
      String(r.status || "").toUpperCase() === "CHECKED_IN" ||
      isActivePending(r) // ← TTL 살아있는 PENDING만 차단
    )
  );

if (future.length) {
  const nextStartHour = Math.min(...future.map(r => r.startHour));
  const nextStartDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), nextStartHour, 0, 0, 0);
  if (nextStartDate < endLocal) {
    endLocal = new Date(nextStartDate.getTime());
  }
}

  // 3) 서버 호출
  const apiResult = await apiCreateReservation({
    seat: state.seat,
    startTimeISO: startLocal.toISOString(),
    endTimeISO:   endLocal.toISOString()
  });

  if (!apiResult.ok) {
    alert("예약 실패: " + (apiResult.reason || "서버 오류"));
    refreshReservationsForRoom(state.room);
    return;
  }

  // 4) 서버 응답 정규화
  const rec = normalizeReservationRaw(apiResult.rec);
  if (rec.id) localStorage.setItem("lastReservationId", rec.id);

  // 5) ‘내 예약(PENDING)’을 로컬에 저장 (새로고침해도 초록 유지)
  //    => 시간 계산은 위에서 우리가 보낸 startLocal/endLocal 기준으로 저장 (타임존 흔들림 방지)
  let endHourExclusive = endLocal.getHours();
  if (endLocal.getMinutes() > 0 || endLocal.getSeconds() > 0 || endLocal.getMilliseconds() > 0) {
    endHourExclusive += 1;
  }

  const pendingLocal = {
    id:   rec.id || `${state.room}-${state.seat}-${startLocal.toISOString()}`,
    room: String(state.room),
    seat: String(state.seat),
    startTime: startLocal.toISOString(),
    endTime:   endLocal.toISOString(),
    startHour: selHour,
    endHourExclusive,
    startDateOnly: localDateStr(startLocal),
    status: "PENDING",
    pin: apiResult.pin || rec.pin || null,
    createdAt: new Date().toISOString(),
    raw:  apiResult.rec
  };

  localStorage.setItem("myReservation", JSON.stringify({
    id: pendingLocal.id,
    room: pendingLocal.room,
    seat: pendingLocal.seat,
    status: "PENDING",
    startTime: pendingLocal.startTime,
    endTime: pendingLocal.endTime,
    pin: pendingLocal.pin,
    createdAt: new Date().toISOString() // ADD
  }));

  // 예약 성공 후(로컬 저장 직후) 다른 탭에 변경 알림 브로드캐스트
  localStorage.setItem("reservationUpdate", Date.now().toString());

  // 6) 즉시 UI에 반영 (초록 표시)
  const idx = state.reservations.findIndex(r => r.id === pendingLocal.id);
  if (idx >= 0) state.reservations[idx] = pendingLocal;
  else state.reservations.push(pendingLocal);
  renderTimeStatusForSeat(String(pendingLocal.seat));

  // 7) 최신화(합치기 로직 덕분에 새로고침해도 유지)
  await refreshReservationsForRoom(state.room);

  // 8) 알림 (표시용으로 끝 시각을 보기 좋게 보여주고 싶으면 여기서만 -1분/-1초 해도 됨)
  const pin = apiResult.pin || rec.pin || "UNKNOWN";
  alert(`예약 완료 ! 20분내로 입실해주세요.\n좌석: ${rec.seat}\n시간: ${state.time}\n입실 PIN: ${pin}`);
});


  leaveBtn.addEventListener("click", () => window.location.href = "checkout.html");
  extendBtn.addEventListener("click", async () => {
  // 1) 연장할 좌석이 선택돼 있어야 함(현재 사용 좌석을 클릭해 선택)
  if (!state.seat) {
    alert("연장할 좌석을 먼저 선택해주세요(현재 사용 중인 좌석).");
    return;
  }

  // 2) 최신화
  await refreshReservationsForRoom(state.room);

  // 3) 지금 시간대의 '내' 체크인 예약 찾기
  const base = findMyActiveReservationForSeat(state.seat);
  if (!base) {
    alert("현재 시간에 사용 중인 내 예약을 찾을 수 없습니다.\n(체크인 상태 + 같은 좌석이어야 합니다.)");
    return;
  }

  // 4) 프론트 가드: 종료 20분 전 ~ 종료 사이만 허용
  const now = new Date();
  const endTime = new Date(base.endTime);
  const earliest = new Date(endTime.getTime() - EXTEND_WINDOW_MIN * 60 * 1000);
  if (now < earliest || now > endTime) {
    alert(`연장은 종료 ${EXTEND_WINDOW_MIN}분 전부터 종료 시각까지 가능합니다.\n(현재 종료: ${endTime.toLocaleTimeString()})`);
    return;
  }

  // 5) 서버에 연장 요청 (서버가 '다음 예약/최대 3시간'을 최종 판정)
  const api = await apiExtendReservation(base.id);
  if (!api.ok) {
    alert("연장 실패: " + (api.reason || "서버 오류"));
    await refreshReservationsForRoom(state.room);
    return;
  }

  // 6) UI 갱신 및 안내
  await refreshReservationsForRoom(state.room);
  const updated = (state.reservations || []).find(r => String(r.id) === String(api.rec.id));
  const newEnd = updated ? new Date(updated.endTime) : null;
  alert(`연장 완료! 새 종료시각: ${newEnd ? newEnd.toLocaleTimeString() : "(갱신됨)"}`);
});


  $$(".time-grid button").forEach(b => b.addEventListener("click", onTimeClick));
}

// ----------------- 초기화 -----------------
function init() {
  requireLogin();       // ✅ 로그인 안 했으면 index.html로 이동
  renderLoggedInUser(); // ✅ 로그인 사용자 아이디 표시

  $$(".room-btn").forEach(btn =>
    btn.addEventListener("click", () => switchRoom(btn.dataset.room))
  );
  $$(".seat").forEach(seat => seat.addEventListener("click", onSeatClick));

  bindActions();

    // ✅ 탭을 다시 볼 때 즉시 서버에서 최신 예약을 가져와 반영
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshReservationsForRoom(state.room);
  });

  window.addEventListener("storage", (ev) => {
    if (["myReservation", "reservationUpdate", "lastReservationId"].includes(ev.key)) {
      refreshReservationsForRoom(state.room);
    }
  });

   // ✅ 선택(권장): 주기적 새로고침 (중복 방지 가드)
  if (!window.__seatPoll) {
    window.__seatPoll = setInterval(() => refreshReservationsForRoom(state.room), 10_000);
  }


  refreshReservationsForRoom(state.room);
}

document.addEventListener("DOMContentLoaded", init);
