// ==UserScript==
// @name         𝕏-mutual
// @namespace    http://tampermonkey.net/
// @version      1.03
// @description  Follow back people who follow you.
// @author       YanaSn0w1
// @match        https://x.com/*/followers
// @match        https://x.com/*/verified_followers
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const limitMax = 100;          // pause every 100 scanned
  const limitTotal = 200;        // max to scan per page
  const limitWait = 11 * 1000;   // 11 second cooldown

  const currentUsername = window.location.pathname.split('/')[1];
  const followersUrl = `https://x.com/${currentUsername}/followers`;
  const verifiedUrl = `https://x.com/${currentUsername}/verified_followers`;

  // original page is "home" (usually verified)
  let originalPage = localStorage.getItem('originalPage') || window.location.href;
  if (!localStorage.getItem('originalPage')) {
    localStorage.setItem('originalPage', originalPage);
  }

  // secondary is "the other one"
  let secondaryUrl = originalPage.includes('verified_followers') ? followersUrl : verifiedUrl;

  // flag: are we currently on the unverified finishing pass
  let finishingUnverified = localStorage.getItem('finishingUnverified') === 'true';

  let running = false;
  let paused = true;
  let processed = new Set();
  let followed = 0, skipped = 0, total = 0;
  let lastTotalCells = 0, stuckCount = 0;

  let fbInterval = null;
  let scanInterval = null;
  let fbRemaining = 0;
  let scanRemaining = 0;
  let fbEndTime = parseInt(localStorage.getItem('fbEndTime') || '0');
  let scanEndTime = 0;
  let timerStarted = fbEndTime > Date.now();
  let cycleFollows = parseInt(localStorage.getItem('cycleFollows') || '0');

  // fixed per-run scan limit: always 200
  let checkLimit = limitTotal;

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
    <span id="scan-counter">Scan: 0/${checkLimit} 00:00</span>
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

  // currently unused, but left in case you re-use minutes-based scan waits later
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

  // restore FB timer on load if still active
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
    window.scrollBy({ top: offset });
    await new Promise(r => setTimeout(r, 100));

    for (const cell of batch) cell.style.border = '2px solid yellow';
    await new Promise(r => setTimeout(r, 100));

    for (const cell of batch) {
      if (paused || cycleFollows >= 14) break;

      const username = getUsername(cell);
      processed.add(username);
      total++;
      updateScanHud();

      // 11 second scan cooldown every 100
      if (total % limitMax === 0 && total < checkLimit) {
        scanRemaining = limitWait / 1000;
        updateScanHud();

        const scanCountdown = setInterval(() => {
          scanRemaining--;
          updateScanHud();
          if (scanRemaining <= 0) clearInterval(scanCountdown);
        }, 1000);

        await new Promise(r => setTimeout(r, limitWait));
      }

      if (total >= checkLimit) {
        await endLogic();
        return;
      }

      let followBtn = cell.querySelector('button[aria-label^="Follow"]');
      const followingBtn = cell.querySelector('button[aria-label^="Following @"], button[data-testid$="-unfollow"]');

      if (followingBtn || !followBtn) {
        cell.style.border = '2px solid green';
        skipped++;
        continue;
      }

      let success = false;
      while (!success) {
        followBtn.click();
        await new Promise(r => setTimeout(r, 600));

        followBtn = cell.querySelector('button[aria-label^="Follow"]');

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
      } else {
        cell.style.border = '2px solid orange';
        skipped++;
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
    // finished scan on current page (verified or unverified)

    if (!finishingUnverified) {
      // we just finished verified; go to unverified
      localStorage.setItem('finishingUnverified', 'true');
      localStorage.setItem('originalPage', originalPage);
      await new Promise(r => setTimeout(r, 5000));
      window.location.href = secondaryUrl;
      return;
    }

    // we are on unverified and just finished there

    // if no follows happened this cycle, explicitly start a 15-minute timer
    if (cycleFollows === 0 && !timerStarted) {
      timerStarted = true;
      await startFbTimer(15);
    }

    // wait for follow timer (either existing from a follow or the forced 15 min)
    while (fbRemaining > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // reset for next cycle
    localStorage.setItem('cycleFollows', '0');
    localStorage.setItem('finishingUnverified', 'false');
    timerStarted = false;

    // next cycle starts back on original page (verified)
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
        stuckCount++;
        window.scrollBy({ top: window.innerHeight });
      } else {
        stuckCount = 0;
      }
      lastTotalCells = currCells;

      if (stuckCount >= 3) {
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
