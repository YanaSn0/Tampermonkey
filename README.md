#  Removes all YT subs.

Removes ~75 subs with 2 to 4 second delay every 30 minutes.

Install Easy YouTube Unsubscribe for Firefox.

https://addons.mozilla.org/en-CA/firefox/addon/easy-youtube-unsubscribe/

Install Tampermonkey and the user script.

https://addons.mozilla.org/en-CA/firefox/addon/tampermonkey/

https://github.com/YanaSn0/Tampermonkey/blob/main/YT_Remove.user.js

Click/bookmark this link https://www.youtube.com/feed/channels or

in YT click: Subscriptions > Manage > Reload the page to start Tampermonkey.

Increase this to take longer than 30 minutes: setTimeout(resolve, 1800000)); // 30-minute delay before reload

Increase these to take longer than 2 to 4 seconds per click: clickDelay = 2000 + Math.random() * 2000;

2000 is the base. Math.random() * 2000 generates a random number between 0 and 2000ms. The total range becomes 2 to 4 seconds.
