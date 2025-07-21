# Facebook Page Auto-Unfollow with Pagination

This Tampermonkey user script automates the process of unfollowing everyone your Facebook Page is following. It works by scrolling through the "Following" tab, opening each profile's options menu, and clicking "Unfollow" for each entry. The script handles pagination by loading more entries as you scroll and continues until all have been processed.

## Features

- Automatically clicks "More options" (three dots) for each profile/page.
- Automatically clicks "Unfollow" for every entry.
- Scrolls to load more entries and repeats the process until all are unfollowed.
- Adds a convenient "Auto-Unfollow All" button to your Facebook Page's Following tab.

## Requirements

- [Tampermonkey](https://www.tampermonkey.net/) browser extension installed.
- Facebook account with a Page and access to the Page's Following tab.

## Installation

1. Install Tampermonkey in your browser (Chrome, Firefox, Edge, etc.).
2. Create a new user script in Tampermonkey.
3. Copy and paste the contents of `facebook_auto_unfollow_paginated.user.js` into the editor.
4. Save the script.

## Usage

1. Go to your Facebook Page's Following tab (e.g. `https://www.facebook.com/YourPageName/following`).
2. Locate the "Auto-Unfollow All" button at the top-right corner of the page.
3. Click the button.
4. The script will automatically process all entries, unfollowing each profile/page one by one and loading more entries as necessary.
5. Wait for the process to complete. A popup will alert you when finished.

## Notes

- The script uses HTML element selectors based on Facebook's current layout. If Facebook updates its UI, you may need to update the selectors in the script.
- Delays between actions are included to reduce the chance of triggering Facebook's automated action limits. You can adjust the delay constants (`DELAY`, `SCROLL_DELAY`) in the script if needed.
- Use responsibly! Mass unfollowing may affect your Page's engagement and could trigger Facebook security checks. Proceed at your own risk.

## Troubleshooting

- If the "Unfollow" button is not being clicked, check that the selector matches Facebook's UI. You may need to inspect the page and update the query in the script.
- If the script stops before all entries are processed, try increasing the scroll delay or refreshing the page and running again.

## License

MIT License
