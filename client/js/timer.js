// js/timer.js

let countdownInterval = null;

// 시간 포맷 함수 (00:00:00 형식)
export function formatTime(ms) {
  if (ms < 0) return "00시간 00분 00초";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(hours)}시간 ${pad(minutes)}분 ${pad(seconds)}초`;
}

// ✅ 남은 시간 표시 (공통)
export function showRemainingTime(reservation, containerSelector = ".seat-page") {
  // 이미 타이머가 돌고 있으면 초기화
  if (countdownInterval) clearInterval(countdownInterval);

  let infoEl = document.getElementById("my-seat-info");
  if (!infoEl) {
    infoEl = document.createElement("div");
    infoEl.id = "my-seat-info";
    infoEl.style.marginTop = "10px";
    infoEl.style.fontWeight = "bold";

    const container = document.querySelector(containerSelector);
    if (container) container.prepend(infoEl);
  }

  const endTime = new Date(reservation.endTime).getTime();

  function update() {
    const now = Date.now();
    const remain = endTime - now;
    infoEl.textContent = `내 좌석: ${reservation.seat}번 | 남은 시간: ${formatTime(remain)}`;
    if (remain <= 0) {
      infoEl.textContent = "사용 시간이 만료되었습니다.";
      clearInterval(countdownInterval);
    }
  }

  update();
  countdownInterval = setInterval(update, 1000);
}
