// ==UserScript==
// @name         X Reply Tracker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Highlight and scroll back to replied tweet
// @author       YanaSn0w1
// @match        https://x.com/*
// @run-at       document-idle
// ==/UserScript==

(function () {
    let lastClickedPost = null;

    // Capture the tweet and highlight it
    document.addEventListener('pointerdown', (event) => {
        const replyButton = event.target.closest('button[data-testid="reply"], button[aria-label*="Reply"]');
        if (replyButton) {
            const post = replyButton.closest('article[data-testid="tweet"]');
            if (post) {
                if (lastClickedPost) {
                    lastClickedPost.style.border = '';
                }
                lastClickedPost = post;
                post.style.border = '2px solid limegreen';
                post.style.borderRadius = '6px';
                post.style.boxShadow = '0 0 10px limegreen';
            }
        }
    });

    // Prevent scroll-to-top when reply box opens
    const preventJump = () => {
        setTimeout(() => {
            window.scrollTo({ top: window.scrollY, behavior: 'instant' });
        }, 100); // Fires just after the jump
    };

    document.addEventListener('click', (event) => {
        const replyButton = event.target.closest('button[data-testid="reply"], button[aria-label*="Reply"]');
        if (replyButton) {
            preventJump();
        }
    });

    // After submitting reply, scroll the bottom of the tweet to 100px from top
    document.addEventListener('click', (event) => {
        const submitButton = event.target.closest('button[data-testid="tweetButton"]');
        if (submitButton && lastClickedPost) {
            setTimeout(() => {
                const rect = lastClickedPost.getBoundingClientRect();
                const scrollTarget = window.scrollY + rect.bottom - 50;
                window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            }, 1200); // Wait for modal to close
        }
    });

    // Clean up highlight if clicking elsewhere
    document.addEventListener('click', (event) => {
        if (!event.target.closest('button[data-testid="reply"], button[data-testid="tweetButton"]')) {
            if (lastClickedPost) {
                lastClickedPost.style.border = '';
                lastClickedPost = null;
            }
        }
    });
})();
