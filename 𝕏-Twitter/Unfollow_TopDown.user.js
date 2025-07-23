// ==UserScript==
// @name         X_Unfollow_TopDown
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Unfollow non-mutual accounts on X profile's Following tab in top-down mode, scrolling to each account for visibility, with immediate pause and auto-loading.
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
    const MAX_HEIGHT_STALLS = 50; // Stop if page height doesn’t change
    const WHITELIST = ['YanaSn0w', 'YanaSn0w1']; // Whitelist

    // Global state
    let state = {
        running: false,
        paused: false,
        timeoutId: null,
        processed: new Set(),
        heightStalls: 0
    };
    let button = null;

    // Helper to check if element is visible
    function isVisible(elem) {
        if (!elem) return false;
        const rect = elem.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    }

    // Helper to simulate click
    function simulateClick(elem) {
        if (!elem || !isVisible(elem)) return false;
        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        elem.click();
        console.log('Clicked element:', elem.outerHTML.slice(0, 100) + '...');
        return true;
    }

    // Collect user cells
    function collectUserCells() {
        const selectors = [
            'button[data-testid="UserCell"]', // From v3.15
            'div[data-testid="cellInnerDiv"] a[href*="/"]' // Fallback
        ];
        let cells = [];
        for (const selector of selectors) {
            cells = Array.from(document.querySelectorAll(selector))
                .map(cell => cell.closest('div[data-testid="cellInnerDiv"]') || cell.closest('div'))
                .filter(cell => {
                    const usernameLink = cell.querySelector('a[href*="/"]');
                    const spans = cell.querySelectorAll('span');
                    const isTrend = Array.from(spans).some(span =>
                        span.textContent.toLowerCase().includes('trending') ||
                        span.textContent.toLowerCase().includes('posts')
                    );
                    const hasFollowButton = cell.querySelector('button[data-testid*="-follow"], button[aria-label*="Follow"], button[data-testid*="-unfollow"], button[aria-label*="Following"], button[aria-label*="Unfollow"]');
                    return usernameLink && !isTrend && hasFollowButton && !state.processed.has(cell);
                });
            if (cells.length > 0) {
                console.log(`Collected ${cells.length} cells using selector: ${selector}`);
                break;
            }
        }
        if (cells.length === 0) {
            console.log('No cells found with any selector');
        }
        return cells.map(cell => ({
            element: cell,
            username: cell.querySelector('a[href*="/"]')?.href.split('/').pop()?.toLowerCase() || 'unknown',
            position: cell.getBoundingClientRect().top + window.scrollY
        }));
    }

    // Check if account is non-mutual
    async function isNonMutual(cellObj) {
        const { element: cell, username } = cellObj;
        if (WHITELIST.includes(username)) {
            console.log(`%cSkipping whitelisted account: @${username}`, 'color: blue');
            return false;
        }
        if (state.processed.has(cell)) {
            console.log(`%cSkipping processed account: @${username}`, 'color: gray');
            return false;
        }

        let followsYou = false;
        const unfollowButton = cell.querySelector('button[data-testid*="-unfollow"], button[aria-label*="Following"], button[aria-label*="Unfollow"]');

        // Check for "Follows you"
        const followIndicator = cell.querySelector('span.css-1jxf684.r-bcqeeo.r-1ttztb7.r-qvutc0.r-poiln3');
        followsYou = followIndicator && followIndicator.textContent.trim().toLowerCase() === 'follows you';
        if (!followsYou) {
            const spans = cell.querySelectorAll('span');
            followsYou = Array.from(spans).some(span => span.textContent.trim().toLowerCase() === 'follows you');
        }

        const isNonMutual = !followsYou && unfollowButton && isVisible(unfollowButton);
        console.log(`%cChecking account: @${username} [mutual=${followsYou}]`, `color: ${followsYou ? 'green' : 'red'}`);
        return isNonMutual;
    }

    // Process following
    async function processFollowing() {
        if (state.running && !state.paused) {
            console.log('Pausing top-down');
            state.paused = true;
            clearTimeout(state.timeoutId);
            updateButton();
            return;
        } else if (state.paused) {
            console.log('Resuming top-down');
            state.paused = false;
            updateButton();
        } else {
            console.log('Starting top-down');
            state.running = true;
            state.paused = false;
            state.processed.clear();
            state.heightStalls = 0;
            updateButton();
        }

        async function processBatch() {
            if (!state.running || state.paused) {
                console.log('Top-down process paused or stopped');
                return;
            }

            const cells = collectUserCells();
            let lastHeight = document.body.scrollHeight;

            if (cells.length === 0) {
                console.log(`No cells found, scrollY: ${window.scrollY}, pageHeight: ${document.body.scrollHeight}`);
                const currentHeight = document.body.scrollHeight;
                if (currentHeight === lastHeight) {
                    state.heightStalls++;
                    if (state.heightStalls >= MAX_HEIGHT_STALLS) {
                        console.log(`No new content after ${state.heightStalls} scrolls, stopping`);
                        state.running = false;
                        state.paused = false;
                        updateButton();
                        console.log(`Finished top-down. Processed ${state.processed.size} accounts`);
                        return;
                    }
                } else {
                    state.heightStalls = 0;
                }
                lastHeight = currentHeight;
                state.timeoutId = setTimeout(processBatch, SCROLL_DELAY);
                return;
            }

            // Process one cell at a time
            const cellObj = cells[0]; // Process only the top cell
            window.scrollTo({ top: cellObj.position, behavior: 'smooth' });
            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));

            if (state.paused) {
                console.log('Top-down process paused or stopped');
                return;
            }

            if (await isNonMutual(cellObj)) {
                const unfollowBtn = cellObj.element.querySelector('button[data-testid*="-unfollow"], button[aria-label*="Following"], button[aria-label*="Unfollow"]');
                if (unfollowBtn && simulateClick(unfollowBtn)) {
                    console.log(`Unfollowed account: @${cellObj.username}`);
                    cellObj.element.style.border = '2px solid red';
                    let confirmAttempts = 0;

                    async function tryConfirm() {
                        if (state.paused) {
                            console.log('Top-down process paused or stopped');
                            return;
                        }
                        const confirmBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).find(el =>
                            el.textContent.trim().toLowerCase() === 'unfollow'
                        );
                        if (confirmBtn && simulateClick(confirmBtn)) {
                            console.log(`Confirmed unfollow for @${cellObj.username}`);
                        } else if (confirmAttempts < CONFIRM_ATTEMPTS - 1) {
                            confirmAttempts++;
                            console.log(`No confirm button for @${cellObj.username}, retrying (${confirmAttempts}/${CONFIRM_ATTEMPTS})`);
                            state.timeoutId = setTimeout(tryConfirm, CONFIRM_DELAY);
                            return;
                        } else {
                            console.log(`Failed to confirm @${cellObj.username} after ${CONFIRM_ATTEMPTS} attempts`);
                        }
                        state.processed.add(cellObj.element);
                        state.timeoutId = setTimeout(processBatch, DELAY);
                    }

                    state.timeoutId = setTimeout(tryConfirm, CONFIRM_DELAY);
                } else {
                    console.log(`No unfollow button or click failed for @${cellObj.username}`);
                    state.processed.add(cellObj.element);
                    state.timeoutId = setTimeout(processBatch, SCROLL_DELAY);
                }
            } else {
                state.processed.add(cellObj.element);
                state.timeoutId = setTimeout(processBatch, SCROLL_DELAY);
            }
        }

        state.timeoutId = setTimeout(processBatch, SCROLL_DELAY);
    }

    // Update button state
    function updateButton() {
        button.textContent = state.running && !state.paused ? 'Pause Top-Down' : state.paused ? 'Resume Top-Down' : 'Run Top-Down';
        console.log('Button:', button.textContent);
    }

    // Add button
    function addButton() {
        if (document.getElementById('x-unfollow-top-down')) return;
        console.log('Adding button');
        button = document.createElement('button');
        button.id = 'x-unfollow-top-down';
        button.textContent = 'Run Top-Down';
        button.style.position = 'fixed';
        button.style.top = '20px';
        button.style.right = '20px';
        button.style.zIndex = 9999;
        button.style.background = '#1da1f2';
        button.style.color = '#fff';
        button.style.padding = '10px 20px';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        button.onclick = processFollowing;
        document.body.appendChild(button);
        console.log('Button added: top-down');
    }

    // Initialize script
    console.log('Script starting');
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOMContentLoaded fired');
            addButton();
        });
    } else {
        console.log('Document already loaded, initializing immediately');
        addButton();
    }
})();
