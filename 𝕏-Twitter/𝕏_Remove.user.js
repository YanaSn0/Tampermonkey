// ==UserScript==
// @name         𝕏_Remove
// @namespace    http://tampermonkey.net/
// @version      1.66
// @description  Unfollow non-mutual accounts one at a time on X profile's Following tab in top-down mode, starting paused, waiting CONFIRM_DELAY + UNFOLLOW_DELAY (2500ms by default) after each unfollow confirmation, logging two lines starting with @ (next cell position, then current cell details) at top: ~100px, stopping scroll before unfollow popup to prevent DOM desync, using 250ms DELAY and SCROLL_DELAY, with robust account detection, stopping completely at list end.
// @author       YanaSn0w
// @match        https://x.com/*/following
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Constants
    const DELAY = 250; // Delay between attempts (main loop)
    const SCROLL_DELAY = 250; // Delay for scrolling
    const CONFIRM_DELAY = 1500; // Delay for confirm retries
    const UNFOLLOW_DELAY = 1000; // Additional delay after unfollow confirmation
    const UNFOLLOW_WAIT = CONFIRM_DELAY + UNFOLLOW_DELAY; // Total wait after unfollow confirmation (2500ms)
    const DOM_STABILIZE_DELAY = 500; // Delay to allow DOM updates after unfollow
    const CONFIRM_ATTEMPTS = 5; // Attempts for confirm button
    const MAX_HEIGHT_STALLS = 50; // Stop if page height doesn’t change
    const WHITELIST = ['YanaSn0w', 'YanaSn0w1']; // Don't remove these even if they don't follow back
    const HEADER_OFFSET = 95; // Position cell at top: ~100px
    const POSITION_TOLERANCE = 50; // Allowable deviation for top position
    const CELL_RETRY_ATTEMPTS = 10; // Retry attempts for cell collection

    // Global state
    let state = {
        running: false,
        paused: true, // Start paused
        isProcessingUnfollow: false,
        timeoutId: null,
        processed: new Set(),
        heightStalls: 0,
        lastScrollPosition: 0
    };
    let button = null;

    // Helper to check if element is visible
    function isVisible(elem) {
        if (!elem) return false;
        const rect = elem.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    }

    // Helper to wait for scroll completion
    async function waitForScroll(targetPosition) {
        let attempts = 0;
        const maxAttempts = 15; // Increased attempts for scroll reliability
        while (attempts < maxAttempts) {
            if (Math.abs(window.pageYOffset - targetPosition) < 10) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));
            attempts++;
        }
        console.log(`Scroll to ${targetPosition} incomplete after ${maxAttempts} attempts`);
        return false;
    }

    // Helper to simulate click
    async function simulateClick(elem, username, action = 'element', skipScroll = false) {
        if (!elem) {
            console.log(`No ${action} to click for @${username}`);
            return false;
        }
        window.focus();
        if (!skipScroll) {
            const clickScrollPosition = elem.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET;
            window.scrollTo({ top: clickScrollPosition, behavior: 'smooth' });
            await waitForScroll(clickScrollPosition);
        }
        if (!isVisible(elem)) {
            console.log(`${action.charAt(0).toUpperCase() + action.slice(1)} not visible for @${username}`);
            return false;
        }
        try {
            elem.click();
            console.log(`Clicked ${action}`);
            return true;
        } catch (e) {
            console.log(`Failed to click ${action} for @${username}: ${e.message}`);
            return false;
        }
    }

    // Collect a single user cell with retries
    async function collectUserCell() {
        let attempts = 0;
        while (attempts < CELL_RETRY_ATTEMPTS) {
            const selectors = [
                'button[data-testid="UserCell"]',
                'div[data-testid="cellInnerDiv"] a[href*="/"]'
            ];
            let cell = null;
            for (const selector of selectors) {
                const cells = Array.from(document.querySelectorAll(selector))
                    .map(c => c.closest('div[data-testid="cellInnerDiv"]') || c.closest('div'))
                    .filter(c => {
                        const usernameLink = c.querySelector('a[href*="/"]');
                        const spans = c.querySelectorAll('span');
                        const isTrend = Array.from(spans).some(span =>
                            span.textContent.toLowerCase().includes('trending') ||
                            span.textContent.toLowerCase().includes('posts')
                        );
                        const hasFollowButton = c.querySelector('button[data-testid*="-follow"], button[aria-label*="Follow"], button[data-testid*="-unfollow"], button[aria-label*="Following"], button[aria-label*="Unfollow"]');
                        const username = usernameLink?.href.split('/').pop()?.toLowerCase() || 'unknown';
                        return usernameLink && !isTrend && hasFollowButton && !state.processed.has(username);
                    })
                    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); // Sort by top position
                if (cells.length > 0) {
                    cell = cells[0]; // Take topmost cell
                    break;
                }
            }
            if (cell) {
                return {
                    element: cell,
                    username: cell.querySelector('a[href*="/"]')?.href.split('/').pop()?.toLowerCase() || 'unknown',
                    position: cell.getBoundingClientRect().top + window.pageYOffset,
                    height: cell.getBoundingClientRect().height
                };
            }
            console.log(`No cell found on attempt ${attempts + 1}/${CELL_RETRY_ATTEMPTS}, retrying`);
            await new Promise(resolve => setTimeout(resolve, DELAY));
            attempts++;
        }
        console.log(`Failed to find cell after ${CELL_RETRY_ATTEMPTS} attempts, may have skipped an account`);
        return null;
    }

    // Check if account is non-mutual
    async function isNonMutual(cellObj) {
        const { element: cell, username } = cellObj;
        state.processed.add(username);
        if (WHITELIST.includes(username)) {
            console.log(`Skipping whitelisted account: @${username}`);
            return false;
        }
        if (state.processed.has(username) && !cellObj.element.isConnected) {
            return false;
        }

        let followsYou = false;
        const followIndicator = cell.querySelector('span.css-1jxf684.r-bcqeeo.r-1ttztb7.r-qvutc0.r-poiln3');
        followsYou = followIndicator && followIndicator.textContent.trim().toLowerCase() === 'follows you';
        if (!followsYou) {
            const spans = cell.querySelectorAll('span');
            followsYou = Array.from(spans).some(span => span.textContent.trim().toLowerCase() === 'follows you');
        }

        return !followsYou;
    }

    // Add button with retry
    function addButton() {
        if (document.getElementById('x-unfollow-top-down')) return;
        console.log('Adding button');
        try {
            button = document.createElement('button');
            button.id = 'x-unfollow-top-down';
            button.textContent = 'Start Top-Down';
            button.style.position = 'fixed';
            button.style.top = '20px';
            button.style.right = '20px';
            button.style.zIndex = '10000';
            button.style.background = '#1da1f2';
            button.style.color = '#fff';
            button.style.padding = '10px 20px';
            button.style.border = '2px solid #fff';
            button.style.borderRadius = '5px';
            button.style.cursor = 'pointer';
            button.style.fontWeight = 'bold';
            button.onclick = processFollowing;
            document.body.appendChild(button);
            console.log('Button added: top-down, script paused');
        } catch (e) {
            console.log('Failed to add button:', e.message);
            setTimeout(addButton, 1000);
        }
    }

    // Process following
    async function processFollowing() {
        if (state.running && !state.paused) {
            console.log('Pausing top-down');
            state.paused = true;
            if (state.timeoutId) {
                clearTimeout(state.timeoutId);
                state.timeoutId = null;
            }
            updateButton();
        } else {
            console.log(`Starting/Resuming top-down (was paused: ${state.paused})`);
            state.running = true;
            state.paused = false;
            state.isProcessingUnfollow = false;
            if (!state.processed.size) {
                state.processed.clear();
                state.heightStalls = 0;
                state.lastScrollPosition = 0;
            }
            updateButton();
            state.timeoutId = setTimeout(processSingle, DELAY);
        }
    }

    async function processSingle() {
        if (!state.running || state.paused) {
            console.log('Top-down process paused or stopped');
            return;
        }

        // Scroll to last known position on resume
        if (state.lastScrollPosition > 0) {
            console.log(`Resuming at scroll position: ${state.lastScrollPosition}`);
            window.scrollTo({ top: state.lastScrollPosition, behavior: 'smooth' });
            await waitForScroll(state.lastScrollPosition);
        }

        // Find current cell
        const cellObj = await collectUserCell();
        let lastHeight = document.body.scrollHeight;

        if (!cellObj) {
            console.log(`No cell found, scrollY: ${Math.round(window.pageYOffset)}`);
            const currentHeight = document.body.scrollHeight;
            if (currentHeight === lastHeight) {
                state.heightStalls++;
                if (state.heightStalls >= MAX_HEIGHT_STALLS) {
                    console.log(`No new content after ${state.heightStalls} scrolls, stopping`);
                    state.running = false;
                    state.paused = true;
                    updateButton();
                    console.log(`Finished top-down. Processed ${state.processed.size} accounts`);
                    return;
                }
            } else {
                state.heightStalls = 0;
            }
            lastHeight = currentHeight;
            window.scrollBy(0, 400);
            state.lastScrollPosition = window.pageYOffset;
            console.log(`Scrolling to: ${Math.round(state.lastScrollPosition)}`);
            state.timeoutId = setTimeout(processSingle, DELAY);
            return;
        }

        // Position current cell at top: ~100px
        const cellScrollPosition = cellObj.position - HEADER_OFFSET;
        window.scrollTo({ top: cellScrollPosition, behavior: 'smooth' });
        await waitForScroll(cellScrollPosition);

        // Verify position
        const currentTop = Math.round(cellObj.element.getBoundingClientRect().top);
        if (Math.abs(currentTop - HEADER_OFFSET) > POSITION_TOLERANCE) {
            console.log(`Position off for @${cellObj.username} (top: ${currentTop}), retrying scroll to top: ${HEADER_OFFSET}`);
            window.scrollTo({ top: cellObj.position - HEADER_OFFSET, behavior: 'smooth' });
            await waitForScroll(cellObj.position - HEADER_OFFSET);
        }

        // Log next cell position (estimate for now, updated later)
        const nextScrollPosition = cellObj.position + cellObj.height;
        console.log(`@next position: ${Math.round(nextScrollPosition)}`);

        // Log current cell details
        const isMutual = !(await isNonMutual(cellObj));
        console.log(`%c@${cellObj.username} [mutual=${isMutual}] (top: ${Math.round(cellObj.element.getBoundingClientRect().top)}, height: ${Math.round(cellObj.height)}, position: ${Math.round(cellObj.position)})`, `color: ${isMutual ? 'green' : 'red'}`);

        if (isMutual) {
            // Find next cell for accurate position
            const nextCellObj = await collectUserCell();
            const finalNextScrollPosition = nextCellObj ? nextCellObj.position - HEADER_OFFSET : nextScrollPosition;
            console.log(`@next position updated: ${Math.round(finalNextScrollPosition)}`);
            window.scrollTo({ top: finalNextScrollPosition, behavior: 'smooth' });
            state.lastScrollPosition = finalNextScrollPosition;
            state.timeoutId = setTimeout(processSingle, DELAY);
            return;
        }

        // Process non-mutual account (no scrolling until unfollow complete)
        state.isProcessingUnfollow = true;
        const followingBtn = cellObj.element.querySelector('button[aria-label*="Following"], button[data-testid*="-unfollow"]');
        if (!followingBtn) {
            console.log(`No Following button for @${cellObj.username}`);
            state.isProcessingUnfollow = false;
            await new Promise(resolve => setTimeout(resolve, DOM_STABILIZE_DELAY)); // Allow DOM to stabilize
            // Find next cell for scrolling
            const nextCellObj = await collectUserCell();
            const finalNextScrollPosition = nextCellObj ? nextCellObj.position - HEADER_OFFSET : nextScrollPosition;
            console.log(`@next position updated: ${Math.round(finalNextScrollPosition)}`);
            window.scrollTo({ top: finalNextScrollPosition, behavior: 'smooth' });
            state.lastScrollPosition = finalNextScrollPosition;
            state.timeoutId = setTimeout(processSingle, DELAY);
            return;
        }

        if (await simulateClick(followingBtn, cellObj.username, 'Following button', true)) {
            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));
            const unfollowBtn = Array.from(document.querySelectorAll('button, div[role="button"], div[role="menuitem"], span')).find(el =>
                el.textContent.trim().toLowerCase().includes('unfollow')
            );
            if (unfollowBtn) {
                if (await simulateClick(unfollowBtn, cellObj.username, 'Unfollow menu item')) {
                    console.log(`Unfollowed: @${cellObj.username}`);
                    cellObj.element.style.border = '2px solid red';
                    let confirmAttempts = 0;

                    async function tryConfirm() {
                        const confirmBtn = document.querySelector('button[data-testid="confirmationSheetConfirm"]') ||
                                          Array.from(document.querySelectorAll('button, div[role="button"], span')).find(el =>
                                              el.textContent.trim().toLowerCase().includes('unfollow')
                                          );
                        if (confirmBtn && await simulateClick(confirmBtn, cellObj.username, 'Confirm button')) {
                            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));
                            const followBtn = cellObj.element.querySelector('button[aria-label*="Follow"], button[data-testid*="-follow"]');
                            if (followBtn) {
                                console.log(`Confirmed unfollow: @${cellObj.username}`);
                                state.isProcessingUnfollow = false;
                                console.log(`Waiting ${UNFOLLOW_WAIT}ms before next account`);
                                await new Promise(resolve => setTimeout(resolve, UNFOLLOW_WAIT));
                                await new Promise(resolve => setTimeout(resolve, DOM_STABILIZE_DELAY)); // Allow DOM to stabilize
                                // Find next cell for scrolling
                                const nextCellObj = await collectUserCell();
                                const finalNextScrollPosition = nextCellObj ? nextCellObj.position - HEADER_OFFSET : nextScrollPosition;
                                console.log(`@next position updated: ${Math.round(finalNextScrollPosition)}`);
                                window.scrollTo({ top: finalNextScrollPosition, behavior: 'smooth' });
                                state.lastScrollPosition = finalNextScrollPosition;
                                state.timeoutId = setTimeout(processSingle, DELAY);
                                return true;
                            } else if (confirmAttempts < CONFIRM_ATTEMPTS - 1) {
                                console.log(`No Follow button for @${cellObj.username}, retrying (${confirmAttempts + 1}/${CONFIRM_ATTEMPTS})`);
                                confirmAttempts++;
                                await new Promise(resolve => setTimeout(resolve, CONFIRM_DELAY));
                                return await tryConfirm();
                            } else {
                                console.log(`Failed to confirm @${cellObj.username} after ${CONFIRM_ATTEMPTS} attempts`);
                                state.isProcessingUnfollow = false;
                                await new Promise(resolve => setTimeout(resolve, DOM_STABILIZE_DELAY)); // Allow DOM to stabilize
                                // Find next cell for scrolling
                                const nextCellObj = await collectUserCell();
                                const finalNextScrollPosition = nextCellObj ? nextCellObj.position - HEADER_OFFSET : nextScrollPosition;
                                console.log(`@next position updated: ${Math.round(finalNextScrollPosition)}`);
                                window.scrollTo({ top: finalNextScrollPosition, behavior: 'smooth' });
                                state.lastScrollPosition = finalNextScrollPosition;
                                state.timeoutId = setTimeout(processSingle, DELAY);
                                return false;
                            }
                        } else if (confirmAttempts < CONFIRM_ATTEMPTS - 1) {
                            console.log(`No confirm button for @${cellObj.username}, retrying (${confirmAttempts + 1}/${CONFIRM_ATTEMPTS})`);
                            confirmAttempts++;
                            await new Promise(resolve => setTimeout(resolve, CONFIRM_DELAY));
                            return await tryConfirm();
                        } else {
                            console.log(`Failed to confirm @${cellObj.username} after ${CONFIRM_ATTEMPTS} attempts`);
                            state.isProcessingUnfollow = false;
                            await new Promise(resolve => setTimeout(resolve, DOM_STABILIZE_DELAY)); // Allow DOM to stabilize
                            // Find next cell for scrolling
                            const nextCellObj = await collectUserCell();
                            const finalNextScrollPosition = nextCellObj ? nextCellObj.position - HEADER_OFFSET : nextScrollPosition;
                            console.log(`@next position updated: ${Math.round(finalNextScrollPosition)}`);
                            window.scrollTo({ top: finalNextScrollPosition, behavior: 'smooth' });
                            state.lastScrollPosition = finalNextScrollPosition;
                            state.timeoutId = setTimeout(processSingle, DELAY);
                            return false;
                        }
                    }

                    await tryConfirm();
                } else {
                    console.log(`No Unfollow menu item or click failed for @${cellObj.username}`);
                    state.isProcessingUnfollow = false;
                    await new Promise(resolve => setTimeout(resolve, DOM_STABILIZE_DELAY)); // Allow DOM to stabilize
                    // Find next cell for scrolling
                    const nextCellObj = await collectUserCell();
                    const finalNextScrollPosition = nextCellObj ? nextCellObj.position - HEADER_OFFSET : nextScrollPosition;
                    console.log(`@next position updated: ${Math.round(finalNextScrollPosition)}`);
                    window.scrollTo({ top: finalNextScrollPosition, behavior: 'smooth' });
                    state.lastScrollPosition = finalNextScrollPosition;
                    state.timeoutId = setTimeout(processSingle, DELAY);
                }
            } else {
                console.log(`No Unfollow menu item found for @${cellObj.username}`);
                state.isProcessingUnfollow = false;
                await new Promise(resolve => setTimeout(resolve, DOM_STABILIZE_DELAY)); // Allow DOM to stabilize
                // Find next cell for scrolling
                const nextCellObj = await collectUserCell();
                const finalNextScrollPosition = nextCellObj ? nextCellObj.position - HEADER_OFFSET : nextScrollPosition;
                console.log(`@next position updated: ${Math.round(finalNextScrollPosition)}`);
                window.scrollTo({ top: finalNextScrollPosition, behavior: 'smooth' });
                state.lastScrollPosition = finalNextScrollPosition;
                state.timeoutId = setTimeout(processSingle, DELAY);
            }
        } else {
            console.log(`No Following button or click failed for @${cellObj.username}`);
            state.isProcessingUnfollow = false;
            await new Promise(resolve => setTimeout(resolve, DOM_STABILIZE_DELAY)); // Allow DOM to stabilize
            // Find next cell for scrolling
            const nextCellObj = await collectUserCell();
            const finalNextScrollPosition = nextCellObj ? nextCellObj.position - HEADER_OFFSET : nextScrollPosition;
            console.log(`@next position updated: ${Math.round(finalNextScrollPosition)}`);
            window.scrollTo({ top: finalNextScrollPosition, behavior: 'smooth' });
            state.lastScrollPosition = finalNextScrollPosition;
            state.timeoutId = setTimeout(processSingle, DELAY);
        }
    }

    // Update button state
    function updateButton() {
        if (button) {
            button.textContent = state.running && !state.paused ? 'Pause Top-Down' : 'Start Top-Down';
            console.log('Button:', button.textContent);
        } else {
            console.log('Button not found for update');
            addButton();
        }
    }

    // Initialize script
    console.log('Script starting v1.66');
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOMContentLoaded fired');
            addButton();
        });
    } else {
        console.log('Document already loaded, adding button');
        setTimeout(addButton, 1000);
    }
})();
