// js/user-utils.js

// ✅ 로그인 사용자 표시 (아이디만 보여줌)
export function renderLoggedInUser() {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user) return;

  const userInfoEl = document.getElementById("user-info");
  if (userInfoEl) {
    const displayName = user.userId || "(알 수 없음)";
    userInfoEl.innerHTML = `${displayName}님 | <a href="#" id="logout">로그아웃</a>`;

    const logout = document.getElementById("logout");
    if (logout) {
      logout.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.clear(); // 모든 로그인 관련 데이터 삭제
        location.href = "index.html"; // 메인으로 이동
      });
    }
  }
}


