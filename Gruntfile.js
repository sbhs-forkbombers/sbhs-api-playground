/*
 * Copyright (C) 2014  James Ye, Simon Shields
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

module.exports = function(grunt) {
	'use strict';
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		GIT_RV: require('fs').readFileSync('.git/refs/heads/master').toString().trim(),
		GIT_RV_SHORT: require('fs').readFileSync('.git/refs/heads/master').toString().trim().substr(0,6),
		'delete': {
			run: 'true'
		},
		nodemon: {
			dev: {
				script: 'server.js',
				options: {
					callback: function(nm) {
						nm.on('restart', function() {
							if (require('fs').existsSync('/tmp/timetable.sock')) {
								require('fs').unlinkSync('/tmp/timetable.sock');
							}
							grunt.task.run('concat');
							console.log();
							console.log('[nodemon] *** RESTARTING ***');
							console.log();
						});
					},
					ignore: ['node_modules/**', 'Gruntfile.js', 'script/*', 'style/*', 'static/*']
				}
			}
		},
	});

	grunt.loadNpmTasks('grunt-nodemon');
	grunt.loadNpmTasks('grunt-concurrent');


	grunt.registerMultiTask('delete', 'delete stuff', function() {
		if (process.platform !== 'win32' && require('fs').existsSync('/tmp/playground.sock')) {
			require('fs').unlinkSync('/tmp/playground.sock');
			grunt.log.writeln(this.target + ': deleted /tmp/playground.sock');
		}
		else {
			grunt.log.writeln(this.target + ': nothing happened');
		}
	});

	grunt.registerMultiTask('reload', 'tell a process to reload', function() {
		require('fs').writeFile('.reload', '1');
		grunt.log.writeln('reloaded process.');
	});

	grunt.registerTask('default', ['delete', 'nodemon', 'delete']);
};
