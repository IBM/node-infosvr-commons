#!/usr/bin/env node

/***
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/**
 * @file Creates an authorisation file containing information about how to connect to this environment (i.e. for CLI tools)
 * @license Apache-2.0
 * @requires ibm-iis-commons
 * @requires prompt
 * @requires yargs
 * @example
 * // creates an authorisation file for the user 'isadmin' and saves it into /etc/infosvr-auth.cfg (will prompt for password if not provided as an argument)
 * ./createAuthFile.js -u isadmin -f /etc/infosvr-auth.cfg
 */

const commons = require('../');
const prompt = require('prompt');
prompt.colors = false;

// Command-line setup
const yargs = require('yargs');
const argv = yargs
    .usage('Usage: $0 -u <username> -p <password> -f <file>')
    .option('f', {
      alias: 'file',
      describe: 'File into which to store authorisation details',
      demand: true, requiresArg: true, type: 'string'
    })
    .option('u', {
      alias: 'username',
      describe: 'Username for authenticating into Information Server',
      demand: true, requiresArg: true, type: 'string',
      default: "isadmin"
    })
    .option('p', {
      alias: 'password',
      describe: 'Password for authenticating into Information Server',
      demand: false, requiresArg: true, type: 'string'
    })
    .help('h')
    .alias('h', 'help')
    .wrap(yargs.terminalWidth())
    .argv;

function createFile() {
  const EnvCtx = new commons.EnvironmentContext();
  EnvCtx.createAuthFile(argv.username, argv.password, argv.file);
}

if (typeof argv.password === 'undefined' || argv.password === null || argv.password === "") {

  const input = {
    properties: {
      password1: {
        hidden: true,
        required: true,
        message: "Please enter the password for '" + argv.username + "': "
      },
      password2: {
        hidden: true,
        required: true,
        message: "Please enter the same password again: "
      }
    }
  };

  prompt.message = "";
  prompt.delimiter = "";

  prompt.start();
  prompt.get(input, function (err, result) {
    if (result.password1 !== result.password2) {
      console.error("Passwords received were different!");
      process.exit(1);
    } else {
      argv.password = result.password1;
      createFile();
    }
  });
} else {
  createFile();
}
