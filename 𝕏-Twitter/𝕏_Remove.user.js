// ==UserScript==
// @name         X_remove
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Unfollow non-mutuals on X. Log/status/action always matches the cell at the visual cutoff. Buttons on right. Number input beside Bottom #.
// @author       YanaSn0w1
// @match        https://x.com/*/following
// @match        https://twitter.com/*/following
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Adjust HEADER_OFFSET to match the space under the fixed header (try 88, 100, etc)
    const DELAY = 1200;
    const SCROLL_WAIT = 700;
    const HEADER_OFFSET = 100;

    const WHITELIST = ['YanaSn0w', 'YanaSn0w1'];
    let running = false, paused = false, currentMode = null, bottomN = 100;
    let processed = new Set();
    let modeButtons = {};
    const modeLabels = {
        topDown: 'Top Down',
        bottomUp: 'Bottom Up',
        bottomN: 'Bottom #'
    };

    function log(msg) {
        console.log('[X_remove]', msg);
    }
    function status(msg) {
        let el = document.getElementById('xremove-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'xremove-status';
            el.style.position = 'fixed';
            el.style.top = '10px';
            el.style.left = '10px';
            el.style.zIndex = 9999;
            el.style.background = '#222';
            el.style.color = '#fff';
            el.style.padding = '8px 16px';
            el.style.borderRadius = '5px';
            el.style.fontSize = '16px';
            el.style.boxShadow = '0 2px 8px #0002';
            document.body.appendChild(el);
        }
        el.textContent = msg;
    }

    function getUserCells() {
        return Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]')).filter(cell => {
            const btn = cell.querySelector('button[aria-label^="Following"],button[data-testid$="-unfollow"]');
            const userLink = cell.querySelector('a[href^="/"][role="link"]') || cell.querySelector('a[href^="/"]');
            return btn && userLink;
        });
    }
    function getUsername(cell) {
        const link = cell.querySelector('a[href^="/"][role="link"]') || cell.querySelector('a[href^="/"]');
        if (!link) return '';
        let path = link.getAttribute('href').split('?')[0].split('#')[0];
        let user = (path.match(/^\/([^\/]+)/)||[])[1] || '';
        return user;
    }
    function isMutual(cell) {
        return Array.from(cell.querySelectorAll('span')).some(span =>
            span.textContent.trim().toLowerCase() === 'follows you'
        );
    }

    // Scroll so that the given cell is exactly at HEADER_OFFSET from the top
    async function scrollToCellPrecise(cell) {
        const rect = cell.getBoundingClientRect();
        const absoluteY = window.scrollY + rect.top;
        const scrollToY = absoluteY - HEADER_OFFSET;
        window.scrollTo({top: scrollToY, behavior: 'auto'});
        await new Promise(resolve => setTimeout(resolve, SCROLL_WAIT));
    }

    // Find the cell visually at the cutoff after scroll
    function getCellAtCutoff() {
        const cutoff = HEADER_OFFSET;
        let visibleCells = getUserCells();
        // Find the cell whose top is at or just below the cutoff
        let atCutoff = visibleCells.find(c => {
            const rect = c.getBoundingClientRect();
            return rect.top >= cutoff - 2 && rect.top <= cutoff + 6;
        });
        if (!atCutoff) {
            // fallback: closest to cutoff
            let minDist = 10000, closest = null;
            for (let c of visibleCells) {
                let dist = Math.abs(c.getBoundingClientRect().top - cutoff);
                if (dist < minDist) { minDist = dist; closest = c; }
            }
            atCutoff = closest || visibleCells[0];
        }
        return atCutoff;
    }

    function unfollowCell(cell, cb) {
        const username = getUsername(cell);
        if (WHITELIST.includes(username)) {
            log(`Skipping whitelisted: @${username}`);
            status(`Skipping whitelisted: @${username}`);
            cb();
            return;
        }
        const followBtn = cell.querySelector('button[aria-label^="Following"],button[data-testid$="-unfollow"]');
        if (!followBtn) {
            log(`No Following button for @${username}`);
            status(`No Following button for @${username}`);
            cb();
            return;
        }
        followBtn.click();
        setTimeout(() => {
            let confirmBtn = Array.from(document.querySelectorAll('div[role="menuitem"],button,span')).find(el =>
                el.textContent.trim().toLowerCase() === 'unfollow' && el.offsetParent !== null
            );
            if (confirmBtn) confirmBtn.click();
            else {
                confirmBtn = Array.from(document.querySelectorAll('button[data-testid="confirmationSheetConfirm"],button,span')).find(el =>
                    el.textContent.trim().toLowerCase() === 'unfollow' && el.offsetParent !== null
                );
                if (confirmBtn) confirmBtn.click();
                else {
                    log(`Could not find confirm for @${username}`);
                    status(`Could not find confirm for @${username}`);
                    cb();
                    return;
                }
            }
            log(`Unfollowed @${username}`);
            status(`Unfollowed @${username}`);
            setTimeout(cb, DELAY);
        }, 400);
    }

    // Always log/act on the cell at the cutoff line after scroll
    async function processNext() {
        if (!running || paused) return;

        let cells = getUserCells();
        let cellOrder = (currentMode === 'bottomUp') ? [...cells].reverse() : cells;
        if (currentMode === 'bottomN') {
            cellOrder = [...cells].slice(-bottomN).reverse();
        }
        let cell = null;
        for (let c of cellOrder) {
            const username = getUsername(c);
            if (!processed.has(username)) {
                cell = c;
                break;
            }
        }
        if (!cell) {
            log(`Done!`);
            status('Finished unfollowing!');
            running = false; paused = false; currentMode = null; processed.clear();
            updateButtonLabels();
            return;
        }

        await scrollToCellPrecise(cell);

        // After scroll, get the cell visually at the cutoff
        let winner = getCellAtCutoff();
        const username = getUsername(winner);
        processed.add(username);

        if (isMutual(winner)) {
            log(`Skipping mutual: @${username}`);
            status(`Skipping mutual: @${username}`);
            setTimeout(processNext, 200);
        } else {
            unfollowCell(winner, () => setTimeout(processNext, 200));
        }
    }

    function startMode(mode, n) {
        if (running) {
            if (currentMode === mode) {
                paused = !paused;
                status(paused ? 'Paused!' : 'Resumed!');
                updateButtonLabels();
                if (!paused && running) processNext();
            }
            return;
        }
        running = true; paused = false; currentMode = mode; processed.clear();
        if (mode === 'bottomN') {
            bottomN = n || 100;
            status(`Unfollowing bottom ${bottomN} entries...`);
            log(`Starting bottomN`);
        } else {
            status(`Unfollowing ${mode === 'bottomUp' ? 'bottom-up' : 'top-down'}...`);
            log(`Starting ${mode}`);
        }
        updateButtonLabels();
        processNext();
    }

    function updateButtonLabels() {
        for (const [mode, btn] of Object.entries(modeButtons)) {
            if (running && currentMode === mode && paused)
                btn.textContent = `${modeLabels[mode]} (Unpause)`;
            else if (running && currentMode === mode)
                btn.textContent = `${modeLabels[mode]} (Pause)`;
            else
                btn.textContent = modeLabels[mode];
        }
    }

    function styleBtn(btn, color) {
        btn.style.width = '160px';
        btn.style.background = color;
        btn.style.color = '#fff';
        btn.style.padding = '10px 20px';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.fontSize = '16px';
        btn.style.marginBottom = '8px';
        btn.style.transition = 'background 0.2s';
        btn.style.display = 'block';
        btn.style.textAlign = 'center';
    }

    function addButtons() {
        if (document.getElementById('xremove-btn-container')) return;

        // Container for right vertical stack
        const container = document.createElement('div');
        container.id = 'xremove-btn-container';
        container.style.position = 'fixed';
        container.style.right = '20px';
        container.style.top = '20px';
        container.style.zIndex = 9999;
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'flex-end';

        // Bottom # row (button and input side by side)
        const bottomRow = document.createElement('div');
        bottomRow.style.display = 'flex';
        bottomRow.style.alignItems = 'center';
        bottomRow.style.marginBottom = '8px';

        const btnBottomN = document.createElement('button');
        styleBtn(btnBottomN, '#4CAF50');
        btnBottomN.textContent = modeLabels.bottomN;
        btnBottomN.style.marginBottom = '0';
        btnBottomN.onclick = () => {
            const n = parseInt(numInput.value, 10);
            if (running && currentMode === 'bottomN') {
                paused = !paused;
                status(paused ? 'Paused!' : 'Resumed!');
                updateButtonLabels();
                if (!paused && running) processNext();
                return;
            }
            if (!running) {
                if (isNaN(n) || n < 1) return status('Please enter a valid number');
                startMode('bottomN', n);
            }
        };
        modeButtons['bottomN'] = btnBottomN;

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.value = 100;
        numInput.min = 1;
        numInput.max = 10000;
        numInput.style.marginLeft = '10px';
        numInput.style.width = '70px';
        numInput.style.height = '36px';
        numInput.style.fontSize = '18px';
        numInput.style.borderRadius = '5px';
        numInput.style.border = '1px solid #ccc';
        numInput.style.outline = 'none';

        bottomRow.appendChild(btnBottomN);
        bottomRow.appendChild(numInput);
        container.appendChild(bottomRow);

        // Top Down
        const btnTopDown = document.createElement('button');
        styleBtn(btnTopDown, '#1da1f2');
        btnTopDown.textContent = modeLabels.topDown;
        btnTopDown.onclick = () => startMode('topDown');
        container.appendChild(btnTopDown);
        modeButtons['topDown'] = btnTopDown;

        // Bottom Up
        const btnBottomUp = document.createElement('button');
        styleBtn(btnBottomUp, '#E91E63');
        btnBottomUp.textContent = modeLabels.bottomUp;
        btnBottomUp.onclick = () => startMode('bottomUp');
        container.appendChild(btnBottomUp);
        modeButtons['bottomUp'] = btnBottomUp;

        document.body.appendChild(container);

        updateButtonLabels();
        log('Script loaded!');
        status('Script loaded!');
    }

    if (document.readyState !== 'loading') addButtons();
    else document.addEventListener('DOMContentLoaded', addButtons);
})();
