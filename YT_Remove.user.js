// ==UserScript==
// @name         Auto Unsubscribe
// @namespace    http://tampermonkey.net/
// @version      1.9.2
// @description  Automatically unsubscribes from YouTube channels with 1-click extension, 3-6s delay, reloads after 5
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
        console.log(`Script is now ${isPaused ? 'paused' : 'resumed'}`);
    });

    // Log all elements once at the start
    const allElements = document.querySelectorAll('a, button, span');
    console.log('Initial element texts:', Array.from(allElements).map(el => ({
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
                console.log(`Checking element: ${text} (Tag: ${element.tagName}, ID: ${element.id}, Class: ${element.className})`);
                if (text && (text.startsWith('Unsub:') || text.startsWith('Unsubscribe:'))) {
                    element.click(); // One-click unsubscribe
                    clickCount++; // Increment for each successful click
                    console.log(`Unsubscribed: Count updated to ${clickCount} channels`);
                    found = true;
                    const clickDelay = 3000 + Math.random() * 3000; // Random delay between 3s and 6s
                    await new Promise(resolve => setTimeout(resolve, clickDelay));
                }
            }
            if (!found) {
                console.log('No Unsub or Unsubscribe buttons found. Waiting 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds and check again
            }
            console.log(`Current count check: clickCount = ${clickCount}`);
            if (clickCount >= 5) {
                console.log('Reached 5 unsubscribes. Reloading page in 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay before reload
                location.reload(); // Reload the page
                await new Promise(resolve => setTimeout(resolve, 15000)); // 15-second delay after reload
                clickCount = 0; // Reset count after reload
            }
        }
    }

    // Start the function when the script runs
    autoUnsub().catch(err => console.error('Error:', err));
})();
