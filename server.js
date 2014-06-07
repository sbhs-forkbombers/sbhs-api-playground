/*
 * Copyright (C) 2014 James Ye, Simon Shields
 *
 * This file is part of SBHS-Timetable-Node.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
/*global sessions RELEASE GIT_RV REL_RV DEBUG */
var all_start = Date.now();
console.log('[core] Loading...');
/* Requires */
var http = require('http'),
	fs = require('fs'),
	url = require('url'),
	auth = require('./lib/auth.js'),
	apis = require('./lib/api.js'),
	config = require('./config.js'),
	request = require('request');

/* Variables */
var secret = config.secret,
	clientID = config.clientID,
	redirectURI = config.redirectURI,
	forcedETagUpdateCounter = 0,
	cachedBells = {},
	index_cache, ipv4server, ipv6server, unixserver;
sessions = {}; // global
RELEASE = false;
DEBUG = true;
console.log('[core] Initialised in in ' + (Date.now() - all_start) + 'ms');

if (!RELEASE) {
	GIT_RV = fs.readFileSync('.git/refs/heads/master').toString().trim();
	var watcher = fs.watch('.git/refs/heads/master', { persistent: false }, function() {
		'use strict';
		GIT_RV = fs.readFileSync('.git/refs/heads/master').toString().trim();
	});
}
fs.writeFile('.reload', '0');


function serverError() {
	'use strict';
	return fs.createReadStream('static/500.html');
}

function cleanSessions() { // clear sessions
	'use strict';
	var start = Date.now(),
		cleaned = 0;
	for (var i in global.sessions) {
		if (global.sessions[i].expires < Date.now()) {
			delete global.sessions[i];
			cleaned++;
		}
		else if (Object.keys(global.sessions[i]).length < 2) { // not storing anything in the session, so it's just eating memory.
			delete global.sessions[i];
			cleaned++;
		}
	}
	console.log('[core] Cleaned ' + cleaned + ' sessions');
	fs.writeFileSync('sessions.json', JSON.stringify(global.sessions));
	console.log('[core] Wrote ' + Object.keys(global.sessions).length + ' sessions to disk');
}

process.on('SIGHUP', function() {
	'use strict';
	cleanSessions();
});

process.on('SIGINT', function() {
	'use strict';
	unixserver.close(function() { global.unixDone = true; });
	ipv4server.close(function() { global.ipv4Done = true; });
	ipv6server.close(function() { global.ipv6Done = true; });
	fs.writeFileSync('sessions.json', JSON.stringify(global.sessions));
	console.log('Saved sessions.');
});


function httpHeaders(res, response, contentType, dynamic, headers) { // send headers
	'use strict';
	var date;
	dynamic = dynamic || false;
	headers = headers || {};
	if (!('Set-Cookie' in headers) && 'SESSID' in res) {
		headers['Set-Cookie'] = 'SESSID='+res.SESSID+'; Max-Age=36000';
	}
	if (dynamic || DEBUG) { // disable caching
		headers['Cache-Control'] = 'no-cache';
	} else if (!dynamic) {
		date = new Date();
		date.setYear(date.getFullYear() + 1);
		headers.Expires = date.toGMTString();
	}
	headers['Content-Type'] = contentType + '; charset=UTF-8';
	res.writeHead(response, headers);
	return res;
}

function getBelltimes(date, res) { // get /api/timetable/bell.json (should be in lib/api.js, but meh)
	'use strict';
	if (date === null || date === undefined || !/\d\d\d\d-\d?\d-\d?\d/.test(date)) {
		res.end(JSON.stringify({error: 'Invalid Date!'}));
	}
	if (date in cachedBells) {
		res.end(cachedBells[date]);
	} else {
		request('http://student.sbhs.net.au/api/timetable/bells.json?date='+date,
			function(err, r, b) {
				if (err || r.statusCode != 200) {
					if (err) {
						console.error('failed to get bells for',date,' err='+err);
						res.end('{"error": "internal", "statusCode": 500}');
					} else {
						console.error('Got a ' + r.statusCode + ' from SBHS for the belltimes for ' + date);
						res.end('{"error": "remote", "statusCode":'+r.statusCode+'}');
					}
					return;
				}
				cachedBells[date] = b;
				res.end(b);
			}
		);
	}
}

