// ==UserScript==
// @name         𝕏-Mutual-Manager-Pro
// @namespace    http://tampermonkey.net/
// @version      1
// @author       YanaSn0w1
// @description  Two in one plus filters and full UI
// @match        https://x.com/*follow*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  let SKIP_DEFAULT_PIC = localStorage.getItem('um_skip_default_pic') !== 'false'; // default true
  let SKIP_NO_BIO = localStorage.getItem('um_skip_no_bio') !== 'false'; // default true
  let SKIP_KEY_WORDS = localStorage.getItem('um_skip_key_words') !== 'false'; // default true

  let KEY_WORDS = JSON.parse(localStorage.getItem('um_key_words')) || ['elon', 'musk', 'private', 'chat', 'dm'].map(w => w.toLowerCase());

  let WHITELIST = JSON.parse(localStorage.getItem('um_whitelist')) || ['YanaHeat', 'YanaSn0w1'];

  const MIN_DELAY = 200;
  const MAX_DELAY = 600;
  const BATCH_SIZE = 7;
  const SCROLL_POSITION = 107;
  const STUCK_THRESHOLD = 60;

  const UF_MAX_PER_PERIOD = 150;
  const ACTION_CD = 15 * 60 * 1000;
  const SC_CD = 30 * 1000;
  const SC_PAUSE_COUNT = 200;
  const SC_MAX_UNFOLLOW = 30000;

  const FB_MAX_PER_PERIOD = 14;
  const PAUSE_SCAN_EVERY = 200;
  const LARGE_SCAN_LIMIT = 10000;
  const SMALL_SCAN_LIMIT = 50;

  const path = window.location.pathname;
  const parts = path.split('/').filter(p => p);
  if (parts.length < 2) return;
  const username = parts[0];
  const pageType = parts[1];

  const isFollowingPage = pageType === 'following';
  const isFollowersPage = pageType === 'followers' || pageType === 'verified_followers';

  if (!isFollowingPage && !isFollowersPage) return;

  const mode = isFollowingPage ? 'unfollow' : 'followback';
  const isVerified = pageType === 'verified_followers';

  const verifiedUrl = `https://x.com/${username}/verified_followers`;
  const followingUrl = `https://x.com/${username}/following`;
  const normalUrl = `https://x.com/${username}/followers`;

  function getCells() {
    return Array.from(document.querySelectorAll('button[data-testid="UserCell"]'));
  }

  function getUsername(cell) {
    const link = cell.querySelector('a[href^="/"][role="link"]');
    return link ? link.getAttribute('href').slice(1).split('/')[0] : '';
  }

  function extractTextWithEmojis(el) {
    if (!el) return '';
    return Array.from(el.querySelectorAll('span, img'))
      .map(node => node.tagName === 'IMG' ? node.alt : node.textContent.trim())
      .filter(t => t)
      .join(' ');
  }

  function getBotInfo(cell) {
    const img = cell.querySelector('img');
    const hasDefaultPic = img && img.src.includes('default_profile_normal.png');
    const nameDiv = cell.querySelector('div[class*="r-b88u0q"]');
    const name = extractTextWithEmojis(nameDiv);
    const bioDiv = cell.querySelector('div[dir="auto"][class*="r-1h8ys4a"]');
    const bio = extractTextWithEmojis(bioDiv);
    const noBio = bio.trim() === '';
    const username = getUsername(cell);
    const hasKeyword = SKIP_KEY_WORDS && KEY_WORDS.some(k =>
      name.toLowerCase().includes(k) || username.toLowerCase().includes(k) || bio.toLowerCase().includes(k)
    );

    const reasons = [];
    if (SKIP_DEFAULT_PIC && hasDefaultPic) reasons.push('default pic');
    if (SKIP_NO_BIO && noBio) reasons.push('no bio');
    if (hasKeyword) reasons.push('keyword');
    return { isBotLike: reasons.length > 0, reasons };
  }

  async function randomDelay() {
    const ms = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
    await new Promise(r => setTimeout(r, ms));
  }

  function isRateLimited() {
    const toast = document.querySelector('[data-testid="toast"]');
    if (toast && toast.textContent.toLowerCase().includes('rate limit')) {
      console.log('RATE LIMIT DETECTED!');
      return true;
    }
    return false;
  }

  async function waitForUnfollowConfirm() {
    return new Promise(resolve => {
      const obs = new MutationObserver(() => {
        const btn = Array.from(document.querySelectorAll('button[data-testid="confirmationSheetConfirm"]'))
          .find(b => b.textContent.trim().toLowerCase() === 'unfollow');
        if (btn && btn.offsetParent) {
          obs.disconnect();
          resolve(btn);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, 3000);
    });
  }

  // UI
  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:#fff;padding:12px;border:2px solid #000;border-radius:10px;font-family:sans-serif;font-size:13px;display:flex;flex-direction:column;gap:8px;min-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  document.body.appendChild(ui);

  const startBtn = document.createElement('button');
  startBtn.textContent = 'Start';
  startBtn.style.cssText = 'padding:10px;font-weight:bold;font-size:15px;border-radius:6px;background:#2196F3;color:white;cursor:pointer;';
  ui.appendChild(startBtn);

  const modeLine = document.createElement('div');
  modeLine.style.fontWeight = 'bold';
  modeLine.style.fontSize = '14px';
  ui.appendChild(modeLine);

  const actionLine = document.createElement('div');
  ui.appendChild(actionLine);

  const scanLine = document.createElement('div');
  ui.appendChild(scanLine);

  // Mode switch button - fixed to always go to the opposite mode's correct page
  const modeSwitchBtn = document.createElement('button');
  modeSwitchBtn.style.cssText = 'padding:8px;font-weight:bold;cursor:pointer;border-radius:6px;background:#9c27b0;color:white;';
  if (isFollowingPage) {
    modeSwitchBtn.textContent = 'Switch → Follow Back (Verified)';
    modeSwitchBtn.onclick = () => window.location.href = verifiedUrl;
  } else {
    modeSwitchBtn.textContent = 'Switch → Unfollow';
    modeSwitchBtn.onclick = () => window.location.href = followingUrl;
  }
  ui.appendChild(modeSwitchBtn);

  // Reset button - now only clears data for the current mode
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset This Mode & Reload';
  resetBtn.style.cssText = 'padding:8px;font-weight:bold;cursor:pointer;border-radius:6px;background:#f44336;color:white;';
  resetBtn.onclick = () => {
    if (confirm('Clear data for this mode only and reload?')) {
      const prefix = mode === 'unfollow' ? 'um_uf_' : 'um_fb_';
      Object.keys(localStorage)
        .filter(key => key.startsWith(prefix))
        .forEach(key => localStorage.removeItem(key));
      location.reload();
    }
  };
  ui.appendChild(resetBtn);

  let followUnvDiv;
  if (mode !== 'unfollow') {
    followUnvDiv = document.createElement('div');
    followUnvDiv.style.cssText = 'display:flex;align-items:center;';
    const followUnvCheckbox = document.createElement('input');
    followUnvCheckbox.type = 'checkbox';
    followUnvCheckbox.id = 'follow-unv';
    followUnvCheckbox.checked = localStorage.getItem('um_fb_followUnv') === 'true';
    followUnvCheckbox.onchange = () => {
      localStorage.setItem('um_fb_followUnv', followUnvCheckbox.checked);
    };
    const followUnvLabel = document.createElement('label');
    followUnvLabel.htmlFor = 'follow-unv';
    followUnvLabel.textContent = 'Follow Unverified';
    followUnvLabel.style.marginLeft = '5px';
    followUnvDiv.appendChild(followUnvCheckbox);
    followUnvDiv.appendChild(followUnvLabel);
    ui.appendChild(followUnvDiv);
  }

  // Bot filters checkboxes
  const filtersLabel = document.createElement('div');
  filtersLabel.textContent = 'Bot Filters:';
  filtersLabel.style.fontWeight = 'bold';
  ui.appendChild(filtersLabel);

  const defaultPicDiv = document.createElement('div');
  defaultPicDiv.style.cssText = 'display:flex;align-items:center;';
  const defaultPicCheckbox = document.createElement('input');
  defaultPicCheckbox.type = 'checkbox';
  defaultPicCheckbox.id = 'skip-default-pic';
  defaultPicCheckbox.checked = SKIP_DEFAULT_PIC;
  defaultPicCheckbox.onchange = () => {
    SKIP_DEFAULT_PIC = defaultPicCheckbox.checked;
    localStorage.setItem('um_skip_default_pic', SKIP_DEFAULT_PIC);
  };
  const defaultPicLabel = document.createElement('label');
  defaultPicLabel.htmlFor = 'skip-default-pic';
  defaultPicLabel.textContent = 'Skip Default Pic';
  defaultPicLabel.style.marginLeft = '5px';
  defaultPicDiv.appendChild(defaultPicCheckbox);
  defaultPicDiv.appendChild(defaultPicLabel);
  ui.appendChild(defaultPicDiv);

  const noBioDiv = document.createElement('div');
  noBioDiv.style.cssText = 'display:flex;align-items:center;';
  const noBioCheckbox = document.createElement('input');
  noBioCheckbox.type = 'checkbox';
  noBioCheckbox.id = 'skip-no-bio';
  noBioCheckbox.checked = SKIP_NO_BIO;
  noBioCheckbox.onchange = () => {
    SKIP_NO_BIO = noBioCheckbox.checked;
    localStorage.setItem('um_skip_no_bio', SKIP_NO_BIO);
  };
  const noBioLabel = document.createElement('label');
  noBioLabel.htmlFor = 'skip-no-bio';
  noBioLabel.textContent = 'Skip No Bio';
  noBioLabel.style.marginLeft = '5px';
  noBioDiv.appendChild(noBioCheckbox);
  noBioDiv.appendChild(noBioLabel);
  ui.appendChild(noBioDiv);

  const keywordsDiv = document.createElement('div');
  keywordsDiv.style.cssText = 'display:flex;align-items:center;';
  const keywordsCheckbox = document.createElement('input');
  keywordsCheckbox.type = 'checkbox';
  keywordsCheckbox.id = 'skip-keywords';
  keywordsCheckbox.checked = SKIP_KEY_WORDS;
  keywordsCheckbox.onchange = () => {
    SKIP_KEY_WORDS = keywordsCheckbox.checked;
    localStorage.setItem('um_skip_key_words', SKIP_KEY_WORDS);
  };
  const keywordsLabel = document.createElement('label');
  keywordsLabel.htmlFor = 'skip-keywords';
  keywordsLabel.textContent = 'Skip Keywords';
  keywordsLabel.style.marginLeft = '5px';
  keywordsDiv.appendChild(keywordsCheckbox);
  keywordsDiv.appendChild(keywordsLabel);
  ui.appendChild(keywordsDiv);

  // Keywords management
  const keywordsManageLabel = document.createElement('div');
  keywordsManageLabel.textContent = 'Manage Keywords:';
  keywordsManageLabel.style.fontWeight = 'bold';
  ui.appendChild(keywordsManageLabel);

  const keywordsList = document.createElement('ul');
  keywordsList.style.cssText = 'list-style:none;padding:0;margin:0;';
  ui.appendChild(keywordsList);

  function updateKeywordsList() {
    keywordsList.innerHTML = '';
    KEY_WORDS.forEach((kw, index) => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:5px;margin-bottom:5px;';
      const span = document.createElement('span');
      span.textContent = kw;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.style.cssText = 'font-size:12px;padding:2px 4px;background:#f44336;color:white;border:none;cursor:pointer;';
      removeBtn.onclick = () => {
        KEY_WORDS.splice(index, 1);
        localStorage.setItem('um_key_words', JSON.stringify(KEY_WORDS));
        updateKeywordsList();
      };
      li.appendChild(span);
      li.appendChild(removeBtn);
      keywordsList.appendChild(li);
    });
  }
  updateKeywordsList();

  const addKeywordDiv = document.createElement('div');
  addKeywordDiv.style.cssText = 'display:flex;gap:5px;';
  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.placeholder = 'New keyword';
  addInput.style.flex = '1';
  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add';
  addBtn.style.cssText = 'padding:4px 8px;background:#4CAF50;color:white;border:none;cursor:pointer;';
  addBtn.onclick = () => {
    const newKw = addInput.value.trim().toLowerCase();
    if (newKw && !KEY_WORDS.includes(newKw)) {
      KEY_WORDS.push(newKw);
      localStorage.setItem('um_key_words', JSON.stringify(KEY_WORDS));
      updateKeywordsList();
      addInput.value = '';
    }
  };
  addKeywordDiv.appendChild(addInput);
  addKeywordDiv.appendChild(addBtn);
  ui.appendChild(addKeywordDiv);

  // Whitelist management
  const whitelistManageLabel = document.createElement('div');
  whitelistManageLabel.textContent = 'Manage Whitelist:';
  whitelistManageLabel.style.fontWeight = 'bold';
  ui.appendChild(whitelistManageLabel);

  const whitelistList = document.createElement('ul');
  whitelistList.style.cssText = 'list-style:none;padding:0;margin:0;';
  ui.appendChild(whitelistList);

  function updateWhitelistList() {
    whitelistList.innerHTML = '';
    WHITELIST.forEach((wl, index) => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:5px;margin-bottom:5px;';
      const span = document.createElement('span');
      span.textContent = wl;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.style.cssText = 'font-size:12px;padding:2px 4px;background:#f44336;color:white;border:none;cursor:pointer;';
      removeBtn.onclick = () => {
        WHITELIST.splice(index, 1);
        localStorage.setItem('um_whitelist', JSON.stringify(WHITELIST));
        updateWhitelistList();
      };
      li.appendChild(span);
      li.appendChild(removeBtn);
      whitelistList.appendChild(li);
    });
  }
  updateWhitelistList();

  const addWhitelistDiv = document.createElement('div');
  addWhitelistDiv.style.cssText = 'display:flex;gap:5px;';
  const addWlInput = document.createElement('input');
  addWlInput.type = 'text';
  addWlInput.placeholder = 'New whitelist username';
  addWlInput.style.flex = '1';
  const addWlBtn = document.createElement('button');
  addWlBtn.textContent = 'Add';
  addWlBtn.style.cssText = 'padding:4px 8px;background:#4CAF50;color:white;border:none;cursor:pointer;';
  addWlBtn.onclick = () => {
    const newWl = addWlInput.value.trim();
    if (newWl && !WHITELIST.includes(newWl)) {
      WHITELIST.push(newWl);
      localStorage.setItem('um_whitelist', JSON.stringify(WHITELIST));
      updateWhitelistList();
      addWlInput.value = '';
    }
  };
  addWhitelistDiv.appendChild(addWlInput);
  addWhitelistDiv.appendChild(addWlBtn);
  ui.appendChild(addWhitelistDiv);

  let running = false;
  let paused = true;

  if (mode === 'unfollow') {
    // UNFOLLOW MODE
    modeLine.textContent = 'Mode: Unfollow non-mutuals + bots';
    actionLine.innerHTML = `Unfollows: <span id="action-count">0/${UF_MAX_PER_PERIOD}</span><span id="timer"></span>`;
    scanLine.innerHTML = `Processed: <span id="scan-count">0/${SC_MAX_UNFOLLOW}</span>`;

    const actionCountSpan = document.getElementById('action-count');
    const timerSpan = document.getElementById('timer');
    const scanCountSpan = document.getElementById('scan-count');

    let processed = new Set();
    let total = 0;
    let actionedInPeriod = 0;
    let remainingTime = 0;
    let hasActioned = false;
    let timerInt = null;
    let periodStart = null;

    const storagePrefix = 'um_uf_';

    function loadState() {
      periodStart = parseInt(localStorage.getItem(storagePrefix + 'periodStart') || '0') || null;
      actionedInPeriod = parseInt(localStorage.getItem(storagePrefix + 'count') || '0');
      if (periodStart) {
        const elapsed = Date.now() - periodStart;
        if (elapsed < ACTION_CD) {
          remainingTime = Math.floor((ACTION_CD - elapsed) / 1000);
          startTimerFrom(remainingTime);
        } else {
          periodStart = null;
          actionedInPeriod = 0;
        }
      }
      updateUI();
    }

    function saveState() {
      if (periodStart) localStorage.setItem(storagePrefix + 'periodStart', periodStart);
      else localStorage.removeItem(storagePrefix + 'periodStart');
      localStorage.setItem(storagePrefix + 'count', actionedInPeriod);
    }

    function startTimerFrom(sec) {
      remainingTime = sec;
      hasActioned = true;
      updateUI();
      timerInt = setInterval(() => {
        remainingTime--;
        updateUI();
        if (remainingTime <= 0) {
          clearInterval(timerInt);
          periodStart = null;
          actionedInPeriod = 0;
          hasActioned = false;
          saveState();
          updateUI();
        }
      }, 1000);
    }

    function startNewTimer() {
      clearInterval(timerInt);
      periodStart = Date.now();
      remainingTime = Math.floor(ACTION_CD / 1000);
      hasActioned = true;
      saveState();
      updateUI();
      timerInt = setInterval(() => {
        remainingTime--;
        updateUI();
        if (remainingTime <= 0) {
          clearInterval(timerInt);
          periodStart = null;
          actionedInPeriod = 0;
          hasActioned = false;
          saveState();
          updateUI();
        }
      }, 1000);
    }

    function updateUI() {
      actionCountSpan.textContent = `${actionedInPeriod}/${UF_MAX_PER_PERIOD}`;
      timerSpan.textContent = hasActioned ? ` (${Math.floor(remainingTime/60).toString().padStart(2,'0')}:${(remainingTime%60).toString().padStart(2,'0')})` : '';
      scanCountSpan.textContent = `${total}/${SC_MAX_UNFOLLOW}`;
    }

    loadState();

    async function processBatch() {
      let cells = getCells().filter(c => !processed.has(getUsername(c)));
      let batch = cells.slice(0, BATCH_SIZE);
      if (!batch.length) return 0;

      window.scrollBy({top: batch[0].getBoundingClientRect().top - SCROLL_POSITION});
      await new Promise(r => setTimeout(r, 300));

      batch.forEach(c => c.style.border = '2px solid yellow');
      await new Promise(r => setTimeout(r, 500));

      let processedCount = 0;
      for (let cell of batch) {
        if (paused) break;
        const user = getUsername(cell);
        processed.add(user);
        total++;
        processedCount++;
        updateUI();

        if (WHITELIST.includes(user)) {
          cell.style.border = '2px solid orange';
          console.log(`Skipping ${user}: whitelisted`);
          continue;
        }

        const isMutual = !!cell.querySelector('[data-testid="userFollowIndicator"]');

        const {isBotLike, reasons: botReasons} = getBotInfo(cell);

        let reasons = [];
        if (!isMutual) reasons.push('non-mutual');
        reasons = reasons.concat(botReasons);

        if (reasons.length === 0) {
          cell.style.border = '2px solid green';
          console.log(`Skipping ${user}: mutual and not bot-like`);
          continue;
        }

        const btn = cell.querySelector('button[aria-label^="Following @"], button[data-testid$="-unfollow"]');
        if (!btn) {
          cell.style.border = '2px solid orange';
          console.log(`Skipping ${user}: no unfollow button`);
          continue;
        }

        if (actionedInPeriod >= UF_MAX_PER_PERIOD) {
          paused = true;
          startBtn.textContent = 'Start';
          cell.style.border = '2px solid purple';
          console.log(`Pausing: max unfollows reached`);
          continue;
        }

        btn.click();
        const confirm = await waitForUnfollowConfirm();
        if (confirm) {
          confirm.click();
          cell.style.border = '2px solid red';
          actionedInPeriod++;
          if (actionedInPeriod === 1) startNewTimer();
          updateUI();
          saveState();
          console.log(`Unfollowed ${user}: ${reasons.join(', ')}`);
        } else {
          if (isRateLimited()) startNewTimer();
          cell.style.border = '2px solid orange';
          console.log(`Failed to unfollow ${user}: rate limited or no confirm`);
        }

        await randomDelay();
      }
      return processedCount;
    }

    startBtn.onclick = async () => {
      if (running) {
        paused = !paused;
        startBtn.textContent = paused ? 'Start' : 'Pause';
        return;
      }
      running = true;
      paused = false;
      startBtn.textContent = 'Pause';
      let stuckCount = 0;
      let lastCellsCount = 0;
      let scanSincePause = 0;
      while (running) {
        if (paused) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        const proc = await processBatch();
        scanSincePause += proc;
        if (scanSincePause >= SC_PAUSE_COUNT) {
          await new Promise(r => setTimeout(r, SC_CD));
          scanSincePause = 0;
        }
        const curr = getCells().length;
        if (curr === lastCellsCount) stuckCount++;
        else stuckCount = 0;
        lastCellsCount = curr;
        if (stuckCount >= STUCK_THRESHOLD) {
          running = false;
          startBtn.textContent = 'Start';
          break;
        }
        window.scrollBy({top: 800});
        await new Promise(r => setTimeout(r, 100));
      }
    };

  } else {
    // FOLLOW-BACK MODE
    modeLine.textContent = `Mode: Follow Back (${isVerified ? 'Verified' : 'All'} Followers)`;
    actionLine.innerHTML = `Follows: <span id="fb-count-val">0/${FB_MAX_PER_PERIOD}</span> <span id="fb-timer">00:00</span>`;
    scanLine.innerHTML = `Processed: <span id="scan-count">0</span>`;

    const fbCountSpan = document.getElementById('fb-count-val');
    const fbTimerSpan = document.getElementById('fb-timer');
    const scanCountSpan = document.getElementById('scan-count');

    let processed = new Set();
    let total = 0;
    let cycleFollows = 0;
    let fbRemaining = 0;
    let fbTimerInt = null;
    let fbEndTime = 0;

    const storagePrefix = 'um_fb_';

    let originalPage = localStorage.getItem(storagePrefix + 'original') || window.location.href;
    if (!localStorage.getItem(storagePrefix + 'original')) localStorage.setItem(storagePrefix + 'original', originalPage);

    fbEndTime = parseInt(localStorage.getItem(storagePrefix + 'endTime') || '0');
    cycleFollows = parseInt(localStorage.getItem(storagePrefix + 'cycle') || '0');

    let fiftyMode = localStorage.getItem(storagePrefix + 'fiftyMode') === 'true';
    let checkedAll = localStorage.getItem(storagePrefix + 'checkedAll') === 'true';
    let checkLimit = checkedAll ? SMALL_SCAN_LIMIT : (fiftyMode ? SMALL_SCAN_LIMIT : LARGE_SCAN_LIMIT);

    function updateUI() {
      const m = String(Math.floor(fbRemaining / 60)).padStart(2, '0');
      const s = String(fbRemaining % 60).padStart(2, '0');
      fbCountSpan.textContent = `${cycleFollows}/${FB_MAX_PER_PERIOD}`;
      fbTimerSpan.textContent = `${m}:${s}`;
      scanCountSpan.textContent = `${total}/${checkLimit}`;
    }

    async function startFbCooldown() {
      fbEndTime = Date.now() + ACTION_CD;
      localStorage.setItem(storagePrefix + 'endTime', fbEndTime);
      fbRemaining = Math.floor(ACTION_CD / 1000);
      updateUI();
      if (fbTimerInt) clearInterval(fbTimerInt);
      fbTimerInt = setInterval(() => {
        fbRemaining = Math.max(0, Math.floor((fbEndTime - Date.now()) / 1000));
        updateUI();
        if (fbRemaining <= 0) {
          clearInterval(fbTimerInt);
          cycleFollows = 0;
          localStorage.setItem(storagePrefix + 'cycle', '0');
          localStorage.removeItem(storagePrefix + 'endTime');
          updateUI();
        }
      }, 1000);
    }

    if (fbEndTime > Date.now()) {
      fbRemaining = Math.floor((fbEndTime - Date.now()) / 1000);
      fbTimerInt = setInterval(() => {
        fbRemaining = Math.max(0, Math.floor((fbEndTime - Date.now()) / 1000));
        updateUI();
        if (fbRemaining <= 0) {
          clearInterval(fbTimerInt);
          cycleFollows = 0;
          localStorage.setItem(storagePrefix + 'cycle', '0');
          localStorage.removeItem(storagePrefix + 'endTime');
          updateUI();
        }
      }, 1000);
    }
    updateUI();

    async function processBatch() {
      let cells = getCells().filter(c => !processed.has(getUsername(c)));
      let batch = cells.slice(0, BATCH_SIZE);
      if (!batch.length) return 0;

      window.scrollBy({top: batch[0].getBoundingClientRect().top - SCROLL_POSITION});
      await new Promise(r => setTimeout(r, 300));

      batch.forEach(c => c.style.border = '2px solid yellow');
      await new Promise(r => setTimeout(r, 500));

      let proc = 0;
      for (let cell of batch) {
        if (paused || cycleFollows >= FB_MAX_PER_PERIOD) break;
        const user = getUsername(cell);
        processed.add(user);
        total++;
        proc++;
        updateUI();

        if (WHITELIST.includes(user)) {
          cell.style.border = '2px solid orange';
          console.log(`Skipping ${user}: whitelisted`);
          continue;
        }

        const {isBotLike, reasons} = getBotInfo(cell);
        if (isBotLike) {
          cell.style.border = '2px solid purple';
          console.log(`Skipping ${user}: bot-like (${reasons.join(', ')})`);
          continue;
        }

        const alreadyFollowing = cell.querySelector('button[aria-label^="Following @"]');
        if (alreadyFollowing) {
          cell.style.border = '2px solid green';
          console.log(`Skipping ${user}: already following`);
          continue;
        }

        const followBackBtn = cell.querySelector('button[aria-label*="Follow back @"]');
        if (!followBackBtn) {
          cell.style.border = '2px solid gray';
          console.log(`Skipping ${user}: no follow back button`);
          continue;
        }

        let success = false;
        let attempts = 0;
        while (!success && attempts < 3) {
          attempts++;
          followBackBtn.click();
          await new Promise(r => setTimeout(r, 800));
          if (isRateLimited()) {
            await startFbCooldown();
            // Wait for the cooldown to finish before retrying
            await new Promise(resolve => {
              const waitInterval = setInterval(() => {
                if (fbRemaining <= 0) {
                  clearInterval(waitInterval);
                  resolve();
                }
              }, 1000);
            });
            // After waiting, retry if the button is still present
            if (!cell.querySelector('button[aria-label*="Follow back @"]')) {
              success = true;
            }
            continue;
          }
          if (!cell.querySelector('button[aria-label*="Follow back @"]')) {
            success = true;
          }
        }

        if (success) {
          cell.style.border = '2px solid blue';
          cycleFollows++;
          localStorage.setItem(storagePrefix + 'cycle', cycleFollows);
          if (cycleFollows === 1) await startFbCooldown();
          updateUI();
          console.log(`Followed ${user}: eligible follow back`);
        } else {
          console.log(`Failed to follow ${user}: after ${attempts} attempts`);
        }

        await randomDelay();
      }
      return proc;
    }

    async function finishLogic() {
      localStorage.setItem(storagePrefix + 'checkedAll', 'true');
      localStorage.setItem(storagePrefix + 'fiftyMode', 'true');
      if (fbRemaining > 0) {
        await new Promise(r => setTimeout(r, fbRemaining * 1000 + 2000));
      } else {
        await new Promise(r => setTimeout(r, ACTION_CD + 2000));
      }
      const followUnv = localStorage.getItem('um_fb_followUnv') === 'true';
      let nextUrl;
      if (!followUnv) {
        nextUrl = verifiedUrl;
      } else {
        nextUrl = isVerified ? normalUrl : verifiedUrl;
      }
      window.location.href = nextUrl;
    }

    startBtn.onclick = () => {
      paused = !paused;
      startBtn.textContent = paused ? 'Start' : 'Pause';
      if (!running && !paused) {
        running = true;
        (async () => {
          let lastScroll = window.scrollY;
          let lastScrollTime = Date.now();
          let scanSincePause = 0;
          while (running) {
            if (paused) {
              await new Promise(r => setTimeout(r, 300));
              continue;
            }
            const proc = await processBatch();
            scanSincePause += proc;
            if (scanSincePause >= PAUSE_SCAN_EVERY) {
              await new Promise(r => setTimeout(r, SC_CD));
              scanSincePause = 0;
            }
            window.scrollBy({top: window.innerHeight});
            const curr = window.scrollY;
            if (curr === lastScroll) {
              if (Date.now() - lastScrollTime > 6000) {
                await finishLogic();
                return;
              }
            } else {
              lastScroll = curr;
              lastScrollTime = Date.now();
            }
            await new Promise(r => setTimeout(r, 100));
          }
        })();
      }
    };
  }

  setTimeout(() => {
    if (startBtn && startBtn.textContent.trim() === 'Start') {
      startBtn.click();
    }
  }, 10000);

})();
