// js/viewseats.js

// 서버 주소
const BASE_URL = "http://172.20.10.9:3000";

// 유틸리티 함수
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// 토큰이 있으면 인증 헤더 추가
function authHeaders() {
    const token = localStorage.getItem("token");
    return token ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
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

// ----------------- 잔여 시간 타이머 (클라이언트 측 계산) -----------------
let countdownInterval = null;

function formatTime(ms) {
    if (ms < 0) return "00시간 00분 00초";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}시간 ${pad(minutes)}분 ${pad(seconds)}초`;
}

function startCountdown(endTime) {
    if (countdownInterval) clearInterval(countdownInterval);

    const countdownEl = document.createElement('div');
    countdownEl.className = 'countdown-timer';
    countdownEl.style.position = 'absolute'; // 절대 위치 설정
    countdownEl.style.bottom = '10px';
    countdownEl.style.left = '50%';
    countdownEl.style.transform = 'translateX(-50%)';
    countdownEl.style.background = 'rgba(0,0,0,0.5)';
    countdownEl.style.color = '#fff';
    countdownEl.style.padding = '5px 10px';
    countdownEl.style.borderRadius = '5px';
    countdownEl.style.fontSize = '12px';

    $('.my-seat').appendChild(countdownEl);

    const updateTimer = () => {
        const now = new Date().getTime();
        const distance = endTime - now;
        countdownEl.textContent = `남은 시간: ${formatTime(distance)}`;

        if (distance < 0) {
            clearInterval(countdownInterval);
            countdownEl.textContent = "사용 시간 만료";
            setTimeout(() => location.reload(), 3000); // 3초 후 페이지 새로고침
        }
    };

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}

// ----------------- UI 렌더링 -----------------
async function renderSeats() {
    // 기존 좌석 상태 초기화
    $$('.seat').forEach(seat => {
        seat.classList.remove('used', 'available', 'my-seat');
        seat.classList.add('available');
    });

    const reservations = await apiFetchReservations();
    const currentUser = JSON.parse(localStorage.getItem("user"));
    const currentUserId = currentUser ? (currentUser.id || currentUser.userId) : null;
    let myReservation = null;

    reservations.forEach(res => {
        const seat = $(`.seat[data-room="${res.room}"][data-seat-id="${res.seat}"]`);
        if (!seat) return;

        // 고정석은 건너뛰기
        if (seat.dataset.fixed === "true") return;

        // 예약 상태에 따라 UI 업데이트
        if (res.status === 'CHECKED_IN' || res.status === 'PENDING') {
            seat.classList.remove('available');
            seat.classList.add('used');

            // 내 좌석인 경우
            if (res.userId === currentUserId) {
                seat.classList.add('my-seat');
                myReservation = res;
            }
        }
    });

// 로그인한 사용자의 예약 정보가 있으면 상단에 정보 표시 + 타이머
if (myReservation && myReservation.endTime) {
    showMySeatInfo(myReservation);
}

}

// ----------------- 초기화 및 이벤트 리스너 -----------------
function init() {
    // 좌석 data 속성 초기화
    const room901Seats = $$('.room-wrap:first-child .seat');
    room901Seats.forEach((seat, index) => {
        seat.dataset.room = '901';
        seat.dataset.seatId = index + 1;
    });

    const room907Seats = $$('.room-wrap:last-child .seat');
    room907Seats.forEach((seat, index) => {
        if (seat.dataset.i18n === 'fixedSeat') {
            seat.dataset.room = '907';
            seat.dataset.fixed = 'true';
            seat.dataset.seatId = `fixed${index + 1}`;
        } else {
            seat.dataset.room = '907';
            seat.dataset.seatId = '14';
        }
    });
    
    // 로그인 사용자 표시 (공통)
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

    // 초기 렌더링
    renderSeats();

    // ✅ 30초마다 갱신
    setInterval(renderSeats, 1000);
}

document.addEventListener("DOMContentLoaded", init);