function genSessionID(req) { // generate a session ID.
	'use strict';
	var ua = req.headers['user-agent'];
	var buf = new Buffer(Date.now().toString() + ua + Math.floor(Math.random()*100));
	return buf.toString('hex');
}

function getCookies(s) { // get cookies from a cookie header
	'use strict';
	var res = {};
	s.split(';').forEach(function (ck) {
		var parts = ck.split('=');
		res[parts.shift().trim()] = parts.join('=').trim();
	});
	return res;
}

function onRequest(req, res) { // respond to a request
	/* jshint validthis: true */
	'use strict';
	var start = Date.now(),
		genSession;
	genSession = true;
	// set session expiry/initialise session
	if ('cookie' in req.headers) {
		var cookies = getCookies(req.headers.cookie);
		if ('SESSID' in cookies) {
			res.SESSID = cookies.SESSID;
			if (sessions[res.SESSID] === undefined || sessions[res.SESSID] === null) {
				sessions[res.SESSID] = { expires: Date.now() + (1000 * 60 * 60 * 24 * 90) };
			}
		}
		else {
			res.SESSID = genSessionID(req);
			sessions[res.SESSID] = { expires: Date.now() + (1000 * 60 * 60 * 24 * 90) };
		}
	}
	else {
		res.SESSID = genSessionID(req);
		sessions[res.SESSID] = { expires: Date.now() + (1000 * 60 * 60 * 24 * 90) };
	}

	var target, uri = url.parse(req.url, true);
	if (uri.pathname === '/') {
		/* Main page */
		httpHeaders(res, 200, 'text/html');
		fs.createReadStream('index.html').pipe(res);
	} else if (uri.pathname.match('/style/.*[.]css$') && fs.existsSync(uri.pathname.slice(1))) {
		/* Style sheets */
		httpHeaders(res, 200, 'text/css');
		target = uri.pathname.slice(1);
		fs.createReadStream(target).pipe(res);
	} else if (uri.pathname == '/script/belltimes.js' && !RELEASE) {
		fs.createReadStream('script/belltimes.concat.js').pipe(res);
	} else if (uri.pathname.match('/script/.*[.]js$') && fs.existsSync(uri.pathname.slice(1))) {
		/* JavaScript */
		httpHeaders(res, 200, 'application/javascript');
		target = uri.pathname.slice(1);
		fs.createReadStream(target).pipe(res);
	} else if (uri.pathname == '/api/belltimes') {
		/* Belltimes wrapper */
		httpHeaders(res, 200, 'application/json');
		getBelltimes(uri.query.date, res);
	} else if (uri.pathname == '/favicon.ico') {
		/* favicon */
		httpHeaders(res, 200, 'image/x-icon');
		fs.createReadStream('static/favicon.ico').pipe(res);
	} else if (uri.pathname == '/COPYING') {
		/* license */
		httpHeaders(res, 200, 'text/plain');
		fs.createReadStream('COPYING').pipe(res);
	} else if (uri.pathname.match('^/[.]ht.*')) {
		/* Disallow pattern */
		httpHeaders(res, 403, 'text/html');
		fs.createReadStream('static/403.html').pipe(res);
	} else if (uri.pathname == '/try_do_oauth') {
		/* OAuth2 attempt */
		auth.getAuthCode(res, res.SESSID);
	} else if (uri.pathname == '/login') {
		/* OAuth2 handler */
		auth.getAuthToken(res, uri, null);
	} else if (uri.pathname == '/session_info') {
		/* Session info */
		httpHeaders(res, 200, 'application/json');
		res.end(JSON.stringify(global.sessions[res.SESSID]));
	} else if (uri.pathname.match('/api/.*[.]json') && apis.isAPI(uri.pathname.slice(5))) {
		/* API calls */
		apis.get(uri.pathname.slice(5), uri.query, res.SESSID, function(obj) {
			httpHeaders(res, 200, 'application/json');
			res.end(JSON.stringify(obj));
		});
	} else if (uri.pathname == '/logout') {
		/* Logout */
		httpHeaders(res, 302, 'text/plain');
		res.end();
		delete global.sessions[res.SESSID].accessToken;
		delete global.sessions[res.SESSID].refreshToken;
		delete global.sessions[res.SESSID].accessTokenExpires;
		delete global.sessions[res.SESSID].refreshTokenExpires;
	} else if (uri.pathname == '/reset_access_token') {
		/* Make the access token expire */
		httpHeaders(res, 200, 'application/json');
		delete global.sessions[res.SESSID].accessToken;
		global.sessions[res.SESSID].accessTokenExpires = 0;
		res.end(JSON.stringify(global.sessions[res.SESSID]));
	} else if (uri.pathname == '/refresh_token') {
		/* Refresh the access token explicitly */
		httpHeaders(res, 200, 'application/json');
		if (global.sessions[res.SESSID].refreshToken) {
			auth.refreshAuthToken(global.sessions[res.SESSID].refreshToken, res.SESSID, function() {
				res.end(JSON.stringify(global.sessions[res.SESSID]));
			});
		} else {
			res.end('{"error": "not logged in"}');
		}
	} else {
		/* 404 everything else */
		httpHeaders(res, 404, 'text/html');
		fs.createReadStream('static/404.html').pipe(res);
	}
	console.log('[' + this.name + ']', req.method, req.url, 'in', Date.now()-start + 'ms');
}

