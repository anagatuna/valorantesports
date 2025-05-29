// src/utils/rateLimitedFetch.js
export default function rateLimitedFetchFactory({ delay = 200 }) {
  let lastCallTime = 0;

  return async function rateLimitedFetch(url, options = {}) {
    const now = Date.now();
    const waitTime = Math.max(delay - (now - lastCallTime), 0);
    if (waitTime > 0) {
      await new Promise(res => setTimeout(res, waitTime));
    }

    lastCallTime = Date.now();
    return fetch(url, options);
  };
}
