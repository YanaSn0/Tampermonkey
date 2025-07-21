// ==UserScript==
// @name         FB_Remove
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Three buttons: unfollow all top-down, bottom-up, or just the bottom 100 entries on Facebook Page's Following tab
// @author       YanaSn0
// @match        https://www.facebook.com/*/following
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const DELAY = 1200;        // Time between unfollow actions (ms)
    const SCROLL_DELAY = 900;  // Time to wait after each scroll (ms)
    const MAX_SCROLLS = 100;   // Maximum scroll attempts

    // Helper to click elements
    function simulateClick(elem) {
        if (elem) {
            elem.scrollIntoView({behavior: "smooth", block: "center"});
            elem.click();
        }
    }

    // Wait until next section (like Music) is present after following
    function waitUntilFollowingListEnds(callback) {
        let scrollCount = 0;
        function scrollStep() {
            window.scrollTo(0, document.body.scrollHeight);

            let nextSection = Array.from(document.querySelectorAll('a'))
                .find(a => a.textContent.trim().toLowerCase() === 'music' && a.href && a.href.includes('music'));

            scrollCount++;
            if (nextSection || scrollCount >= MAX_SCROLLS) {
                setTimeout(callback, SCROLL_DELAY);
            } else {
                setTimeout(scrollStep, SCROLL_DELAY);
            }
        }
        scrollStep();
    }

    // Unfollow from top to bottom
    function autoUnfollowTopDown() {
        waitUntilFollowingListEnds(() => {
            let processed = new Set();
            let moreButtons = Array.from(document.querySelectorAll('div[aria-label^="More options"]')).filter(btn => !processed.has(btn));
            let i = 0;

            function next() {
                if (i >= moreButtons.length) {
                    alert("Finished top-down unfollowing!");
                    return;
                }
                let btn = moreButtons[i];
                processed.add(btn);
                simulateClick(btn);

                setTimeout(() => {
                    let unfollowBtn = Array.from(document.querySelectorAll('div[role="menuitem"], span, button'))
                        .find(el =>
                            el.textContent.trim().toLowerCase() === "unfollow" &&
                            el.offsetParent !== null
                        );
                    if (unfollowBtn) {
                        simulateClick(unfollowBtn);
                    }
                    i++;
                    setTimeout(next, DELAY);
                }, DELAY);
            }

            next();
        });
    }

    // Unfollow from bottom to top
    function autoUnfollowBottomUp() {
        waitUntilFollowingListEnds(() => {
            let processed = new Set();
            let moreButtons = Array.from(document.querySelectorAll('div[aria-label^="More options"]')).filter(btn => !processed.has(btn));
            moreButtons = moreButtons.reverse();
            let i = 0;

            function next() {
                if (i >= moreButtons.length) {
                    alert("Finished bottom-up unfollowing!");
                    return;
                }
                let btn = moreButtons[i];
                processed.add(btn);
                simulateClick(btn);

                setTimeout(() => {
                    let unfollowBtn = Array.from(document.querySelectorAll('div[role="menuitem"], span, button'))
                        .find(el =>
                            el.textContent.trim().toLowerCase() === "unfollow" &&
                            el.offsetParent !== null
                        );
                    if (unfollowBtn) {
                        simulateClick(unfollowBtn);
                    }
                    i++;
                    setTimeout(next, DELAY);
                }, DELAY);
            }

            next();
        });
    }

    // Unfollow bottom 100 only
    function autoUnfollowBottom100() {
        waitUntilFollowingListEnds(() => {
            let processed = new Set();
            let moreButtons = Array.from(document.querySelectorAll('div[aria-label^="More options"]')).filter(btn => !processed.has(btn));
            moreButtons = moreButtons.reverse().slice(0, 100); // Get the bottom 100
            let i = 0;

            function next() {
                if (i >= moreButtons.length) {
                    alert("Finished unfollowing bottom 100 entries!");
                    return;
                }
                let btn = moreButtons[i];
                processed.add(btn);
                simulateClick(btn);

                setTimeout(() => {
                    let unfollowBtn = Array.from(document.querySelectorAll('div[role="menuitem"], span, button'))
                        .find(el =>
                            el.textContent.trim().toLowerCase() === "unfollow" &&
                            el.offsetParent !== null
                        );
                    if (unfollowBtn) {
                        simulateClick(unfollowBtn);
                    }
                    i++;
                    setTimeout(next, DELAY);
                }, DELAY);
            }

            next();
        });
    }

    // Adds three buttons to the top-right corner
    function addAutomationButtons() {
        // Top-Down Button
        const btn1 = document.createElement('button');
        btn1.textContent = 'FB_Remove Top-Down';
        btn1.style.position = 'fixed';
        btn1.style.top = '20px';
        btn1.style.right = '20px';
        btn1.style.zIndex = 9999;
        btn1.style.background = '#4267B2';
        btn1.style.color = '#fff';
        btn1.style.padding = '10px 20px';
        btn1.style.border = 'none';
        btn1.style.borderRadius = '5px';
        btn1.style.cursor = 'pointer';
        btn1.onclick = autoUnfollowTopDown;
        document.body.appendChild(btn1);

        // Bottom-Up Button
        const btn2 = document.createElement('button');
        btn2.textContent = 'FB_Remove Bottom-Up';
        btn2.style.position = 'fixed';
        btn2.style.top = '60px';
        btn2.style.right = '20px';
        btn2.style.zIndex = 9999;
        btn2.style.background = '#E91E63';
        btn2.style.color = '#fff';
        btn2.style.padding = '10px 20px';
        btn2.style.border = 'none';
        btn2.style.borderRadius = '5px';
        btn2.style.cursor = 'pointer';
        btn2.onclick = autoUnfollowBottomUp;
        document.body.appendChild(btn2);

        // Bottom 100 Button
        const btn3 = document.createElement('button');
        btn3.textContent = 'FB_Remove Bottom 100';
        btn3.style.position = 'fixed';
        btn3.style.top = '100px';
        btn3.style.right = '20px';
        btn3.style.zIndex = 9999;
        btn3.style.background = '#4CAF50';
        btn3.style.color = '#fff';
        btn3.style.padding = '10px 20px';
        btn3.style.border = 'none';
        btn3.style.borderRadius = '5px';
        btn3.style.cursor = 'pointer';
        btn3.onclick = autoUnfollowBottom100;
        document.body.appendChild(btn3);
    }

    addAutomationButtons();
})();
