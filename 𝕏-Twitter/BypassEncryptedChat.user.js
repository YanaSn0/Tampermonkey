// ==UserScript==
// @name         Group Scrape
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Bypass encrypted chat and scrape chat data
// @match        https://x.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Bypass part
    const YOUR_GROUP = '/messages/1973126048167632945';  // ← change only if you want a different one

    // Rewrite all envelope links
    const rewriteLinks = () => {
        document.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href === '/messages' || href === '/messages/' || href === '/i/chat') {
                a.setAttribute('href', YOUR_GROUP);
            }
            // Bottom tab + floating button
            if (a.dataset.testid === 'AppTabBar_DirectMessage_Link' || a.dataset.testid === 'floatingMessageButton') {
                a.setAttribute('href', YOUR_GROUP);
            }
        });
    };

    new MutationObserver(rewriteLinks).observe(document, { childList: true, subtree: true });
    rewriteLinks();

    // Simple click interceptor — this is the magic that actually works without crashing
    document.addEventListener('click', e => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href') || '';
        const testid = link.dataset.testid || '';

        if (
            href.includes('/messages') ||
            href === '/i/chat' ||
            testid === 'AppTabBar_DirectMessage_Link' ||
            testid === 'floatingMessageButton' ||
            link.querySelector('svg path[d^="M1.998 5.5"]') // the envelope SVG path you posted earlier
        ) {
            e.preventDefault();
            e.stopPropagation();
            location.href = YOUR_GROUP;  // hard navigation, no React interference
        }
    }, true);

    // Scraper part
    // ===== Utilities =====
    function normalizeAvatarUrl(src) {
        if (!src) return '';
        return src
            .replace(/_normal(\.[a-z0-9]+)$/i, '$1')
            .replace(/_bigger(\.[a-z0-9]+)$/i, '$1')
            .replace(/_mini(\.[a-z0-9]+)$/i, '$1')
            .replace(/\?.*$/, '');
    }

    function stableSort(nodes) {
        return [...nodes].sort((a, b) => {
            const rel = a.compareDocumentPosition(b);
            if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });
    }

    function formatAMPM(raw) {
        if (!raw) return '';
        const m = String(raw).match(/\b(\d{1,2}:\d{2}\s?(AM|PM))\b/i);
        if (m) return m[1];
        try {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) {
                return d.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            }
        } catch {}
        return '';
    }

    function nowTime() {
        const d = new Date();
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    // ===== Rail scrape (left list) =====
    function scrapeRailUsers() {
        const users = {};
        document.querySelectorAll('[data-testid="conversation"]').forEach(convo => {
            const href = convo.querySelector('a[href^="/"]')?.getAttribute('href') || '';
            if (!href.startsWith('/')) return;
            let username = href.slice(1);

            // Find actual username from @handle if present
            const handleEl = [...convo.querySelectorAll('span')].find(s => (s.textContent || '').trim().startsWith('@'));
            if (handleEl) {
                username = handleEl.textContent.trim().slice(1);
            }

            const imgSrc = convo.querySelector('img')?.src || '';
            const avatarUrl = normalizeAvatarUrl(imgSrc);

            const nameEl = convo.querySelector('a[href^="/"] span') ||
                           convo.querySelector('span:not([class*="css-1jxf684 r-9iso6"]):first-child');
            const altName = convo.querySelector('img[alt]')?.getAttribute('alt')?.trim() || '';
            let displayName = (nameEl?.textContent || '').trim() || altName;

            // Clean alt if it's avatar description
            if (displayName.endsWith("'s profile photo")) {
                displayName = displayName.slice(0, -18).trim();
            } else if (displayName.startsWith("Profile photo for ")) {
                displayName = displayName.slice(18).trim();
            } else if (displayName.startsWith("Opens profile photo for ")) {
                displayName = displayName.slice(24).trim();
            } else if (displayName === "Opens profile photo" || displayName === "") {
                displayName = '';
            }

            const timeEl = convo.querySelector('time');
            const rawTs =
                timeEl?.getAttribute('datetime') ||
                timeEl?.getAttribute('dateTime') ||
                timeEl?.getAttribute('aria-label') ||
                (timeEl?.textContent || '').trim() || '';

            const groupTitle = convo.closest('[data-testid="DMGroupConversation"]')
                ?.querySelector('[data-testid="DMGroupConversationTitle"]')?.textContent?.trim() || '';

            users[username] = {
                username,
                avatarUrl,
                displayName,
                timestamp: rawTs,
                group: groupTitle
            };
        });
        return users;
    }

    // ===== Chat Info =====
    function scrapeChatInfo() {
        if (!location.pathname.startsWith('/messages/')) return null;

        const header = document.querySelector('header[role="banner"]') || document.querySelector('header');
        if (!header) return null;

        let title = '';
        let handle = '';
        let bio = '';
        let isGroup = /\/messages\/\d+$/.test(location.pathname);

        if (isGroup) {
            const groupTitleEl = header.querySelector('[data-testid="DMGroupConversationTitle"] span') ||
                                 header.querySelector('h2 span');
            if (groupTitleEl) title = groupTitleEl.textContent.trim();
        } else {
            const nameEl = header.querySelector('h2#detail-header span.r-poiln3');
            if (nameEl) title = nameEl.textContent.trim();

            const handleEl = header.querySelector('[data-testid="DmHeader-handle"]') ||
                             header.querySelector('span[dir="auto"]');
            if (handleEl) handle = handleEl.textContent.trim();
        }

        // For single user bio
        if (!isGroup) {
            const infoButton = header.querySelector('[data-testid="conversationInformationButton"]');
            if (infoButton) {
                infoButton.click();
                setTimeout(() => {
                    const bioEl = document.querySelector('[data-testid="UserDescription"]') ||
                                  document.querySelector('div[data-testid="primaryColumn"] p');
                    if (bioEl) bio = bioEl.textContent.trim();
                    const closeButton = document.querySelector('button[aria-label="Back"]') || document.querySelector('button[aria-label="Close"]');
                    if (closeButton) closeButton.click();
                }, 500);
            }
        }

        return { isGroup, title, handle, bio };
    }

    function printChatInfo(info) {
        if (!info) return;

        console.group('%cChat Info', 'font-weight: bold; color: green;');

        if (info.title) {
            console.log(`${info.isGroup ? 'Group' : 'User'} Name: ${info.title}`);
        }
        if (info.handle) console.log(`Handle: ${info.handle}`);
        if (info.bio) console.log(`Bio: ${info.bio}`);

        console.groupEnd();
    }

    // ===== Per-bubble meta (right thread footer) =====
    function extractHandle(cell) {
        const href = cell.querySelector('[data-testid^="UserAvatar-Container"] a')
            ?.getAttribute('href') || '';
        return href.startsWith('/') ? href.slice(1) : href;
    }

    function extractBubbleMeta(cell) {
        const timeEl = cell.querySelector('time');
        const footer = timeEl ? timeEl.parentNode : null;

        let displayName = '';
        let rawTs = '';

        if (timeEl) {
            rawTs =
                timeEl.getAttribute('datetime') ||
                timeEl.getAttribute('dateTime') ||
                timeEl.getAttribute('aria-label') ||
                (timeEl.textContent || '').trim() || '';
        }

        if (footer) {
            // Clean spans: drop dot separators and "Replying to ..."
            const spans = [...footer.querySelectorAll('span')]
                .map(s => (s.textContent || '').trim())
                .filter(t => t && t !== '·' && !/^Replying to/i.test(t));

            if (spans.length) displayName = spans[0];

            if (!rawTs && spans.length) {
                const last = spans[spans.length - 1];
                if (/\b\d{1,2}:\d{2}\s?(AM|PM)\b/i.test(last)) rawTs = last;
            }
        }

        // Prioritize alt for displayName if not set
        if (!displayName) {
            const alt = cell.querySelector('[data-testid^="UserAvatar-Container"] img')?.alt?.trim() || '';
            if (alt) {
                let cleaned = alt;
                if (cleaned.endsWith("'s profile photo")) {
                    cleaned = cleaned.slice(0, -18).trim();
                } else if (cleaned.startsWith("Profile photo for ")) {
                    cleaned = cleaned.slice(18).trim();
                } else if (cleaned.startsWith("Opens profile photo for ")) {
                    cleaned = cleaned.slice(24).trim();
                } else if (cleaned.startsWith("Image of ")) {
                    cleaned = cleaned.slice(9).trim();
                } else if (cleaned === "Opens profile photo" || cleaned === "") {
                    cleaned = '';
                }
                if (cleaned) displayName = cleaned;
            }
        }

        const time = formatAMPM(rawTs) || '';
        return { displayName, rawTs, time };
    }

    // ===== Text + emoji + media =====
    function extractTextBlocks(entry) {
        const blocks = [];
        entry.querySelectorAll('[data-testid="tweetText"]').forEach(block => {
            const parts = [];
            block.querySelectorAll('span,img,a').forEach(n => {
                const text = n.tagName === 'IMG' ? (n.alt || '') : (n.textContent || '').trim();
                if (text) parts.push(text);
            });
            const text = parts.join(' ').replace(/\s+/g, ' ').trim();
            if (text) blocks.push(text);
        });
        if (entry.querySelector('[data-testid="tweetPhoto"]')) blocks.push('[image]');
        if (entry.querySelector('[data-testid="videoPlayer"]')) blocks.push('[video]');
        return blocks;
    }

    function extractReplyLabel(entry) {
        const labelEl = entry.querySelector('svg ~ div span');
        const t = (labelEl?.textContent || '').trim();
        return t ? t.replace(/^Replying to\s+/i, '') : '';
    }

    function extractReactions(cell) {
        const counts = new Map();
        [...cell.querySelectorAll('[data-testid^="DM_Reaction-"]')].forEach(node => {
            const sym = node.querySelector('img')?.alt || '';
            if (!sym) return;
            const cEl = node.querySelector('[data-testid="app-text-transition-container"] div');
            const n = cEl ? parseInt(cEl.textContent.trim(), 10) : NaN;
            counts.set(sym, (counts.get(sym) || 0) + (Number.isFinite(n) ? n : 1));
        });
        const arr = [...counts.entries()].map(([sym, c]) => `${sym} (${c})`);
        return arr.length ? arr.sort().join(' ') : '';
    }

    // ===== Banner + menu =====
    function buildBanner(username, fullName, bannerTime) {
        const at = `@${username}`;
        let header = `%c${at}`;
        const styles = ['color: blue; font-weight: bold;'];
        const name = (fullName || '').trim();
        const time = (bannerTime || '').trim();
        let extra = '';
        if (name) extra += name;
        if (time) extra += (name ? ` - ${time}` : time);
        if (extra) {
            header += ' %c' + extra;
            styles.push('color: grey; font-weight: normal;');
        }
        return { header, styles };
    }

    function printMenu({ username, meta, bubbleMeta, bannerTime, avatarFromBubble }) {
        const profileUrl = `https://x.com/${username}`;
        console.log(`Profile: ${profileUrl}`);

        // Avatar directly under Profile, plain link for copy
        const avatarUrl = meta.avatarUrl || avatarFromBubble || '';
        if (avatarUrl) console.log(`Avatar: ${avatarUrl}`);

        console.log(`Handle: @${username}`);

        const fullName = (meta?.displayName || bubbleMeta?.displayName || '').trim();
        if (fullName) console.log(`Full Name: ${fullName}`);

        if (meta?.group) console.log(`Group: ${meta.group}`);

        const timeToShow =
            bannerTime ||
            formatAMPM(meta?.timestamp) ||
            formatAMPM(bubbleMeta?.rawTs) ||
            nowTime();
        console.log(`Time (Formatted): ${timeToShow}`);

        const rawTs = bubbleMeta?.rawTs || meta?.timestamp || '';
        if (rawTs) console.log(`Timestamp (Raw): ${rawTs}`);

        if (meta?.lastMessage) console.log(`Rail Preview: ${meta.lastMessage}`);
    }

    // ===== State =====
    const lastSnapshot = new Map();
    const lastUpdateTs = new Map();
    let railUsers = {};
    let batchTimer = null;
    let lastKnownPath = location.pathname;
    let printedInfo = false;
    let observedEntries = new Set();
    let visibilityObserver = null;

    // ===== Process one entry =====
    function processEntry(entry) {
        const now = performance.now();
        const last = lastUpdateTs.get(entry) || 0;
        if (now - last < 120) return;
        lastUpdateTs.set(entry, now);

        const cell = entry.closest('[data-testid="cellInnerDiv"]');
        if (!cell) return;

        const username = extractHandle(cell);
        if (!username) return;

        const bubbleMeta = extractBubbleMeta(cell);
        const meta = railUsers[username] || {};

        const texts = extractTextBlocks(entry);
        const replyTo = extractReplyLabel(entry);
        const reacts = extractReactions(cell);

        if (!texts.length && !reacts) return;

        const lines = [];
        if (replyTo) lines.push(`↱ Replying to ${replyTo}`);
        lines.push(...texts);
        if (reacts) lines.push(reacts);
        const messageText = lines.join('\n').replace('undefined', '').trim();

        const prev = lastSnapshot.get(entry);
        if (prev === messageText) return;
        lastSnapshot.set(entry, messageText);

        const bannerTime =
            bubbleMeta.time ||
            formatAMPM(meta.timestamp) ||
            formatAMPM(bubbleMeta.rawTs) ||
            nowTime();

        const fullName = meta.displayName || bubbleMeta.displayName || '';
        const { header, styles } = buildBanner(username, fullName, bannerTime);

        // Extract avatar from bubble if needed
        const avatarFromBubble = normalizeAvatarUrl(cell.querySelector('img[src*="profile_images"]')?.src || '');

        // Print message lines, blank line, then banner
        console.groupCollapsed(`${messageText}\n\n${header}`, ...styles);
        console.log(messageText); // Plain text for easy copy-paste
        printMenu({ username, meta, bubbleMeta, bannerTime, avatarFromBubble });
        console.groupEnd();
    }

    // ===== Setup visibility observer =====
    visibilityObserver = new IntersectionObserver((entries) => {
        entries.forEach((obsEntry) => {
            if (obsEntry.isIntersecting) {
                processEntry(obsEntry.target);
            }
        });
    }, { threshold: 0.1 });

    // ===== Batch flush to observe new entries =====
    function flush() {
        if (!location.pathname.startsWith('/messages/')) return;

        // Clean up stale entries
        for (const key of [...lastSnapshot.keys()]) {
            if (!document.contains(key)) {
                lastSnapshot.delete(key);
                lastUpdateTs.delete(key);
                observedEntries.delete(key);
            }
        }

        const messageEntries = document.querySelectorAll('[data-testid="messageEntry"]');
        messageEntries.forEach((entry) => {
            if (!observedEntries.has(entry)) {
                visibilityObserver.observe(entry);
                observedEntries.add(entry);
            }
        });

        if (!printedInfo) {
            const info = scrapeChatInfo();
            printChatInfo(info);
            printedInfo = true;
        }
    }

    // ===== Boot + observe =====
    function boot() {
        railUsers = scrapeRailUsers();
        flush();
    }
    boot();

    const container = document.querySelector('[role="main"]') || document.body;
    if (!container) return;
    const obs = new MutationObserver(() => {
        if (location.pathname !== lastKnownPath) {
            lastSnapshot.clear();
            lastUpdateTs.clear();
            printedInfo = false;
            observedEntries.clear();
            lastKnownPath = location.pathname;
            setTimeout(flush, 500);
        }
        clearTimeout(batchTimer);
        batchTimer = setTimeout(() => {
            railUsers = scrapeRailUsers(); // refresh rail opportunistically
            flush();
        }, 100);
    });
    obs.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });

    // Second observer for navigation changes
    const navObs = new MutationObserver(() => {
        if (location.pathname !== lastKnownPath) {
            lastSnapshot.clear();
            lastUpdateTs.clear();
            printedInfo = false;
            observedEntries.clear();
            lastKnownPath = location.pathname;
            setTimeout(flush, 500);
        }
    });
    navObs.observe(document.body, { childList: true, subtree: true });
})();
