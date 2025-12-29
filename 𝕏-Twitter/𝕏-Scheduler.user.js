// ==UserScript==
// @name         X Post Scheduler UI
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  UI for scheduling X posts.
// @author       YanaHeat
// @match        https://x.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // Define defaults
    const defaults = {
        startDate: new Date().toISOString().split('T')[0],
        startTime: '23:59',
        intervalHours: 2,
        intervalMins: 0,
        messages: [
            "Can I get a GM? 💕",
            "Good morning legend 🌞",
            "Good morning beautiful 😍",
            "Can I get a GA? 💕",
            "Good evening love 😘",
            "Can I get a GE? 😊",
            "Good night 🌊",
            "Can I get a GN? 💫"
        ]
    };

    // Function to wait for element
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

    // Function to inject text like in the bot
    async function injectText(editor, text) {
      if (typeof text !== 'string' || !text.trim()) return false;
      if (!editor) return false;

      editor.focus();

      // Clear existing content
      let tries = 0;
      while (editor.textContent.trim() && tries < 3) {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        await new Promise(r => setTimeout(r, 150));
        tries++;
      }

      // Insert text
      document.execCommand('insertText', false, text);

      // Wait and check
      await new Promise(r => setTimeout(r, 600));
      const inserted = editor.textContent.includes(text.slice(0, Math.min(3, text.length)));

      // Dispatch events
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      editor.dispatchEvent(new Event('keydown', { bubbles: true }));
      editor.dispatchEvent(new Event('keyup', { bubbles: true }));

      editor.blur();

      return inserted;
    }

    // Function to close any open modal
    async function closeModal() {
      try {
        const closeButton = document.querySelector('[data-testid="app-bar-close"]');
        if (closeButton) {
          closeButton.click();
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e) {
        console.error('Error closing modal:', e);
      }
    }

    // Function to compute schedule times based on start and interval
    function computeScheduleTimes(startDateStr, startTimeStr, intervalHours, intervalMins, numPosts) {
      if (!startDateStr || !startTimeStr || numPosts === 0) return [];
      let start = new Date(`${startDateStr}T${startTimeStr}:00`);
      if (isNaN(start.getTime())) return [];

      const now = new Date();
      const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
      if (start.getTime() < now.getTime() + bufferMs) {
        start.setDate(start.getDate() + 1);
      }

      const intervalMs = (intervalHours * 60 + intervalMins) * 60 * 1000;
      const times = [];
      for (let i = 0; i < numPosts; i++) {
        const t = new Date(start.getTime() + i * intervalMs);
        times.push(t);
      }
      return times;
    }

    // Function to schedule a post at a given time with text
    async function schedulePost(targetTime, text) {
      try {
        await closeModal();

        // Click New Post
        const newPostButton = await waitForElement('[data-testid="SideNav_NewTweet_Button"]');
        newPostButton.click();

        await new Promise(r => setTimeout(r, 1000));

        // Click Schedule
        const scheduleOption = await waitForElement('[data-testid="scheduleOption"]');
        scheduleOption.click();

        await new Promise(r => setTimeout(r, 1000));

        // Set date/time
        const year = targetTime.getFullYear().toString();
        const month = (targetTime.getMonth() + 1).toString();
        const day = targetTime.getDate().toString();
        let hour = targetTime.getHours();
        const ampm = hour < 12 ? 'am' : 'pm';
        hour = hour % 12;
        if (hour === 0) hour = 12;
        hour = hour.toString();
        const minute = targetTime.getMinutes().toString().padStart(2, '0');

        // Set hidden date input
        const dateInput = await waitForElement('input[type="date"]');
        dateInput.value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 500));

        // Set selects
        const dateGroup = await waitForElement('[aria-label="Date"]');
        const dateSelects = dateGroup.querySelectorAll('select');

        if (dateSelects.length === 3) {
          // Set year first
          dateSelects[2].value = year;
          dateSelects[2].dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));

          // Set month
          dateSelects[0].value = month;
          dateSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));

          // Set day
          dateSelects[1].value = day;
          dateSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));
        }

        await new Promise(r => setTimeout(r, 500)); // Additional delay after date

        const timeGroup = await waitForElement('[aria-label="Time"]');
        const timeSelects = timeGroup.querySelectorAll('select');

        if (timeSelects.length === 3) {
          // Set hour
          timeSelects[0].value = hour;
          timeSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));

          // Set minute with pad
          timeSelects[1].value = minute;
          timeSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));

          // Set AM/PM
          timeSelects[2].value = ampm;
          timeSelects[2].dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));
        }

        // Click Confirm
        const confirmButton = await waitForElement('[data-testid="scheduledConfirmationPrimaryAction"]:not([disabled])');
        confirmButton.click();

        await new Promise(r => setTimeout(r, 1000));

        // Now inject text
        const editor = await waitForElement('[data-testid="tweetTextarea_0"]');
        const success = await injectText(editor, text);
        if (!success) {
          console.log('Failed to insert text for:', text);
          await closeModal();
          return false;
        }

        await new Promise(r => setTimeout(r, 500));

        // Click Schedule
        const scheduleButton = await waitForElement('[data-testid="tweetButton"]:not([disabled])');
        scheduleButton.click();

        await new Promise(r => setTimeout(r, 1000));

        return true;
      } catch (e) {
        console.error('Error scheduling post:', e);
        await closeModal();
        return false;
      }
    }

    // Load settings from storage
    let startDate = GM_getValue('startDate', defaults.startDate);
    let startTime = GM_getValue('startTime', defaults.startTime);
    let intervalHours = GM_getValue('intervalHours', defaults.intervalHours);
    let intervalMins = GM_getValue('intervalMins', defaults.intervalMins);
    let messages = GM_getValue('messages', defaults.messages);

    // Function to save to storage
    function saveSettings() {
        GM_setValue('startDate', startDate);
        GM_setValue('startTime', startTime);
        GM_setValue('intervalHours', intervalHours);
        GM_setValue('intervalMins', intervalMins);
        GM_setValue('messages', messages);
    }

    // Create floating UI panel
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
        <h3 style="margin-top:0; color:#212529;">X Post Scheduler</h3>
        <label style="display:block; margin-bottom:10px;">Start Date: <input type="date" id="startDate" value="${startDate}" style="padding:5px; border:1px solid #ced4da; border-radius:4px;"></label>
        <label style="display:block; margin-bottom:10px;">Start Time: <input type="time" id="startTime" value="${startTime}" style="padding:5px; border:1px solid #ced4da; border-radius:4px;"></label>
        <label style="display:block; margin-bottom:10px;">Interval: <input type="number" id="intervalHours" value="${intervalHours}" min="0" style="width:60px; padding:5px; border:1px solid #ced4da; border-radius:4px;"> hours
        <input type="number" id="intervalMins" value="${intervalMins}" min="0" max="59" style="width:60px; padding:5px; border:1px solid #ced4da; border-radius:4px;"> mins</label>
        <textarea id="newMsg" placeholder="Add new message" style="width:100%; height:60px; padding:8px; border:1px solid #ced4da; border-radius:4px; margin-bottom:10px;"></textarea>
        <button id="addMsgBtn" style="padding:6px 12px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;">Add Message</button>
        <button id="resetDefaultsBtn" style="padding:6px 12px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:10px;">Reset to Defaults</button>
        <div id="msgList" style="margin-top:15px;"></div>
        <button id="previewSlotsBtn" style="padding:6px 12px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer; margin-top:10px;">Preview Schedules</button>
        <div id="slotsTable" style="margin-top:15px;"></div>
        <button id="scheduleAllBtn" style="padding:6px 12px; background:#ffc107; color:#212529; border:none; border-radius:4px; cursor:pointer; margin-top:10px;">Schedule All</button>
        <div id="logArea" style="margin-top:15px; border-top:1px solid #dee2e6; padding-top:10px; max-height:250px; overflow-y:auto; background:#e9ecef; padding:10px; border-radius:4px;"></div>
        <button id="closePanel" style="position:absolute; top:5px; right:5px; background:none; border:none; font-size:16px; cursor:pointer; color:#6c757d;">✕</button>
    `;
    document.body.appendChild(panel);

    // Make panel draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    panel.addEventListener('mousedown', (e) => {
        if (e.target.id !== 'closePanel' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
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

    // Update message list
    function updateMsgList() {
        const listDiv = document.getElementById('msgList');
        listDiv.innerHTML = '<h4 style="margin:0 0 5px; color:#495057;">Messages:</h4><ul style="list-style:none; padding:0;">' +
            messages.map((msg, i) => `<li style="margin-bottom:5px; background:#fff; padding:8px; border:1px solid #dee2e6; border-radius:4px; display:flex; justify-content:space-between; align-items:center;"><span>${msg}</span><button data-idx="${i}" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Remove</button></li>`).join('') + '</ul>';
        listDiv.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                messages.splice(idx, 1);
                saveSettings();
                updateMsgList();
            });
        });
    }
    updateMsgList();

    // Add new message
    document.getElementById('addMsgBtn').addEventListener('click', () => {
        const newMsg = document.getElementById('newMsg').value.trim();
        if (newMsg) {
            messages.push(newMsg);
            saveSettings();
            updateMsgList();
            document.getElementById('newMsg').value = '';
        }
    });

    // Reset to defaults
    document.getElementById('resetDefaultsBtn').addEventListener('click', () => {
        ['startDate', 'startTime', 'intervalHours', 'intervalMins', 'messages'].forEach(key => GM_deleteValue(key));
        location.reload();
    });

    // Update start date on change
    document.getElementById('startDate').addEventListener('change', () => {
        startDate = document.getElementById('startDate').value;
        saveSettings();
    });

    // Update start time on change
    document.getElementById('startTime').addEventListener('change', () => {
        startTime = document.getElementById('startTime').value;
        saveSettings();
    });

    // Update interval hours on change
    document.getElementById('intervalHours').addEventListener('change', () => {
        intervalHours = parseInt(document.getElementById('intervalHours').value) || 0;
        saveSettings();
    });

    // Update interval mins on change
    document.getElementById('intervalMins').addEventListener('change', () => {
        intervalMins = parseInt(document.getElementById('intervalMins').value) || 0;
        if (intervalMins > 59) intervalMins = 59;
        document.getElementById('intervalMins').value = intervalMins;
        saveSettings();
    });

    // Preview schedules
    document.getElementById('previewSlotsBtn').addEventListener('click', () => {
        const times = computeScheduleTimes(startDate, startTime, intervalHours, intervalMins, messages.length);
        const tableDiv = document.getElementById('slotsTable');
        tableDiv.innerHTML = '<h4 style="margin:0 0 5px; color:#495057;">Scheduled Slots:</h4><table style="width:100%; border-collapse:collapse;"><tr><th style="border:1px solid #dee2e6; padding:8px; background:#e9ecef;">Time</th><th style="border:1px solid #dee2e6; padding:8px; background:#e9ecef;">Message</th></tr>' +
            times.map((t, i) => `<tr><td style="border:1px solid #dee2e6; padding:8px;">${t.toLocaleString()}</td><td style="border:1px solid #dee2e6; padding:8px;">${messages[i]}</td></tr>`).join('') + '</table>';
    });

    // Schedule all with log
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
            await new Promise(r => setTimeout(r, 2000));
        }
        logArea.scrollTop = logArea.scrollHeight;
    });

    // Close panel
    document.getElementById('closePanel').addEventListener('click', () => {
        panel.style.display = 'none';
    });

})();
