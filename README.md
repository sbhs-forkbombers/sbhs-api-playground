sbhs-oauth-playground
============

With the advent of the new API, there's not really any way to get the API's output without writing an entire app. So, here is the app that you would write.

##Configuration
1. clone the repo
2. npm install
3. node server.js

###It errors the second time I try and start it
If you're on linux/osx you need to `rm /tmp/playground.sock` before running it.

##Code layout

server.js -- application
&nbsp;lib/
&nbsp;&nbsp;auth.js -- handles OAuth2 stuff (because Passport is *way* to complicated \*ahem\*)
&nbsp;&nbsp;api.js -- handles the getting of the API.


## Dependencies
It needs one module from NPM, `request`. That is all.

