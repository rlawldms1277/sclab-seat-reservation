// js/user-utils.js

// ✅ 로그인 사용자 표시 + 네비 링크 숨김
export function renderLoggedInUser() {
  const user  = JSON.parse(localStorage.getItem("user") || "null");
  const token = localStorage.getItem("token");
  const isLoggedIn = !!(user && token);

  // 1) body에 상태 클래스 토글 (원하면 CSS로 제어 가능)
  document.body.classList.toggle("logged-in",  isLoggedIn);
  document.body.classList.toggle("logged-out", !isLoggedIn);

  // 2) 우측 상단 네비에서 로그인/회원가입 링크 숨기기(자바스크립트로 즉시 처리)
  const nav = document.querySelector(".main-nav");
  if (nav) {
    const loginLink  = nav.querySelector('a[href="login.html"]');
    const signupLink = nav.querySelector('a[href="signup.html"]');
    const dividers   = nav.querySelectorAll(".divider");

    if (isLoggedIn) {
      if (loginLink)  loginLink.style.display  = "none";
      if (signupLink) signupLink.style.display = "none";
      // 로그인/회원가입 옆 구분자도 숨김
      dividers.forEach(d => (d.style.display = "none"));
    } else {
      if (loginLink)  loginLink.style.display  = "";
      if (signupLink) signupLink.style.display = "";
      dividers.forEach(d => (d.style.display = ""));
    }
  }

  // 3) 우측 상단 사용자 표시/로그아웃
  const userInfoEl = document.getElementById("user-info");
  if (!userInfoEl) return;

  if (isLoggedIn) {
    const displayName = user.userId || user.username || user.email || "(알 수 없음)";
    userInfoEl.innerHTML = `${displayName}님 | <a href="#" id="logout">로그아웃</a>`;
    const logout = document.getElementById("logout");
    if (logout) {
      logout.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.clear();
        location.href = "index.html";
      });
    }
  } else {
    // 로그아웃 상태면 표시비움
    userInfoEl.innerHTML = "";
  }
}

export function requireLogin() {
  const token = localStorage.getItem("token");
  // seat.html 같은 "보호된 페이지"일 때만 체크
  const protectedPages = ["seat.html", "checkout.html", "entering.html"];
  const currentPage = window.location.pathname.split("/").pop();

  if (!token && protectedPages.includes(currentPage)) {
    alert("로그인이 필요합니다.");
    location.href = "index.html";
  }
}



