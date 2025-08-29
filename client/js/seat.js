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

// 남은시간 포맷: ms -> "X시간 Y분" 또는 "Z분"
function formatRemainingTime(ms) {
  if (ms == null || ms <= 0) return "만료";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  if (hours >= 1) {
    return mins === 0 ? `${hours}시간` : `${hours}시간 ${mins}분`;
  }
  return `${mins}분`;
}

// 남은시간 배지(실시간) 업데이트 함수
function updateSeatTimers() {
  const now = Date.now();
  $$(".seat").forEach(seatEl => {
    const badge = seatEl.querySelector(".seat-timer");
    if (!badge) return;
    const seatId = seatEl.dataset.seatId;
    const room = state.room;
    const r = (state.reservations || []).find(rr =>
      String(rr.room) === String(room) &&
      String(rr.seat) === String(seatId) &&
      String((rr.status||"")).toUpperCase() === "CHECKED_IN" &&
      rr.endTime
    );
    if (!r) {
      // 더 이상 체크인 예약이 없으면 배지 제거
      badge.remove();
      return;
    }
    const end = new Date(r.endTime).getTime();
    const remainingMs = end - now;
    if (remainingMs <= 0) {
      badge.remove();
      // 만료된 항목이 생기면 서버에서 다시 받아 최신화
      refreshReservationsForRoom(state.room);
      return;
    }
    badge.textContent = formatRemainingTime(remainingMs);
    badge.style.display = "inline-block";
  });
}




// ----------------- 서버 호출 -----------------
async function apiFetchReservations(room) {
  try {
    const url = room 
      ? `${BASE_URL}/reservations?room=${encodeURIComponent(room)}`
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
      headers: authHeaders(),
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, reason: data.error || data.message || "server error", body: data };
    }
    return {
      ok: true,
      rec: data.reservation || data,
      pin: data.devPin || data.pin || null
    };
  } catch (err) {
    console.warn("apiCreateReservation failed:", err);
    return { ok: false, reason: "network" };
  }
}


// ----------------- 정규화 함수 -----------------
function normalizeReservationRaw(raw) {
  // room: raw.room | raw.roomId | raw.seat?.room | fallback state.room
  let room = raw.room || raw.roomId || (raw.seat && raw.seat.room) || state.room;

  // seat: raw.seatId | raw.seat | if object -> seatNumber or id
  let seat = raw.seatId || raw.seat;
  if (seat && typeof seat === "object") {
    seat = seat.seatNumber != null ? seat.seatNumber : (seat.id != null ? seat.id : seat);
    // if room wasn't set earlier, try seat.room
    if ((!room || room === "undefined") && seat && typeof raw.seat === "object" && raw.seat.room) {
      room = raw.seat.room;
    }
  }

  const start = raw.startTime || raw.start;
  const end   = raw.endTime || raw.end;

  const startDate = start ? new Date(start) : null;
  const endDate   = end ? new Date(end) : null;

  // startHour은 시작 시각의 정수 시
  const startHour = startDate ? startDate.getHours() : null;

  // endHourExclusive: 종료 시각의 시(hour)를 배타적으로 비교하는 값.
  // 만약 종료 시각에 분 또는 초가 0보다 크면 해당 '종료 시의 시'도 포함되어야 하므로 +1 처리
  let endHourExclusive = null;
  if (endDate) {
    endHourExclusive = endDate.getHours();
    if (endDate.getMinutes() > 0 || endDate.getSeconds() > 0 || endDate.getMilliseconds() > 0) {
      endHourExclusive = endHourExclusive + 1;
    }
  }

  return {
    id: raw.id || `${room}-${seat}-${start}`,
    room: String(room),
    seat: String(seat),
    startTime: startDate ? startDate.toISOString() : null,
    endTime: endDate ? endDate.toISOString() : null,
    startHour: startHour,
    endHourExclusive: endHourExclusive,
    status: raw.status || raw.state || "",
    pin: raw.devPin || raw.pin || null,
    raw
  };
}

