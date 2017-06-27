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

const https = require('https');

/**
 * RestConnection class -- for handling connectivity to REST APIs
 * @example
 * const commons = require('ibm-iis-commons');
 * const restConnect = new commons.RestConnection('isadmin', 'isadmin-password', 'localhost', '9445');
 * const igcrest = require('ibm-igc-rest');
 * igcrest.setConnection(restConnect);
 */
class RestConnection {

  /**
   * Sets up a REST API connection
   *
   * @function
   * @param {string} username - username to use when authenticating to REST API
   * @param {string} password - password to use when authenticating to REST API
   * @param {string} host - hostname of the domain tier
   * @param {int} port - port number of the domain tier
   * @param {int} [maxSockets] - the maximum number of sockets to support concurrently on the host
   */
  constructor(username, password, host, port, maxSockets) {
    if (username === undefined || username === "" || password === undefined || password === "") {
      throw new Error("Incomplete authentication information -- missing username or password (or both).");
    }
    this._username = username;
    this._password = password;
    if (host === undefined || host === "" || port === undefined || port === "") {
      throw new Error("Incomplete connection information -- missing host or port (or both).");
    }
    this._host = host;
    this._port = port;
    if (maxSockets === undefined || maxSockets === "") {
      maxSockets = 100;
    }
    this._agent = new https.Agent({
      maxSockets: maxSockets,
      keepAlive: false
    });
  }

  /**
   * Get the authentication object for a REST connection
   * @return {Object} - a hash of 'user' and 'pass' basic authentication details
   */
  get auth() {
    return { 'user': this._username, 'pass': this._password };
  }

  /**
   * Get the hostname for the REST connection
   * @return {string}
   */
  get host() {
    return this._host;
  }

  /**
   * Get the port for the REST connection
   * @return {string}
   */
  get port() {
    return this._port;
  }

  /**
   * Get the qualified connection details for the REST connection (host:port)
   * @return {string}
   */
  get connection() {
    return this._host + ":" + this._port;
  }

  /**
   * Get the fully-qualified base SSL URL for the REST connection
   * @return {string}
   */
  get baseURL() {
    return 'https://' + this.connection;
  }

  /**
   * Get the https.Agent object for the REST connection
   * @return {Object}
   */
  get agent() {
    return this._agent;
  }

}

module.exports = RestConnection;
