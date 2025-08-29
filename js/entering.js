// js/entering.js
import { renderLoggedInUser, requireLogin } from "./user.js";  // 경로 수정 주의!

const BASE_URL = "http://172.20.10.9:3000";

// 유틸
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function authHeaders() {
  const token = localStorage.getItem("token");
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
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
document.addEventListener("DOMContentLoaded", () => {
  // ✅ 로그인 강제 검사 + 사용자 표시
  requireLogin();
  renderLoggedInUser();

  const checkinForm = $(".entering-form");
  const pinInput = $(".input-pill input");

  if (checkinForm) {
    checkinForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pin = pinInput.value.trim();
      const reservationId = localStorage.getItem("lastReservationId");

      if (!pin) {
        alert("입실 번호를 입력해주세요.");
        return;
      }
      if (!reservationId) {
        alert("예약 정보가 없습니다. 먼저 자리를 예약해주세요.");
        return;
      }

      // ✅ PIN 형식 검사 (6자리 숫자)
      if (!/^\d{6}$/.test(pin)) {
        alert("유효하지 않은 PIN 형식입니다. (예: 6자리 숫자)");
        return;
      }

      const result = await apiCheckin(reservationId, pin);

      if (result.ok) {
        alert("입실이 완료되었습니다! 이제 4시간 동안 사용 가능합니다.");
        window.location.href = "seat.html"; // 입실 후 seat.html로 리다이렉트
      } else {
        alert("입실 실패: " + result.message);
      }
    });
  }
});
