// ==UserScript==
// @name         𝕏-Scheduler
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  UI for scheduling X posts with per-account emoji configs.
// @author       YanaHeat
// @match        https://x.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==

(async function() {
    'use strict';

    async function wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async function waitForProfileLink() {
        while (true) {
            const link = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
            if (link) return link;
            await wait(200);
        }
    }

    const profileLink = await waitForProfileLink();
    let href = profileLink.getAttribute('href') || '';
    href = href.replace(/^\/+/, '').replace(/\/+$/, '');
    if (href.startsWith('@')) href = href.slice(1);
    const currentUsername = href;

    const storagePrefix = currentUsername ? `xSched_${currentUsername}_` : 'xSched_anon_';

    const accountConfigs = {
        'YanaHeat': {
            closers: ["everyone", "Builders", "Peeps", "Legend", "Family", "Fam", "Frens", "Fren", "Friends", "Friend"],
            morningEmojis: ["💕", "❤", "🖌️", "🦁", "🙏"],
            afternoonEmojis: ["🔥", "🚀", "🪭", "💰", "💬"],
            eveningNightEmojis: ["🐐", "🕔", "🌙", "💎", "👽", "🥷", "🍆", "🫟", "💸", "💵"],
            timezoneOffset: 0
        },
        'YanaSn0w1': {
            closers: ["Babe", "Hun", "Darling", "Fren"],
            morningEmojis: ["🌹", "😽", "🎨"],
            afternoonEmojis: ["⚡", "🌈", "🌪️"],
            eveningNightEmojis: ["🕸️", "🥰", "⭐", "🤍", "🛡️", "🦁"],
            timezoneOffset: 0
        },
        'YenaFan01': {
            closers: ["bro", "yo", "y'all", "Peeps"],
            morningEmojis: ["🫶🏻", "🍑", "🌮"],
            afternoonEmojis: ["🌻", "💦", "🐪"],
            eveningNightEmojis: ["🌆", "✨", "🍸", "🎇", "🌊", "🌜"],
            timezoneOffset: +2
        },
        'YanaFan02': {
            closers: ["everyone", "champs", "mates", "Builders"],
            morningEmojis: ["⚔️", "😊", "🌐"],
            afternoonEmojis: ["🤔", "🎉", "💬"],
            eveningNightEmojis: ["💜", "🙏", "🏆", "🫡", "⏳", "🌒"],
            timezoneOffset: 0
        },
        'YanaFan03': {
            closers: ["friends", "champ", "mate", "Buddies", "Legends"],
            morningEmojis: ["🌅", "🌞", "😘"],
            afternoonEmojis: ["😍", "❤️", "🌅"],
            eveningNightEmojis: ["🌆", "🌉", "🌙", "❣️", "🌃", "✨"],
            timezoneOffset: -5
        }
        // Add more accounts here as needed:
        // 'SomeOtherAccount': { closers: [...], morningEmojis: [...], afternoonEmojis: [...], eveningNightEmojis: [...], timezoneOffset: -3 }
    };

    function getAccountConfig(username) {
        if (!username) return {};
        const unameNorm = username.toLowerCase();
        for (const key of Object.keys(accountConfigs)) {
            if (key.toLowerCase() === unameNorm) return accountConfigs[key];
        }
        return {};
    }

    const defaults = {
        startDate: new Date().toISOString().split('T')[0],
        startTime: '23:59',
        intervalHours: 2,
        intervalMins: 0,
        gmGreetings: ["Good morning", "GM", "Can I get a GM?"],
        gaGreetings: ["Good afternoon", "GA", "Can I get a GA?"],
        geGreetings: ["Good evening", "GE", "Can I get a GE?"],
        gnGreetings: ["Good night", "GN", "Can I get a GN?"],
        closers: [
            "fam", "legend", "babe", "everyone", "friends",
            "crew", "squad", "darling", "champ", "baby",
            "unc", "bro", "mate", "hun", "dear"
        ],
        morningEmojis: ["🌹", "😽", "☕", "🌅", "😊", "🌻", "✨"],
        afternoonEmojis: ["⚡", "💖", "🚀", "🌈", "🥳", "🔥", "🍀"],
        eveningNightEmojis: ["🕸️", "🥰", "⭐", "🤍", "🌙", "😘", "💫"],
        maxEmojis: 1,
        messages: []
    };

    const resolvedConfig = getAccountConfig(currentUsername);
    const closers = resolvedConfig.closers || defaults.closers;
    const morningEmojis = resolvedConfig.morningEmojis || defaults.morningEmojis;
    const afternoonEmojis = resolvedConfig.afternoonEmojis || defaults.afternoonEmojis;
    const eveningNightEmojis = resolvedConfig.eveningNightEmojis || defaults.eveningNightEmojis;
    const timezoneOffset = resolvedConfig.timezoneOffset || 0;

    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const interval = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(interval);
                    resolve(el);
                } else if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    reject(`Timeout waiting for ${selector}`);
                }
            }, 100);
        });
    }

    async function injectText(editor, text) {
        if (typeof text !== 'string' || !text.trim()) return false;
        if (!editor) return false;

        editor.focus();

        let tries = 0;
        while (editor.textContent.trim() && tries < 3) {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            await wait(150);
            tries++;
        }

        document.execCommand('insertText', false, text);

        await wait(600);
        const inserted = editor.textContent.includes(text.slice(0, Math.min(3, text.length)));

        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        editor.dispatchEvent(new Event('keydown', { bubbles: true }));
        editor.dispatchEvent(new Event('keyup', { bubbles: true }));

        editor.blur();

        return inserted;
    }

    async function closeModal() {
        try {
            const closeButton = document.querySelector('[data-testid="app-bar-close"]');
            if (closeButton) {
                closeButton.click();
                await wait(500);
            }
        } catch (e) {
            console.error('Error closing modal:', e);
        }
    }

    function computeScheduleTimes(startDateStr, startTimeStr, intervalHours, intervalMins, numPosts) {
        if (!startDateStr || !startTimeStr || numPosts === 0) return [];
        let start = new Date(`${startDateStr}T${startTimeStr}:00`);
        if (isNaN(start.getTime())) return [];

        // Apply timezone offset to the start time
        start.setTime(start.getTime() + timezoneOffset * 60 * 60 * 1000);

        const now = new Date();
        const bufferMs = 10 * 60 * 1000; // 10 minutes buffer
        // If the adjusted start is in the past, bump the entire schedule by 24 hours
        if (start.getTime() < now.getTime() + bufferMs) {
            start.setTime(start.getTime() + 24 * 60 * 60 * 1000);
        }

        const intervalMs = (intervalHours * 60 + intervalMins) * 60 * 1000;
        const times = [];
        for (let i = 0; i < numPosts; i++) {
            const t = new Date(start.getTime() + i * intervalMs);
            times.push(t);
        }
        return times;
    }

    async function schedulePost(targetTime, text) {
        try {
            await closeModal();

            const newPostButton = await waitForElement('[data-testid="SideNav_NewTweet_Button"], [data-testid="SideNav_NewPost_Button"]');
            newPostButton.click();

            await wait(1000);

            const scheduleOption = await waitForElement('[data-testid="scheduleOption"]');
            scheduleOption.click();

            await wait(1000);

            const year = targetTime.getFullYear().toString();
            const month = (targetTime.getMonth() + 1).toString();
            const day = targetTime.getDate().toString();
            let hour = targetTime.getHours();
            const ampm = hour < 12 ? 'am' : 'pm';
            hour = hour % 12;
            if (hour === 0) hour = 12;
            hour = hour.toString();
            const minute = targetTime.getMinutes().toString().padStart(2, '0');

            const dateInput = await waitForElement('input[type="date"]');
            dateInput.value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));

            await wait(500);

            const dateGroup = await waitForElement('[aria-label="Date"]');
            const dateSelects = dateGroup.querySelectorAll('select');

            if (dateSelects.length === 3) {
                dateSelects[2].value = year;
                dateSelects[2].dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);

                dateSelects[0].value = month;
                dateSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);

                dateSelects[1].value = day;
                dateSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);
            }

            await wait(500);

            const timeGroup = await waitForElement('[aria-label="Time"]');
            const timeSelects = timeGroup.querySelectorAll('select');

            if (timeSelects.length === 3) {
                timeSelects[0].value = hour;
                timeSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);

                timeSelects[1].value = minute;
                timeSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);

                timeSelects[2].value = ampm;
                timeSelects[2].dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);
            }

            const confirmButton = await waitForElement('[data-testid="scheduledConfirmationPrimaryAction"]:not([disabled])');
            confirmButton.click();

            await wait(1000);

            const editor = await waitForElement('[data-testid="tweetTextarea_0"]');
            const success = await injectText(editor, text);
            if (!success) {
                console.log('Failed to insert text for:', text);
                await closeModal();
                return false;
            }

            await wait(500);

            const scheduleButton = await waitForElement('[data-testid="tweetButton"]:not([disabled])');
            scheduleButton.click();

            await wait(1000);

            return true;
        } catch (e) {
            console.error('Error scheduling post:', e);
            await closeModal();
            return false;
        }
    }

    function generateRandomMessages() {
        const groups = [
            {greetings: defaults.gmGreetings, emojiPool: morningEmojis, count: 2},
            {greetings: defaults.gaGreetings, emojiPool: afternoonEmojis, count: 2},
            {greetings: defaults.geGreetings, emojiPool: eveningNightEmojis, count: 2},
            {greetings: defaults.gnGreetings, emojiPool: eveningNightEmojis, count: 2}
        ];
        const messagesLocal = [];
        groups.forEach(group => {
            let usedGreetings = [];
            for (let i = 0; i < group.count; i++) {
                let greeting;
                do {
                    greeting = group.greetings[Math.floor(Math.random() * group.greetings.length)];
                } while (usedGreetings.includes(greeting) && usedGreetings.length < group.greetings.length);

                usedGreetings.push(greeting);
                const addCloser = !greeting.startsWith("Can I get a");
                let closer = '';
                if (addCloser) {
                    closer = closers[Math.floor(Math.random() * closers.length)];
                }
                let numEmojis;
                if (maxEmojis === 'random') {
                    numEmojis = Math.random() < 0.3 ? 0 : (Math.random() < 0.7 ? 1 : 2);
                } else {
                    numEmojis = maxEmojis;
                }
                let emojisStr = '';
                for (let j = 0; j < numEmojis; j++) {
                    const emoji = group.emojiPool[Math.floor(Math.random() * group.emojiPool.length)];
                    emojisStr += emoji;
                }
                const message = addCloser
                    ? `${greeting} ${closer}${emojisStr ? ' ' + emojisStr : ''}`
                    : `${greeting}${emojisStr ? ' ' + emojisStr : ''}`;
                messagesLocal.push(message);
            }
        });
        return messagesLocal;
    }

    let startDate = GM_getValue(storagePrefix + 'startDate', defaults.startDate);
    let startTime = GM_getValue(storagePrefix + 'startTime', defaults.startTime);
    let intervalHours = GM_getValue(storagePrefix + 'intervalHours', defaults.intervalHours);
    let intervalMins = GM_getValue(storagePrefix + 'intervalMins', defaults.intervalMins);
    let maxEmojis = GM_getValue(storagePrefix + 'maxEmojis', defaults.maxEmojis);
    if (maxEmojis !== 'random') {
        maxEmojis = Number(maxEmojis) || 0;
    }
    let messages = GM_getValue(storagePrefix + 'messages', defaults.messages);

    if (!Array.isArray(messages) || messages.length === 0) {
        messages = generateRandomMessages();
        GM_setValue(storagePrefix + 'messages', messages);
    }

    function saveSettings() {
        GM_setValue(storagePrefix + 'startDate', startDate);
        GM_setValue(storagePrefix + 'startTime', startTime);
        GM_setValue(storagePrefix + 'intervalHours', intervalHours);
        GM_setValue(storagePrefix + 'intervalMins', intervalMins);
        GM_setValue(storagePrefix + 'maxEmojis', maxEmojis);
        GM_setValue(storagePrefix + 'messages', messages);
    }

    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.top = '10px';
    panel.style.right = '10px';
    panel.style.width = '350px';
    panel.style.padding = '15px';
    panel.style.background = '#f8f9fa';
    panel.style.border = '1px solid #dee2e6';
    panel.style.zIndex = '9999';
    panel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    panel.style.overflowY = 'auto';
    panel.style.maxHeight = '85vh';
    panel.style.borderRadius = '8px';
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.innerHTML = `
        <h3 style="margin-top:0; color:#212529;">X Post Scheduler ${currentUsername ? '(' + currentUsername + ')' : ''}</h3>
        <label style="display:block; margin-bottom:10px;">Start Date:
            <input type="date" id="startDate" value="${startDate}" style="padding:5px; border:1px solid #ced4da; border-radius:4px;">
        </label>
        <label style="display:block; margin-bottom:10px;">Start Time:
            <input type="time" id="startTime" value="${startTime}" style="padding:5px; border:1px solid #ced4da; border-radius:4px;">
        </label>
        <label style="display:block; margin-bottom:10px;">Interval:
            <input type="number" id="intervalHours" value="${intervalHours}" min="0" style="width:60px; padding:5px; border:1px solid #ced4da; border-radius:4px;"> hours
            <input type="number" id="intervalMins" value="${intervalMins}" min="0" max="59" style="width:60px; padding:5px; border:1px solid #ced4da; border-radius:4px;"> mins
        </label>
        <label style="display:block; margin-bottom:10px;">Emojis per Message:
            <select id="maxEmojis" style="padding:5px; border:1px solid #ced4da; border-radius:4px;">
                <option value="0" ${String(maxEmojis) === '0' ? 'selected' : ''}>0</option>
                <option value="1" ${String(maxEmojis) === '1' ? 'selected' : ''}>1</option>
                <option value="2" ${String(maxEmojis) === '2' ? 'selected' : ''}>2</option>
                <option value="random" ${maxEmojis === 'random' ? 'selected' : ''}>Random (0-2)</option>
            </select>
        </label>
        <textarea id="newMsg" placeholder="Add new message" style="width:100%; height:60px; padding:8px; border:1px solid #ced4da; border-radius:4px; margin-bottom:10px;"></textarea>
        <button id="addMsgBtn" style="padding:6px 12px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;">Add Message</button>
        <button id="generateRandomBtn" style="padding:6px 12px; background:#17a2b8; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:10px;">Generate Random Messages</button>
        <button id="resetDefaultsBtn" style="padding:6px 12px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:10px;">Reset Account Data</button>
        <div id="msgList" style="margin-top:15px;"></div>
        <button id="previewSlotsBtn" style="padding:6px 12px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer; margin-top:10px;">Preview Schedules</button>
        <div id="slotsTable" style="margin-top:15px;"></div>
        <button id="scheduleAllBtn" style="padding:6px 12px; background:#ffc107; color:#212529; border:none; border-radius:4px; cursor:pointer; margin-top:10px;">Schedule All</button>
        <div id="logArea" style="margin-top:15px; border-top:1px solid #dee2e6; padding-top:10px; max-height:250px; overflow-y:auto; background:#e9ecef; padding:10px; border-radius:4px;"></div>
        <button id="closePanel" style="position:absolute; top:5px; right:5px; background:none; border:none; font-size:16px; cursor:pointer; color:#6c757d;">✕</button>
    `;
    document.body.appendChild(panel);

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    panel.addEventListener('mousedown', (e) => {
        if (e.target.id !== 'closePanel' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
            isDragging = true;
            initialX = e.clientX - panel.getBoundingClientRect().left;
            initialY = e.clientY - panel.getBoundingClientRect().top;
            panel.style.cursor = 'grabbing';
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            panel.style.left = `${currentX}px`;
            panel.style.top = `${currentY}px`;
            panel.style.right = 'auto';
        }
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.cursor = 'default';
    });

    function updateMsgList() {
        const listDiv = document.getElementById('msgList');
        listDiv.innerHTML = '<h4 style="margin:0 0 5px; color:#495057;">Messages:</h4><ul style="list-style:none; padding:0;">' +
            messages.map((msg, i) => `<li style="margin-bottom:5px; background:#fff; padding:8px; border:1px solid #dee2e6; border-radius:4px; display:flex; justify-content:space-between; align-items:center;"><span>${msg}</span><button data-idx="${i}" class="editBtn" style="background:#ffc107; color:#212529; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Edit</button><button data-idx="${i}" class="removeBtn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Remove</button></li>`).join('') + '</ul>';
        listDiv.querySelectorAll('.removeBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                messages.splice(idx, 1);
                saveSettings();
                updateMsgList();
            });
        });
        listDiv.querySelectorAll('.editBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const li = btn.parentNode;
                const msg = messages[idx];
                li.innerHTML = `<textarea style="flex:1; padding:5px; border:1px solid #ced4da; border-radius:4px; margin-right:5px;">${msg}</textarea><button class="saveBtn" style="background:#28a745; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Save</button><button class="cancelBtn" style="background:#6c757d; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Cancel</button>`;
                li.querySelector('.saveBtn').addEventListener('click', () => {
                    const newMsg = li.querySelector('textarea').value.trim();
                    if (newMsg) {
                        messages[idx] = newMsg;
                        saveSettings();
                    }
                    updateMsgList();
                });
                li.querySelector('.cancelBtn').addEventListener('click', () => {
                    updateMsgList();
                });
            });
        });
    }
    updateMsgList();

    document.getElementById('addMsgBtn').addEventListener('click', () => {
        const newMsg = document.getElementById('newMsg').value.trim();
        if (newMsg) {
            messages.push(newMsg);
            saveSettings();
            updateMsgList();
            document.getElementById('newMsg').value = '';
        }
    });

    document.getElementById('generateRandomBtn').addEventListener('click', () => {
        messages = generateRandomMessages();
        saveSettings();
        updateMsgList();
    });

    document.getElementById('resetDefaultsBtn').addEventListener('click', () => {
        ['startDate', 'startTime', 'intervalHours', 'intervalMins', 'maxEmojis', 'messages'].forEach(key => {
            GM_deleteValue(storagePrefix + key);
        });
        location.reload();
    });

    document.getElementById('startDate').addEventListener('change', () => {
        startDate = document.getElementById('startDate').value;
        saveSettings();
    });

    document.getElementById('startTime').addEventListener('change', () => {
        startTime = document.getElementById('startTime').value;
        saveSettings();
    });

    document.getElementById('intervalHours').addEventListener('change', () => {
        intervalHours = parseInt(document.getElementById('intervalHours').value, 10) || 0;
        saveSettings();
    });

    document.getElementById('intervalMins').addEventListener('change', () => {
        intervalMins = parseInt(document.getElementById('intervalMins').value, 10) || 0;
        if (intervalMins > 59) intervalMins = 59;
        document.getElementById('intervalMins').value = intervalMins;
        saveSettings();
    });

    document.getElementById('maxEmojis').addEventListener('change', () => {
        const value = document.getElementById('maxEmojis').value;
        maxEmojis = value === 'random' ? 'random' : parseInt(value, 10) || 0;
        saveSettings();
    });

    document.getElementById('previewSlotsBtn').addEventListener('click', () => {
        const times = computeScheduleTimes(startDate, startTime, intervalHours, intervalMins, messages.length);
        const tableDiv = document.getElementById('slotsTable');
        tableDiv.innerHTML = '<h4 style="margin:0 0 5px; color:#495057;">Scheduled Slots:</h4><table style="width:100%; border-collapse:collapse;"><tr><th style="border:1px solid #dee2e6; padding:8px; background:#e9ecef;">Time</th><th style="border:1px solid #dee2e6; padding:8px; background:#e9ecef;">Message</th></tr>' +
            times.map((t, i) => `<tr><td style="border:1px solid #dee2e6; padding:8px;">${t.toLocaleString()}</td><td style="border:1px solid #dee2e6; padding:8px;">${messages[i]}</td></tr>`).join('') + '</table>';
    });

    document.getElementById('scheduleAllBtn').addEventListener('click', async () => {
        const logArea = document.getElementById('logArea');
        logArea.innerHTML = 'Scheduling...<br>';
        const times = computeScheduleTimes(startDate, startTime, intervalHours, intervalMins, messages.length);
        for (let i = 0; i < messages.length; i++) {
            const targetTime = times[i];
            const text = messages[i];
            logArea.innerHTML += `Scheduling at ${targetTime.toLocaleString()}: "${text}"<br>`;
            const success = await schedulePost(targetTime, text);
            logArea.innerHTML += success ? '<span style="color:green;">Success</span><br>' : '<span style="color:red;">Failed</span><br>';
            await wait(2000);
        }
        logArea.scrollTop = logArea.scrollHeight;
    });

    document.getElementById('closePanel').addEventListener('click', () => {
        panel.style.display = 'none';
    });

})();
