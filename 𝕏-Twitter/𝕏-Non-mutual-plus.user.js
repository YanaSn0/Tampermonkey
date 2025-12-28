// ==UserScript==
// @name         𝕏-Non-mutual-plus
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  UF user who UF or never FB plus.
// @author       YanaSn0w1
// @match        https://x.com/*/following
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const UF_DEFAULT_PIC = true;
  const UF_NO_BIO = true;
  const UF_KEY_WORDS = true;
  // set above to false to keep bot followers.
  const WHITELIST = ['YanaHeat', 'YanaSn0w1'];
  const KEY_WORDS = ['elon', 'musk', 'private', 'chat', 'dm'].map(w => w.toLowerCase());
  const UF_CD = 15 * 60 * 1000;
  const UF_MAX = 189;
  const SC_CD = 30 * 1000;
  const SC_PAUSE_COUNT = 500;
  const SC_MAX = 30000;
  // check 30k cell. 500 at 30 sec. 189 unfollow every 15 min.
  const MIN_DELAY = 500;
  const MAX_DELAY = 1500;
  const BATCH_SIZE = 7;
  const SCAN_DELAY = 100;
  const SCROLL_POSITION = 107;
  const STUCK_THRESHOLD = 60;
  const STUCK_BOTTOM_THRESHOLD = 5;

  let running = false;
  let paused = true;
  let processed = new Set();
  let unfollowed = 0, skipped = 0, total = 0;
  let lastTotalCells = 0, stuckCount = 0;
  let periodStart = null;
  let unfollowedInPeriod = 0;
  let timerInterval = null;
  let remainingTime = 0;
  let scanSincePause = 0;
  let hasUnfollowed = false;

  // Load saved state
  function loadState() {
    const savedPeriodStart = localStorage.getItem('periodStart');
    const savedUnfollowedInPeriod = localStorage.getItem('unfollowedInPeriod');
    const savedRemainingTime = localStorage.getItem('remainingTime');

    if (savedPeriodStart) {
      periodStart = parseInt(savedPeriodStart, 10);
      const now = Date.now();
      const elapsed = now - periodStart;
      if (elapsed < UF_CD) {
        remainingTime = Math.floor((UF_CD - elapsed) / 1000);
        startTimerFromRemaining();
      } else {
        periodStart = null;
        unfollowedInPeriod = 0;
        remainingTime = 0;
      }
    }

    if (savedUnfollowedInPeriod) {
      unfollowedInPeriod = parseInt(savedUnfollowedInPeriod, 10);
    }

    if (savedRemainingTime) {
      remainingTime = parseInt(savedRemainingTime, 10);
    }

    updateUFCount();
    updateTimerDisplay();
  }

  // Save state
  function saveState() {
    if (periodStart !== null) {
      localStorage.setItem('periodStart', periodStart.toString());
    } else {
      localStorage.removeItem('periodStart');
    }
    localStorage.setItem('unfollowedInPeriod', unfollowedInPeriod.toString());
    localStorage.setItem('remainingTime', remainingTime.toString());
  }

  // Reset state
  function resetState() {
    clearInterval(timerInterval);
    localStorage.removeItem('periodStart');
    localStorage.removeItem('unfollowedInPeriod');
    localStorage.removeItem('remainingTime');
    periodStart = null;
    unfollowedInPeriod = 0;
    remainingTime = 0;
    hasUnfollowed = false;
    updateUFCount();
    updateTimerDisplay();
  }

  const ui = document.createElement('div');
  ui.id = 'copilot-ui';
  ui.style = `
    position:fixed;
    top:10px;
    right:10px;
    z-index:9999;
    background:#fff;
    padding:4px;
    border:1px solid #ccc;
    font-family:sans-serif;
    color:#000;
    display:flex;
    flex-direction:column;
    align-items:flex-start;
    gap:2px;
    font-size:12px;
    white-space:nowrap;
  `;
  ui.innerHTML = `
    <div>UF: <span id="uf-count">0/${UF_MAX}</span> <span id="uf-timer"></span></div>
    <div>Scan: <span id="scan-count">0/${SC_MAX}</span></div>
    <button id="scan-btn" style="padding:2px 6px; border:1px solid #000;">Start</button>
    <button id="reset-btn" style="padding:2px 6px; border:1px solid #000;">Reset</button>
  `;
  document.body.appendChild(ui);

  document.getElementById('reset-btn').onclick = resetState;

  function updateUFCount() {
    document.getElementById('uf-count').textContent = `${unfollowedInPeriod}/${UF_MAX}`;
  }

  function updateScanCount() {
    document.getElementById('scan-count').textContent = `${total}/${SC_MAX}`;
  }

  function updateTimerDisplay() {
    document.getElementById('uf-timer').textContent = (remainingTime > 0 || hasUnfollowed) ? ` (${formatTime(Math.max(remainingTime, 0))})` : '';
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
  }

  function startTimer() {
    clearInterval(timerInterval);
    remainingTime = Math.floor(UF_CD / 1000);
    hasUnfollowed = true;
    updateTimerDisplay();
    saveState();
    timerInterval = setInterval(() => {
      remainingTime--;
      updateTimerDisplay();
      saveState();
      if (remainingTime <= 0) {
        clearInterval(timerInterval);
        periodStart = null;
        unfollowedInPeriod = 0;
        hasUnfollowed = false;
        updateUFCount();
        saveState();
        if (running && paused) {
          paused = false;
          document.getElementById('scan-btn').textContent = 'Pause';
        }
      }
    }, 1000);
  }

  function startTimerFromRemaining() {
    clearInterval(timerInterval);
    hasUnfollowed = true;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      remainingTime--;
      updateTimerDisplay();
      saveState();
      if (remainingTime <= 0) {
        clearInterval(timerInterval);
        periodStart = null;
        unfollowedInPeriod = 0;
        hasUnfollowed = false;
        updateUFCount();
        saveState();
        if (running && paused) {
          paused = false;
          document.getElementById('scan-btn').textContent = 'Pause';
        }
      }
    }, 1000);
  }

  function getCells() {
    return Array.from(document.querySelectorAll('button[data-testid="UserCell"]'));
  }

  function getUsername(cell) {
    const link = cell.querySelector('a[href^="/"][role="link"]');
    return link ? link.getAttribute('href').replace(/^\//, '').split('/')[0] : '';
  }

  async function waitForConfirm() {
    return new Promise(resolve => {
      const observer = new MutationObserver(() => {
        const confirm = Array.from(document.querySelectorAll('button[data-testid="confirmationSheetConfirm"],div[role="menuitem"]')).find(el =>
          el.textContent.trim().toLowerCase() === 'unfollow' && el.offsetParent !== null
        );
        if (confirm) {
          observer.disconnect();
          resolve(confirm);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, 2000);
    });
  }

  async function randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(r => setTimeout(r, ms));
  }

  function canUnfollow(reset) {
    if (reset || periodStart === null) return true;
    return unfollowedInPeriod < UF_MAX;
  }

  function extractTextWithEmojis(element) {
    if (!element) return '';
    const parts = Array.from(element.querySelectorAll('span, img')).map(el => {
      if (el.tagName === 'SPAN') return el.textContent.trim();
      if (el.tagName === 'IMG' && el.alt) return el.alt;
      return '';
    }).filter(t => t !== '');
    return parts.join(' ');
  }

  async function processBatch() {
    const cells = getCells().filter(cell => {
      const username = getUsername(cell);
      return username && !processed.has(username);
    });

    const batch = cells.slice(0, BATCH_SIZE);
    if (batch.length === 0) return 0;

    const firstCell = batch[0];
    const rect = firstCell.getBoundingClientRect();
    const offset = rect.top - SCROLL_POSITION;
    window.scrollBy({ top: offset, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 300));

    for (const cell of batch) cell.style.border = '2px solid yellow';
    await new Promise(r => setTimeout(r, 500));

    let processedInBatch = 0;
    for (const cell of batch) {
      if (paused) break;
      const username = getUsername(cell);
      processed.add(username);
      total++;
      processedInBatch++;
      updateScanCount();
      if (total >= SC_MAX) {
        running = false;
        paused = true;
        document.getElementById('scan-btn').textContent = 'Start';
        alert(`Reached max scan: ${SC_MAX}`);
        return processedInBatch;
      }

      const nameDiv = cell.querySelector('div[class*="r-b88u0q"]'); // Bold name class
      const name = extractTextWithEmojis(nameDiv);

      const followIndicator = cell.querySelector('[data-testid="userFollowIndicator"]');
      const isMutual = followIndicator && followIndicator.textContent.trim().toLowerCase() === 'follows you';

      const bioDiv = cell.querySelector('div[dir="auto"][class*="r-1h8ys4a"]'); // Bio class
      const bioText = extractTextWithEmojis(bioDiv);

      const hasDefaultPic = cell.querySelector('img')?.src.includes('default_profile_normal.png') || false;
      const noBio = bioText.trim() === '';
      const hasKeyword = UF_KEY_WORDS ? KEY_WORDS.some(key => name.toLowerCase().includes(key) || username.toLowerCase().includes(key) || bioText.toLowerCase().includes(key)) : false;

      const reasons = [];
      if (!isMutual) reasons.push('non-mutual');
      if (UF_DEFAULT_PIC && hasDefaultPic) reasons.push('default pic');
      if (UF_NO_BIO && noBio) reasons.push('no bio');
      if (hasKeyword) reasons.push('keyword match');

      const shouldUnfollow = !WHITELIST.includes(username) && reasons.length > 0;

      if (WHITELIST.includes(username)) {
        console.log(`Skipping ${username}: whitelisted`);
        cell.style.border = '2px solid orange';
        skipped++;
        continue;
      }

      if (!shouldUnfollow) {
        console.log(`Skipping ${username}: no reasons to unfollow`);
        cell.style.border = '2px solid green';
        skipped++;
        continue;
      }

      const btn = cell.querySelector('button[aria-label^="Following @"], button[data-testid$="-unfollow"]');
      if (!btn) {
        console.log(`Skipping ${username}: no unfollow button`);
        cell.style.border = '2px solid orange';
        skipped++;
        continue;
      }

      const now = Date.now();
      let reset = false;
      if (periodStart !== null && now - periodStart >= UF_CD) {
        reset = true;
      }
      if (canUnfollow(reset)) {
        console.log(`Trying to unfollow ${username} because: ${reasons.join(', ')}`);
        btn.click();
        const confirm = await waitForConfirm();
        if (confirm) {
          confirm.click();
          console.log(`Unfollowed ${username}`);
          cell.style.border = '2px solid red';
          unfollowed++;
          if (reset) {
            periodStart = now;
            unfollowedInPeriod = 1;
            startTimer();
          } else if (periodStart === null) {
            periodStart = now;
            unfollowedInPeriod = 1;
            startTimer();
          } else {
            unfollowedInPeriod++;
          }
          updateUFCount();
          saveState();
          if (unfollowedInPeriod >= UF_MAX) {
            paused = true;
            document.getElementById('scan-btn').textContent = 'Start';
          }
          await randomDelay(MIN_DELAY, MAX_DELAY);
        } else {
          console.log(`Failed to unfollow ${username}: no confirm button`);
          cell.style.border = '2px solid orange';
          skipped++;
        }
      } else {
        console.log(`Skipping unfollow for ${username}: rate limit reached`);
        cell.style.border = '2px solid purple';
        skipped++;
      }
    }
    return processedInBatch;
  }

  loadState();

  document.getElementById('scan-btn').onclick = async () => {
    const btn = document.getElementById('scan-btn');
    if (running) {
      paused = !paused;
      btn.textContent = paused ? 'Start' : 'Pause';
      return;
    }
    running = true;
    paused = false;
    btn.textContent = 'Pause';
    while (running) {
      if (paused) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      const processedInBatch = await processBatch();
      scanSincePause += processedInBatch;
      if (scanSincePause >= SC_PAUSE_COUNT) {
        await new Promise(r => setTimeout(r, SC_CD));
        scanSincePause = 0;
      }
      await new Promise(r => setTimeout(r, SCAN_DELAY));
      const currCells = getCells().length;
      if (currCells === lastTotalCells) {
        stuckCount++;
        window.scrollBy({ top: 1000, behavior: 'smooth' });
      } else {
        stuckCount = 0;
      }
      lastTotalCells = currCells;
      if (stuckCount >= STUCK_THRESHOLD) {
        running = false;
        alert(`Done! Stuck.\nUnfollowed: ${unfollowed}\nSkipped: ${skipped}\nTotal: ${total}`);
      }
    }
    btn.textContent = 'Start';
  };
})();
