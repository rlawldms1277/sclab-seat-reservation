// ✅ 퇴실 API 호출 (비밀번호 포함)
async function apiCheckout(reservationId, password) {
  const headers = authHeaders();
  if (!headers) return { ok: false, message: "로그인이 필요합니다." };

  try {
    const res = await fetch(`${BASE_URL}/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reservationId, password }) // 🚩 password 함께 보냄
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, message: data.message || data.error || "퇴실 실패" };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("퇴실 API 오류:", err);
    return { ok: false, message: "네트워크 오류" };
  }
}

// ✅ DOM 이벤트
document.addEventListener("DOMContentLoaded", () => {
  const checkoutForm = document.querySelector(".checkout-form");
  const passwordInput = document.querySelector(".input-pill input");

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (e) => {
      e.preventDefault();

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

      const result = await apiCheckout(reservationId, password);

      if (result.ok) {
        alert("퇴실이 완료되었습니다. 이용해주셔서 감사합니다!");
        localStorage.removeItem("lastReservationId");
        window.location.href = "viewseats.html";
      } else {
        alert("퇴실 실패: " + result.message);
      }
    });
  }
});
