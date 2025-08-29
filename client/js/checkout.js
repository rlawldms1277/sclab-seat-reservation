// js/checkout.js
import { authHeaders } from "./utils.js"; // utils.js가 같은 폴더(js/)에 있어야 합니다.
const BASE_URL = "https://lab-reserve-backend.onrender.com";

async function apiCheckout(reservationId, password) {
  const idNum = Number(reservationId);
  if (Number.isNaN(idNum)) return { ok: false, message: "reservationId가 올바르지 않습니다." };

  if (!localStorage.getItem("token")) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  try {
    const res = await fetch(`${BASE_URL}/checkout`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reservationId: idNum, password })
    });

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok) {
      return { ok: false, message: (data && (data.error || data.message)) || `퇴실 실패 (status ${res.status})` };
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

  if (!checkoutForm) return;

  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!btn) return;

    const reservationId = localStorage.getItem("lastReservationId");
    const password = (passwordInput && passwordInput.value || "").trim();

    if (!reservationId) {
      alert("퇴실할 예약이 없습니다.");
      return;
    }
    if (!password) {
      alert("비밀번호를 입력해주세요.");
      return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "처리중...";

    const result = await apiCheckout(reservationId, password);

    btn.disabled = false;
    btn.textContent = originalText;

    if (result.ok) {
    alert("퇴실이 완료되었습니다. 이용해주셔서 감사합니다!");

    // 다른 탭에 알림
    localStorage.setItem("reservationUpdate", JSON.stringify({ action: "checkout", reservationId: Number(reservationId), ts: Date.now() }));

    // 로컬 정리
    localStorage.removeItem("lastReservationId");
    localStorage.removeItem("myReservation");
    localStorage.removeItem("lastSeat");
    localStorage.removeItem("lastSeatRoom");

    window.location.href = "viewseats.html";
    } else {
      alert("퇴실 실패: " + (result.message || "알 수 없는 오류"));
    }
  });
});
