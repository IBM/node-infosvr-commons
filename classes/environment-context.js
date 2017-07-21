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
   * @param {string} [authFile] - specifies the location of an authorisation file from which information can be retrieved (if available)
   */
  constructor(installLocation, authFile) {

    this.authFile = authFile;
    this._remoteConnectString = "";
    this._remoteCopyString = "";
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
    }
    const versionXML = this._ishome + path.sep + "Version.xml";
    let _versionXML = null;

    if (!this._bOnHost) {
      console.error("WARNING: No Information Server installation on this host, attempting remote connection...");
      const result = this._executeCommandRemotely("cat " + versionXML);
      if (result.code === 0 && result.stdout !== null) {
        _versionXML = new xmldom.DOMParser().parseFromString(result.stdout);
      } else {
        console.error(result.stderr);
      }
    } else {
      if (shell.test('-f', versionXML)) {
        _versionXML = new xmldom.DOMParser().parseFromString(fs.readFileSync(versionXML, 'utf8'));
      } else {
        console.error("WARNING: Unable to find Version.xml -- Information Server install appears incomplete.");
      }
    }

    if (_versionXML !== null) {
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
    }

  }

  /**
   * @private
   */
  _getFromAuthFileIfUnknown(propertyNameInFile, objectProperty) {
    if (this[objectProperty] === "") {
      const file = this.authFile;
      const authDetails = fs.readFileSync(file, 'utf8');
      const aLines = authDetails.split("\n");
      for (let i = 0; i < aLines.length; i++) {
        if (aLines[i].startsWith(propertyNameInFile + "=")) {
          this[objectProperty] = aLines[i].substring(aLines[i].indexOf("=") + 1);
          i = aLines.length;
        }
      }
    }
    return this[objectProperty];
  }

  _checkForRemoteAuthFile() {
    const result = shell.exec(this.remoteConnectionString + " ls ~/.infosvrauth_remoteCopy", { "shell": "/bin/bash", silent: true });
    if (result.code !== 0) {
      this._copyFileRemotely(this.authFile, '.infosvrauth_remoteCopy');
    }
  }

  _executeCommandRemotely(command) {
    if (this.remoteConnectionString !== "") {
      this._checkForRemoteAuthFile();
      let execString = "";
      if (this.remoteConnectionString.startsWith("ssh")) {
        execString = this.remoteConnectionString + " \"" + command.replace(this.authFile, '~/.infosvrauth_remoteCopy') + "\"";
      } else {
        execString = this.remoteConnectionString + " " + command.replace(this.authFile, '~/.infosvrauth_remoteCopy');
      }
      const result = shell.exec(execString, { "shell": "/bin/bash", silent: true });
      if (result.code !== 0) {
        console.error("Unable to execute remote command: " + execString);
        console.error(result.stderr);
      }
      return result;
    } else {
      return {
        code: -1,
        stderr: " ... no remote connection details found -- unable to execute command."
      };
    }
  }

  _copyFileRemotely(source, target) {
    if (this.remoteCopyString !== "") {
      const copyCmd = this.remoteCopyString.replace("__SOURCE__", source).replace("__TARGET__", target);      
      const cpResult = shell.exec(copyCmd, { "shell": "/bin/bash", silent: true });
      if (cpResult.code !== 0) {
        console.error("Unable to copy file: " + source + " to " + target);
        console.error(cpResult.stderr);
      }
      return cpResult;
    } else {
      return {
        code: -1,
        stderr: " ... no remote copy details found -- unable to copy file."
      };
    }
  }

  _removeFileRemotely(file) {
    if (this.remoteConnectionString !== "") {
      const sshString = this.remoteConnectionString + " rm " + file;
      const result = shell.exec(sshString, { "shell": "/bin/bash", silent: true });
      if (result.code !== 0) {
        console.error("Unable to remove remote file: " + sshString);
        console.error(result.stderr);
      }
      return result;
    } else {
      return {
        code: -1,
        stderr: " ... no remote connection details found -- unable to remove remote file."
      };
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
   * NOTE: this must be run from the Information Server environment directly (cannot be run remotely)
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
   * Adds remote connection details to an existing authorisation file, that can then be used for 
   * connecting to an Information Server system remotely (requires SSH and key-based authentication
   * to be pre-configured, or a local Docker container)
   *
   * @function
   * @param {string} file - authorisation file into which to append the remote connection details
   * @param {string} accessType - type of access, either DOCKER or SSH
   * @param {string} username - OS username used for remote access
   * @param {string} privateKey - SSH private key file used for authentication
   * @param {string} hostOrContainer - hostname (or IP) of the remote Information Server system (when accessType is SSH), or container name (when accessType is DOCKER)
   * @param {string} [port] - SSH port number for the remote Information Server system
   */
  addRemoteConnectionDetailsToAuthFile(file, accessType, username, privateKey, hostOrContainer, port) {
    let connectString = "";
    let copyString = "";
    if (accessType === "SSH") {
      connectString = "ssh -i " + privateKey + " " + username + "@" + hostOrContainer;
      copyString = "scp -i " + privateKey + " __SOURCE__ " + username + "@" + hostOrContainer + ":__TARGET__";
      if (typeof port !== 'undefined' && port !== null) {
        connectString += " -p " + port;
      }
    } else if (accessType === "DOCKER") {
      connectString = "docker exec -i " + hostOrContainer;
      copyString = "docker cp __SOURCE__ " + hostOrContainer + ":__TARGET__";
    }
    this._remoteConnectString = connectString;
    this._remoteCopyString = copyString;
    fs.appendFileSync(file, connectString, 'utf8');
    fs.appendFileSync(file, copyString, 'utf8');
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
    return this._getFromAuthFileIfUnknown('user', '_username');
  }

  /**
   * Get the user's password, from the authorisation file if needed
   * @return {string}
   */
  get password() {
    return this._getFromAuthFileIfUnknown('password', '_password');
  }

  /**
   * Get the remote connection string, from the authorisation file if needed
   * @return {string}
   */
  get remoteConnectionString() {
    return this._getFromAuthFileIfUnknown('remoteConnectString', '_remoteConnectString');
  }

  /**
   * Get the remote copy string, from the authorisation file if needed
   * @return {string}
   */
  get remoteCopyString() {
    return this._getFromAuthFileIfUnknown('remoteCopyString', '_remoteCopyString');
  }

  /**
   * Get a RestConnection object allowing REST API's to connect to this environment
   * @param {string} password - unencrypted password to use for REST connection (other details taken from authorisation file automatically)
   * @param {int} [maxSockets] - the maximum number of sockets to support concurrently on the host
   * @return {RestConnection}
   * @see module:ibm-iis-commons~RestConnection
   */
  getRestConnection(password, maxSockets) {
    if (typeof this._restConnection === 'undefined' || this._restConnection === null) {
      this._restConnection = new RestConnection(this.username, password, this.domainHost, this.domainPort, maxSockets);
    } else if (maxSockets !== undefined && maxSockets !== null && maxSockets !== "") {
      this._restConnection._agent.maxSockets = maxSockets;
    }
    return this._restConnection;
  }

  /**
   * Run the provided command on the Information Server environment
   * @param {string} command
   */
  runInfoSvrCommand(command) {
    if (this._bOnHost) {
      return shell.exec(command, { "shell": "/bin/bash", silent: true });
    } else {
      return this._executeCommandRemotely(command);
    }
  }

  /**
   * Copy the provided source file to the target location on the Information Server environment
   * @param {string} source
   * @param {string} target
   */
  copyFile(source, target) {
    if (this._bOnHost) {
      return shell.cp(source, target);
    } else {
      return this._copyFileRemotely(source, target);
    }
  }

  /**
   * Remove the specified file from the Information Server environment
   * @param {string} source
   * @param {string} target
   */
  removeFile(file) {
    if (this._bOnHost) {
      return shell.rm(file);
    } else {
      return this._removeFileRemotely(file);
    }
  }

}

module.exports = EnvironmentContext;
