// ==UserScript==
// @name         𝕏_Next_Comment
// @namespace    http://tampermonkey.net/
// @version      3.12
// @description  Highlight comment(s) (persistent green border) on reply
// @description   button click, keep highlight after submit until new reply
// @description   exceeds highlight count, capture cell height and translateY
// @author       YanaSn0w1
// @include      https://x.com/*/status/*
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    console.log('𝕏_Next_Comment v3.12 loaded');

    let highlightedComments = []; // Track highlighted comments
    let submitDelay = 1200; // Default delay in ms
    let highlightCount = 5; // Default number of comments to keep highlighted
    let fixedOffset = 55; // Default fixed offset based on your feedback
    let currentCellHeight = 0; // Store cell height on reply button click
    let currentTranslateY = 0; // Store translateY on reply button click
    const minCellHeight = 99; // Minimum height for one-line comments (per latest logs)

    // Inject minimal CSS for highlight and UI
    const style = document.createElement('style');
    style.textContent = `
        .highlight-comment {
            border: 2px solid limegreen !important;
            border-radius: 6px !important;
        }
        #𝕏_Next_Comment-ui {
            position: fixed;
            top: 20px;
            right: 10px;
            z-index: 9999;
            background: #fff;
            padding: 4px;
            border: 1px solid #ccc;
            font-family: sans-serif;
            color: #000;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            white-space: nowrap;
        }
        #𝕏_Next_Comment-ui input[type="number"] {
            width: 60px;
        }
    `;
    document.head.appendChild(style);

    // Create UI
    const ui = document.createElement('div');
    ui.id = '𝕏_Next_Comment-ui';
    ui.innerHTML = `
        <label>Delay: <input type="number" id="submit-delay" value="${submitDelay}" min="1000" step="100"></label>
        <label>Highlight: <input type="number" id="highlight-count" value="${highlightCount}" min="0" step="1"></label>
        <label>Offset: <input type="number" id="fixed-offset" value="${fixedOffset}" step="1"></label>
    `;
    document.body.appendChild(ui);

    // Update submitDelay on input change
    document.getElementById('submit-delay').addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1000) {
            submitDelay = value;
            console.log(`Scroll delay updated to ${submitDelay}ms`);
        }
    });

    // Update highlightCount on input change
    document.getElementById('highlight-count').addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 0) {
            highlightCount = value;
            console.log(`Highlight count updated to ${highlightCount} comments`);
            const comments = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
            highlightedComments = highlightedComments.filter(comment => Array.from(comments).includes(comment));
            while (highlightedComments.length > highlightCount && highlightCount > 0) {
                const oldestComment = highlightedComments.shift();
                if (oldestComment) oldestComment.style.border = '';
            }
        }
    });

    // Update fixedOffset on input change
    document.getElementById('fixed-offset').addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value)) {
            fixedOffset = value;
            console.log(`Fixed offset updated to ${fixedOffset}px`);
        }
    });

    // Extract translateY from style attribute
    function getTranslateY(element) {
        const style = element.getAttribute('style') || '';
        const match = style.match(/translateY\(([\d.]+)px\)/);
        return match ? parseFloat(match[1]) : null;
    }

    // Scroll to current comment's translateY plus adjustable fixed offset
    function scrollToComment(currentComment) {
        const comments = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
        if (!Array.from(comments).includes(currentComment)) {
            console.log('Current comment invalid, scrolling to fallback');
            window.scrollBy({ top: 250, behavior: 'smooth' });
            return;
        }
        let scrollTarget;
        const layoutOffset = 54; // Adjust for X's header/padding based on logs
        if (currentTranslateY !== null) {
            scrollTarget = currentTranslateY + fixedOffset - layoutOffset; // Direct math for top alignment
        } else {
            const rect = currentComment.getBoundingClientRect();
            scrollTarget = (rect.top + window.scrollY) + fixedOffset - layoutOffset;
        }
        // Ensure bounds
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        scrollTarget = Math.min(scrollTarget, maxScroll);
        scrollTarget = Math.max(scrollTarget, 0);
        console.log(`Scrolling to target: ${scrollTarget}, current height: ${currentCellHeight}, translateY: ${currentTranslateY}, fixed offset: ${fixedOffset}, layout offset: ${layoutOffset}`);
        window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }

    // Handle button clicks
    function handleClick(event) {
        // First reply button
        const replyButton = event.target.closest('button[data-testid="reply"], button[role="button"][aria-label*="Reply" i], button[role="button"][aria-label*="reply" i], button[role="button"][aria-label*="replies" i]');
        if (replyButton) {
            console.log('Reply button clicked');
            const comment = replyButton.closest('div[data-testid="cellInnerDiv"]');
            if (comment) {
                const comments = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
                highlightedComments = highlightedComments.filter(c => Array.from(comments).includes(c));
                comment.style.border = '2px solid limegreen';
                currentCellHeight = comment.scrollHeight; // Use scrollHeight for full content height
                currentTranslateY = getTranslateY(comment); // Capture translateY
                console.log(`Cell height captured: ${currentCellHeight}px, translateY: ${currentTranslateY}px`);
                highlightedComments.push(comment);
                while (highlightedComments.length > highlightCount && highlightCount > 0) {
                    const oldestComment = highlightedComments.shift();
                    if (oldestComment) oldestComment.style.border = '';
                }
                // Prevent scroll jump when reply box opens
                setTimeout(() => {
                    window.scrollTo({ top: window.scrollY, behavior: 'instant' });
                }, 100);
            }
            return;
        }

        // Second reply button (submit)
        const submitButton = event.target.closest('button[data-testid="tweetButton"]:not([data-testid="app-bar-close"]), button[role="button"][aria-label*="Reply" i], button[role="button"][aria-label*="reply" i], button[role="button"][aria-label*="Post" i]');
        if (submitButton && highlightedComments.length > 0) {
            console.log('Submit button clicked');
            const currentComment = highlightedComments[highlightedComments.length - 1];
            setTimeout(() => scrollToComment(currentComment), submitDelay);
        }
    }

    // Attach listeners
    document.addEventListener('pointerdown', handleClick, { passive: true });
    document.addEventListener('click', handleClick, { passive: true });
})();
