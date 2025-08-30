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


// ----------------- 정규화 함수 -----------------
function normalizeReservationRaw(raw) {
  const room = raw.room || raw.roomId || state.room;
  let seat = raw.seat || raw.seatId;
  if (seat && typeof seat === "object") {
    seat = seat.seatNumber || seat.id;
  }
  const start = raw.startTime;
  const end   = raw.endTime;

  const startDate = start ? new Date(start) : null;
  const endDate   = end ? new Date(end) : null;

  return {
    id: raw.id || `${room}-${seat}-${start}`,
    room: String(room),
    seat: String(seat),
    startTime: startDate ? startDate.toISOString() : null,
    endTime: endDate ? endDate.toISOString() : null,
    startHour: startDate ? startDate.getHours() : null,
    endHourExclusive: endDate ? endDate.getHours() : null,
    status: raw.status || "",
    pin: raw.pin || null,
    raw
  };
}

// ----------------- UI 렌더링 -----------------
function renderTimeStatusForSeat(seatId) {
  const timeButtons = $$(".time-grid button");
  const reservations = state.reservations || [];

  timeButtons.forEach(btn => {
    btn.classList.remove("reserved", "done", "picked");
    btn.disabled = false;
  });

  if (!seatId) return;

  timeButtons.forEach(btn => {
    const btnHour = parseInt(btn.textContent);
    const found = reservations.find(r =>
      String(r.room) === String(state.room) &&
      String(r.seat) === String(seatId) &&
      btnHour >= r.startHour && btnHour < r.endHourExclusive
    );

  if (found) {
    const st = String(found.status).toUpperCase();
    if (st === "PENDING") {
      btn.classList.add("reserved");   // 예약 대기 → 초록
      btn.disabled = true;
    } else if (st === "CHECKED_IN") {
      btn.classList.add("done");       // 입실 → 빨강
      btn.disabled = true;
    } else if (st === "FINISHED" || st === "EXPIRED") {
      btn.classList.add("done");       // 완료 → 빨강
      btn.disabled = true;
    } else if (st === "CANCELED") {
      btn.classList.add("reserved");   // 취소 → 초록(지금 reserved 색상)
      btn.disabled = true;
    }
  }
  });
}

async function refreshReservationsForRoom(room) {
  const raw = await apiFetchReservations(room);
  state.reservations = raw.map(normalizeReservationRaw);

  // ✅ 좌석 현황 업데이트
  updateSeatUI(room);

  renderTimeStatusForSeat(state.seat);
}

function updateSeatUI(room) {
  const reservations = state.reservations;

  // 현재 방의 좌석 DOM들 가져오기
  const seats = $$("#room-" + room + " .seat");

  seats.forEach(seatEl => {
    const seatId = seatEl.dataset.seatId;
    // 기본값은 available
    seatEl.classList.remove("used");
    seatEl.classList.add("available");

    // 서버 데이터에서 해당 좌석 찾아오기
    const found = reservations.find(r =>
      String(r.room) === String(room) &&
      String(r.seat) === String(seatId)
    );

    if (found) {
      const st = String(found.status).toUpperCase();
      if (st === "CHECKED_IN") {
        seatEl.classList.remove("available");
        seatEl.classList.add("used");   // ✅ 회색으로 표시
      }
    }
  });
}


// ----------------- 좌석/시간 선택 -----------------
function onSeatClick(e) {
  const seat = e.currentTarget;
  if (seat.classList.contains("used")) return;

  $$(".seat.selected").forEach(s => s.classList.remove("selected"));
  seat.classList.add("selected");

  state.seat = seat.dataset.seatId;
  renderTimeStatusForSeat(state.seat);
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

    // 예약 시간 계산
    const selHour = hourFromLabel(state.time);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), selHour, 0, 0, 0);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // 4시간

    const apiResult = await apiCreateReservation({
      seat: state.seat,
      startTimeISO: start.toISOString(),
      endTimeISO: end.toISOString()
    });

    if (apiResult.ok) {
      const rec = normalizeReservationRaw(apiResult.rec);
      if (rec.id) localStorage.setItem("lastReservationId", rec.id);

      await refreshReservationsForRoom(state.room);
      const pin = apiResult.pin || rec.pin || "UNKNOWN";
      alert(`예약 완료!\n좌석: ${rec.seat}\n시간: ${state.time}\n입실 PIN: ${pin}`);
    } else {
      alert("예약 실패: " + (apiResult.reason || "서버 오류"));
    }
  });

  leaveBtn.addEventListener("click", () => window.location.href = "checkout.html");
  extendBtn.addEventListener("click", () => alert("연장 기능 준비 중"));

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
  refreshReservationsForRoom(state.room);
}

document.addEventListener("DOMContentLoaded", init);
