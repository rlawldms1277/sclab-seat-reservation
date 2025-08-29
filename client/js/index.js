// 모든 페이지에서 공통으로 추가
window.addEventListener("DOMContentLoaded", () => {
  const userInfoEl = document.getElementById("user-info");
  const user = JSON.parse(localStorage.getItem("user")); // 로그인 정보 읽기

  if (user && user.name) {
    // 로그인 상태이면 이름 + 로그아웃 표시
    userInfoEl.innerHTML = `${user.name}님 | <a href="#" id="logout">로그아웃</a>`;

    // 로그아웃 클릭 시 localStorage 삭제 후 메인 페이지 이동
    document.getElementById("logout").addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("user");
      window.location.href = "index.html";
    });
  }
});
