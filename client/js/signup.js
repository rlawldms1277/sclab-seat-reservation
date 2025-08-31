// 번역 데이터
const translations = {
  en: {
    title: "Sign Up - SCLab Seat Reservation System",
    main :"Main",
    login : "Login",
    signup:"Signup",
    signupTitle: "Sign Up",
    name: "Name",
    enterName: "Please enter your name.",
    studentId: "Student ID",
    enterId: "Please enter your student ID.",
    email: "Email",
    enterEmail: "Please enter your email.",
    course: "Course",
    professor: "Professor",
    doctor: "Doctor",
    phd: "PhD Course",
    master: "Master Course",
    undergrad: "Undergraduate Researcher",
    userId: "User ID",
    enterUserId: "Please enter your user ID.",
    pw: "Password",
    enterPw: "Please enter your password.",
    pwConfirm: "Confirm Password",
    reenterPw: "Re-enter your password.",
    signupBtn: "Sign Up"
  },
  ko: {
    title: "회원가입 - SCLab 자리 예약 시스템",
    main :"Main",
    login : "로그인",
    signup:"회원가입",
    signupTitle: "회원가입",
    name: "이름",
    enterName: "입력해주세요.",
    studentId: "학번",
    enterId: "입력해주세요.",
    email: "메일",
    enterEmail: "입력해주세요.",
    course: "과정",
    professor: "교수님",
    doctor: "박사님",
    phd: "박사과정",
    master: "석사과정",
    undergrad: "학부연구생",
    userId: "ID",
    enterUserId: "입력해주세요.",
    pw: "PW",
    enterPw: "입력해주세요.",
    pwConfirm: "비밀번호 재입력",
    reenterPw: "비밀번호 재입력.",
    signupBtn: "가입하기"
  }
};

// ✅ 언어 전환
let currentLang = "ko";

document.getElementById("btn-lang").addEventListener("click", () => {
  currentLang = currentLang === "ko" ? "en" : "ko";

  // 텍스트 번역
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = translations[currentLang][key];
  });

  // placeholder 번역
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = translations[currentLang][key];
  });

  // 버튼 전환
  document.getElementById("btn-lang").textContent =
    currentLang === "ko" ? "English" : "한국어";

  // <title> 전환
  document.title = translations[currentLang]["title"];
});

// ✅ 서버 주소 (개발: localhost, 배포: 클라우드 주소 교체 예정)
const BASE_URL = "https://lab-reserve-backend.onrender.com";


// ✅ 폼 제출 처리
const form = document.getElementById("signup-form");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    name: document.querySelector('input[data-i18n-placeholder="enterName"]').value,
    studentId: document.querySelector('input[data-i18n-placeholder="enterId"]').value,
    email: document.querySelector('input[data-i18n-placeholder="enterEmail"]').value,
    course: document.querySelector("select").value,
    userId: document.querySelector('input[data-i18n-placeholder="enterUserId"]').value,
    password: document.querySelector('input[data-i18n-placeholder="enterPw"]').value,
    passwordConfirm: document.querySelector('input[data-i18n-placeholder="reenterPw"]').value
  };

  if (data.password !== data.passwordConfirm) {
    alert("비밀번호가 일치하지 않습니다!\nPasswords do not match!");
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok) {
      alert("회원가입이 완료 됐습니다.\nMembership registration completed");
      window.location.href = "login.html";
    } else {
      alert(
        "회원가입 실패: " +
        (result.message || "재가입 불가\nMembership registration failure: Re-enrollment not possible")
      );
    }
  } catch (err) {
    console.error(err);
    alert("서버 오류\nServer error");
  }
});