// ----------------- UI 렌더링 -----------------
// 기존 renderTimeStatusForSeat 대신 아래 코드로 교체
function renderTimeStatusForSeat(seatId) {
  const timeButtons = $$(".time-grid button");
  const reservations = state.reservations || [];

  timeButtons.forEach(btn => {
    btn.classList.remove("reserved", "done", "picked");
    btn.disabled = false;
  });

  if (!seatId) return;

  timeButtons.forEach(btn => {
    const btnHour = hourFromLabel(btn.textContent);
    if (btnHour === null) return;

    // find all reservations that cover this hour for this seat
    const matches = reservations.filter(r =>
      String(r.room) === String(state.room) &&
      String(r.seat) === String(seatId) &&
      r.startHour !== null &&
      r.endHourExclusive !== null &&
      btnHour >= r.startHour && btnHour < r.endHourExclusive
    );

    if (matches.length === 0) return;

    // Decide UI based on priority:
    // CHECKED_IN (입실중) -> done (disabled)
    // PENDING -> reserved (disabled)
    // FINISHED/EXPIRED -> DO NOT block (treat as past -> available)
    // Unknown -> reserved (safe)
    if (matches.some(r => String(r.status || "").toUpperCase() === "CHECKED_IN")) {
      btn.classList.add("done");
      btn.disabled = true;
      return;
    }

    if (matches.some(r => String(r.status || "").toUpperCase() === "PENDING")) {
      btn.classList.add("reserved");
      btn.disabled = true;
      return;
    }

    // If only FINISHED/EXPIRED (과거) or CANCELED -> don't disable (allow selection)
    // If some unknown statuses exist (neither CHECKED_IN nor PENDING), be conservative:
    const hasOnlyPastOrCanceled = matches.every(r => {
      const s = String(r.status || "").toUpperCase();
      return s === "FINISHED" || s === "EXPIRED" || s === "CANCELED";
    });
    if (hasOnlyPastOrCanceled) {
      // leave button enabled / no class (or optionally mark visually as past)
      return;
    }

    // fallback: mark reserved (safe)
    btn.classList.add("reserved");
    btn.disabled = true;
  });
}

async function refreshReservationsForRoom(room) {
  const raw = await apiFetchReservations(room);
  console.log("[API reservations raw]", raw);
  state.reservations = (raw || []).map(normalizeReservationRaw);
  console.log("[normalized reservations]", state.reservations);

  // 좌석 현황 업데이트
  updateSeatUI(room);

  renderTimeStatusForSeat(state.seat);

  applyLocalMyReservation();

  // 서버에서 받아온 reservations를 로컬에 저장 (폴백)
  try {
    saveLocalReservations(state.reservations);
  } catch (e) {}
}

function updateSeatUI(room) {
  const reservations = state.reservations || [];

  // 현재 방의 좌석 DOM들 가져오기
  const seats = $$("#room-" + room + " .seat");
  const now = new Date();

  seats.forEach(seatEl => {
    const seatId = seatEl.dataset.seatId;
    // 기본값: remove other classes, set available
    seatEl.classList.remove("used", "reserved-seat");
    seatEl.classList.add("available");

    // 1) CHECKED_IN & 현재시간 범위 → used (입실중)
    const overlapping = reservations.find(r =>
      String(r.room) === String(room) &&
      String(r.seat) === String(seatId) &&
      String(r.status || "").toUpperCase() === "CHECKED_IN" &&
      r.startTime && r.endTime &&
      (new Date(r.startTime) <= now && now < new Date(r.endTime))
    );

    if (overlapping) {
      seatEl.classList.remove("available");
      seatEl.classList.add("used");

      // 남은 시간 배지 표시 (있으면 업데이트, 없으면 생성)
      const end = new Date(overlapping.endTime);
      const remainingMs = end.getTime() - now.getTime();

      let badge = seatEl.querySelector(".seat-timer");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "seat-timer";
        seatEl.appendChild(badge);
      }
      badge.textContent = formatRemainingTime(remainingMs);
      badge.style.display = remainingMs > 0 ? "inline-block" : "none";
    } else {
      // used가 아니면 기존 배지 제거
      const old = seatEl.querySelector(".seat-timer");
      if (old) old.remove();
    }

    // 2) 미래(또는 당일 PENDING) 예약이 있는 경우 reserved-seat 표시
    const hasFuture = reservations.some(r =>
      String(r.room) === String(room) &&
      String(r.seat) === String(seatId) &&
      r.startTime &&
      new Date(r.startTime) > now && // 시작 시간이 지금 이후면 "미래예약"
      String(r.status || "").toUpperCase() !== "CANCELED"
    );

    const hasPendingToday = reservations.some(r =>
      String(r.room) === String(room) &&
      String(r.seat) === String(seatId) &&
      r.startTime && r.endTime &&
      (new Date(r.startTime) <= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59)) &&
      (new Date(r.endTime) >= now) &&
      String(r.status || "").toUpperCase() === "PENDING"
    );

    if (hasFuture || hasPendingToday) {
      seatEl.classList.remove("available");
      if (!seatEl.classList.contains("used")) {
        seatEl.classList.add("reserved-seat");
      } else {
        seatEl.classList.add("reserved-seat");
      }
    }
  });
}



