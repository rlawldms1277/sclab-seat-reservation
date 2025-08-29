// js/viewseats.js

// 서버 주소
const BASE_URL = "https://lab-reserve-backend.onrender.com";

// 유틸리티 함수
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function authHeaders() {
  const token = localStorage.getItem("token");
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

// ----------------- 서버 호출 -----------------
async function apiFetchReservations() {
  try {
    const res = await fetch(`${BASE_URL}/reservations`, {
      method: "GET",
      headers: authHeaders()
    });
    if (!res.ok) throw new Error("좌석 현황을 불러오는데 실패했습니다.");
    const data = await res.json();
    return data.reservations || [];
  } catch (err) {
    console.error("API 호출 실패:", err);
    return [];
  }
}

// ----------------- 시간 표시 유틸 -----------------
function formatTime(ms) {
  if (ms <= 0) return "만료됨";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// ----------------- UI 렌더링 -----------------
async function renderSeats() {
  // 초기화
  $$(".seat").forEach((seat) => {
    seat.classList.remove("used", "available", "reserved", "my-seat");
    seat.classList.add("available");

    // 기존 남은시간 표시 제거
    const oldTimer = seat.querySelector(".seat-timer");
    if (oldTimer) oldTimer.remove();
  });

  const reservations = await apiFetchReservations();
  const currentUser = JSON.parse(localStorage.getItem("user"));
  const currentUserId = currentUser ? (currentUser.id || currentUser.userId) : null;

  reservations.forEach((res) => {
    const seat = $(`.seat[data-room="${res.room}"][data-seat-id="${res.seat}"]`);
    if (!seat) return;
    if (seat.dataset.fixed === "true") return;

    // 상태별 좌석 색상 (예약도 사용중으로 표시)
    if (res.status === "CHECKED_IN" || res.status === "PENDING") {
    seat.classList.remove("available");
    seat.classList.add("used"); // 예약이든 입실이든 회색으로
    }


    // 남은 시간 표시
    if (res.endTime) {
      const endTime = new Date(res.endTime).getTime();
      const timerEl = document.createElement("div");
      timerEl.className = "seat-timer";
      timerEl.style.fontSize = "10px";
      timerEl.style.marginTop = "2px";
      timerEl.style.color = "#fff"; // 글자색 (필요에 따라 수정)

      seat.appendChild(timerEl);

      // 타이머 업데이트
      const update = () => {
        const now = Date.now();
        const remain = endTime - now;
        timerEl.textContent = formatTime(remain);
        if (remain <= 0) {
          timerEl.textContent = "만료됨";
        }
      };
      update();
      setInterval(update, 1000);
    }

    // 내 좌석 강조
    if (res.userId === currentUserId) {
      seat.classList.add("my-seat");
    }
  });
}

// ----------------- 초기화 -----------------
function init() {
  // 좌석 data 속성 초기화
  const room901Seats = $$(".room-wrap:first-child .seat");
  room901Seats.forEach((seat, index) => {
    seat.dataset.room = "901";
    seat.dataset.seatId = index + 1;
  });

  const room907Seats = $$(".room-wrap:last-child .seat");
  room907Seats.forEach((seat, index) => {
    if (seat.dataset.i18n === "fixedSeat") {
      seat.dataset.room = "907";
      seat.dataset.fixed = "true";
      seat.dataset.seatId = `fixed${index + 1}`;
    } else {
      seat.dataset.room = "907";
      seat.dataset.seatId = "14";
    }
  });

  // 로그인 사용자 표시
  const userInfoEl = document.getElementById("user-info");
  const user = JSON.parse(localStorage.getItem("user"));
  if (user && user.name) {
    userInfoEl.innerHTML = `${user.name}님 | <a href="#" id="logout">로그아웃</a>`;
    document.getElementById("logout").addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.clear();
      window.location.href = "index.html";
    });
  }

  // 초기 렌더링 + 주기적 갱신
  renderSeats();
  setInterval(renderSeats, 30000); // 30초마다 전체 새로고침
}

document.addEventListener("DOMContentLoaded", init);
