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
 * @file Re-usable functions for interacting with IBM InfoSphere Information Server via Node.js modules
 * @license Apache-2.0
 */

/**
 * @module ibm-iis-commons
 */

const RestConnection = require('./classes/rest-connection');

if (typeof require === 'function') {
  exports.RestConnection = RestConnection;
}
