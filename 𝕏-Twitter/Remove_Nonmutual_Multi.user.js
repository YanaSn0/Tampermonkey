// ==UserScript==
// @name         X_Unfollow_NonMutual
// @namespace    http://tampermonkey.net/
// @version      2.24
// @description  Three buttons: unfollow non-mutual accounts (you follow, they don’t follow back) top-down, bottom-up, or bottom 100 (in reverse order after reaching bottom) on X profile's Following tab, with pause/resume, processing up to 3 cells at a time
// @author       Adapted from YanaSn0’s X_Remove
// @match        https://x.com/*/following
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const DELAY = 2000;        // Time between unfollow actions (ms)
    const SCROLL_DELAY = 1000;  // Delay for visibility and loading
    const CONFIRM_DELAY = 1500; // Delay for confirmation popup (ms)
    const CONFIRM_ATTEMPTS = 3; // Max attempts to find confirmation button
    let SCROLL_STEP = 300;     // Initial value, will be dynamically set
    const MAX_SCROLLS = 200;    // Maximum scrolls
    const MAX_ATTEMPTS = 200;   // Maximum attempts to process accounts
    const MAX_HEIGHT_STALLS = 10; // Max consecutive scrolls with no height change
    const BOTTOM_CONFIRM_COUNT = 5; // Number of consistent height checks to confirm bottom
    const MAX_RETRIES = 2;      // Max retries to find non-mutual accounts
    const MAX_CELLS_PER_VIEW = 3; // Process up to 3 non-mutual cells per viewport
    const INITIAL_SCROLL_STEP = 1200; // Larger step for initial bottom scroll

    // Global state
    let state = {
        mode: null, // 'top-down', 'bottom-up', 'bottom-100'
        running: false,
        paused: false,
        timeoutId: null,
        processed: new Set(),
        bottomReached: false,
        lastCell: null, // Store bottommost cell for bottom-100
        lastHeight: 0,
        lastUsername: null,
        heightChecks: 0,
        lastStableHeight: 0,
        retryCount: 0
    };
    let buttons = {};

    // Helper to check if element is visible
    function isVisible(elem) {
        if (!elem) return false;
        const rect = elem.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    // Helper to click elements
    function simulateClick(elem) {
        if (isVisible(elem)) {
            elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            elem.click();
            console.log('Clicked element:', elem.outerHTML.slice(0, 100) + '...');
            return true;
        }
        console.log('Element not visible:', elem ? elem.outerHTML.slice(0, 100) + '...' : 'null');
        return false;
    }

    // Schedule timeout to handle inactive tabs
    function scheduleTimeout(callback, delay) {
        if (document.visibilityState === 'visible') {
            state.timeoutId = setTimeout(callback, delay);
        } else {
            const intervalId = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    clearInterval(intervalId);
                    state.timeoutId = setTimeout(callback, delay);
                }
            }, 100);
        }
    }

    // Dynamically set SCROLL_STEP based on 3 UserCell heights
    function setScrollStep() {
        let cells = Array.from(document.querySelectorAll('div[data-testid="UserCell"], button[data-testid="UserCell"]')).filter(cell => isVisible(cell));
        if (cells.length >= 3) {
            let totalHeight = 0;
            for (let i = 0; i < 3; i++) {
                totalHeight += cells[i].getBoundingClientRect().height;
            }
            SCROLL_STEP = Math.max(300, totalHeight); // Minimum 300px to avoid tiny steps
            console.log(`Dynamically set SCROLL_STEP to ${SCROLL_STEP}px based on 3 UserCells`);
        } else {
            console.log(`Not enough visible cells (${cells.length}) to set SCROLL_STEP, using default 300px`);
        }
    }

    // Get non-mutual UserCells with strict detection
    function getNonMutualFollowing() {
        return new Promise(resolve => {
            scheduleTimeout(() => {
                let cells = Array.from(document.querySelectorAll('div[data-testid="UserCell"], button[data-testid="UserCell"]')).filter(cell => {
                    let usernameLink = cell.querySelector('a[href*="/"]');
                    let spans = cell.querySelectorAll('span');
                    let isTrend = Array.from(spans).some(span => span.textContent.includes('Trending') || span.textContent.includes('posts'));
                    return usernameLink && !isTrend && isVisible(cell);
                });

                let startIdx = state.lastCell ? cells.indexOf(state.lastCell) : (state.mode === 'bottom-up' || state.mode === 'bottom-100') ? Math.max(0, cells.length - MAX_CELLS_PER_VIEW) : 0;
                let endIdx = Math.min(startIdx + MAX_CELLS_PER_VIEW, cells.length);
                let cellRange = cells.slice(startIdx, endIdx);

                console.log(`Found ${cells.length} UserCell elements in current viewport, processing up to ${cellRange.length} cell(s)`);

                if (cellRange.length === 0) {
                    console.log('No valid UserCell found');
                    resolve([]);
                    return;
                }

                let nonMutual = [];
                for (let cell of cellRange) {
                    let username = cell.querySelector('a[href*="/"]')?.href.split('/').pop() || 'unknown';

                    if (cell.style.border && cell.style.border.includes('red') || state.processed.has(cell)) {
                        console.log(`Skipping already processed cell: @${username}`);
                        continue;
                    }

                    let followIndicator = cell.querySelector('span.css-1jxf684.r-bcqeeo.r-1ttztb7.r-qvutc0.r-poiln3, [data-testid="userFollowIndicator"], span[role="text"]:not(.css-175oi2r), div[aria-label*="Follows you"]');
                    let followsYou = followIndicator && /follows\s*you/i.test(followIndicator.textContent.trim());

                    if (!followsYou) {
                        let allSpans = cell.querySelectorAll('span:not(.css-175oi2r)');
                        followsYou = Array.from(allSpans).some(span => /follows\s*you/i.test(span.textContent.trim()) || span.getAttribute('aria-hidden') === 'true' && /follows\s*you/i.test(span.textContent));
                        if (!followsYou && allSpans.length > 0) {
                            console.log(`Spans checked for: @${username}, Span contents:`,
                                Array.from(allSpans).map(span => `"${span.textContent.trim()}" (hidden: ${span.getAttribute('aria-hidden')})`).join(', '));
                        }
                    }

                    let unfollowButton = cell.querySelector('button[data-testid*="-unfollow"], button[aria-label*="Following"], button[aria-label*="Unfollow"], button[role="button"][data-testid="UserCell"] ~ button, button[aria-label*="Unfollow"]');
                    let isNonMutual = !followsYou && unfollowButton && isVisible(unfollowButton);

                    console.log(`Mutual check for @${username}, Follows you: ${followsYou}, Position: ${Math.round(cell.getBoundingClientRect().top + window.scrollY)}, Follow indicator: ${followIndicator ? `"${followIndicator.textContent.trim()}"` : 'none'}, Unfollow button: ${unfollowButton ? unfollowButton.getAttribute('aria-label') || 'unfollow' : 'none'}`);

                    if (isNonMutual) {
                        nonMutual.push(cell);
                        state.retryCount = 0; // Reset retry count on success
                    } else if (unfollowButton) {
                        console.log(`Mutual account skipped: @${username}`);
                    } else {
                        console.log(`No unfollow button for: @${username}`, cell.outerHTML.slice(0, 200) + '...');
                    }
                }

                if (nonMutual.length === 0 && state.retryCount < MAX_RETRIES) {
                    console.log(`No non-mutual found, retrying (${state.retryCount + 1}/${MAX_RETRIES})`);
                    state.retryCount++;
                    scheduleTimeout(() => getNonMutualFollowing().then(resolve), SCROLL_DELAY);
                    return;
                }

                console.log(`Found ${nonMutual.length} non-mutual account(s)`);
                resolve(nonMutual);
            }, 500); // Wait for DOM stability
        });
    }

    // Scroll to bottom for bottom-up or bottom-100 modes with optimized speed
    function scrollToBottom() {
        return new Promise(resolve => {
            let scrollCount = 0;
            let heightStalls = 0;
            let lastHeight = document.body.scrollHeight;
            let usingInitialStep = true;

            function scroll() {
                const step = usingInitialStep ? INITIAL_SCROLL_STEP : SCROLL_STEP;
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                scheduleTimeout(() => {
                    scrollCount++;
                    const currentHeight = document.body.scrollHeight;
                    const isAtBottom = window.scrollY + window.innerHeight >= currentHeight - 100;

                    console.log(`Scroll attempt ${scrollCount}, scrollY: ${window.scrollY}, pageHeight: ${currentHeight}, isAtBottom: ${isAtBottom}, Step: ${step}px`);

                    if (isAtBottom) {
                        if (currentHeight === lastHeight) {
                            state.heightChecks++;
                            state.lastStableHeight = currentHeight;
                            if (state.heightChecks >= BOTTOM_CONFIRM_COUNT) {
                                console.log('Bottom confirmed after stable height checks');
                                let cells = Array.from(document.querySelectorAll('div[data-testid="UserCell"], button[data-testid="UserCell"]')).filter(cell => {
                                    let usernameLink = cell.querySelector('a[href*="/"]');
                                    let spans = cell.querySelectorAll('span');
                                    let isTrend = Array.from(spans).some(span => span.textContent.includes('Trending') || span.textContent.includes('posts'));
                                    return usernameLink && !isTrend && isVisible(cell);
                                });
                                state.lastCell = cells[cells.length - 1];
                                console.log('Stored bottommost cell:', state.lastCell ? state.lastCell.querySelector('a[href*="/"]')?.href.split('/').pop() || 'unknown' : 'none');
                                state.bottomReached = true;
                                resolve();
                                return;
                            }
                        } else {
                            state.heightChecks = 0;
                            lastHeight = currentHeight;
                        }
                    } else {
                        state.heightChecks = 0;
                    }

                    if (scrollCount >= MAX_SCROLLS) {
                        console.log('Max scrolls reached, proceeding with current height');
                        state.bottomReached = true;
                        let cells = Array.from(document.querySelectorAll('div[data-testid="UserCell"], button[data-testid="UserCell"]')).filter(cell => {
                            let usernameLink = cell.querySelector('a[href*="/"]');
                            let spans = cell.querySelectorAll('span');
                            let isTrend = Array.from(spans).some(span => span.textContent.includes('Trending') || span.textContent.includes('posts'));
                            return usernameLink && !isTrend && isVisible(cell);
                        });
                        state.lastCell = cells[cells.length - 1];
                        console.log('Stored bottommost cell:', state.lastCell ? state.lastCell.querySelector('a[href*="/"]')?.href.split('/').pop() || 'unknown' : 'none');
                        resolve();
                    } else if (heightStalls >= MAX_HEIGHT_STALLS) {
                        console.log('No new content after scrolls, proceeding');
                        state.bottomReached = true;
                        let cells = Array.from(document.querySelectorAll('div[data-testid="UserCell"], button[data-testid="UserCell"]')).filter(cell => {
                            let usernameLink = cell.querySelector('a[href*="/"]');
                            let spans = cell.querySelectorAll('span');
                            let isTrend = Array.from(spans).some(span => span.textContent.includes('Trending') || span.textContent.includes('posts'));
                            return usernameLink && !isTrend && isVisible(cell);
                        });
                        state.lastCell = cells[cells.length - 1];
                        console.log('Stored bottommost cell:', state.lastCell ? state.lastCell.querySelector('a[href*="/"]')?.href.split('/').pop() || 'unknown' : 'none');
                        resolve();
                    } else {
                        if (currentHeight === lastHeight) {
                            heightStalls++;
                            if (heightStalls > 2 && usingInitialStep) {
                                usingInitialStep = false; // Switch to dynamic step after initial stalls
                                setScrollStep(); // Set SCROLL_STEP based on 3 cells
                            }
                        } else {
                            heightStalls = 0;
                            lastHeight = currentHeight;
                        }
                        scroll();
                    }
                }, SCROLL_DELAY);
            }
            scroll();
        });
    }

    // Update button states
    function updateButtons() {
        Object.values(buttons).forEach(btn => {
            if (state.running && btn.mode !== state.mode) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.textContent = state.running && !state.paused && btn.mode === state.mode
                    ? `Pause ${btn.mode.replace('-', ' ')}`
                    : state.paused && btn.mode === state.mode
                    ? `Resume ${btn.mode.replace('-', ' ')}`
                    : `Remove ${btn.mode.replace('-', ' ')}`;
            }
        });
        console.log('Buttons updated:', Object.keys(buttons).map(mode => `${mode}: ${buttons[mode].textContent}`).join(', '));
    }

    // Process following in batches
    async function processFollowing(mode, limit = Infinity) {
        if (state.running && state.mode !== mode) {
            console.log(`Cannot start ${mode}: ${state.mode} is running`);
            return;
        }

        if (state.running && !state.paused) {
            console.log(`Pausing ${mode} process`);
            state.paused = true;
            clearTimeout(state.timeoutId);
            updateButtons();
            return;
        } else if (state.paused) {
            console.log(`Resuming ${mode} process`);
            state.paused = false;
            if ((mode === 'bottom-up' || mode === 'bottom-100') && !state.bottomReached) {
                console.log('Bottom not reached, scrolling to bottom');
                await scrollToBottom();
            }
            updateButtons();
        } else {
            console.log(`Starting ${mode} unfollow process`);
            state.mode = mode;
            state.running = true;
            state.paused = false;
            state.processed.clear();
            state.bottomReached = false;
            state.lastCell = null;
            state.lastHeight = 0;
            state.lastUsername = null;
            state.heightChecks = 0;
            state.lastStableHeight = 0;
            state.retryCount = 0;
            setScrollStep(); // Set initial scroll step
            updateButtons();
            if (mode === 'bottom-up' || mode === 'bottom-100') {
                await scrollToBottom();
            }
        }

        async function processBatch() {
            if (!state.running || state.paused) {
                console.log(`${mode} process paused or stopped`);
                return;
            }

            const currentHeight = document.body.scrollHeight;
            console.log(`Attempt ${state.processed.size + 1}, Processed ${state.processed.size}/${limit}, scrollY: ${window.scrollY}, pageHeight: ${currentHeight}`);

            let followingCells = await getNonMutualFollowing();
            let username = followingCells.length > 0 ? followingCells[0].querySelector('a[href*="/"]')?.href.split('/').pop() || state.lastUsername : state.lastUsername;

            if (followingCells.length === 0 && state.processed.size < limit && window.scrollY > 0) {
                console.log('No non-mutual account found, scrolling');
                state.lastCell = null;
                const scrollStep = mode === 'top-down' ? SCROLL_STEP : -SCROLL_STEP;
                window.scrollBy(0, scrollStep);
                state.lastHeight = currentHeight;
                state.lastUsername = username;
                scheduleTimeout(processBatch, SCROLL_DELAY);
                return;
            }

            if (state.processed.size >= limit || window.scrollY <= 0) {
                console.log(`Finished ${mode} unfollowing. Removed ${state.processed.size} accounts.`);
                state.running = false;
                state.paused = false;
                state.mode = null;
                state.bottomReached = false;
                state.lastCell = null;
                updateButtons();
                return;
            }

            for (let cell of followingCells) {
                state.processed.add(cell);
                let unfollowBtn = cell.querySelector('button[data-testid*="-unfollow"], button[aria-label*="Following"], button[aria-label*="Unfollow"], button[role="button"][data-testid="UserCell"] ~ button, button[aria-label*="Unfollow"]');
                let username = cell.querySelector('a[href*="/"]')?.href.split('/').pop() || 'unknown';

                if (unfollowBtn && simulateClick(unfollowBtn)) {
                    console.log(`Unfollowed account: @${username} at position ${Math.round(cell.getBoundingClientRect().top + window.scrollY)}`);
                    cell.style.border = '2px solid red';
                    let confirmAttempts = 0;

                    function tryConfirm() {
                        let confirmBtn = Array.from(document.querySelectorAll('div[role="button"], button[role="button"], button')).find(el =>
                            el.textContent.trim().toLowerCase() === 'unfollow'
                        );
                        if (confirmBtn && simulateClick(confirmBtn)) {
                            console.log(`Confirmed unfollow for @${username}`);
                        } else if (confirmAttempts < CONFIRM_ATTEMPTS - 1) {
                            confirmAttempts++;
                            console.log(`No confirm button found for @${username}, retrying (${confirmAttempts}/${CONFIRM_ATTEMPTS})`);
                            scheduleTimeout(tryConfirm, CONFIRM_DELAY);
                            return;
                        } else {
                            console.log(`Failed to find confirm button for @${username} after ${CONFIRM_ATTEMPTS} attempts`);
                        }
                        state.lastCell = null;
                        const scrollStep = mode === 'top-down' ? SCROLL_STEP : -SCROLL_STEP;
                        window.scrollBy(0, scrollStep);
                    }

                    scheduleTimeout(tryConfirm, CONFIRM_DELAY);
                } else {
                    console.log(`No unfollow button or click failed for @${username}, skipping`);
                }
            }

            state.lastHeight = document.body.scrollHeight;
            state.lastUsername = username;
            scheduleTimeout(processBatch, DELAY);
        }

        processBatch();
    }

    // Add three buttons to the top-right corner
    function addAutomationButtons() {
        if (document.getElementById('x-unfollow-top-down')) return;
        console.log('Adding automation buttons');

        const btn1 = document.createElement('button');
        btn1.id = 'x-unfollow-top-down';
        btn1.textContent = 'Remove Top-Down';
        btn1.style.position = 'fixed';
        btn1.style.top = '20px';
        btn1.style.right = '20px';
        btn1.style.zIndex = 9999;
        btn1.style.background = '#1da1f2';
        btn1.style.color = '#fff';
        btn1.style.padding = '10px 20px';
        btn1.style.border = 'none';
        btn1.style.borderRadius = '5px';
        btn1.style.cursor = 'pointer';
        btn1.mode = 'top-down';
        btn1.onclick = () => processFollowing('top-down', Infinity);
        document.body.appendChild(btn1);
        buttons['top-down'] = btn1;
        console.log('Added Top-Down button');

        const btn2 = document.createElement('button');
        btn2.id = 'x-unfollow-bottom-up';
        btn2.textContent = 'Remove Bottom-Up';
        btn2.style.position = 'fixed';
        btn2.style.top = '60px';
        btn2.style.right = '20px';
        btn2.style.zIndex = 9999;
        btn2.style.background = '#ef4444';
        btn2.style.color = '#fff';
        btn2.style.padding = '10px 20px';
        btn2.style.border = 'none';
        btn2.style.borderRadius = '5px';
        btn2.style.cursor = 'pointer';
        btn2.mode = 'bottom-up';
        btn2.onclick = () => processFollowing('bottom-up', Infinity);
        document.body.appendChild(btn2);
        buttons['bottom-up'] = btn2;
        console.log('Added Bottom-Up button');

        const btn3 = document.createElement('button');
        btn3.id = 'x-unfollow-bottom-100';
        btn3.textContent = 'Remove Bottom 100';
        btn3.style.position = 'fixed';
        btn3.style.top = '100px';
        btn3.style.right = '20px';
        btn3.style.zIndex = 9999;
        btn3.style.background = '#16a34a';
        btn3.style.color = '#fff';
        btn3.style.padding = '10px 20px';
        btn3.style.border = 'none';
        btn3.style.borderRadius = '5px';
        btn3.style.cursor = 'pointer';
        btn3.mode = 'bottom-100';
        btn3.onclick = () => processFollowing('bottom-100', 100);
        document.body.appendChild(btn3);
        buttons['bottom-100'] = btn3;
        console.log('Added Bottom 100 button');
    }

    console.log('Script starting');
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOMContentLoaded fired');
            addAutomationButtons();
        });
    } else {
        console.log('Document already loaded, initializing immediately');
        addAutomationButtons();
    }
})();
