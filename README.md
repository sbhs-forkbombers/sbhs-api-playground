sbhs-oauth-playground
============

With the advent of the new API, there's not really any way to get the API's output without writing an entire app. So, here is the app that you would write.

(This app is essentially a stripped-down version of sbhs-forkbombers/sbhs-timetable-node)

##Configuration
1. clone the repo
2. npm install
3. npm install -g grunt-cli (if you haven't done so already
3. grunt

### Bonus!
You don't even have to restart the app. It should automatically reload when you make any changes.

##Code layout

server.js -- application
&nbsp;lib/
&nbsp;&nbsp;auth.js -- handles OAuth2 stuff (because Passport is *way* to complicated \*ahem\*)
&nbsp;&nbsp;api.js -- handles the getting of the API.


## Dependencies
It needs one module from NPM, `request`. That is all.

