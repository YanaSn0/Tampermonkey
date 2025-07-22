// ==UserScript==
// @name         X_Unfollow_NonMutual
// @namespace    http://tampermonkey.net/
// @version      3.15
// @description  Unfollow non-mutual accounts in top-down mode on X profile's Following tab, with pause/resume.
// @author       Adapted from YanaSn0’s X_Remove
// @match        https://x.com/*/following
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Constants
    const DELAY = 2000; // Delay between unfollow attempts
    const SCROLL_DELAY = 1000; // Delay after scrolling
    const CONFIRM_DELAY = 1500; // Delay for confirm button
    const CONFIRM_ATTEMPTS = 3; // Max attempts to find confirm button
    const SCROLL_STEP = 2000; // Reduced for smoother scrolling
    const NO_NON_MUTUAL_THRESHOLD = 5; // Scroll after 5 empty attempts
    const MAX_ATTEMPTS = 1000; // Max total attempts
    const MAX_HEIGHT_STALLS = 50; // Stop if page height doesn’t change
    const WHITELIST = ['onchainero', 'Shorty91295368', 'PostinClips'];

    // Global state
    let state = {
        running: false,
        paused: false,
        timeoutId: null,
        processed: new Set(),
        noNonMutualCount: 0,
        heightStalls: 0
    };
    let buttons = {};

    // Helper functions
    function isVisible(elem) {
        if (!elem) return false;
        const rect = elem.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function simulateClick(elem) {
        if (!elem) return false;
        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        elem.click();
        console.log('Clicked element:', elem.outerHTML.slice(0, 100) + '...');
        return true;
    }

    function collectUserCells() {
        return Array.from(document.querySelectorAll('button[data-testid="UserCell"]')).filter(cell => {
            let usernameLink = cell.querySelector('a[href*="/"]');
            let spans = cell.querySelectorAll('span');
            let isTrend = Array.from(spans).some(span => span.textContent.includes('Trending') || span.textContent.includes('posts'));
            return usernameLink && !isTrend;
        });
    }

    async function isNonMutual(cell) {
        let username = cell.querySelector('a[href*="/"]')?.href.split('/').pop() || 'unknown';
        if (WHITELIST.includes(username.toLowerCase())) {
            console.log(`Skipping whitelisted account: @${username}`);
            return false;
        }
        if (state.processed.has(cell)) {
            console.log(`Skipping processed cell: @${username}`);
            return false;
        }

        let followsYou = false;
        let unfollowButton = cell.querySelector('button[data-testid*="-unfollow"], button[aria-label*="Following"], button[aria-label*="Unfollow"]');
        let followButton = cell.querySelector('button[data-testid*="-follow"], button[aria-label*="Follow"]');

        // Check for "Follows you" with specific selector
        let followIndicator = cell.querySelector('span.css-1jxf684.r-bcqeeo.r-1ttztb7.r-qvutc0.r-poiln3');
        followsYou = followIndicator && followIndicator.textContent.trim().toLowerCase() === 'follows you';
        // Fallback to general span check
        if (!followsYou) {
            let spans = cell.querySelectorAll('span');
            followsYou = Array.from(spans).some(span => span.textContent.trim().toLowerCase() === 'follows you');
            if (!followsYou && spans.length > 0) {
                console.log('Spans checked for:', username, 'Span contents:', Array.from(spans).map(span => `"${span.textContent.trim()}"`).join(', '));
            }
        }

        let isNonMutual = !followsYou && unfollowButton;
        console.log('Mutual check for:', username,
                    'Follows you:', followsYou,
                    'Position:', cell.offsetTop,
                    'Follow button:', followButton ? followButton.outerHTML.slice(0, 100) + '...' : 'none',
                    'Unfollow button:', unfollowButton ? unfollowButton.outerHTML.slice(0, 100) + '...' : 'none');
        return isNonMutual;
    }

    async function processFollowing() {
        if (state.running && !state.paused) {
            console.log('Pausing top-down process');
            state.paused = true;
            clearTimeout(state.timeoutId);
            updateButtons();
            return;
        } else if (state.paused) {
            console.log('Resuming top-down process');
            state.paused = false;
            updateButtons();
        } else {
            console.log('Starting top-down unfollow process');
            state.running = true;
            state.paused = false;
            state.processed.clear();
            state.noNonMutualCount = 0;
            state.heightStalls = 0;
            updateButtons();
        }

        let attemptCount = 0;
        let scrollCount = 0;
        let lastHeight = document.body.scrollHeight;

        async function processBatch() {
            if (!state.running || state.paused) {
                console.log('Top-down process paused or stopped');
                return;
            }

            console.log(`Attempt ${attemptCount + 1}, Scroll ${scrollCount + 1}, Processed ${state.processed.size}, scrollY: ${window.scrollY}, pageHeight: ${document.body.scrollHeight}`);
            let cells = collectUserCells();
            let nonMutual = [];
            for (let cell of cells) {
                if (await isNonMutual(cell)) {
                    nonMutual.push(cell);
                }
            }
            console.log(`Found ${nonMutual.length} non-mutual accounts in current viewport`);

            if (nonMutual.length === 0 || cells.length < 3) {
                state.noNonMutualCount++;
                console.log(`No non-mutual accounts found, noNonMutualCount: ${state.noNonMutualCount}`);
                if (state.noNonMutualCount >= NO_NON_MUTUAL_THRESHOLD || cells.length < 3) {
                    window.scrollBy(0, SCROLL_STEP);
                    console.log('Scrolling downward');
                    scrollCount++;
                    state.noNonMutualCount = 0;
                }
                attemptCount++;
                const currentHeight = document.body.scrollHeight;
                if (currentHeight === lastHeight) {
                    state.heightStalls++;
                    if (state.heightStalls >= MAX_HEIGHT_STALLS) {
                        console.log(`No new content after ${state.heightStalls} scrolls, stopping`);
                        state.running = false;
                        state.paused = false;
                        updateButtons();
                        console.log(`Finished top-down unfollowing. Removed ${state.processed.size} accounts.`);
                        return;
                    }
                } else {
                    state.heightStalls = 0;
                }
                lastHeight = currentHeight;
                state.timeoutId = setTimeout(processBatch, SCROLL_DELAY);
                return;
            }

            if (attemptCount >= MAX_ATTEMPTS) {
                console.log(`Max attempts reached, stopping`);
                state.running = false;
                state.paused = false;
                updateButtons();
                console.log(`Finished top-down unfollowing. Removed ${state.processed.size} accounts.`);
                return;
            }

            let cell = nonMutual[0];
            state.processed.add(cell);
            let unfollowBtn = cell.querySelector('button[data-testid*="-unfollow"], button[aria-label*="Following"], button[aria-label*="Unfollow"]');
            let username = cell.querySelector('a[href*="/"]')?.href.split('/').pop() || 'unknown';

            if (unfollowBtn && simulateClick(unfollowBtn)) {
                console.log(`Unfollowed account: @${username} at position ${cell.offsetTop}`);
                cell.style.border = '2px solid red';
                let confirmAttempts = 0;

                function tryConfirm() {
                    let confirmBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).find(el =>
                        el.textContent.trim().toLowerCase() === 'unfollow'
                    );
                    if (confirmBtn && simulateClick(confirmBtn)) {
                        console.log(`Confirmed unfollow for @${username}`);
                    } else if (confirmAttempts < CONFIRM_ATTEMPTS - 1) {
                        confirmAttempts++;
                        console.log(`No confirm button found for @${username}, retrying (${confirmAttempts}/${CONFIRM_ATTEMPTS})`);
                        state.timeoutId = setTimeout(tryConfirm, CONFIRM_DELAY);
                        return;
                    } else {
                        console.log(`Failed to find confirm button for @${username} after ${CONFIRM_ATTEMPTS} attempts`);
                    }
                    attemptCount++;
                    state.noNonMutualCount = 0;
                    state.timeoutId = setTimeout(processBatch, DELAY);
                }

                state.timeoutId = setTimeout(tryConfirm, CONFIRM_DELAY);
            } else {
                console.log(`No unfollow button or click failed for @${username}, continuing`);
                attemptCount++;
                state.noNonMutualCount = 0;
                state.timeoutId = setTimeout(processBatch, SCROLL_DELAY);
            }
        }

        processBatch();
    }

    function updateButtons() {
        buttons['top-down'].textContent = state.running && !state.paused ? 'Pause Top-Down' : state.paused ? 'Resume Top-Down' : 'Run Top-Down';
        buttons['top-down'].style.opacity = state.running && !state.paused ? '0.5' : '1';
        console.log('Button updated:', buttons['top-down'].textContent);
    }

    function addAutomationButtons() {
        if (document.getElementById('x-unfollow-top-down')) return;
        console.log('Adding top-down button');
        const btn = document.createElement('button');
        btn.id = 'x-unfollow-top-down';
        btn.textContent = 'Run Top-Down';
        btn.style.position = 'fixed';
        btn.style.top = '20px';
        btn.style.right = '20px';
        btn.style.zIndex = 9999;
        btn.style.background = '#1da1f2';
        btn.style.color = '#fff';
        btn.style.padding = '10px 20px';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.onclick = processFollowing;
        document.body.appendChild(btn);
        buttons['top-down'] = btn;
        console.log('Top-Down button added');
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
