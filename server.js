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

/* the gnustomp-forkbomb style guide:
 * Single tabs for indentation
 * Single quotes for strings
 * Opening braces on the same line as the statement
 * Spaces around operators
 * Empty line after a function defenition
 */
IPV6 = false;
all_start = Date.now();
console.log('[core] Loading...');
/* Requires */
var http = require('http'),
	fs = require('fs'),
	url = require('url'),
	auth = require('./lib/auth.js'),
	apis = require('./lib/api.js'),
    config = require('./config.js');

/* Variables */
var secret = config.secret,
	clientID = config.clientID,
	redirectURI = config.redirectURI,
	forcedETagUpdateCounter = 0,
	cachedBells = {},
	indexCache = '';
sessions = {}; // global

console.log('[core] Initialised in in ' + (Date.now() - all_start) + 'ms');

//require('./variables.js'); // set globals appropriate to status - dev (DEBUG = true) or release (DEBUG = false and GIT_RV set)
RELEASE = false;
DEBUG = true;
if (!RELEASE) {
	GIT_RV = fs.readFileSync('.git/refs/heads/master').toString().trim();
	var watcher = fs.watch('.git/refs/heads/master', { persistent: false }, function() {
		'use strict';
		GIT_RV = fs.readFileSync('.git/refs/heads/master').toString().trim();
	});
}


function serverError() {
	'use strict';
	return fs.createReadStream('static/500.html');
}

function cleanSessions() {
	'use strict';
	var start = Date.now(),
		cleaned = 0;
	console.log('[core] Cleaning sessions...');
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
	console.log('[core] Cleaned ' + cleaned + ' sessions in ' + Date.now()-start + 'ms');
}

process.on('SIGHUP', function() {
	'use strict';
	cleanSessions();
});

function httpHeaders(res, response, contentType, dynamic, headers) {
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
		//	headers.ETag = GIT_RV+'_'+forcedETagUpdateCounter;	// TODO better ETags. This *will* work in production because new git revisions will be the only way updates occur. 
		// SIGHUP'ing the process will force every client to re-request resources.
	}
	headers['Content-Type'] = contentType + '; charset=UTF-8';
	res.writeHead(response, headers);
	return res;
}

function getBelltimes(date, res) {
	'use strict';
	if (date === null || date === undefined || !/\d\d\d\d-\d?\d-\d?\d/.test(date)) {
		res.end(JSON.stringify({error: 'Invalid Date!'}));
	}
	if (date in cachedBells) {
		res.end(cachedBells[date]);
	} else {
		http.request({
			hostname: 'student.sbhs.net.au',
			port: 80,
			path: '/api/timetable/bells.json?date='+date,
			method: 'GET'
		}, function(rsp) {
			rsp.setEncoding('utf8');
			rsp.on('data', function(b) {
				cachedBells[date] = b;
				res.end(b);
			});
		}).end();
	}
}

function genSessionID(req) {
	'use strict';
	var ua = req.headers['user-agent'];
	var buf = new Buffer(Date.now().toString() + ua + Math.floor(Math.random()*100));
	return buf.toString('hex');
}

function getCookies(s) {
	'use strict';
	var res = {};
	s.split(';').forEach(function (ck) {
		var parts = ck.split('=');
		res[parts.shift().trim()] = parts.join('=').trim();
	});
	return res;
}

function onRequest(req, res) {
	/*jshint validthis: true*/
	'use strict';
	var start = Date.now(),
		genSession;
	if (req.headers['if-none-match'] == GIT_RV+'_'+forcedETagUpdateCounter && !DEBUG) {
		res.writeHead(304);
		res.end();
		return;
	}
	genSession = true;
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
	if (uri.pathname === '/') { // Main page
		fs.createReadStream('index.html').pipe(res);
	} else if (uri.pathname.match('/style/.*[.]css$') && fs.existsSync(uri.pathname.slice(1))) { // CSS
		httpHeaders(res, 200, 'text/css');
		target = uri.pathname.slice(1);
		fs.createReadStream(target).pipe(res);
	} else if (uri.pathname == '/api/belltimes.json') { // Belltimes wrapper
		httpHeaders(res, 200, 'application/json');
		getBelltimes(uri.query.date, res);
	} else if (uri.pathname == '/favicon.ico') { // favicon
		httpHeaders(res, 200, 'image/x-icon');
		fs.createReadStream('favicon.ico').pipe(res);
	} else if (uri.pathname == '/COPYING') { // License file
        httpHeaders(res, 200, 'text/plain');
        fs.createReadStream('COPYING').pipe(res);
    } else if (uri.pathname.match('^[.]ht.*')) { // Deny pattern
		httpHeaders(res, 403, 'text/plain');
		res.end('No.');
	} else if (uri.pathname == '/try_do_oauth') { // OAuth2 attempt
		auth.getAuthCode(res, res.SESSID);
	} else if (uri.pathname == '/login') { // Handle codes from OAuth
		auth.getAuthToken(res, uri, null);
	} else if (uri.pathname == '/session_info') { // Session information
		httpHeaders(res, 200, 'application/json');
		res.end(JSON.stringify(global.sessions[res.SESSID]));
	} else if (uri.pathname.match('/api/.*[.]json') && apis.isAPI(uri.pathname.slice(5))) { // API calls
		apis.get(uri.pathname.slice(5), uri.query, res.SESSID, function(obj) {
			httpHeaders(res, 200, 'application/json');
			res.end(JSON.stringify(obj));
		});
	} else if (uri.pathname == '/logout') {
		httpHeaders(res, 302, 'text/plain');
		//res.end('Redirecting...');
		delete global.sessions[res.SESSID].accessToken;
		delete global.sessions[res.SESSID].refreshToken;
		delete global.sessions[res.SESSID].accessTokenExpires;
		delete global.sessions[res.SESSID].refreshTokenExpires;
	} else if (uri.pathname == '/reset_access_token') {
		httpHeaders(res, 200, 'application/json');
		res.end(JSON.stringify(global.sessions[res.SESSID]));
		delete global.sessions[res.SESSID].accessToken;	
	} else { // 404 for everything else
		httpHeaders(res, 404, 'text/html');
		fs.createReadStream('static/404.html').pipe(res);
	}
	console.log('[' + this.name + ']', req.method, req.url, 'in', Date.now()-start + 'ms');
}

function requestSafeWrapper(req, res) {
    /*jshint validthis: true*/
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
	/*jshint validthis: true*/
	'use strict';
	console.log('[' + this.name + '] Listening on http://' + this.address().address + ':' + this.address().port + '/');
}

function nxListening() {
    /*jshint validthis: true*/
    'use strict';
    console.log('[' + this.name + '] Listening on ' + this.path);
}
if (RELEASE) {
    console.log('[core] SBHS-Timetable-Node version ' + REL_RV + ' starting server...');
} else {
    console.log('[core] SBHS-Timetable-Node git revision ' + GIT_RV.substr(0,6) + ' starting server...');
}

index_cache = serverError;
var ipv4server = http.createServer(),
	ipv6server = http.createServer(),
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
if (IPV6) {
	ipv6server.listen(8082, '::');
}
if (process.platform !== 'win32') {
    unixserver.path = '/tmp/playground.sock';
	unixserver.listen(unixserver.path);
    fs.chmod(unixserver.path, '777');
}
