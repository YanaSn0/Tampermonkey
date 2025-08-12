// ==UserScript==
// @name         𝕏_Next_Post
// @namespace    http://tampermonkey.net/
// @version      5.4
// @description  Highlight post (persistent green border) on reply button click, scroll to next post top after submit with adjustable delay on X.com home page
// @author       YanaSn0w1
// @match        https://x.com/home
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    console.log('𝕏_Next_Post v5.4 loaded');

    let lastClickedPost = null;
    const scrollOffset = -50;
    let submitDelay = 1000; // Default delay in ms

    // Inject minimal CSS for highlight and UI
    const style = document.createElement('style');
    style.textContent = `
        .highlight-post {
            border: 2px solid limegreen !important;
            border-radius: 6px !important;
        }
        #next-post-ui {
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
        #next-post-ui input[type="number"] {
            width: 60px;
        }
    `;
    document.head.appendChild(style);

    // Create UI
    const ui = document.createElement('div');
    ui.id = 'next-post-ui';
    ui.innerHTML = `
        <label>𝕏_Next_Post: <input type="number" id="submit-delay" value="${submitDelay}" min="1000" step="100"></label>
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
                if (lastClickedPost) {
                    lastClickedPost.style.border = '';
                }
                post.style.border = '2px solid limegreen';
                lastClickedPost = post;
            }
            return;
        }

        // Second reply button (submit)
        const submitButton = event.target.closest('button[data-testid="tweetButton"]:not([data-testid="app-bar-close"]), button[role="button"][aria-label*="Reply" i], button[role="button"][aria-label*="reply" i], button[role="button"][aria-label*="Post" i]');
        if (submitButton && lastClickedPost) {
            console.log('Submit button clicked');
            const currentPost = lastClickedPost;
            lastClickedPost = null;
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
                currentPost.style.border = '';
            }, submitDelay);
        }
    }

    // Attach listeners
    document.addEventListener('pointerdown', handleClick, { passive: true });
    document.addEventListener('click', handleClick, { passive: true });
})();
