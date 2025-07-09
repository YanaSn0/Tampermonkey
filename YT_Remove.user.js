// ==UserScript==
// @name         Auto Unsubscribe
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Automatically unsubscribes from YouTube channels with reload at 50
// @author       You
// @match        https://www.youtube.com/feed/channels*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async function() {
    'use strict';
    let clickCount = 0;

    async function autoUnsub() {
        while (true) {
            const unsubButtons = document.querySelectorAll('a, button, span');
            let found = false;
            for (const element of unsubButtons) {
                if (element.textContent && element.textContent.trim().startsWith('Unsub:')) {
                    element.click();
                    clickCount++;
                    console.log(`Unsubscribed: ${clickCount} channels`);
                    found = true;
                    const delay = 2000 + Math.random() * 2000; // Random delay between 2s and 4s
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            if (!found) {
                const delay = 2000 + Math.random() * 2000; // Random delay between 2s and 4s if no buttons found
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            if (clickCount >= 50) {
                console.log('Reached 50 unsubscribes. Reloading page in 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000)); // 10-second delay before reload
                location.reload(); // Reload the page
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay after reload
                clickCount = 0; // Reset count after reload
            }
        }
    }

    // Start the function when the script runs
    autoUnsub().catch(err => console.error('Error:', err));
})();
