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

// 서버 체크인(퇴실 아닌 'checkout' 엔드포인트) 호출 - 서버 스펙에 맞춰 password 필드로 보냄
async function apiCheckin(reservationId, pin) {
  try {
    const url = `${BASE_URL}/checkout`; // <-- 서버가 제공한 엔드포인트 (/checkout)
    const body = {
      reservationId: Number(reservationId),
      password: String(pin) // <-- 서버는 'password' 필드를 기대함
    };
    console.log("체크인 요청 보냄:", url, body);

    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body)
    });

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    console.log("체크인 응답:", res.status, data);

    if (!res.ok) {
      // 서버가 준 에러 메시지 최대한 보여주기
      const errMsg = (data && (data.error || data.message)) || `서버 에러 ${res.status}`;
      return { ok: false, message: errMsg, body: data, status: res.status };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("입실 API 호출 중 네트워크 오류:", err);
    return { ok: false, message: "네트워크 오류가 발생했습니다.", error: err };
  }
}

// 로컬에 내 예약 저장 (seat 페이지가 읽음)
function saveMyReservation(obj) {
  localStorage.setItem("myReservation", JSON.stringify(obj));
  // lastReservationId도 숫자 형태로 저장
  if (obj && obj.id != null) localStorage.setItem("lastReservationId", String(obj.id));
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

    // 서버가 준 PIN 길이를 알고 있다면 검증 (예: 6자리)
    if (!/^\d{6}$/.test(pin)) {
      alert("유효하지 않은 PIN 형식입니다. (예: 숫자 6자리)");
      btn.disabled = false;
      return;
    }

    // 서버 호출 (reservationId는 숫자로 변환해서 보냄)
    const res = await apiCheckin(reservationId, pin);

    if (res.ok) {
      const payload = res.data || {};
      const reservation = payload.reservation || payload;

      // 서버가 보낸 reservation 구조에 안전하게 맞춰 저장
      const myRes = {
        id: reservation.id != null ? Number(reservation.id) : Number(reservationId),
        room: reservation.room || (reservation.seat && reservation.seat.room) || localStorage.getItem("lastSeatRoom") || "",
        seat: reservation.seatNumber || (reservation.seat && (reservation.seat.seatNumber || reservation.seat.id)) || localStorage.getItem("lastSeat") || "",
        status: reservation.status || "CHECKED_IN",
        startTime: reservation.startTime || new Date().toISOString(),
        endTime: reservation.endTime || (new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()),
        pin: pin
      };

      saveMyReservation(myRes);
      alert("입실이 완료되었습니다! 좌석으로 이동합니다.");
      window.location.href = "seat.html";
      return;
    }

    // 실패 처리 — 서버 메시지를 보여주고, 로컬 임시 처리 옵션 제공
    console.warn("체크인 실패 응답:", res);
    const okLocal = confirm("서버 응답 실패: " + (res.message || "알 수 없음") + "\n테스트용으로 로컬에서 임시 입실 처리하시겠어요?");
    if (okLocal) {
      const now = new Date();
      const myRes = {
        id: Number(reservationId),
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
