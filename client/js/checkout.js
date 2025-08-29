// js/checkout.js
import { authHeaders } from "./utils.js"; // authHeaders가 다른 파일에 있으면 import, 아니면 아래 authHeaders 재정의
const BASE_URL = "https://lab-reserve-backend.onrender.com";

function authHeadersLocal() {
  const token = localStorage.getItem("token");
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function apiCheckout(reservationId, password) {
  // reservationId를 숫자로 보내는 것이 안전
  const idNum = Number(reservationId);
  if (Number.isNaN(idNum)) return { ok: false, message: "reservationId가 올바르지 않습니다." };

  const headers = authHeadersLocal();
  // headers는 항상 객체이므로 따로 falsy 체크 대신 token 유무 체크를 권장:
  if (!localStorage.getItem("token")) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  try {
    const res = await fetch(`${BASE_URL}/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reservationId: idNum, password })
    });

    // 안전하게 JSON 파싱
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok) {
      return { ok: false, message: (data && (data.error || data.message)) || "퇴실 실패" };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("퇴실 API 오류:", err);
    return { ok: false, message: "네트워크 오류" };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const checkoutForm = document.querySelector(".checkout-form");
  const passwordInput = document.querySelector(".input-pill input");
  const btn = checkoutForm ? checkoutForm.querySelector(".btn-checkout") : null;

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!btn) return;

      const reservationId = localStorage.getItem("lastReservationId");
      const password = passwordInput.value.trim();

      if (!reservationId) {
        alert("퇴실할 예약이 없습니다.");
        return;
      }
      if (!password) {
        alert("비밀번호를 입력해주세요.");
        return;
      }

      // UX: 버튼 비활성화
      btn.disabled = true;
      btn.textContent = "처리중...";

      const result = await apiCheckout(reservationId, password);

      btn.disabled = false;
      btn.textContent = "퇴실하기";

      if (result.ok) {
        alert("퇴실이 완료되었습니다. 이용해주셔서 감사합니다!");

        // 로컬 정리: 마지막 예약, 내 예약, 좌석 정보 등
        localStorage.removeItem("lastReservationId");
        localStorage.removeItem("myReservation");
        localStorage.removeItem("lastSeat");
        localStorage.removeItem("lastSeatRoom");

        // 성공시 리다이렉트
        window.location.href = "viewseats.html";
      } else {
        // 상세 메시지 표시
        alert("퇴실 실패: " + (result.message || "알 수 없는 오류"));
      }
    });
  }
});