// ----------------- 로컬 체크인(또는 폴백) UI 반영 -----------------
function applyLocalMyReservation() {
  try {
    const myRes = JSON.parse(localStorage.getItem("myReservation") || "null");
    if (!myRes || !myRes.seat || !myRes.room) return;
    // 현재 보고 있는 방과 다르면 무시
    if (String(myRes.room) !== String(state.room)) return;

    // 좌석 DOM 찾기 및 used 표시
    const seatEl = document.querySelector(`#room-${state.room} .seat[data-seat-id="${String(myRes.seat)}"]`);
    if (seatEl) {
      seatEl.classList.remove("available");
      seatEl.classList.add("used");

        // 로컬 체크인 정보가 있으면 배지 표시
        const endLocal = myRes.endTime ? new Date(myRes.endTime) : null;
        if (endLocal) {
          const remainingMsLocal = endLocal.getTime() - Date.now();
          let badge = seatEl.querySelector(".seat-timer");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "seat-timer";
            seatEl.appendChild(badge);
          }
          badge.textContent = formatRemainingTime(remainingMsLocal);
          badge.style.display = remainingMsLocal > 0 ? "inline-block" : "none";
        }
      }

    // 시간 버튼도 start/end 기준으로 done(reserved) 표시
    const start = myRes.startTime ? new Date(myRes.startTime) : null;
    const end = myRes.endTime ? new Date(myRes.endTime) : null;
    const status = (myRes.status || "").toUpperCase();

    if (start && end) {
      $$(".time-grid button").forEach(btn => {
        const h = hourFromLabel(btn.textContent);
        if (h === null) return;

        // endExclusive 계산 (이미 normalize 로직과 동일 처리)
        let endExclusive = end.getHours();
        if (end.getMinutes() > 0 || end.getSeconds() > 0 || end.getMilliseconds() > 0) endExclusive++;

        if (h >= start.getHours() && h < endExclusive) {
          btn.classList.remove("reserved", "done", "picked");
          // CHECKED_IN -> done (입실 중), 그 외 (PENDING 등) -> reserved
          if (status === "CHECKED_IN") {
            btn.classList.add("done");
          } else {
            btn.classList.add("reserved");
          }
          btn.disabled = true;
        }
      });
    }
  } catch (e) {
    // ignore
  }
}




