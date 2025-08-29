// ✅ 서버 주소
const BASE_URL = "https://lab-reserve-backend.onrender.com";

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const userId = document.getElementById("userId").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    // 1. 로그인 요청
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password })
    });

    const result = await res.json();

    if (res.ok && result.token) {
      alert("로그인 성공\nLogin successful!");
      localStorage.setItem("token", result.token); // ✅ 토큰 저장

      // 2. 사용자 정보 가져오기 (반드시 /me 호출)
      const meRes = await fetch(`${BASE_URL}/me`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${result.token}` }
      });

      if (meRes.ok) {
        const meData = await meRes.json();

        // 🚩 서버는 { user: {...} } 구조로 내려주도록 약속
        const user = meData.user ? meData.user : meData;

        // 🚩 user.id는 반드시 숫자로 보장 (없으면 예약 API에서 오류 발생)
        if (!user.id || isNaN(Number(user.id))) {
          alert("⚠️ 서버 응답에 id가 없습니다. 서버 담당자에게 확인하세요.");
          return;
        }

        localStorage.setItem("user", JSON.stringify(user));
      } else {
        alert("사용자 정보를 불러오지 못했습니다.");
        return;
      }

      // 3. seat 페이지로 이동
      window.location.href = "seat.html";
    } else {
      alert("로그인 실패: " + (result.message || "ID 또는 비밀번호를 확인하세요."));
    }
  } catch (err) {
    console.error("❌ login.js error:", err);
    alert("서버 오류\nServer error");
  }
});

// ✅ 언어 전환
const translations = {
  en: {
    main: "Main",
    entering: "Enter",
    viewSeats: "Check Available Seats",
    loginTitle: "Login",
    loginNote: "When you log in, you will be redirected to the seat selection page.",
    loginBtn: "Login"
  },
  ko: {
    main: "Main",
    entering: "입실",
    viewSeats: "남은 좌석 확인",
    loginTitle: "로그인",
    loginNote: "로그인 시 자리 선택 창으로 넘어갑니다.",
    loginBtn: "로그인"
  }
};

let currentLang = "ko";
document.getElementById("btn-lang").addEventListener("click", () => {
  currentLang = currentLang === "ko" ? "en" : "ko";

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = translations[currentLang][key];
  });

  document.getElementById("btn-lang").textContent =
    currentLang === "ko" ? "English" : "한국어";
});
