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

const shell = require('shelljs');
const xmldom = require('xmldom');
const xpath = require('xpath');
const path = require('path');
const fs = require('fs');

const RestConnection = require('./rest-connection');

/**
 * EnvironmentContext class -- for encapsulating the context of an Information Server environment (NOTE: always run from Engine tier)
 * @example
 * const commons = require('ibm-iis-commons');
 * const envCtx = new commons.EnvironmentContext();
 * console.log("Host details: " + envCtx.domainHost + ":" + envCtx.domainPort);
 * console.log("Version     : " + envCtx.currentVersion);
 * console.log("Patches     : " + envCtx.installedPatches);
 * console.loc("$DSHOME     : " + envCtx.dshome);
 */
class EnvironmentContext {

  /**
   * Sets up everything we can determine about the environment from the current system
   *
   * @constructor
   * @param {string} [installLocation] - specifies the root of the installation ('/opt/IBM/InformationServer' by default)
   */
  constructor(installLocation) {

    this._username = "";
    this._password = "";
    this._clearPassword = "";
    this._restConnection = null;
    this._select = xpath.useNamespaces({"installreg": "http://www.ibm.com/LocalInstallRegistry"});
    this._bOnHost = false;
    this._bHaveVersionXML = false;
    this._tierToHosts = {};
    this._isConsolePort = "";
    this._ishome = "/opt/IBM/InformationServer";
    this._dshome = this._ishome + path.sep + "Server" + path.sep + "DSEngine";
    this._patchHistory = [];
    if (typeof installLocation !== 'undefined' && installLocation !== null) {
      this._ishome = installLocation;
    }
    if (shell.test('-f', "/.dshome")) {
      this._bOnHost = true;
      this._dshome = shell.cat("/.dshome").replace("\n", "");
      this._ishome = path.dirname(path.dirname(this._dshome));
    } else if (shell.test('-d', this._ishome)) {
      console.error("WARNING: This does not appear to be the engine tier -- you may run into problems...");
      this._bOnHost = true;
    } else {
      console.error("WARNING: No Information Server installation on this host, functionality will be limited.");
    }

    if (this._bOnHost) {
      // Parse out details from Version.xml -- only need to attempt this if we're on an Information Server host
      const versionXML = this._ishome + path.sep + "Version.xml";
      if (shell.test('-f', versionXML)) {
  
        const _versionXML = new xmldom.DOMParser().parseFromString(fs.readFileSync(versionXML, 'utf8'));
        this._bHaveVersionXML = true;
  
        const nInstallType = this._select("/installreg:LocalInstallRegistry/installreg:InstallType", _versionXML)[0];
        this._currentVersion = nInstallType.getAttribute("currentVersion");
    
        const nlPatches = this._select("/installreg:LocalInstallRegistry/installreg:History/installreg:HistoricalEvent[@installType='PATCH']", _versionXML);
        for (let i = 0; i < nlPatches.length; i++) {
          this._patchHistory.push({
            patchId: nlPatches[i].getAttribute("installerId"),
            patchDate: nlPatches[i].getAttribute("eventDate")
          });
        }
    
        const nlProducts = this._select("/installreg:LocalInstallRegistry/installreg:Products/installreg:Product", _versionXML);
        this._installedModules = [];
        for (let i = 0; i < nlProducts.length; i++) {
          this._installedModules.push(nlProducts[i].getAttribute("productId"));
        }
  
        this._isConsolePort = this._select("/installreg:LocalInstallRegistry/installreg:PersistedVariables/installreg:PersistedVariable[@name='is.console.port']", _versionXML)[0].getAttribute("value");
        this._tierToHosts.DOMAIN = this._select("/installreg:LocalInstallRegistry/installreg:PersistedVariables/installreg:PersistedVariable[@name='isf.server.host']", _versionXML)[0].getAttribute("value");
        this._tierToHosts.ENGINE = this._select("/installreg:LocalInstallRegistry/installreg:PersistedVariables/installreg:PersistedVariable[@name='isf.agent.host']", _versionXML)[0].getAttribute("value");
  
      } else {
        console.error("WARNING: Unable to find Version.xml -- Information Server install appears incomplete.");
      }
    }

  }

  /**
   * Get the installation location of Information Server
   * @return {string}
   */
  get ishome() {
    return this._ishome;
  }

  /**
   * Get the installation location of DataStage
   * @return {string}
   */
  get dshome() {
    return this._dshome;
  }

  /**
   * Get the installation location of the ASBNode
   * @return {string}
   */
  get asbhome() {
    return this._ishome + path.sep + "ASBNode";
  }

  /**
   * Get the fully-qualified location of the istool command
   * @return {string}
   */
  get istool() {
    return this._ishome + path.sep + "Clients" + path.sep + "istools" + path.sep + "cli" + path.sep + "istool.sh";
  }

  /**
   * Get the version of the Information Server installation
   * @return {string}
   */
  get currentVersion() {
    if (this._bHaveVersionXML) {
      return this._currentVersion;
    } else {
      return "Unknown";
    }
  }

  /**
   * Get an array of installed patches on the Information Server environment
   * @return {string[]}
   */
  get installedPatches() {
    return this._patchHistory;
  }

