import {
	debug as consoleDebug,
	warn as consoleWarn,
	error as consoleError,
} from 'node:console';
import debug from 'debug';

const APP_NAME = 'mediasoup-client-aiortc';

export class Logger {
	private readonly _debug: debug.Debugger;
	private readonly _warn: debug.Debugger;
	private readonly _error: debug.Debugger;

	constructor(prefix?: string) {
		if (prefix) {
			this._debug = debug(`${APP_NAME}:${prefix}`);
			this._warn = debug(`${APP_NAME}:WARN:${prefix}`);
			this._error = debug(`${APP_NAME}:ERROR:${prefix}`);
		} else {
			this._debug = debug(APP_NAME);
			this._warn = debug(`${APP_NAME}:WARN`);
			this._error = debug(`${APP_NAME}:ERROR`);
		}

		this._debug.log = consoleDebug;
		this._warn.log = consoleWarn;
		this._error.log = consoleError;
	}

	get debug(): debug.Debugger {
		return this._debug;
	}

	get warn(): debug.Debugger {
		return this._warn;
	}

	get error(): debug.Debugger {
		return this._error;
	}
}
