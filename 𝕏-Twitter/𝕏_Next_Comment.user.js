// ==UserScript==
// @name         𝕏_Next_Comment
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Highlight comment(s) (persistent green border) on reply button click, keep highlight after submit until new reply exceeds highlight count, scroll to next comment top with adjustable delay on X.com status page
// @author       YanaSn0w1
// @include      https://x.com/*/status/*
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    console.log('𝕏_Next_Comment v1.3 loaded');

    let highlightedComments = []; // Track highlighted comments
    const scrollOffset = -153;
    let submitDelay = 1200; // Default delay in ms
    let highlightCount = 1; // Default number of comments to keep highlighted

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
        <label>𝕏_Next_Comment: <input type="number" id="submit-delay" value="${submitDelay}" min="1000" step="100"></label>
        <label>Highlight: <input type="number" id="highlight-count" value="${highlightCount}" min="0" step="1"></label>
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

    // Find the next comment
    function findNextComment(currentComment) {
        const comments = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
        const currentIndex = Array.from(comments).indexOf(currentComment);
        return comments[currentIndex + 1] || comments[0] || null;
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
            setTimeout(() => {
                const comments = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
                if (!Array.from(comments).includes(currentComment)) {
                    console.log('Last comment invalid, scrolling to fallback');
                    window.scrollBy({ top: 250, behavior: 'smooth' });
                    return;
                }
                const nextComment = findNextComment(currentComment);
                const scrollTarget = nextComment
                    ? nextComment.getBoundingClientRect().top + window.scrollY + scrollOffset
                    : window.scrollY + 250 + scrollOffset;
                window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
                // Keep highlight on currentComment
            }, submitDelay);
        }
    }

    // Attach listeners
    document.addEventListener('pointerdown', handleClick, { passive: true });
    document.addEventListener('click', handleClick, { passive: true });
})();
