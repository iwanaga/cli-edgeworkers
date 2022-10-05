import * as envUtils from './utils/env-utils';
import * as cliUtils from './utils/cli-utils';
import { promiseTimeout } from './utils/timeout-promise';
import {
  EDGEWORKERS_API_BASE,
  EDGEWORKERS_CLIENT_HEADER,
} from './edgeworkers/ew-service';
import { EDGEKV_API_BASE } from './edgekv/ekv-service';

export let accountKey: string = null;
export const timeoutVal = 120000;
const versionHeader = 'X-AK-EDGEKV-CLI-VER';
const ekvcliHeader = 'X-AK-EDGEKV-CLI';
const pjson = require('../package.json');

export function setAccountKey(account: string) {
  accountKey = account;
}

/**
 * This is for non-Tarball gets and all POST/PUT actions that return JSON or string bodies
 * for both edge CLI and edge KV CLI. This method authenticates, sends request and returns promise
 */
export function sendEdgeRequest(
  pth: string,
  method: string,
  body,
  headers,
  timeout: number,
  metricType?: string,
  requestConfig? : Record<string, unknown> 
) {
  const edge = envUtils.getEdgeGrid();

  let path = pth;
  let qs = '&';
  if (accountKey) {
    // Check if query string already included in path, if not use ? otherwise use &
    if (path.indexOf('?') == -1) qs = '?';
    path += `${qs}accountSwitchKey=${accountKey}`;
  }
  if (path.includes(EDGEWORKERS_API_BASE)) {
    headers[EDGEWORKERS_CLIENT_HEADER] = 'CLI';
  }

  if (path.includes(EDGEKV_API_BASE)) {
    headers[versionHeader] = pjson.version;
    headers[ekvcliHeader] = metricType;
  }

  const servicePromise = function () {
    return new Promise<any>((resolve, reject) => {
       edge.auth({
        path,
        method,
        headers,
        body,
        ...requestConfig,
      });

      edge.send(function (error, response, body) {
        if (!error && isOkStatus(response.status)) {
          const obj = {
            response,
            body:
              body == '' || body == 'null' || !!body
                ? cliUtils.parseIfJSON(body)
                : undefined, // adding null and empty string use case for edgekv
          };
          resolve(obj);
        } else {
          try {
            const errorObj = error.response.data;
            errorObj['status'] = error.response.status;
            errorObj['traceId'] = error.response.headers['x-trace-id']; // adding trace id for debugging purpose
            reject(cliUtils.toJsonPretty(errorObj));
          } catch (ex) {
            const commonErrMsg = 'Failed to retrieve the error response. ';

            if (!error) {
              console.error(
                commonErrMsg +
                  `No error object, but got status code ${response.status}`
              );
              reject(response);
            }

            if (!error.response || !error.response.status) {
              console.error(
                commonErrMsg +
                  `Got error: ${cliUtils.toJsonPretty(
                    error
                  )}, but error response section is incomplete`
              );
              reject(error);
            }

            console.error(
              `Got error code: ${error.response.status} calling ${method} ${path}\n${body}`
            );
            reject(body);
          }
        }
      });
    });
  };

  // race promise to set timeout
  return promiseTimeout(timeout, servicePromise());
}

export function postJson(
  path: string,
  body,
  timeout: number,
  metricType?: string,
  requestConfig? : Record<string, unknown>
) {
  return sendEdgeRequest(
    path,
    'POST',
    body,
    {
      'Content-Type': 'application/json',
    },
    timeout,
    metricType,
    requestConfig
  );
}

export function putJson(
  path: string,
  body,
  timeout: number,
  metricType?: string,
  requestConfig? : Record<string, unknown>
) {
  return sendEdgeRequest(
    path,
    'PUT',
    body,
    {
      'Content-Type': 'application/json',
    },
    timeout,
    metricType,
    requestConfig
  );
}

export function getJson(
  path: string,
  timeout: number,
  metricType?: string,
  requestConfig? : Record<string, unknown>
  ) {
  return sendEdgeRequest(path, 'GET', '', {}, timeout, metricType, requestConfig);
}

export function deleteReq(path: string,
  timeout: number,
  metricType?: string,
  requestConfig? : Record<string, unknown> 
  ) {
  return sendEdgeRequest(path, 'DELETE', '', {}, timeout, metricType, requestConfig);
}

export function isOkStatus(code) {
  return code >= 200 && code < 300;
}
