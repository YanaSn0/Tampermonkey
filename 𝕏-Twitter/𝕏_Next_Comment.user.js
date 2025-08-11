// ==UserScript==
// @name         𝕏_Next_Comment
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Highlight and scroll back to replied comment on X (Twitter)
// @author       YanaSn0w1
// @include      https://x.com/*/status/*
// @run-at       document-idle
// ==/UserScript==

(function () {
    let lastClickedComment = null;

    const COMMENT_SCROLL_OFFSET = 65;

    const highlightComment = (element) => {
        element.style.border = '2px solid limegreen';
        element.style.borderRadius = '6px';
        element.style.boxShadow = '0 0 10px limegreen';
    };

    const clearCommentHighlight = () => {
        if (lastClickedComment) {
            lastClickedComment.style.border = '';
            lastClickedComment.style.boxShadow = '';
            lastClickedComment = null;
        }
    };

    const scrollToComment = (element) => {
        const rect = element.getBoundingClientRect();
        const scrollTarget = window.scrollY + rect.top - COMMENT_SCROLL_OFFSET;
        window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    };

    // Detect reply button click inside a comment cell
    document.addEventListener('pointerdown', (event) => {
        const replyButton = event.target.closest('button[data-testid="reply"], button[aria-label*="Reply"]');
        if (replyButton) {
            const comment = replyButton.closest('div[data-testid="cellInnerDiv"]');
            if (comment) {
                clearCommentHighlight();
                lastClickedComment = comment;
            }
        }
    });

    // Prevent scroll jump when reply box opens
    document.addEventListener('click', (event) => {
        const replyButton = event.target.closest('button[data-testid="reply"], button[aria-label*="Reply"]');
        if (replyButton) {
            setTimeout(() => {
                window.scrollTo({ top: window.scrollY, behavior: 'instant' });
            }, 100);
        }
    });

    // After submitting reply, scroll and highlight the comment
    document.addEventListener('click', (event) => {
        const submitButton = event.target.closest('button[data-testid="tweetButton"]');
        if (submitButton && lastClickedComment) {
            setTimeout(() => {
                highlightComment(lastClickedComment);
                scrollToComment(lastClickedComment);
            }, 1200);
        }
    });

    // Clear highlight if clicking elsewhere
    document.addEventListener('click', (event) => {
        const isReplyOrSubmit = event.target.closest('button[data-testid="reply"], button[data-testid="tweetButton"]');
        if (!isReplyOrSubmit) {
            clearCommentHighlight();
        }
    });
})();
