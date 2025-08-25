// ==UserScript==
// @name         Threads Unfollower
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Automatically unfollow accounts on Threads with a clean UI, loads on profile page
// @author       Grok
// @match        https://www.threads.com/@*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let ui = null;
    let startBtn, stopBtn, statusText, countSpan, mRetryInput, dPauseInput, dPauseUnitSpan;
    let unfollowedCount = 0;
    let scrollAttempts = 0;
    let isRunning = false;
    let isPaused = false;
    let timeoutId = null;
    const maxScrollAttempts = 10;
    const maxUnfollows = 300;
    let mRetry = 0;
    let dPause = 10;
    let dPauseUnit = 'Seconds';
    let lastDPauseValue = 10;
    let lastFailedUsername = null;
    let lastFailedButton = null;
    const whitelist = ['yourbestie', 'yanaheat', 'yanasn0w1'];

    function createUI() {
        if (ui) return; // UI already exists
        ui = document.createElement('div');
        ui.id = 'unfollower-ui';
        ui.style.position = 'fixed';
        ui.style.top = '10px';
        ui.style.right = '10px';
        ui.style.zIndex = '1000';
        ui.style.background = '#fff';
        ui.style.padding = '8px';
        ui.style.border = '1px solid #ccc';
        ui.style.borderRadius = '5px';
        ui.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        ui.style.textAlign = 'center';
        ui.innerHTML = `
            <div style="margin-bottom: 5px;">
                <button id="startBtn" style="margin-right: 5px; width: 60px;">Start</button>
                <button id="stopBtn" style="width: 60px;">Stop</button>
            </div>
            <div style="margin-bottom: 5px;"><span id="statusText">Paused</span></div>
            <div style="margin-bottom: 5px;">Unfollowed: <span id="unfollowCount">0</span></div>
            <div style="margin-bottom: 5px;">
                <span style="margin-right: 3px;">Retry</span>
                <input id="mRetry" type="number" min="0" max="20" value="0" style="width: 45px; text-align: center; margin: 0 2px;">
            </div>
            <div>
                <span id="dPauseUnit" style="margin-right: 3px;">Seconds</span>
                <input id="dPause" type="number" min="5" max="59" value="10" step="1" style="width: 45px; text-align: center; margin: 0 2px;">
            </div>
        `;
        document.body.appendChild(ui);

        startBtn = document.getElementById('startBtn');
        stopBtn = document.getElementById('stopBtn');
        statusText = document.getElementById('statusText');
        countSpan = document.getElementById('unfollowCount');
        mRetryInput = document.getElementById('mRetry');
        dPauseInput = document.getElementById('dPause');
        dPauseUnitSpan = document.getElementById('dPauseUnit');

        // Update mRetry
        mRetryInput.addEventListener('input', () => {
            const value = parseInt(mRetryInput.value);
            if (value >= 0 && value <= 20) mRetry = value;
            else mRetryInput.value = mRetry;
        });

        // Update dPause and unit
        dPauseInput.addEventListener('input', () => {
            let value = parseInt(dPauseInput.value) || 0;
            let newUnit = dPauseUnit;

            const isIncrement = value > lastDPauseValue;
            const isDecrement = value < lastDPauseValue;

            if (dPauseUnit === 'Seconds') {
                if (value < 5) {
                    value = 5;
                    dPauseInput.value = value;
                } else if (isIncrement && value >= 59) {
                    newUnit = 'Minutes';
                    value = 1;
                    dPauseInput.min = 1;
                    dPauseInput.max = 59;
                    dPauseUnitSpan.textContent = 'Minutes';
                }
            } else if (dPauseUnit === 'Minutes') {
                if (isIncrement && value >= 59) {
                    newUnit = 'Hours';
                    value = 1;
                    dPauseInput.min = 1;
                    dPauseInput.max = 24;
                    dPauseUnitSpan.textContent = 'Hours';
                } else if (isDecrement && value <= 1) {
                    newUnit = 'Seconds';
                    value = 59;
                    dPauseInput.min = 5;
                    dPauseInput.max = 59;
                    dPauseUnitSpan.textContent = 'Seconds';
                }
            } else if (dPauseUnit === 'Hours') {
                if (value > 24) {
                    value = 24;
                    dPauseInput.value = value;
                } else if (isDecrement && value <= 1) {
                    newUnit = 'Minutes';
                    value = 59;
                    dPauseInput.min = 1;
                    dPauseInput.max = 59;
                    dPauseUnitSpan.textContent = 'Minutes';
                }
            }

            dPause = value;
            dPauseUnit = newUnit;
            dPauseInput.value = value;
            lastDPauseValue = value;
        });

        // Start button
        startBtn.addEventListener('click', () => {
            if (!isRunning && !isPaused) {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = null;
                isRunning = true;
                isPaused = false;
                startBtn.disabled = true;
                stopBtn.disabled = false;
                statusText.textContent = 'Running';
                console.log(`Starting unfollow script for Threads at ${new Date().toLocaleString()}`);
                clickNext();
            }
        });

        // Stop button
        stopBtn.addEventListener('click', () => {
            if (isRunning || isPaused) {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = null;
                isRunning = false;
                isPaused = false;
                startBtn.disabled = false;
                stopBtn.disabled = false;
                statusText.textContent = 'Stopped';
                if (lastFailedUsername) {
                    console.log(`Pause canceled for ${lastFailedUsername}`);
                }
                console.log('Script stopped by user');
                lastFailedUsername = null;
                lastFailedButton = null;
            }
        });
    }

    function getFollowButtons() {
        return Array.from(document.querySelectorAll('div[role="button"].x1i10hfl'))
            .filter(btn => btn.textContent.trim() === 'Following' && btn.querySelector('div.xlyipyv'))
            .map(btn => {
                const parent = btn.closest('div.x78zum5.x1q0g3np');
                const username = parent?.querySelector('a[href^="/@"] span.x1lliihq')?.textContent?.trim().toLowerCase()?.replace('@', '') || `unknown_${unfollowedCount}_${Date.now()}`;
                if (username.startsWith('unknown_')) {
                    console.log(`Debug: No username found. Parent HTML: ${parent?.outerHTML.slice(0, 200) || 'none'}...`);
                }
                return { button: btn, username };
            })
            .filter(item => !whitelist.includes(item.username));
    }

    function scrollToBottom() {
        const currentHeight = document.body.scrollHeight;
        window.scrollTo({ top: currentHeight, behavior: 'smooth' });
        console.log(`Scrolling to height: ${currentHeight}`);
    }

    function clickNext() {
        if (!isRunning || isPaused) return;

        if (unfollowedCount >= maxUnfollows) {
            console.log(`Stopped: Reached daily unfollow limit of ${maxUnfollows}.`);
            isRunning = false;
            isPaused = false;
            startBtn.disabled = false;
            stopBtn.disabled = false;
            statusText.textContent = 'Stopped';
            return;
        }

        let btn, username;
        if (lastFailedUsername && lastFailedButton && lastFailedButton.isConnected && lastFailedButton.textContent.trim() === 'Following' && lastFailedButton.querySelector('div.xlyipyv')) {
            btn = lastFailedButton;
            username = lastFailedUsername;
            console.log(`Retrying "Following" button for ${username}`);
        } else {
            const followButtons = getFollowButtons();
            if (followButtons.length === 0) {
                if (scrollAttempts >= maxScrollAttempts) {
                    console.log(`Finished unfollowing ${unfollowedCount} accounts.`);
                    isRunning = false;
                    isPaused = false;
                    startBtn.disabled = false;
                    stopBtn.disabled = false;
                    statusText.textContent = 'Finished';
                    return;
                }
                scrollToBottom();
                scrollAttempts++;
                console.log(`Scrolling (Attempt ${scrollAttempts}/${maxScrollAttempts})`);
                timeoutId = setTimeout(clickNext, 2000);
                return;
            }
            scrollAttempts = 0;
            ({ button: btn, username } = followButtons[0]);
            lastFailedUsername = null;
            lastFailedButton = null;
        }

        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log(`Clicking "Following" button for ${username}`);
        btn.click();

        timeoutId = setTimeout(() => {
            if (!isRunning || isPaused) return;

            const unfollowBtn = Array.from(document.querySelectorAll('div[role="button"].x1i10hfl'))
                .find(el => el.textContent.trim() === 'Unfollow' && el.querySelector('span.x1lliihq'));

            if (unfollowBtn) {
                unfollowBtn.click();
                timeoutId = setTimeout(() => {
                    if (!isRunning || isPaused) return;

                    const buttonText = btn.textContent.trim();
                    console.log(`Button state for ${username}: "${buttonText}"`);
                    if (buttonText !== 'Following') {
                        unfollowedCount++;
                        lastFailedUsername = null;
                        lastFailedButton = null;
                        console.log(`Unfollowed #${unfollowedCount} (${username})`);
                        countSpan.textContent = unfollowedCount;
                        clickNext();
                    } else {
                        console.warn(`Unfollow failed for ${username} (button still says "Following")`);
                        handleFailure(btn, username);
                    }
                }, 500);
            } else {
                console.warn(`Unfollow button not found for ${username}`);
                handleFailure(btn, username);
            }
        }, 2000);
    }

    function handleFailure(btn, username) {
        lastFailedUsername = username;
        lastFailedButton = btn;
        if (mRetry === 0) {
            const pauseSeconds = dPauseUnit === 'Seconds' ? dPause : dPauseUnit === 'Minutes' ? dPause * 60 : dPause * 3600;
            console.log(`Pausing for ${dPause} ${dPauseUnit} due to unfollow failure for ${username}`);
            isRunning = false;
            isPaused = true;
            startBtn.disabled = false;
            stopBtn.disabled = false;
            statusText.textContent = `Paused ${dPause} ${dPauseUnit}`;
            timeoutId = setTimeout(() => {
                if (!isPaused) {
                    console.log(`Pause canceled for ${username}`);
                    return;
                }
                console.log(`Resuming after ${dPause} ${dPauseUnit} for ${username}`);
                isRunning = true;
                isPaused = false;
                startBtn.disabled = true;
                stopBtn.disabled = false;
                statusText.textContent = 'Running';
                clickNext();
            }, pauseSeconds * 1000);
        } else {
            clickNext();
        }
    }

    // Create UI immediately
    createUI();
    console.log(`Script loaded in paused state on profile page. Navigate to "Following" tab and click "Start" to begin.`);
})();