  /**
   * Get the hostname of the Information Server domain (services) tier
   * @return {string}
   */
  get domainHost() {
    if (!this._tierToHosts.hasOwnProperty("DOMAIN")) {
      const file = this.authFile;
      const authDetails = fs.readFileSync(file, 'utf8');
      const aLines = authDetails.split("\n");
      for (let i = 0; i < aLines.length; i++) {
        if (aLines[i].startsWith("domain=")) {
          this._tierToHosts.DOMAIN = aLines[i].split("=")[1].split(":")[0];
          i = aLines.length;
        }
      }
    }
    return this._tierToHosts.DOMAIN;
  }

  /**
   * Get the port number of the Information Server domain (services) tier
   * @return {string}
   */
  get domainPort() {
    if (this._isConsolePort === "") {
      const file = this.authFile;
      const authDetails = fs.readFileSync(file, 'utf8');
      const aLines = authDetails.split("\n");
      for (let i = 0; i < aLines.length; i++) {
        if (aLines[i].startsWith("domain=")) {
          this._isConsolePort = aLines[i].split("=")[1].split(":")[1];
          i = aLines.length;
        }
      }
    }
    return this._isConsolePort;
  }

  /**
   * Get fully-qualified Information Server domain (services) tier information -- host:port
   * @return {string}
   */
  get domain() {
    return this.domainHost + ":" + this.domainPort;
  }

  /**
   * Get the hostname of the Information Server engine tier
   * @return {string}
   */
  get engine() {
    if (!this._tierToHosts.hasOwnProperty("ENGINE")) {
      const file = this.authFile;
      const authDetails = fs.readFileSync(file, 'utf8');
      const aLines = authDetails.split("\n");
      for (let i = 0; i < aLines.length; i++) {
        if (aLines[i].startsWith("server=")) {
          this._tierToHosts.ENGINE = aLines[i].split("=")[1];
          i = aLines.length;
        }
      }
    }
    return this._tierToHosts.ENGINE.toUpperCase();
  }

  /**
   * Creates an authorisation file that can be used with most Information Server CLI tools
   * (so that passwords are not shown in-the-clear on the command line) -- based on the 
   * values provided
   * 
   * @function
   * @param {string} username - username to use for authentication
   * @param {string} password - password to use for authentication
   * @param {string} file - file into which to store the details
   */
  createAuthFileFromParams(username, password, file) {
    const encryptCmd = this.asbhome + path.sep + "bin" + path.sep + "encrypt.sh " + password;
    this._clearPassword = password;
    if (!this._bOnHost) {
      console.error("ERROR: An authorisation file can only be created on Information Server host itself.");
      throw new Error("An authorisation file can only be created on Information Server host itself.");
    }
    const result = shell.exec(encryptCmd, {"shell": "/bin/bash", silent: true});
    if (result.code !== 0) {
      console.error("Unable to encrypt password for authorisation file: exit code " + result.code);
    }
    this._username = username;
    this._password = result.stdout.replace("\n", "");
    const data = "" + 
        "user=" + username + "\n" +
        "password=" + result.stdout +
        "domain=" + this.domain + "\n" +
        "server=" + this.engine + "\n";
    fs.writeFileSync(file, data, 'utf8');
    this.authFile = file;
  }

  /**
   * Get the fully-qualified location of the authorisation file (if any)
   * @return {string}
   */
  get authFile() {
    if (typeof this._authFile === 'undefined' || this._authFile === null || this._authFile === "") {
      if (shell.test('-f', "~/.infosvrauth")) {
        this._authFile = process.env.HOME + path.sep + ".infosvrauth";
      } else {
        throw new Error("ERROR: Unable to find an authorisation file.");
      }
    }
    return this._authFile;
  }

  /**
   * Set the location of the authorisation file
   * @param file {string}
   */
  set authFile(file) {
    this._authFile = file;
  }

  /**
   * Get the username, from the authorisation file if needed
   * @return {string}
   */
  get username() {
    if (this._username === "") {
      const file = this.authFile;
      const authDetails = fs.readFileSync(file, 'utf8');
      const aLines = authDetails.split("\n");
      for (let i = 0; i < aLines.length; i++) {
        if (aLines[i].startsWith("user=")) {
          this._username = aLines[i].split("=")[1];
          i = aLines.length;
        }
      }
    }
    return this._username;
  }

  /**
   * Get the user's password, from the authorisation file if needed
   * @return {string}
   */
  get password() {
    if (this._password === "") {
      const file = this.authFile;
      const authDetails = fs.readFileSync(file, 'utf8');
      const aLines = authDetails.split("\n");
      for (let i = 0; i < aLines.length; i++) {
        if (aLines[i].startsWith("password=")) {
          this._password = aLines[i].substring(aLines[i].indexOf("=") + 1);
          i = aLines.length;
        }
      }
    }
    return this._password;
  }

  /**
   * Get a RestConnection object allowing REST API's to connect to this environment
   * @param {string} password - unencrypted password to use for REST connection (other details taken from authorisation file automatically)
   * @return {RestConnection}
   * @see module:ibm-iis-commons~RestConnection
   */
  getRestConnection(password) {
    if (typeof this._restConnection === 'undefined' || this._restConnection === null) {
      this._restConnection = new RestConnection(this.username, password, this.domainHost, this.domainPort);
    }
    return this._restConnection;
  }

}

module.exports = EnvironmentContext;
