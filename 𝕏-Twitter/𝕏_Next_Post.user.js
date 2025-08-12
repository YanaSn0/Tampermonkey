// ==UserScript==
// @name         𝕏_Next_Post
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Highlight post(s) (persistent green border) on reply button click, keep highlight after submit until new reply exceeds highlight count,
// @description   scroll to next post top with adjustable delay on X.com home page
// @author       YanaSn0w1
// @match        https://x.com/home
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    console.log('𝕏_Next_Post v6.0 loaded');

    let highlightedPosts = []; // Track highlighted posts
    const scrollOffset = -50;
    let submitDelay = 1000; // Default delay in ms
    let highlightCount = 5; // Default number of posts to keep highlighted

    // Inject minimal CSS for highlight and UI
    const style = document.createElement('style');
    style.textContent = `
        .highlight-post {
            border: 2px solid limegreen !important;
            border-radius: 6px !important;
        }
        #𝕏_Next_Post-ui {
            position: fixed;
            top: -8px;
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
        #𝕏_Next_Post-ui input[type="number"] {
            width: 60px;
        }
    `;
    document.head.appendChild(style);

    // Create UI
    const ui = document.createElement('div');
    ui.id = '𝕏_Next_Post-ui';
    ui.innerHTML = `
        <label>𝕏_Next_Post: <input type="number" id="submit-delay" value="${submitDelay}" min="1000" step="100"></label>
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
            console.log(`Highlight count updated to ${highlightCount} posts`);
            // Clear excess highlights if needed
            while (highlightedPosts.length > highlightCount) {
                const oldestPost = highlightedPosts.shift();
                if (oldestPost) oldestPost.style.border = '';
            }
        }
    });

    // Find the next post
    function findNextPost(currentPost) {
        const posts = document.querySelectorAll('article[data-testid="tweet"]');
        const currentIndex = Array.from(posts).indexOf(currentPost);
        return posts[currentIndex + 1] || posts[0] || null;
    }

    // Handle button clicks
    function handleClick(event) {
        // First reply button
        const replyButton = event.target.closest('button[data-testid="reply"], button[role="button"][aria-label*="Reply" i], button[role="button"][aria-label*="reply" i], button[role="button"][aria-label*="replies" i]');
        if (replyButton) {
            console.log('Reply button clicked');
            const post = replyButton.closest('article[data-testid="tweet"]');
            if (post) {
                // Add new highlight
                post.style.border = '2px solid limegreen';
                highlightedPosts.push(post);
                // Clear excess highlights
                while (highlightedPosts.length > highlightCount && highlightCount > 0) {
                    const oldestPost = highlightedPosts.shift();
                    if (oldestPost) oldestPost.style.border = '';
                }
            }
            return;
        }

        // Second reply button (submit)
        const submitButton = event.target.closest('button[data-testid="tweetButton"]:not([data-testid="app-bar-close"]), button[role="button"][aria-label*="Reply" i], button[role="button"][aria-label*="reply" i], button[role="button"][aria-label*="Post" i]');
        if (submitButton && highlightedPosts.length > 0) {
            console.log('Submit button clicked');
            const currentPost = highlightedPosts[highlightedPosts.length - 1];
            setTimeout(() => {
                const posts = document.querySelectorAll('article[data-testid="tweet"]');
                if (!Array.from(posts).includes(currentPost)) {
                    console.log('Last post invalid, scrolling to fallback');
                    window.scrollBy({ top: 250, behavior: 'smooth' });
                    return;
                }
                const nextPost = findNextPost(currentPost);
                const scrollTarget = nextPost
                    ? nextPost.getBoundingClientRect().top + window.scrollY + scrollOffset
                    : window.scrollY + 250 + scrollOffset;
                window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
                // Keep highlight on currentPost
            }, submitDelay);
        }
    }

    // Attach listeners
    document.addEventListener('pointerdown', handleClick, { passive: true });
    document.addEventListener('click', handleClick, { passive: true });
})();