// ----------------- 좌석/시간 선택 -----------------
function onSeatClick(e) {
  const seat = e.currentTarget;

  $$(".seat.selected").forEach(s => s.classList.remove("selected"));
  seat.classList.add("selected");

  state.seat = seat.dataset.seatId;

  // 디버그: 선택한 좌석의 예약 목록 로그 (원하면 툴팁으로 바꿀 수 있음)
  console.log("selected seat reservations:", state.reservations.filter(r => String(r.seat) === String(state.seat) && String(r.room) === String(state.room)));

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

    // 예약 시작 시간
    const selHour = hourFromLabel(state.time);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), selHour, 0, 0, 0);

    // 기본 종료 시간 = 시작 + 4시간
    let end = new Date(start.getTime() + 4 * 60 * 60 * 1000);

    // 같은 좌석에 이미 있는 예약 중 "시작 시간이 선택한 start 이후"인 것 찾기
    const futureReservations = state.reservations.filter(r =>
      String(r.room) === String(state.room) &&
      String(r.seat) === String(state.seat) &&
      r.startHour !== null &&
      r.startHour >= selHour
    );

    if (futureReservations.length > 0) {
      // 가장 가까운 예약 시작 시각 찾기
      const nextStart = Math.min(...futureReservations.map(r => r.startHour));
      const nextStartDate = new Date(start.getFullYear(), start.getMonth(), start.getDate(), nextStart, 0, 0, 0);

      if (nextStartDate < end) {
        end = new Date(nextStartDate.getTime() - 1); // 다음 예약 시작 직전까지만
      }
    }


  // ----------------- 여기에 충돌 검사 추가 -----------------
  // 선택한 시작시간(selHour)이 이미 그 좌석의 다른 예약과 겹치는지 검사
  const conflict = state.reservations.some(r =>
    String(r.room) === String(state.room) &&
    String(r.seat) === String(state.seat) &&
    r.startHour !== null &&
    r.endHourExclusive !== null &&
    selHour >= r.startHour && selHour < r.endHourExclusive &&
    String(r.status || "").toUpperCase() !== "CANCELED"
  );

  if (conflict) {
    alert("선택한 시간대는 이미 예약되어 있습니다. 다른 시간/좌석을 선택해주세요.");
    return;
  }


    // 서버 예약 요청
    const apiResult = await apiCreateReservation({
      seat: state.seat,
      startTimeISO: start.toISOString(),
      endTimeISO: end.toISOString()
    });

    if (apiResult.ok) {
      const rec = normalizeReservationRaw(apiResult.rec);
      if (rec.id) localStorage.setItem("lastReservationId", rec.id);

      // 서버 응답 기반으로 최근 좌석/방 정보 저장 (entering에서 사용)
      if (rec.room) localStorage.setItem("lastSeatRoom", String(rec.room));
      if (rec.seat) localStorage.setItem("lastSeat", String(rec.seat));

      // (선택적) myReservation 임시 저장 — 서버 반영 전 UI 테스트용
      localStorage.setItem("myReservation", JSON.stringify({
        id: rec.id || null,
        room: rec.room || localStorage.getItem("lastSeatRoom") || state.room,
        seat: rec.seat || localStorage.getItem("lastSeat") || state.seat,
        status: rec.status || "PENDING",
        startTime: rec.startTime || start.toISOString(),
        endTime: rec.endTime || end.toISOString(),
        pin: apiResult.pin || rec.pin || null
      }));

      // 다른 탭 갱신 알림 (다른 탭의 storage 이벤트가 이를 감지)
      localStorage.setItem("reservationUpdate", JSON.stringify({ action: "reserve", reservationId: rec.id || null, seat: rec.seat || state.seat, ts: Date.now() }));

      await refreshReservationsForRoom(state.room);
      const pin = apiResult.pin || rec.pin || "UNKNOWN";

      // 정확한 종료 표시: end는 '종료 시점의 시작'일 수 있으므로 -1ms 해서 표시
      const displayEnd = new Date(end.getTime() - 1);
      const endHourStr = String(displayEnd.getHours()).padStart(2, "0");
      const endMinStr = String(displayEnd.getMinutes()).padStart(2, "0");

      alert(`예약 완료!\n좌석: ${rec.seat}\n시간: ${state.time} ~ ${endHourStr}:${endMinStr}\n입실 PIN: ${pin}`);
    } else {
      alert("예약 실패: " + (apiResult.reason || "서버 오류"));
    }
  });

  // ---- 이 부분은 reserveBtn 핸들러 밖에서 동작해야 합니다 ----
  leaveBtn.addEventListener("click", () => window.location.href = "checkout.html");
  extendBtn.addEventListener("click", () => alert("연장 기능 준비 중"));

  $$(".time-grid button").forEach(b => b.addEventListener("click", onTimeClick));
}

// ----------------- 초기화 -----------------
function init() {
  requireLogin();       // 로그인 안 했으면 index.html로 이동
  renderLoggedInUser(); // 로그인 사용자 아이디 표시

  $$(".room-btn").forEach(btn =>
    btn.addEventListener("click", () => switchRoom(btn.dataset.room))
  );
  $$(".seat").forEach(seat => seat.addEventListener("click", onSeatClick));

  bindActions();
  refreshReservationsForRoom(state.room);

   updateSeatTimers();

  // 30초마다 최신화
  setInterval(() => refreshReservationsForRoom(state.room), 30 * 1000);

  // 기존 예약/좌석 갱신 타이머 아래에 추가
  setInterval(updateSeatTimers, 30 * 1000);

  // 다른 탭에서 reservationUpdate가 발생하면 즉시 갱신
  window.addEventListener("storage", (ev) => {
    if (!ev.key) return;
    if (ev.key === "reservationUpdate") {
      try {
        // console.log("storage event:", ev.newValue);
        refreshReservationsForRoom(state.room);
      } catch (e) { /* ignore */ }
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
