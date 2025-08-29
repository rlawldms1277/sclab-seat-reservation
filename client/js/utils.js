// js/utils.js
// 공통 유틸: authHeaders, DOM selectors, 안전한 JSON 파싱, 토큰 헬퍼 등

// 토큰 키(필요하면 바꾸세요)
const TOKEN_KEY = "token";

/**
 * authHeaders()
 * - localStorage에 저장된 토큰을 읽어 Authorization 헤더를 만들어 리턴.
 * - 토큰이 없으면 Content-Type 헤더만 리턴.
 */
export function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

/** 토큰 헬퍼들 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token == null) return;
  localStorage.setItem(TOKEN_KEY, String(token));
}
export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** 간단한 DOM 헬퍼 (자주 쓰이는 $ / $$) */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * safeParseJSON(response)
 * - fetch 결과(response)에서 안전하게 JSON 파싱 (parse 실패 시 null 리턴)
 * - 사용법: const data = await safeParseJSON(res);
 */
export async function safeParseJSON(response) {
  try {
    // response.json() 자체가 promise이므로 await
    return await response.json();
  } catch (e) {
    return null;
  }
}

/**
 * fetchJson(url, opts)
 * - fetch 래퍼: 자동으로 authHeaders 병합하고, 응답 JSON을 안전히 파싱해서 반환
 * - 반환값: { ok: boolean, status: number, data: any }
 */
export async function fetchJson(url, opts = {}) {
  const headers = Object.assign({}, authHeaders(), opts.headers || {});
  try {
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    const data = await safeParseJSON(res);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error("fetchJson error:", err);
    return { ok: false, status: 0, data: null, error: err };
  }
}

/** 유틸 예: ISO -> "HH:MM" */
export function formatTimeHHMM(isoOrDate) {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : (isoOrDate instanceof Date ? isoOrDate : null);
  if (!d || Number.isNaN(d.getTime())) return "";
  return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}
