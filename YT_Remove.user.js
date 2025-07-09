// ==UserScript==
// @name         Auto Unsubscribe
// @namespace    http://tampermonkey.net/
// @version      1.9.10
// @description  Automatically unsubscribes from YouTube channels with 2-4s delay, detailed logging
// @author       You
// @match        https://www.youtube.com/feed/channels*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async function() {
    'use strict';
    let clickCount = 0;

    // Add a pause button to the page
    const pauseButton = document.createElement('button');
    pauseButton.textContent = 'Pause Script';
    pauseButton.style.position = 'fixed';
    pauseButton.style.top = '10px';
    pauseButton.style.right = '10px';
    pauseButton.style.zIndex = '1000';
    document.body.appendChild(pauseButton);
    let isPaused = false;

    pauseButton.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseButton.textContent = isPaused ? 'Resume Script' : 'Pause Script';
        console.log(`[${new Date().toISOString()}] Script is now ${isPaused ? 'paused' : 'resumed'}`);
    });

    // Log all elements once at the start
    const allElements = document.querySelectorAll('a, button, span');
    console.log(`[${new Date().toISOString()}] Initial element texts:`, Array.from(allElements).map(el => ({
        text: el.textContent?.trim() || 'No text',
        tag: el.tagName,
        id: el.id || 'No ID',
        class: el.className || 'No class'
    })));

    async function autoUnsub() {
        while (true) {
            if (isPaused) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second while paused
                continue;
            }

            const unsubButtons = document.querySelectorAll('a, button, span');
            let found = false;
            for (const element of unsubButtons) {
                const text = element.textContent?.trim();
                console.log(`[${new Date().toISOString()}] Checking element: ${text} (Tag: ${element.tagName}, ID: ${element.id}, Class: ${element.className})`);
                if (text && (text.startsWith('Unsub:') || text.startsWith('Unsubscribe:'))) {
                    console.log(`[${new Date().toISOString()}] Attempting to click element with text: ${text}`);
                    element.click();
                    clickCount++; // Increment count for each successful click
                    console.log(`[${new Date().toISOString()}] Unsubscribed: Count updated to ${clickCount} channels`);
                    found = true;
                    const clickDelay = 2000 + Math.random() * 2000; // Random delay between 2s and 4s
                    console.log(`[${new Date().toISOString()}] Waiting ${clickDelay / 1000} seconds before next click...`);
                    await new Promise(resolve => setTimeout(resolve, clickDelay));
                }
            }
            if (!found) {
                console.log(`[${new Date().toISOString()}] No Unsub or Unsubscribe buttons found. Waiting 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds and check again
            }
            console.log(`[${new Date().toISOString()}] Current count check: clickCount = ${clickCount}`);
            if (clickCount >= 5) {
                console.log(`[${new Date().toISOString()}] Reached 5 unsubscribes. Reloading page in 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 1800000)); // 5-second delay before reload
                location.reload(); // Reload the page
                await new Promise(resolve => setTimeout(resolve, 15000)); // 15-second delay after reload
                clickCount = 0; // Reset count after reload
            }
        }
    }

    // Start the function when the script runs
    autoUnsub().catch(err => console.error(`[${new Date().toISOString()}] Error: ${err.message}`));
})();