function requestSafeWrapper(req, res) { // handle exceptions with a 500 response
	/* jshint validthis: true */
	'use strict';
	try {
		onRequest.call(this, req, res);
	}
	catch (e) {
		console.log('ERROR HANDLING REQUEST: ' + req.url);
		console.log(e);
		console.log(e.stack);
		res.writeHead(500, 'text/html');
		serverError().pipe(res);
	}
}

function onListening() {
	/* jshint validthis: true */
	'use strict';
	console.log('[' + this.name + '] Listening on http://' + this.address().address + ':' + this.address().port + '/');
}

function nxListening() {
	/* jshint validthis: true */
	'use strict';
	console.log('[' + this.name + '] Listening on ' + this.path);
}
if (RELEASE) {
	console.log('[core] SBHS API Playground version ' + REL_RV + ' starting server...');
} else {
	console.log('[core] SBHS API Playground git revision ' + GIT_RV.substr(0,6) + ' starting server...');
}

var index_cache = serverError;

ipv4server = http.createServer();
ipv6server = http.createServer();
unixserver = http.createServer();

ipv4server.name = 'ipv4server';
ipv6server.name = 'ipv6server';
unixserver.name = 'unixserver';

ipv4server.on('request', requestSafeWrapper);
ipv6server.on('request', requestSafeWrapper);
unixserver.on('request', requestSafeWrapper);

ipv4server.on('listening', onListening);
ipv6server.on('listening', onListening);
unixserver.on('listening', nxListening);

ipv4server.listen(8082, '0.0.0.0');
setInterval(cleanSessions, 36000000); // clean expired sessions every hour

if (fs.existsSync('sessions.json')) {
	console.log('[core] Loading sessions...');
	global.sessions = JSON.parse(fs.readFileSync('sessions.json'));
	console.log('[core] Success!');
}
if (IPV6) {
	ipv6server.listen(8082, '::');
}
if (process.platform !== 'win32') {
	unixserver.path = '/tmp/playground.sock';
	unixserver.listen(unixserver.path);
	fs.chmod(unixserver.path, '777');
}
