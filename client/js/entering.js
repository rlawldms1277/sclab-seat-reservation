// js/entering.js
import { renderLoggedInUser, requireLogin } from "./user.js";  // 경로 수정 주의!

const BASE_URL = "https://lab-reserve-backend.onrender.com";


// 유틸
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function authHeaders() {
  const token = localStorage.getItem("token");
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

/* 🔹 [ADD 1] 여기 추가: TTL/활성예약 복구 유틸 */
const PENDING_TTL_MIN = 20;
const ONE_MIN = 60 * 1000;

function isActivePending(rec) {
  if (!rec || String(rec.status).toUpperCase() !== "PENDING") return false;
  const ca = rec.createdAt ? new Date(rec.createdAt) : null;
  if (!ca) return true; // createdAt이 없으면 안전하게 차단 취급
  return (Date.now() - ca.getTime()) < (PENDING_TTL_MIN * ONE_MIN);
}

// 서버에서 내 활성 예약(체크인중 또는 TTL 내 PENDING)을 찾아 로컬에 복구
async function recoverMyActiveReservation() {
  try {
    const res = await fetch(`${BASE_URL}/reservations`, { headers: authHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    const list = data.reservations || data || [];

    const me = JSON.parse(localStorage.getItem("user") || "null");
    if (!me) return null;
    const now = new Date();

    const mine = list.filter(r => Number(r.userId) === Number(me.id));
    const active = mine.find(r => {
      const s = String(r.status || "").toUpperCase();
      if (s === "CHECKED_IN") return r.endTime && now < new Date(r.endTime);
      if (s === "PENDING")    return isActivePending(r);
      return false;
    });
    if (!active) return null;

    // 로컬 복구(entering/seat 공통으로 쓰는 키)
    localStorage.setItem("myReservation", JSON.stringify({
      id:        String(active.id),
      room:      String(active.seat?.room ?? active.room),
      seat:      String(active.seat?.seatNumber ?? active.seatId),
      status:    String(active.status || "PENDING"),
      startTime: active.startTime || null,
      endTime:   active.endTime   || null,
      createdAt: active.createdAt || new Date().toISOString()
    }));
    localStorage.setItem("lastReservationId", String(active.id));
    localStorage.setItem("reservationUpdate", Date.now().toString());
    return active;
  } catch {
    return null;
  }
}


// ✅ 입실(체크인) API
async function apiCheckin(reservationId, pin) {
  try {
    const res = await fetch(`${BASE_URL}/checkin`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reservationId: Number(reservationId), pin })
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, message: data.error || data.message || "입실 실패" };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("입실 API 호출 중 오류 발생:", err);
    return { ok: false, message: "네트워크 오류가 발생했습니다." };
  }
}

// DOM 로드 후 실행
document.addEventListener("DOMContentLoaded", async () => {
  // ✅ 로그인 강제 검사 + 사용자 표시
  requireLogin();
  renderLoggedInUser();

  await recoverMyActiveReservation();

  const checkinForm = $(".entering-form");
  const pinInput = $(".input-pill input");

  if (checkinForm) {
    checkinForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pin = pinInput.value.trim();

      // 🔹 [ADD 3] 제출 직전에도 보수적으로 복구 시도
      let reservationId = localStorage.getItem("lastReservationId");
      if (!reservationId) {
        await recoverMyActiveReservation();
        reservationId = localStorage.getItem("lastReservationId");
      }

      if (!pin) {
        alert("입실 번호를 입력해주세요.");
        return;
      }
      if (!reservationId) {
        alert("활성 예약을 찾을 수 없습니다. 먼저 자리를 예약하거나 새로고침 후 다시 시도해주세요.");
        return;
      }

      // ✅ PIN 형식 검사 (6자리 숫자)
      if (!/^\d{6}$/.test(pin)) {
        alert("유효하지 않은 PIN 형식입니다. (예: 6자리 숫자)");
        return;
      }

      const result = await apiCheckin(reservationId, pin);


      if (result.ok) {
        // 1) 다른 탭/창에게 "상태 바뀜" 브로드캐스트 → seat.js의 storage 리스너가 받아 자동 새로고침
        localStorage.setItem("reservationUpdate", Date.now().toString());

        // 2) (선택) 현재 탭에서도 즉시 빨강(입실중) 반영: 내 예약 로컬 상태를 CHECKED_IN으로 변경
        const m = JSON.parse(localStorage.getItem("myReservation") || "null");
        if (m) {
          m.status = "CHECKED_IN";

          // (선택) 서버가 startTime/endTime을 돌려줬다면 함께 동기화
          const payload = result.data || {};
          const reservation = payload.reservation || payload;
          if (reservation && reservation.startTime) m.startTime = reservation.startTime;
          if (reservation && reservation.endTime)   m.endTime   = reservation.endTime;

          localStorage.setItem("myReservation", JSON.stringify(m));
        }

        alert("입실이 완료되었습니다. 4시간 동안 사용 가능합니다.");
        window.location.href = "seat.html"; // <= 이 줄은 맨 마지막(브로드캐스트 후) 유지
      } else {
        alert("입실 실패: " + result.message);
      }

    });
  }
});
