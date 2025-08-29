// js/entering.js
import { renderLoggedInUser, requireLogin } from "./user.js";

const BASE_URL = "https://lab-reserve-backend.onrender.com";
const $ = (sel) => document.querySelector(sel);

// 헤더 생성 (토큰 포함)
function authHeaders() {
  const token = localStorage.getItem("token");
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

// 서버 체크인 호출
async function apiCheckin(reservationId, pin) {
  try {
    const res = await fetch(`${BASE_URL}/checkin`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reservationId: Number(reservationId), pin })
    });

    // 안전하게 JSON 파싱
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok) {
      return { ok: false, message: (data && (data.error || data.message)) || "입실 실패", body: data };
    }

    // 기대: data.reservation (또는 바로 reservation 객체)
    return { ok: true, data };
  } catch (err) {
    console.error("입실 API 호출 중 오류 발생:", err);
    return { ok: false, message: "네트워크 오류가 발생했습니다." };
  }
}

// 로컬에 내 예약 저장 (seat 페이지가 읽음)
function saveMyReservation(obj) {
  localStorage.setItem("myReservation", JSON.stringify(obj));
  // lastReservationId도 업데이트
  if (obj && obj.id) localStorage.setItem("lastReservationId", String(obj.id));
  if (obj && obj.seat) localStorage.setItem("lastSeat", String(obj.seat));
  if (obj && obj.room) localStorage.setItem("lastSeatRoom", String(obj.room));
}

document.addEventListener("DOMContentLoaded", () => {
  requireLogin();
  renderLoggedInUser();

  const form = $(".entering-form");
  const pinInput = $(".input-pill input");
  const btn = form ? form.querySelector(".btn-enter") : null;

  if (!form || !pinInput || !btn) {
    console.warn("Entering form elements not found.");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    const pin = pinInput.value.trim();
    const reservationId = localStorage.getItem("lastReservationId");

    if (!pin) {
      alert("입실 번호를 입력해주세요.");
      btn.disabled = false;
      return;
    }
    if (!reservationId) {
      alert("예약 정보가 없습니다. 먼저 자리를 예약해주세요.");
      btn.disabled = false;
      return;
    }

    // 서버팀이 6자리 PIN을 준다고 하셨으므로 6자리로 검사 (변경 포인트)
    if (!/^\d{6}$/.test(pin)) {
      alert("유효하지 않은 PIN 형식입니다. (예: 숫자 6자리)");
      btn.disabled = false;
      return;
    }

    // 서버에 체크인 요청
    const res = await apiCheckin(reservationId, pin);

    if (res.ok) {
      // 서버가 반환한 예약(정규화)
      const payload = res.data || {};
      // 가능한 응답 형태 처리: { reservation: {...}, ... } 또는 바로 reservation 객체
      const reservation = payload.reservation || payload;

      // 안전하게 필요한 필드를 골라서 저장
      const myRes = {
        id: reservation.id || reservationId,
        room: reservation.room || (reservation.seat && reservation.seat.room) || localStorage.getItem("lastSeatRoom") || "",
        seat: reservation.seatNumber || (reservation.seat && (reservation.seat.seatNumber || reservation.seat.id)) || localStorage.getItem("lastSeat") || "",
        status: reservation.status || "CHECKED_IN",
        startTime: reservation.startTime || new Date().toISOString(),
        endTime: reservation.endTime || (new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()),
        pin: pin
      };

      saveMyReservation(myRes);
      alert("입실이 완료되었습니다! 좌석으로 이동합니다.");
      // redirect — 페이지가 바뀌므로 btn 상태 복구 불필요
      window.location.href = "seat.html";
      return;
    }

    // 실패 처리: 서버 연결 문제라면 로컬 폴백(테스트용) 제공
    const okLocal = confirm("서버 응답 실패: " + (res.message || "알수없음") + "\n테스트용으로 로컬에서 임시 입실 처리하시겠어요?");
    if (okLocal) {
      const now = new Date();
      const myRes = {
        id: reservationId,
        room: localStorage.getItem("lastSeatRoom") || "901",
        seat: localStorage.getItem("lastSeat") || "",
        status: "CHECKED_IN",
        startTime: now.toISOString(),
        endTime: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
        pin
      };
      saveMyReservation(myRes);
      alert("로컬에서 임시 입실 처리되었습니다. (서버 동기화 필요)");
      window.location.href = "seat.html";
      return;
    } else {
      alert("입실 실패: " + (res.message || "서버 오류"));
      btn.disabled = false;
      return;
    }
  });
});
