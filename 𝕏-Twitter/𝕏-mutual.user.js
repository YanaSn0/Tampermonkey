// ==UserScript==
// @name         𝕏-mutual
// @namespace    http://tampermonkey.net/
// @version      1.07
// @description  FB all if F me.
// @author       Yana
// @match        https://x.com/*followers
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const FB_CD = 15 * 60 * 1000;   // follow cooldown
  const SCAN_CD = 15 * 1000;      // scan cooldown

  const pauseScan = 100;          // was limitMax
  const beforeFirstScan = 200;    // was limitTotal
  const afterFirstScan = 50;      // 50-mode

  const currentUsername = window.location.pathname.split('/')[1];
  const followersUrl = `https://x.com/${currentUsername}/followers`;
  const verifiedUrl = `https://x.com/${currentUsername}/verified_followers`;

  let originalPage = localStorage.getItem('originalPage') || window.location.href;
  if (!localStorage.getItem('originalPage')) {
    localStorage.setItem('originalPage', originalPage);
  }

  let onVerified = window.location.href.includes('verified_followers');
  let secondaryUrl = onVerified ? followersUrl : verifiedUrl;

  let finishingUnverified = localStorage.getItem('finishingUnverified') === 'true';
  let neededSecondary = localStorage.getItem('neededSecondary') === 'true';

  // permanent 50-mode lock after first VERIFIED 200 run
  let fiftyMode = localStorage.getItem('fiftyMode') === 'true';

  let running = false;
  let paused = true;

  let processed = new Set();
  let followed = 0;
  let skipped = 0;
  let total = 0;

  let fbInterval = null;
  let fbRemaining = 0;
  let fbEndTime = parseInt(localStorage.getItem('fbEndTime') || '0', 10);
  let timerStarted = fbEndTime > Date.now();

  let scanInterval = null;
  let scanRemaining = 0;
  let scanEndTime = 0;

  let cycleFollows = parseInt(localStorage.getItem('cycleFollows') || '0', 10);

  let checkedAll = localStorage.getItem('checkedAll') === 'true';
  let checkLimit = checkedAll
    ? (parseInt(localStorage.getItem('checkLimit') || '0', 10) || afterFirstScan)
    : beforeFirstScan;

  if (fiftyMode) {
    checkLimit = afterFirstScan;
  }

  let lastScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  let lastScrollTime = Date.now();

  const ui = document.createElement('div');
  ui.id = 'copilot-ui';
  ui.style = `
    position:fixed; top:10px; right:10px; z-index:9999;
    background:#fff; padding:4px; border:1px solid #ccc;
    font-family:sans-serif; color:#000; display:flex;
    flex-direction:column; gap:2px; font-size:12px; white-space:nowrap;
  `;
  ui.innerHTML = `
    <button id="scan-btn" style="padding:2px 6px; border:1px solid #000;">Start</button>
    <span id="fb-counter">FB: 0/14 00:00</span>
    <span id="scan-counter">Scan: 0/${checkLimit} 00:00</span>
  `;
  document.body.appendChild(ui);

  function updateFbHud() {
    const m = Math.floor(fbRemaining / 60).toString().padStart(2, '0');
    const s = (fbRemaining % 60).toString().padStart(2, '0');
    document.getElementById('fb-counter').textContent = `FB: ${cycleFollows}/14 ${m}:${s}`;
  }

  function updateScanHud() {
    const m = Math.floor(scanRemaining / 60).toString().padStart(2, '0');
    const s = (scanRemaining % 60).toString().padStart(2, '0');
    document.getElementById('scan-counter').textContent = `Scan: ${total}/${checkLimit} ${m}:${s}`;
  }

  updateFbHud();
  updateScanHud();

  async function startFbTimer() {
    fbEndTime = Date.now() + FB_CD;
    localStorage.setItem('fbEndTime', fbEndTime.toString());
    fbRemaining = Math.floor(FB_CD / 1000);
    timerStarted = true;

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

    return new Promise(res => {
      const t = setInterval(() => {
        if (Date.now() >= fbEndTime) {
          clearInterval(t);
          res();
        }
      }, 1000);
    });
  }

  async function startScanTimer() {
    scanEndTime = Date.now() + SCAN_CD;
    scanRemaining = Math.floor(SCAN_CD / 1000);

    if (scanInterval) clearInterval(scanInterval);
    scanInterval = setInterval(() => {
      scanRemaining = Math.max(0, Math.floor((scanEndTime - Date.now()) / 1000));
      updateScanHud();
      if (scanRemaining <= 0) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
    }, 1000);

    return new Promise(res => {
      const t = setInterval(() => {
        if (Date.now() >= scanEndTime) {
          clearInterval(t);
          res();
        }
      }, 1000);
    });
  }

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
    return link ? link.getAttribute('href').slice(1).split('/')[0] : '';
  }

  function isRateLimited() {
    const toast = document.querySelector('[data-testid="toast"]');
    return toast && toast.textContent.toLowerCase().includes('rate limited');
  }

  async function randomDelay() {
    return new Promise(r => setTimeout(r, Math.floor(Math.random() * 401) + 200));
  }

  async function processBatch() {
    const cells = getCells().filter(c => {
      const u = getUsername(c);
      return u && !processed.has(u);
    });

    const batch = cells.slice(0, 7);
    if (batch.length === 0) return;

    const first = batch[0];
    const rect = first.getBoundingClientRect();
    window.scrollBy({ top: rect.top - 107 });
    await new Promise(r => setTimeout(r, 100));

    for (const c of batch) c.style.border = '2px solid yellow';
    await new Promise(r => setTimeout(r, 100));

    for (const cell of batch) {
      if (paused || cycleFollows >= 14) break;

      const username = getUsername(cell);
      processed.add(username);
      total++;
      updateScanHud();

      if (total % pauseScan === 0 && total < checkLimit) {
        await startScanTimer();
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

      let ok = false;
      while (!ok) {
        followBtn.click();
        await new Promise(r => setTimeout(r, 600));
        followBtn = cell.querySelector('button[aria-label^="Follow"]');
        if (isRateLimited()) {
          await startFbTimer();
        } else ok = true;
      }

      cell.style.border = '2px solid blue';
      followed++;
      cycleFollows++;
      localStorage.setItem('cycleFollows', cycleFollows.toString());
      updateFbHud();

      if (!timerStarted) {
        timerStarted = true;
        startFbTimer();
      }

      await randomDelay();
    }
  }

  document.getElementById('scan-btn').onclick = () => {
    paused = !paused;
    document.getElementById('scan-btn').textContent = paused ? 'Start' : 'Stop';
    if (!running && !paused) {
      running = true;
      mainLoop();
    }
  };

  async function endLogic() {
    localStorage.setItem('checkedAll', 'true');

    const isVerifiedNow = window.location.href.includes('verified_followers');

    // VERIFIED run that hit 200 → lock permanent 50-mode and go UNV 50
    if (isVerifiedNow && total >= beforeFirstScan) {
      fiftyMode = true;
      localStorage.setItem('fiftyMode', 'true');
      checkLimit = afterFirstScan;
      localStorage.setItem('checkLimit', afterFirstScan.toString());

      localStorage.setItem('finishingUnverified', 'true');
      localStorage.setItem('neededSecondary', 'true');
      localStorage.setItem('originalPage', verifiedUrl);

      await new Promise(r => setTimeout(r, 5000));
      window.location.href = followersUrl;
      return;
    }

    // UNVERIFIED run: must ALWAYS be 50 and ALWAYS stop + timer, even if 0 follows
    if (!isVerifiedNow) {
      fiftyMode = true;
      localStorage.setItem('fiftyMode', 'true');
      checkLimit = afterFirstScan;
      localStorage.setItem('checkLimit', afterFirstScan.toString());
      localStorage.removeItem('neededSecondary');
      localStorage.setItem('finishingUnverified', 'false');

      if (!timerStarted) await startFbTimer();
      else {
        while (fbRemaining > 0) await new Promise(r => setTimeout(r, 1000));
      }

      localStorage.setItem('cycleFollows', '0');
      timerStarted = false;
      window.location.href = originalPage;
      return;
    }

    // VERIFIED < 200 → go to UNV
    if (!finishingUnverified) {
      localStorage.setItem('finishingUnverified', 'true');
      localStorage.setItem('neededSecondary', 'true');
      localStorage.setItem('originalPage', window.location.href);

      const nextLimit = fiftyMode ? afterFirstScan : beforeFirstScan;
      checkLimit = nextLimit;
      localStorage.setItem('checkLimit', nextLimit.toString());

      await new Promise(r => setTimeout(r, 5000));
      window.location.href = secondaryUrl;
      return;
    }

    // fallback: treat as UNV completion → lock to 50 and timer
    fiftyMode = true;
    localStorage.setItem('fiftyMode', 'true');
    checkLimit = afterFirstScan;
    localStorage.setItem('checkLimit', afterFirstScan.toString());
    localStorage.removeItem('neededSecondary');

    if (!timerStarted) await startFbTimer();
    else {
      while (fbRemaining > 0) await new Promise(r => setTimeout(r, 1000));
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

      window.scrollBy({ top: window.innerHeight });

      const st = window.scrollY || document.documentElement.scrollTop || 0;
      if (st !== lastScrollTop) {
        lastScrollTop = st;
        lastScrollTime = Date.now();
      } else {
        if (Date.now() - lastScrollTime >= 3000) {
          await endLogic();
          return;
        }
      }
    }
  }

  setTimeout(() => {
    if (!running) document.getElementById('scan-btn').click();
  }, 5000);

})();
