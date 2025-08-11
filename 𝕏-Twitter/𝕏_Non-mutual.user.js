// ==UserScript==
// @name         𝕏_Non-mutual
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Unfollow people who unfollowed on never followed back.
// @author       YanaSn0w1
// @match        https://x.com/*/following
// @match        https://twitter.com/*/following
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const WHITELIST = ['YanaSn0w', 'YanaSn0w1'];
  let running = false;
  let paused = true;
  let pausedByInput = false;
  let processed = new Set();
  let unfollowed = 0, skipped = 0, total = 0;
  let lastTotalCells = 0, stuckCount = 0;

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
    align-items:center;
    gap:6px;
    font-size:12px;
    white-space:nowrap;
  `;
  ui.innerHTML = `
    <label>min <input type="number" id="min-delay" value="500" style="width:45px;"></label>
    <label>max <input type="number" id="max-delay" value="1500" style="width:45px;"></label>
    <label>batch <input type="number" id="batch-size" value="5" style="width:35px;"></label>
    <label>scan <input type="number" id="scan-delay" value="100" style="width:45px;"></label>
    <label>scroll <input type="number" id="scroll-position" value="107" style="width:45px;"></label>
    <button id="scan-btn" style="padding:2px 6px; border:1px solid #000;">Start</button>
  `;
  document.body.appendChild(ui);

  const inputs = ui.querySelectorAll('input[type="number"]');
  inputs.forEach(input => {
    let held = false;
    let direction = 1;

    function tick() {
      if (!held) return;
      input.value = parseInt(input.value || '0', 10) + 100 * direction;
      setTimeout(() => requestAnimationFrame(tick), 50);
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && pausedByInput) {
        paused = false;
        pausedByInput = false;
        document.getElementById('scan-btn').textContent = 'Pause';
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

      e.preventDefault();
      direction = e.key === 'ArrowUp' ? 1 : -1;
      held = true;
      tick();
    });

    input.addEventListener('keyup', () => {
      held = false;
    });

    input.addEventListener('blur', () => {
      held = false;
      pausedByInput = false;
    });

    input.addEventListener('focus', () => {
      paused = true;
      pausedByInput = true;
      document.getElementById('scan-btn').textContent = 'Start';
    });
  });

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

  async function processBatch() {
    const batchSize = parseInt(document.getElementById('batch-size').value, 10) || 1;
    const minDelay = parseInt(document.getElementById('min-delay').value, 10) || 500;
    const maxDelay = parseInt(document.getElementById('max-delay').value, 10) || 1500;
    const scrollOffset = parseInt(document.getElementById('scroll-position').value, 10) || 107;

    const cells = getCells().filter(cell => {
      const username = getUsername(cell);
      return username && !processed.has(username);
    });

    const batch = cells.slice(0, batchSize);
    if (batch.length === 0) return;

    const firstCell = batch[0];
    const rect = firstCell.getBoundingClientRect();
    const offset = rect.top - scrollOffset;
    window.scrollBy({ top: offset, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 300));

    for (const cell of batch) cell.style.border = '2px solid yellow';
    await new Promise(r => setTimeout(r, 500));

    for (const cell of batch) {
      if (paused) break;
      const username = getUsername(cell);
      processed.add(username);
      total++;

      const isMutual = Array.from(cell.querySelectorAll('span')).some(span =>
        span.textContent.trim().toLowerCase() === 'follows you'
      );

      if (WHITELIST.includes(username)) {
        cell.style.border = '2px solid orange';
        skipped++;
        continue;
      }

      if (isMutual) {
        cell.style.border = '2px solid green';
        skipped++;
        continue;
      }

      const btn = cell.querySelector('button[aria-label^="Following"],button[data-testid$="-unfollow"]');
      if (!btn) {
        cell.style.border = '2px solid orange';
        skipped++;
        continue;
      }

      btn.click();
      const confirm = await waitForConfirm();
      if (confirm) {
        confirm.click();
        cell.style.border = '2px solid red';
        unfollowed++;
        await randomDelay(minDelay, maxDelay);
      } else {
        cell.style.border = '2px solid orange';
        skipped++;
      }
    }
  }

  document.getElementById('scan-btn').onclick = async () => {
    const btn = document.getElementById('scan-btn');

    if (running) {
      if (pausedByInput) {
        paused = false;
        pausedByInput = false;
        btn.textContent = 'Pause';
        return;
      }
      paused = !paused;
      btn.textContent = paused ? 'Start' : 'Pause';
      return;
    }

    running = true;
    paused = true;
    btn.textContent = 'Start';

    await new Promise(r => setTimeout(r, parseInt(document.getElementById('scan-delay').value, 10) || 1000));
    paused = false;
    btn.textContent = 'Pause';

    while (true) {
      if (paused) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      await processBatch();

      const liveScanDelay = parseInt(document.getElementById('scan-delay').value, 10) || 1000;
      await new Promise(r => setTimeout(r, liveScanDelay));

      const currCells = getCells().length;
      if (currCells === lastTotalCells) {
        stuckCount++;
        window.scrollBy({ top: 1000, behavior: 'smooth' });
      } else {
        stuckCount = 0;
      }
      lastTotalCells = currCells;
      if (stuckCount >= 30) break;
    }

    alert(`Done!\nUnfollowed: ${unfollowed}\nSkipped: ${skipped}`);
    running = false;
    paused = true;
    btn.textContent = 'Start';
  };
})();
