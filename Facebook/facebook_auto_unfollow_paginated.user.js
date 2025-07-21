// ==UserScript==
// @name         Facebook Page Auto-Unfollow with Pagination
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Automatically unfollow everyone your Page is following, scrolling to load more entries
// @author       YanaSn0
// @match        https://www.facebook.com/*/following
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const DELAY = 2000; // Time between actions
    const SCROLL_DELAY = 2500; // Wait time after scrolling

    // Helper to click elements
    function simulateClick(elem) {
        if (elem) {
            elem.scrollIntoView();
            elem.click();
        }
    }

    let processed = new Set();

    function autoUnfollowPaginated() {
        let moreButtons = Array.from(document.querySelectorAll('div[aria-label^="More options"]')).filter(btn => !processed.has(btn));
        let i = 0;

        function next() {
            if (i >= moreButtons.length) {
                // Scroll to load more entries
                window.scrollTo(0, document.body.scrollHeight);
                setTimeout(() => {
                    let newButtons = Array.from(document.querySelectorAll('div[aria-label^="More options"]')).filter(btn => !processed.has(btn));
                    if (newButtons.length === 0) {
                        alert("No more entries found. Finished unfollowing all loaded entries!");
                        return;
                    }
                    moreButtons = newButtons;
                    i = 0;
                    next();
                }, SCROLL_DELAY);
                return;
            }
            let btn = moreButtons[i];
            processed.add(btn);
            simulateClick(btn);

            setTimeout(() => {
                // Find the visible "Unfollow" button
                let unfollowBtn = Array.from(document.querySelectorAll('div[role="menuitem"], span, button'))
                    .find(el =>
                        el.textContent.trim().toLowerCase() === "unfollow" &&
                        el.offsetParent !== null // Visible
                    );
                if (unfollowBtn) {
                    simulateClick(unfollowBtn);
                }
                i++;
                setTimeout(next, DELAY);
            }, DELAY);
        }

        next();
    }

    function addAutomationButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Auto-Unfollow All';
        btn.style.position = 'fixed';
        btn.style.top = '20px';
        btn.style.right = '20px';
        btn.style.zIndex = 9999;
        btn.style.background = '#4267B2';
        btn.style.color = '#fff';
        btn.style.padding = '10px 20px';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.onclick = autoUnfollowPaginated;
        document.body.appendChild(btn);
    }

    addAutomationButton();
})();
