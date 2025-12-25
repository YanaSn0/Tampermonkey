// ==UserScript==
// @name         FB
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Scrape to skip "bots" while fb normal accounts.
// @author       YanaSn0w1
// @match        https://x.com/*followers
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Tunables ----------
  const SCROLL_STEP_PX  = 800;   // scroll step between batches
  const BATCH_IDLE_MS   = 900;   // wait after scroll for new cells

  const limitMax = 500;
  const limitTotal = 5000;
  const limitWait = 5 * 1000; // Scan timer wait in ms (e.g., 30*1000 for 30 seconds)
  const currentUsername = window.location.pathname.split('/')[1];
  const followersUrl = `https://x.com/${currentUsername}/followers`;
  const verifiedUrl = `https://x.com/${currentUsername}/verified_followers`;
  let originalPage = verifiedUrl; // Always prioritize verified as original
  localStorage.setItem('originalPage', originalPage); // Force set to verified
  let secondaryUrl = followersUrl; // Unverified is secondary
  let finishingUnverified = localStorage.getItem('finishingUnverified') === 'true';

  // Check current page and timer
  const isVerifiedPage = window.location.href.includes('verified_followers');
  const isFollowersPage = window.location.href.includes('/followers') && !isVerifiedPage;
  let fbEndTime = parseInt(localStorage.getItem('fbEndTime') || '0');
  let fbRemaining = Math.max(0, Math.floor((fbEndTime - Date.now()) / 1000));

  // If timer ready (fbRemaining <=0) and not on verified, redirect to verified
  if (fbRemaining <= 0 && !isVerifiedPage) {
    console.log('[𝕏-mutual] Timer ready, redirecting to verified followers page.');
    window.location.href = verifiedUrl;
    return; // Stop execution until redirect
  }

  // If on unverified but not finishing, and timer ready, redirect to verified
  if (isFollowersPage && !finishingUnverified && fbRemaining <= 0) {
    console.log('[𝕏-mutual] Not finishing unverified, redirecting to verified.');
    window.location.href = verifiedUrl;
    return;
  }

  console.log(`[𝕏-mutual] On page: ${isVerifiedPage ? 'Verified' : 'Unverified'}`);

  let running = false;
  let paused = true;
  let processed = new Set();
  let followed = 0, skipped = 0, total = 0;
  let lastTotalCells = 0, stuckCount = 0;
  let fbInterval = null;
  let scanInterval = null;
  let scanRemaining = 0;
  let scanEndTime = 0;
  let timerStarted = fbEndTime > Date.now();
  let cycleFollows = parseInt(localStorage.getItem('cycleFollows') || '0');
  let checkedAll = localStorage.getItem('checkedAll') === 'true';
  let checkLimit = checkedAll ? (parseInt(localStorage.getItem('checkLimit')) || 50) : limitTotal;
  let neededSecondary = localStorage.getItem('neededSecondary') === 'true';

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
    <button id="scan-btn" style="padding:2px 6px; border:1px solid #000;">Start</button>
    <span id="fb-counter">FB: 0/14 00:00</span>
    <span id="scan-counter">Scan: 0/5000 00:00</span>
  `;
  document.body.appendChild(ui);

  function updateFbHud() {
    const mins = Math.floor(fbRemaining / 60).toString().padStart(2, '0');
    const secs = (fbRemaining % 60).toString().padStart(2, '0');
    document.getElementById('fb-counter').textContent = `FB: ${cycleFollows}/14 ${mins}:${secs}`;
  }
  updateFbHud();

  function updateScanHud() {
    const mins = Math.floor(scanRemaining / 60).toString().padStart(2, '0');
    const secs = (scanRemaining % 60).toString().padStart(2, '0');
    document.getElementById('scan-counter').textContent = `Scan: ${total}/${checkLimit} ${mins}:${secs}`;
  }
  updateScanHud();

  async function startFbTimer(minutes) {
    fbEndTime = Date.now() + minutes * 60000;
    localStorage.setItem('fbEndTime', fbEndTime.toString());
    fbRemaining = minutes * 60;
    if (fbInterval) clearInterval(fbInterval);
    fbInterval = setInterval(() => {
      fbRemaining = Math.max(0, Math.floor((fbEndTime - Date.now()) / 1000));
      updateFbHud();
      if (fbRemaining <= 0) {
        clearInterval(fbInterval);
        fbInterval = null;
        localStorage.removeItem('fbEndTime');
      }
    }, 1000);
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (Date.now() >= fbEndTime) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  async function startScanTimer(minutes) {
    scanEndTime = Date.now() + minutes * 60000;
    scanRemaining = minutes * 60;
    if (scanInterval) clearInterval(scanInterval);
    scanInterval = setInterval(() => {
      scanRemaining = Math.max(0, Math.floor((scanEndTime - Date.now()) / 1000));
      updateScanHud();
      if (scanRemaining <= 0) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
    }, 1000);
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (Date.now() >= scanEndTime) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  // Restore FB timer on load
  if (fbEndTime > Date.now()) {
    fbInterval = setInterval(() => {
      fbRemaining = Math.max(0, Math.floor((fbEndTime - Date.now()) / 1000));
      updateFbHud();
      if (fbRemaining <= 0) {
        clearInterval(fbInterval);
        fbInterval = null;
        localStorage.removeItem('fbEndTime');
      }
    }, 1000);
  } else {
    localStorage.removeItem('fbEndTime');
  }

  // ---------- Utils ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function getCells() {
    return Array.from(document.querySelectorAll('button[data-testid="UserCell"]'));
  }

  function getUsername(cell) {
    const link = cell.querySelector('a[href^="/"][role="link"]');
    return link ? link.getAttribute('href').replace(/^\//, '').split('/')[0] : '';
  }

  function isRateLimited() {
    const toast = document.querySelector('[data-testid="toast"]');
    if (toast && toast.textContent.toLowerCase().includes('rate limited')) return true;
    return false;
  }

  function isErrorPresent() {
    const xpath = "//span[contains(text(),'Something went wrong')] | //span[contains(text(),'Try reloading')]";
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue !== null;
  }

  function clickRetryButton() {
    const xpath = "//button[descendant::span[contains(text(),'Try again')]] | //button[descendant::span[contains(text(),'Reload')]]";
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const button = result.singleNodeValue;
    if (button) {
      button.click();
      return true;
    }
    return false;
  }

  async function randomDelay() {
    const ms = Math.floor(Math.random() * (600 - 200 + 1)) + 200;
    return new Promise(r => setTimeout(r, ms));
  }

  async function processBatch() {
    const cells = getCells().filter(cell => {
      const username = getUsername(cell);
      return username && !processed.has(username);
    });

    const batch = cells.slice(0, 7);
    if (batch.length === 0) return;

    const firstCell = batch[0];
    const rect = firstCell.getBoundingClientRect();
    const offset = rect.top - 107;
    window.scrollBy({ top: offset, behavior: 'auto' });
    await sleep(100);

    for (const cell of batch) cell.style.border = '2px solid yellow';
    await sleep(100);

    for (const cell of batch) {
      if (paused || cycleFollows >= 14) break;
      const username = getUsername(cell);
      processed.add(username);
      total++;
      updateScanHud();
      if (total % limitMax === 0 && total < checkLimit) {
        await startScanTimer(limitWait / 60000);
      }
      if (total >= checkLimit) {
        await endLogic();
        return;
      }

      let followBtn = cell.querySelector('button[aria-label^="Follow"]');
      const followingBtn = cell.querySelector('button[aria-label^="Following @"], button[data-testid$="-unfollow"]');

      if (followingBtn) {
        cell.style.border = '2px solid green';
        skipped++;
        console.log(`[𝕏-mutual] Skipped @${username}: Already following`);
        continue;
      }

      if (!followBtn) {
        cell.style.border = '2px solid orange';
        skipped++;
        console.log(`[𝕏-mutual] Skipped @${username}: No follow button`);
        continue;
      }

      // Scroll to cell offset
      const cellRect = cell.getBoundingClientRect();
      const cellOffset = cellRect.top - 107;
      window.scrollBy({ top: cellOffset, behavior: 'auto' });
      await sleep(120);

      // Scroll again before click if needed
      const updatedRect = cell.getBoundingClientRect();
      if (updatedRect.top < 0 || updatedRect.bottom > window.innerHeight) {
        const updatedOffset = updatedRect.top - 107;
        window.scrollBy({ top: updatedOffset, behavior: 'auto' });
        await sleep(120);
      }

      let success = false;
      while (!success) {
        followBtn = cell.querySelector('button[aria-label^="Follow"]');
        if (!followBtn) {
          success = true; // Assume success if button gone
          break;
        }
        followBtn.click();
        await sleep(600);

        if (isRateLimited()) {
          await startFbTimer(15);
        } else {
          success = true;
        }
      }

      if (success) {
        cell.style.border = '2px solid blue';
        followed++;
        cycleFollows++;
        localStorage.setItem('cycleFollows', cycleFollows.toString());
        updateFbHud();
        if (!timerStarted) {
          timerStarted = true;
          startFbTimer(15);
        }
        console.log(`[𝕏-mutual] Followed @${username}`);
        await sleep(300);
      } else {
        cell.style.border = '2px solid orange';
        skipped++;
        console.log(`[𝕏-mutual] Skipped @${username}: Follow failed`);
      }

      await randomDelay();
    }
  }

  document.getElementById('scan-btn').onclick = async () => {
    const btn = document.getElementById('scan-btn');

    paused = !paused;
    btn.textContent = paused ? 'Start' : 'Stop';
    if (!running && !paused) {
      running = true;
      mainLoop();
    }
  };

  async function endLogic() {
    localStorage.setItem('checkedAll', 'true');
    if (cycleFollows >= 14) {
      if (neededSecondary) {
        checkLimit = 50;
      } else {
        checkLimit += cycleFollows; // Add the number found (e.g., +14)
        if (checkLimit > limitTotal) checkLimit = limitTotal;
      }
      localStorage.setItem('checkLimit', checkLimit.toString());
      localStorage.removeItem('neededSecondary');
    } else {
      if (!finishingUnverified) {
        localStorage.setItem('finishingUnverified', 'true');
        localStorage.setItem('neededSecondary', 'true');
        localStorage.setItem('originalPage', window.location.href);
        localStorage.setItem('checkLimit', limitTotal.toString());
        await new Promise(r => setTimeout(r, 5000)); // Stop for 5 seconds
        window.location.href = secondaryUrl;
        return;
      } else {
        localStorage.setItem('checkLimit', '50');
        localStorage.removeItem('neededSecondary');
      }
    }
    while (fbRemaining > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
    localStorage.setItem('cycleFollows', '0');
    localStorage.setItem('finishingUnverified', 'false');
    timerStarted = false;
    window.location.href = originalPage;
  }

  async function mainLoop() {
    while (true) {
      if (paused) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      await processBatch();

      await new Promise(r => setTimeout(r, 50));

      const currCells = getCells().length;
      if (currCells === lastTotalCells) {
        if (isErrorPresent()) {
          console.log('[𝕏-mutual] Detected error message, trying to retry.');
          if (clickRetryButton()) {
            await sleep(2000); // wait for load
            stuckCount = 0;
          } else {
            console.log('[𝕏-mutual] Retry button not found.');
            stuckCount++;
          }
        } else {
          stuckCount++;
        }
        window.scrollBy({ top: window.innerHeight, behavior: 'auto' });
        await sleep(300); // Extra wait after scroll when stuck
      } else {
        stuckCount = 0;
      }
      lastTotalCells = currCells;

      if (stuckCount >= 5) {
        await endLogic();
        return;
      }
    }
  }

  setTimeout(() => {
    if (!running) {
      document.getElementById('scan-btn').click();
    }
  }, 5000);

})();
