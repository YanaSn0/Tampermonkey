// ==UserScript==
// @name         𝕏-Mutual-Manager-Pro-Plus
// @namespace    http://tampermonkey.net/
// @version      1.1.3
// @author       YanaHeat
// @match        https://x.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ===== GLOBAL CONFIG =====
  let SKIP_DEFAULT_PIC = localStorage.getItem('um_skip_default_pic') !== 'false';
  let SKIP_NO_BIO = localStorage.getItem('um_skip_no_bio') !== 'false';
  let SKIP_KEY_WORDS = localStorage.getItem('um_skip_key_words') !== 'false';

  let KEY_WORDS = JSON.parse(localStorage.getItem('um_key_words')) || ['elon', 'musk', 'private', 'chat', 'dm'].map(w => w.toLowerCase());
  let WHITELIST = JSON.parse(localStorage.getItem('um_whitelist')) || ['YanaHeat', 'YanaSn0w1'];

  let scPauseCount = parseInt(localStorage.getItem('um_sc_pause_count')) || 200;
  let scPauseSeconds = parseInt(localStorage.getItem('um_sc_pause_seconds')) || 30;
  const fbMaxPerPeriod = 14;
  let fbCooldownMinutes = parseInt(localStorage.getItem('um_fb_cooldown_minutes')) || 15;

  const MIN_DELAY = 200;
  const MAX_DELAY = 600;
  const BATCH_SIZE = 7;
  const SCROLL_POSITION = 107;
  const STUCK_THRESHOLD = 60;

  const UF_MAX_PER_PERIOD = 150;
  let ACTION_CD = fbCooldownMinutes * 60 * 1000;
  const SC_MAX_UNFOLLOW = 30000;

  const FB_SCAN_MIN = 50;
  const SC_INIT = 100;
  const SC_POST = 50;
  let fbScanMax = parseInt(localStorage.getItem('um_fb_scan_max')) || SC_INIT;

  const path = window.location.pathname;
  const parts = path.split('/').filter(p => p);
  const pageType = parts[1] || '';
  const usernameFromPath = parts[0] || '';

  const isFollowingPage = pageType === 'following';
  const isFollowersPage = pageType === 'followers' || pageType === 'verified_followers';
  const mode = isFollowingPage ? 'unfollow' : (isFollowersPage ? 'followback' : 'none');
  const isVerifiedFollowersPage = pageType === 'verified_followers';

  if (isFollowersPage || isFollowingPage) {
    if (usernameFromPath) {
      localStorage.setItem('um_fb_username', usernameFromPath);
    }
  }
  const storedUsername = localStorage.getItem('um_fb_username') || usernameFromPath || '';

  const verifiedUrl = storedUsername ? `https://x.com/${storedUsername}/verified_followers` : '';
  const followingUrl = storedUsername ? `https://x.com/${storedUsername}/following` : '';
  const normalUrl = storedUsername ? `https://x.com/${storedUsername}/followers` : '';

  function getFollowUnv() {
    const v = localStorage.getItem('um_fb_followUnv');
    return v === null ? true : v === 'true';
  }

  // ===== SHARED HELPERS =====
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
    if (!toast) return false;
    const msg = toast.textContent.toLowerCase();
    if (
      msg.includes('rate limit') ||
      msg.includes('unable to follow more people') ||
      msg.includes('you are unable to follow') ||
      msg.includes('you are rate limited')
    ) {
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

  function resetUI() {
    getCells().forEach(cell => {
      cell.style.border = '';
    });
  }

  // ===== SHARED FOLLOW COUNT + COOLDOWN =====
  function getCooldownEnd() {
    return parseInt(localStorage.getItem('um_fb_cooldownEnd') || '0') || 0;
  }
  function setCooldownEnd(ts) {
    if (ts) localStorage.setItem('um_fb_cooldownEnd', String(ts));
    else localStorage.removeItem('um_fb_cooldownEnd');
  }
  function getCycleFollows() {
    return parseInt(localStorage.getItem('um_fb_cycle') || '0') || 0;
  }
  function setCycleFollows(v) {
    localStorage.setItem('um_fb_cycle', String(v));
  }

  function setNeedThreadFallback(flag) {
    localStorage.setItem('um_fb_need_thread', flag ? 'true' : 'false');
  }
  function getNeedThreadFallback() {
    return localStorage.getItem('um_fb_need_thread') === 'true';
  }

  // ===== HUD (GLOBAL) =====
  let ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:#fff;padding:12px;border:2px solid #000;border-radius:10px;font-family:sans-serif;font-size:13px;display:flex;flex-direction:column;gap:8px;min-width:260px;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-height:80vh;overflow-y:auto;';
  document.body.appendChild(ui);

  ui.style.cursor = 'move';
  let isDragging = false;
  let startX, startY;

  ui.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - ui.getBoundingClientRect().left;
    startY = e.clientY - ui.getBoundingClientRect().top;
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      ui.style.left = `${e.clientX - startX}px`;
      ui.style.top = `${e.clientY - startY}px`;
      ui.style.right = 'auto';
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

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

  const modeSwitchBtn = document.createElement('button');
  modeSwitchBtn.style.cssText = 'padding:8px;font-weight:bold;cursor:pointer;border-radius:6px;background:#9c27b0;color:white;';
  if (isFollowingPage) {
    modeSwitchBtn.textContent = 'Switch → Follow Back (Verified)';
    modeSwitchBtn.onclick = () => { if (verifiedUrl) window.location.href = verifiedUrl; };
  } else if (isFollowersPage) {
    modeSwitchBtn.textContent = 'Switch → Unfollow';
    modeSwitchBtn.onclick = () => { if (followingUrl) window.location.href = followingUrl; };
  } else {
    modeSwitchBtn.textContent = 'Go → Verified Followers';
    modeSwitchBtn.onclick = () => { if (verifiedUrl) window.location.href = verifiedUrl; };
  }
  ui.appendChild(modeSwitchBtn);

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset FB State';
  resetBtn.style.cssText = 'padding:8px;font-weight:bold;cursor:pointer;border-radius:6px;background:#f44336;color:white;';
  resetBtn.onclick = () => {
    ['um_fb_cycle', 'um_fb_cooldownEnd', 'um_fb_firstScan', 'um_fb_scan_max', 'um_fb_need_thread', 'um_processed_threads'].forEach(k => localStorage.removeItem(k));
    resetUI();
    location.reload();
  };
  ui.appendChild(resetBtn);

  function createCollapsible(title, content) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = title;
    summary.style.fontWeight = 'bold';
    details.appendChild(summary);
    details.appendChild(content);
    return details;
  }

  const botFiltersContent = document.createElement('div');
  botFiltersContent.style.display = 'flex';
  botFiltersContent.style.flexDirection = 'column';
  botFiltersContent.style.gap = '8px';

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
  botFiltersContent.appendChild(defaultPicDiv);

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
  botFiltersContent.appendChild(noBioDiv);

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
  botFiltersContent.appendChild(keywordsDiv);

  ui.appendChild(createCollapsible('Bot Filters', botFiltersContent));

  const keywordsContent = document.createElement('div');
  keywordsContent.style.display = 'flex';
  keywordsContent.style.flexDirection = 'column';
  keywordsContent.style.gap = '8px';

  const keywordsList = document.createElement('ul');
  keywordsList.style.cssText = 'list-style:none;padding:0;margin:0;';
  keywordsContent.appendChild(keywordsList);

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
  keywordsContent.appendChild(addKeywordDiv);

  ui.appendChild(createCollapsible('Manage Keywords', keywordsContent));

  const whitelistContent = document.createElement('div');
  whitelistContent.style.display = 'flex';
  whitelistContent.style.flexDirection = 'column';
  whitelistContent.style.gap = '8px';

  const whitelistList = document.createElement('ul');
  whitelistList.style.cssText = 'list-style:none;padding:0;margin:0;';
  whitelistContent.appendChild(whitelistList);

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
  whitelistContent.appendChild(addWhitelistDiv);

  ui.appendChild(createCollapsible('Manage Whitelist', whitelistContent));

  const advancedContent = document.createElement('div');
  advancedContent.style.display = 'flex';
  advancedContent.style.flexDirection = 'column';
  advancedContent.style.gap = '8px';

  const pauseEveryDiv = document.createElement('div');
  pauseEveryDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
  const pauseEveryLabel = document.createElement('label');
  pauseEveryLabel.textContent = 'Pause every:';
  const pauseEveryInput = document.createElement('input');
  pauseEveryInput.type = 'number';
  pauseEveryInput.value = scPauseCount;
  pauseEveryInput.min = '1';
  pauseEveryInput.onchange = () => {
    scPauseCount = parseInt(pauseEveryInput.value) || 200;
    localStorage.setItem('um_sc_pause_count', scPauseCount);
  };
  pauseEveryDiv.appendChild(pauseEveryLabel);
  pauseEveryDiv.appendChild(pauseEveryInput);
  advancedContent.appendChild(pauseEveryDiv);

  const pauseSecondsDiv = document.createElement('div');
  pauseSecondsDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
  const pauseSecondsLabel = document.createElement('label');
  pauseSecondsLabel.textContent = 'Pause seconds:';
  const pauseSecondsInput = document.createElement('input');
  pauseSecondsInput.type = 'number';
  pauseSecondsInput.value = scPauseSeconds;
  pauseSecondsInput.min = '1';
  pauseSecondsInput.onchange = () => {
    scPauseSeconds = parseInt(pauseSecondsInput.value) || 30;
    localStorage.setItem('um_sc_pause_seconds', scPauseSeconds);
  };
  pauseSecondsDiv.appendChild(pauseSecondsLabel);
  pauseSecondsDiv.appendChild(pauseSecondsInput);
  advancedContent.appendChild(pauseSecondsDiv);

  const cooldownDiv = document.createElement('div');
  cooldownDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
  const cooldownLabel = document.createElement('label');
  cooldownLabel.textContent = 'Cooldown Minutes:';
  const cooldownInput = document.createElement('input');
  cooldownInput.type = 'number';
  cooldownInput.value = fbCooldownMinutes;
  cooldownInput.min = '1';
  cooldownInput.onchange = () => {
    fbCooldownMinutes = parseInt(cooldownInput.value) || 15;
    localStorage.setItem('um_fb_cooldown_minutes', fbCooldownMinutes);
    ACTION_CD = fbCooldownMinutes * 60 * 1000;
  };
  cooldownDiv.appendChild(cooldownLabel);
  cooldownDiv.appendChild(cooldownInput);
  advancedContent.appendChild(cooldownDiv);

  if (mode !== 'unfollow') {
    const followUnvDiv = document.createElement('div');
    followUnvDiv.style.cssText = 'display:flex;align-items:center;';
    const followUnvCheckbox = document.createElement('input');
    followUnvCheckbox.type = 'checkbox';
    followUnvCheckbox.id = 'follow-unv';
    const storedUnv = localStorage.getItem('um_fb_followUnv');
    followUnvCheckbox.checked = storedUnv === null ? true : storedUnv === 'true';
    followUnvCheckbox.onchange = () => {
      const val = followUnvCheckbox.checked ? 'true' : 'false';
      localStorage.setItem('um_fb_followUnv', val);
      modeLine.textContent = `Mode: Follow Back (${followUnvCheckbox.checked ? 'All' : 'Verified'} Followers)`;
      if (!followUnvCheckbox.checked && !isVerifiedFollowersPage && verifiedUrl) {
        window.location.href = verifiedUrl;
      }
    };
    const followUnvLabel = document.createElement('label');
    followUnvLabel.htmlFor = 'follow-unv';
    followUnvLabel.textContent = 'Follow Unverified';
    followUnvLabel.style.marginLeft = '5px';
    followUnvDiv.appendChild(followUnvCheckbox);
    followUnvDiv.appendChild(followUnvLabel);
    advancedContent.appendChild(followUnvDiv);

    const fbScanMaxDiv = document.createElement('div');
    fbScanMaxDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const fbScanMaxLabel = document.createElement('label');
    fbScanMaxLabel.textContent = 'FB Scan Max:';
    const fbScanMaxInput = document.createElement('input');
    fbScanMaxInput.type = 'number';
    fbScanMaxInput.value = fbScanMax;
    fbScanMaxInput.min = '1';
    fbScanMaxInput.onchange = () => {
      fbScanMax = parseInt(fbScanMaxInput.value) || SC_INIT;
      localStorage.setItem('um_fb_scan_max', fbScanMax);
    };
    fbScanMaxDiv.appendChild(fbScanMaxLabel);
    fbScanMaxDiv.appendChild(fbScanMaxInput);
    advancedContent.appendChild(fbScanMaxDiv);
  }

  ui.appendChild(createCollapsible('Advanced Settings', advancedContent));

  // ===== GLOBAL HUD COUNT/TIMER ELEMENTS =====
  actionLine.innerHTML = `
    F: <span id="fb-count-val">0/${fbMaxPerPeriod}</span>
    <span id="fb-timer">00:00:00</span>
  `;
  scanLine.innerHTML = `Scan: <span id="scan-count">0/0</span> <span id="scan-timer">00:00:00</span>`;

  const fbCountSpan = document.getElementById('fb-count-val');
  const fbTimerSpan = document.getElementById('fb-timer');
  const scanCountSpan = document.getElementById('scan-count');
  const scanTimerSpan = document.getElementById('scan-timer');

  let globalCooldownInt = null;

  function updateGlobalCountUI(cycleFollows, scanTotal, scanMax) {
    fbCountSpan.textContent = `${cycleFollows}/${fbMaxPerPeriod}`;
    scanCountSpan.textContent = `${scanTotal}/${scanMax}`;
  }

  function startGlobalCooldownTicker() {
    if (globalCooldownInt) clearInterval(globalCooldownInt);
    globalCooldownInt = setInterval(() => {
      const end = getCooldownEnd();
      if (!end) {
        fbTimerSpan.textContent = '00:00:00';
        return;
      }
      let remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
      const h = String(Math.floor(remaining / 3600)).padStart(2, '0');
      const m = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
      const s = String(remaining % 60).padStart(2, '0');
      fbTimerSpan.textContent = `${h}:${m}:${s}`;
      if (remaining <= 0) {
        setCooldownEnd(0);
        setCycleFollows(0);
        localStorage.setItem('um_uf_count', '0');
        setNeedThreadFallback(false);
        if (verifiedUrl) {
          window.location.href = verifiedUrl;
        }
      }
    }, 1000);
  }

  if (getCooldownEnd() > Date.now()) {
    startGlobalCooldownTicker();
  }

  // ===== UNFOLLOW MODE =====
  if (mode === 'unfollow') {
    modeLine.textContent = 'Mode: Unfollow non-mutuals + bots';
    scanCountSpan.textContent = `0/${SC_MAX_UNFOLLOW}`;

    let processed = new Set();
    let total = 0;
    let actionedInPeriod = 0;

    const storagePrefix = 'um_uf_';

    function loadState() {
      actionedInPeriod = parseInt(localStorage.getItem(storagePrefix + 'count') || '0');
      const end = getCooldownEnd();
      if (end > Date.now()) {
        actionedInPeriod = UF_MAX_PER_PERIOD;
      }
      scanCountSpan.textContent = `${total}/${SC_MAX_UNFOLLOW}`;
    }

    function saveState() {
      localStorage.setItem(storagePrefix + 'count', actionedInPeriod);
    }

    async function processBatch() {
      let cells = getCells().filter(c => !processed.has(getUsername(c)));
      let batch = cells.slice(0, BATCH_SIZE);
      if (!batch.length) return 0;

      window.scrollBy({ top: batch[0].getBoundingClientRect().top - SCROLL_POSITION });
      await new Promise(r => setTimeout(r, 300));

      batch.forEach(c => c.style.border = '2px solid yellow');
      await new Promise(r => setTimeout(r, 500));

      let processedCount = 0;
      for (let cell of batch) {
        if (actionedInPeriod >= UF_MAX_PER_PERIOD) {
          break;
        }

        const user = getUsername(cell);
        processed.add(user);
        total++;
        processedCount++;
        scanCountSpan.textContent = `${total}/${SC_MAX_UNFOLLOW}`;

        if (WHITELIST.includes(user)) {
          cell.style.border = '2px solid orange';
          continue;
        }

        const isMutual = !!cell.querySelector('[data-testid="userFollowIndicator"]');
        const { isBotLike, reasons: botReasons } = getBotInfo(cell);
        let reasons = [];
        if (!isMutual) reasons.push('non-mutual');
        reasons = reasons.concat(botReasons);

        if (reasons.length === 0) {
          cell.style.border = '2px solid green';
          continue;
        }

        const btn = cell.querySelector('button[aria-label^="Following @"], button[data-testid$="-unfollow"]');
        if (!btn) {
          cell.style.border = '2px solid orange';
          continue;
        }

        btn.click();
        const confirm = await waitForUnfollowConfirm();
        if (confirm) {
          confirm.click();
          cell.style.border = '2px solid red';
          actionedInPeriod++;
          saveState();
        } else {
          if (isRateLimited()) {
            if (!getCooldownEnd()) {
              const end = Date.now() + ACTION_CD;
              setCooldownEnd(end);
              startGlobalCooldownTicker();
            }
            actionedInPeriod = UF_MAX_PER_PERIOD;
            cell.style.border = '2px solid orange';
            running = false;
            break;
          }
          cell.style.border = '2px solid orange';
        }

        await randomDelay();
      }
      return processedCount;
    }

    let running = false;
    let paused = true;

    loadState();

    startBtn.onclick = async () => {
      if (running) {
        paused = !paused;
        startBtn.textContent = paused ? 'Start' : 'Pause';
        return;
      }
      if (actionedInPeriod >= UF_MAX_PER_PERIOD) {
        return;
      }
      running = true;
      paused = false;
      startBtn.textContent = 'Pause';
      let stuckCount = 0;
      let lastCellsCount = 0;
      while (running) {
        if (paused) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        const proc = await processBatch();
        const curr = getCells().length;
        if (curr === lastCellsCount) stuckCount++;
        else stuckCount = 0;
        lastCellsCount = curr;
        if (stuckCount >= STUCK_THRESHOLD || total >= SC_MAX_UNFOLLOW) {
          running = false;
          startBtn.textContent = 'Start';
          break;
        }
        window.scrollBy({ top: 800 });
        await new Promise(r => setTimeout(r, 100));
      }
    };

    setTimeout(() => {
      if (startBtn && startBtn.textContent.trim() === 'Start') {
        startBtn.click();
      }
    }, 10000);

    return;
  }

  // ===== FOLLOWBACK MODE =====
  if (mode === 'followback') {
    const followUnvEnabled = getFollowUnv();
    modeLine.textContent = `Mode: Follow Back (${followUnvEnabled ? 'All' : 'Verified'} Followers)`;

    if (localStorage.getItem('um_fb_firstScan') === null) {
      localStorage.setItem('um_fb_firstScan', 'true');
    }
    let firstScan = localStorage.getItem('um_fb_firstScan') === 'true';

    let processed = new Set();
    let scanTotal = 0;
    let cycleFollows = getCycleFollows();

    let fbCooldownEnd = getCooldownEnd();
    if (fbCooldownEnd > Date.now()) {
      startGlobalCooldownTicker();
    }

    function updateUI() {
      updateGlobalCountUI(cycleFollows, scanTotal, fbScanMax);
    }

    async function pauseWithCountdown(seconds) {
      for (let i = seconds; i >= 0; i--) {
        const h = String(Math.floor(i / 3600)).padStart(2, '0');
        const m = String(Math.floor((i % 3600) / 60)).padStart(2, '0');
        const s = String(i % 60).padStart(2, '0');
        scanTimerSpan.textContent = `${h}:${m}:${s}`;
        await new Promise(r => setTimeout(r, 1000));
      }
      scanTimerSpan.textContent = '00:00:00';
    }

    async function processBatch() {
      let cells = getCells().filter(c => !processed.has(getUsername(c)));
      let batch = cells.slice(0, BATCH_SIZE);
      if (!batch.length) return 0;

      window.scrollBy({ top: batch[0].getBoundingClientRect().top - SCROLL_POSITION });
      await new Promise(r => setTimeout(r, 300));

      batch.forEach(c => c.style.border = '2px solid yellow');
      await new Promise(r => setTimeout(r, 500));

      let proc = 0;
      for (let cell of batch) {
        if (cycleFollows >= fbMaxPerPeriod || scanTotal >= fbScanMax) break;

        const user = getUsername(cell);
        processed.add(user);
        scanTotal++;
        proc++;
        updateUI();

        if (WHITELIST.includes(user)) {
          cell.style.border = '2px solid orange';
          continue;
        }

        const { isBotLike, reasons } = getBotInfo(cell);
        if (isBotLike) {
          cell.style.border = '2px solid purple';
          continue;
        }

        const alreadyFollowing = cell.querySelector('button[aria-label^="Following @"]');
        if (alreadyFollowing) {
          cell.style.border = '2px solid green';
          continue;
        }

        const followBackBtn = cell.querySelector('button[aria-label*="Follow back @"]');
        if (!followBackBtn) {
          cell.style.border = '2px solid gray';
          continue;
        }

        followBackBtn.click();

        let rateLimited = false;
        let success = false;
        await new Promise((resolve) => {
          let checks = 0;
          const checkInt = setInterval(() => {
            checks++;
            if (isRateLimited()) {
              rateLimited = true;
              clearInterval(checkInt);
              resolve();
            } else if (!cell.querySelector('button[aria-label*="Follow back @"]')) {
              success = true;
              clearInterval(checkInt);
              resolve();
            }
            if (checks >= 10) { // 5 seconds (500ms * 10)
              clearInterval(checkInt);
              resolve();
            }
          }, 500);
        });

        if (rateLimited) {
          if (!getCooldownEnd()) {
            const end = Date.now() + ACTION_CD;
            setCooldownEnd(end);
            startGlobalCooldownTicker();
          }
          setCycleFollows(fbMaxPerPeriod);
          cell.style.border = '2px solid orange';
          return proc;
        }

        if (success) {
          cell.style.border = '2px solid blue';
          cycleFollows++;
          setCycleFollows(cycleFollows);
          updateUI();

          if (cycleFollows === 1 && !getCooldownEnd()) {
            const end = Date.now() + ACTION_CD;
            setCooldownEnd(end);
            startGlobalCooldownTicker();
          }
        } else {
          cell.style.border = '2px solid orange';
        }

        await randomDelay();
      }
      return proc;
    }

    async function finishPage() {
      if (getFollowUnv() && isVerifiedFollowersPage && (scanTotal >= FB_SCAN_MIN || scanTotal >= fbScanMax)) {
        await new Promise(r => setTimeout(r, 5000));
        if (normalUrl) window.location.href = normalUrl;
        return;
      }

      if (firstScan && scanTotal >= fbScanMax) {
        localStorage.setItem('um_fb_firstScan', 'false');
        firstScan = false;
        fbScanMax = SC_POST;
        localStorage.setItem('um_fb_scan_max', SC_POST);
      }

      setNeedThreadFallback(true);
      await new Promise(r => setTimeout(r, 3000));
      running = false;
    }

    updateUI();

    let running = false;
    let paused = true;

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
            if (cycleFollows >= fbMaxPerPeriod) {
              await finishPage();
              return;
            }
            const proc = await processBatch();
            scanSincePause += proc;
            if (scanSincePause >= scPauseCount) {
              await pauseWithCountdown(scPauseSeconds);
              scanSincePause = 0;
            }
            if (scanTotal >= fbScanMax) {
              await finishPage();
              return;
            }
            window.scrollBy({ top: window.innerHeight });
            const curr = window.scrollY;
            if (curr === lastScroll) {
              if (Date.now() - lastScrollTime > 6000 && scanTotal >= FB_SCAN_MIN) {
                await finishPage();
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

    setTimeout(() => {
      if (startBtn && startBtn.textContent.trim() === 'Start') {
        startBtn.click();
      }
    }, 10000);

    return;
  }

  // ===== THREAD FALLBACK MODE =====
  if (!getNeedThreadFallback()) {
    modeLine.textContent = 'Mode: Idle / Manual';
    return;
  }

  modeLine.textContent = 'Mode: Fallback Thread Scanner';

  setNeedThreadFallback(false);

  let followCount = getCycleFollows();
  let isScrolling = false;

  updateGlobalCountUI(followCount, 0, 0);

  if (followCount >= fbMaxPerPeriod) {
    modeLine.textContent = 'Mode: Waiting for Cooldown';
    return;
  }

  let processedThreads = JSON.parse(localStorage.getItem('um_processed_threads') || '[]');

  function extractPostId(tweet) {
    const link = tweet.querySelector('a[href*="/status/"] time')?.parentElement;
    if (link) {
      const href = link.href;
      const match = href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  function scrollToCellWithOffset(cell) {
    const offset = 50;
    const rect = cell.getBoundingClientRect();
    window.scrollTo(0, rect.top + window.scrollY - offset);
  }

  function checkIfVerified(cell) {
    const verifiedBadge = cell.querySelector('svg[aria-label="Verified account"]') || cell.querySelector('[data-testid="icon-verified"]');
    return !!verifiedBadge;
  }

  function clickAllSpamButtons() {
    const spamButtons = Array.from(document.querySelectorAll('[data-testid="cellInnerDiv"] button'));
    const filteredButtons = spamButtons.filter(btn => btn.textContent.includes('Show probable spam'));
    for (const btn of filteredButtons) {
      btn.click();
    }
  }

  function spamScrollToBottom(callback) {
    if (isScrolling) return;
    isScrolling = true;
    const maxAttempts = 10000;
    let attempts = 0;
    let stableCount = 0;
    const stabilityThreshold = 5;
    const interval = setInterval(() => {
      clickAllSpamButtons();
      const prevHeight = document.body.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      setTimeout(() => {
        attempts++;
        if (document.body.scrollHeight === prevHeight) {
          stableCount++;
        } else {
          stableCount = 0;
        }
        if (stableCount >= stabilityThreshold || attempts >= maxAttempts) {
          clearInterval(interval);
          isScrolling = false;
          callback();
        }
      }, 200);
    }, 500);
  }

  function waitForProfileHeader() {
    return new Promise(resolve => {
      const check = () => {
        if (document.querySelector('[data-testid="UserName"]')) return resolve();
        setTimeout(check, 100);
      };
      check();
    });
  }

  function waitForThreadReturn() {
    return new Promise(resolve => {
      const check = () => {
        if (document.querySelector('article[data-testid="tweet"]')) return resolve();
        setTimeout(check, 100);
      };
      check();
    });
  }

  function findFollowButton() {
    const btns = Array.from(document.querySelectorAll('div[data-testid="placementTracking"] button[data-testid$="-follow"]'));
    for (const btn of btns) {
      const label = btn.innerText.trim().toLowerCase();
      if (label === 'follow' || label === 'follow back') return btn;
    }
    return null;
  }

  async function handleVerifiedFollow(tweet) {
    const profileLink =
      tweet.querySelector('a[href^="/"][role="link"][data-testid="User-Name"]') ||
      tweet.querySelector('a[href^="/"][role="link"]');

    if (!profileLink) {
      return;
    }

    profileLink.click();

    await waitForProfileHeader();

    const followBtn = findFollowButton();
    if (followBtn) {
      const label = followBtn.innerText.trim().toLowerCase();
      if (label === 'follow' || label === 'follow back') {
        followBtn.click();

        let rateLimited = false;
        let success = false;
        await new Promise((resolve) => {
          let checks = 0;
          const checkInt = setInterval(() => {
            checks++;
            if (isRateLimited()) {
              rateLimited = true;
              clearInterval(checkInt);
              resolve();
            } else if (findFollowButton() === null) {
              success = true;
              clearInterval(checkInt);
              resolve();
            }
            if (checks >= 10) {
              clearInterval(checkInt);
              resolve();
            }
          }, 500);
        });

        if (rateLimited) {
          if (!getCooldownEnd()) {
            const end = Date.now() + ACTION_CD;
            setCooldownEnd(end);
            startGlobalCooldownTicker();
          }
          setCycleFollows(fbMaxPerPeriod);
          return;
        }

        if (success) {
          followCount++;
          setCycleFollows(followCount);
          updateGlobalCountUI(followCount, 0, 0);
          if (followCount === 1 && !getCooldownEnd()) {
            const end = Date.now() + ACTION_CD;
            setCooldownEnd(end);
            startGlobalCooldownTicker();
          }
        }
      }
    }

    window.history.back();
    await waitForThreadReturn();
  }

  function startProcessingFromBottom(postId) {
    window.scrollTo(0, document.body.scrollHeight);
    const processed = new Set();
    let consecutiveAlreadyFollowing = 0;
    const homeFollowed = 5;

    function processVisibleTweets() {
      if (followCount >= fbMaxPerPeriod) {
        localStorage.removeItem('um_processed_threads');
        return;
      }

      const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      const reversedTweets = tweets.reverse();

      let newProcessed = false;

      for (const tweet of reversedTweets) {
        if (followCount >= fbMaxPerPeriod) {
          localStorage.removeItem('um_processed_threads');
          return;
        }

        if (tweet.querySelector('h2')) {
          continue;
        }

        const postId = extractPostId(tweet);
        if (postId && !processed.has(postId)) {
          scrollToCellWithOffset(tweet);
          const isVerified = checkIfVerified(tweet);
          processed.add(postId);
          newProcessed = true;

          if (isVerified && followCount < fbMaxPerPeriod) {
            handleVerifiedFollow(tweet).then(() => {
              setTimeout(processVisibleTweets, 3000);
            });
            consecutiveAlreadyFollowing = 0;
            return;
          } else if (isVerified) {
            consecutiveAlreadyFollowing++;
            if (consecutiveAlreadyFollowing >= homeFollowed) {
              if (followCount < fbMaxPerPeriod) {
                window.location.href = 'https://x.com/home';
              }
              return;
            }
          } else {
            consecutiveAlreadyFollowing = 0;
          }

          setTimeout(processVisibleTweets, 3000);
          return;
        }
      }

      if (newProcessed) {
        setTimeout(processVisibleTweets, 1000);
        return;
      }

      window.scrollBy(0, -window.innerHeight);

      setTimeout(() => {
        if (document.documentElement.scrollTop === 0) {
          processedThreads.push(postId);
          localStorage.setItem('um_processed_threads', JSON.stringify(processedThreads));
          if (followCount < fbMaxPerPeriod) {
            window.location.href = 'https://x.com/home';
          }
        } else {
          processVisibleTweets();
        }
      }, 2000);
    }

    processVisibleTweets();
  }

  function loadFullThread(postId) {
    spamScrollToBottom(() => {
      setTimeout(() => {
        const spamButtons = document.querySelectorAll('[data-testid="cellInnerDiv"] button');
        if (spamButtons.length > 0 && Array.from(spamButtons).some(btn => btn.textContent.includes('Show probable spam'))) {
          loadFullThread(postId);
        } else {
          startProcessingFromBottom(postId);
        }
      }, 10000);
    });
  }

  async function navigateToHomeAndOpenPost() {
    const homeLink = document.querySelector('a[data-testid="AppTabBar_Home_Link"]') ||
      document.querySelector('a[href="/home"]');
    if (homeLink) {
      homeLink.click();
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    let attempts = 0;
    const maxAttempts = 20;

    while (followCount < fbMaxPerPeriod && attempts < maxAttempts) {
      const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

      let postToOpen = null;

      for (const tweet of tweets) {
        const postId = extractPostId(tweet);
        if (postId && !processedThreads.includes(postId)) {
          postToOpen = tweet;
          break;
        }
      }

      if (!postToOpen) {
        window.scrollBy(0, window.innerHeight * 2);
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
        continue;
      }

      const postId = extractPostId(postToOpen);
      const postLink = postToOpen.querySelector('a[href*="/status/"] time')?.parentElement;
      if (postLink) {
        postLink.click();
        await new Promise(resolve => setTimeout(resolve, 5000));
        loadFullThread(postId);
        return;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      setNeedThreadFallback(false);
    }
  }

  (async () => {
    if (window.location.pathname.match(/\/status\/\d+/)) {
      const postId = window.location.pathname.match(/\/status\/(\d+)/)[1];
      loadFullThread(postId);
    } else {
      await navigateToHomeAndOpenPost();
    }
  })();

})();
