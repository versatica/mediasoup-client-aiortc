import process from 'node:process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PKG = JSON.parse(fs.readFileSync('./package.json').toString());
const IS_WINDOWS = os.platform() === 'win32';
const MAYOR_VERSION = PKG.version.split('.')[0];
const PYTHON = getPython();
const PIP_DEPS_DIR = path.resolve('worker/pip_deps');
const PIP_DEV_DEPS_DIR = path.resolve('worker/pip_dev_deps');

// Paths for ESLint to check. Converted to string for convenience.
const ESLINT_PATHS = [
	'eslint.config.mjs',
	'jest.config.mjs',
	'npm-scripts.mjs',
	'src',
].join(' ');

// Paths for ESLint to ignore. Converted to string argument for convenience.
const ESLINT_IGNORE_PATTERN_ARGS = []
	.map(entry => `--ignore-pattern ${entry}`)
	.join(' ');

// Paths for Prettier to check/write. Converted to string for convenience.
const PRETTIER_PATHS = [
	'README.md',
	'eslint.config.mjs',
	'jest.config.mjs',
	'npm-scripts.mjs',
	'package.json',
	'tsconfig.json',
	'src',
].join(' ');

const task = process.argv[2];
const args = process.argv.slice(3).join(' ');

// Set PYTHONPATH env since we use custom locations for locally installed PIP
// deps.
if (IS_WINDOWS) {
	process.env.PYTHONPATH = `${PIP_DEPS_DIR};${PIP_DEV_DEPS_DIR};${process.env.PYTHONPATH}`;
} else {
	process.env.PYTHONPATH = `${PIP_DEPS_DIR}:${PIP_DEV_DEPS_DIR}:${process.env.PYTHONPATH}`;
}

void run();

async function run() {
	logInfo(args ? `[args:"${args}"]` : '');

	switch (task) {
		// As per NPM documentation (https://docs.npmjs.com/cli/v9/using-npm/scripts)
		// `prepare` script:
		//
		// - Runs BEFORE the package is packed, i.e. during `npm publish` and
		//   `npm pack`.
		// - Runs on local `npm install` without any arguments.
		// - NOTE: If a package being installed through git contains a `prepare`
		//   script, its dependencies and devDependencies will be installed, and
		//   the `prepare` script will be run, before the package is packaged and
		//   installed.
		//
		// So here we compile TypeScript to JavaScript.
		case 'prepare': {
			buildTypescript({ force: false });

			break;
		}

		case 'postinstall': {
			installPythonDeps();

			break;
		}

		case 'typescript:build': {
			buildTypescript({ force: true });
			replacePythonVersion();

			break;
		}

		case 'typescript:watch': {
			watchTypescript();

			break;
		}

		case 'lint:node': {
			lintNode();

			break;
		}

		case 'lint:python': {
			lintPython();

			break;
		}

		case 'format:node': {
			formatNode();

			break;
		}

		case 'test': {
			replacePythonVersion();
			test();

			break;
		}

		case 'coverage': {
			replacePythonVersion();
			executeCmd(`jest --coverage ${args}`);
			executeCmd('open-cli coverage/lcov-report/index.html');

			break;
		}

		case 'release:check': {
			checkRelease();

			break;
		}

		case 'release': {
			checkRelease();
			executeCmd(`git commit -am '${PKG.version}'`);
			executeCmd(`git tag -a ${PKG.version} -m '${PKG.version}'`);
			executeCmd(`git push origin v${MAYOR_VERSION}`);
			executeCmd(`git push origin '${PKG.version}'`);
			executeCmd('npm publish');

			break;
		}

		default: {
			logError('unknown task');

			exitWithError();
		}
	}
}

function getPython() {
	let python = process.env.PYTHON;

	if (!python) {
		try {
			execSync('python3 --version', { stdio: ['ignore', 'ignore', 'ignore'] });
			python = 'python3';
		} catch (error) {
			python = 'python';
		}
	}

	return python;
}

function replacePythonVersion() {
	logInfo('replacePythonVersion()');

	const file = 'worker/setup.py';
	const text = fs.readFileSync(file, { encoding: 'utf8' });
	const result = text.replace(/version=".*"/g, `version="${PKG.version}"`);

	fs.writeFileSync(file, result, { encoding: 'utf8' });
}

function deleteNodeLib() {
	if (!fs.existsSync('lib')) {
		return;
	}

	logInfo('deleteNodeLib()');

	fs.rmSync('node/lib', { recursive: true, force: true });
}

function buildTypescript({ force }) {
	if (!force && fs.existsSync('node/lib')) {
		return;
	}

	logInfo('buildTypescript()');

	deleteNodeLib();

	// Generate .js CommonJS code and .d.ts TypeScript declaration files in lib/.
	executeCmd('tsc');
}

function watchTypescript() {
	logInfo('watchTypescript()');

	deleteNodeLib();

	executeCmd('tsc --watch');
}

function lintNode() {
	logInfo('lintNode()');

	// Ensure there are no rules that are unnecessary or conflict with Prettier
	// rules.
	executeCmd('eslint-config-prettier eslint.config.mjs');

	executeCmd(
		`eslint -c eslint.config.mjs --max-warnings 0 ${ESLINT_IGNORE_PATTERN_ARGS} ${ESLINT_PATHS}`
	);

	executeCmd(`prettier --check ${PRETTIER_PATHS}`);
}

function lintPython() {
	logInfo('lintPython()');

	installPythonDevDeps();

	executeCmd(`cd worker && "${PYTHON}" -m flake8 --filename *.py && cd ..`);
	executeCmd(
		`cd worker && "${PYTHON}" -m mypy --exclude pip_deps --exclude pip_dev_deps . && cd ..`
	);
}

function formatNode() {
	logInfo('formatNode()');

	executeCmd(`prettier --write ${PRETTIER_PATHS}`);
}

function test() {
	logInfo('test()');

	executeCmd(`jest --silent false --detectOpenHandles ${args}`);
}

function installNodeDeps() {
	logInfo('installNodeDeps()');

	// Install/update deps.
	executeCmd('npm ci --ignore-scripts');
	// Update package-lock.json.
	executeCmd('npm install --package-lock-only --ignore-scripts');
}

function installPythonDeps() {
	logInfo('installPythonDeps()');

	// Install PIP deps into custom location, so we don't depend on system-wide
	// installation.
	// However this may fail due to different PIP and OS versions, so let's do a
	// best effort.
	const res = executeCmd(
		`"${PYTHON}" -m pip install --upgrade --no-user --target="${PIP_DEPS_DIR}" ${args} worker/`,
		/* exitOnError */ false
	);

	if (!res) {
		executeCmd(
			`"${PYTHON}" -m pip install --upgrade --no-user --target="${PIP_DEPS_DIR}" ${args} --break-system-packages worker/`,
			/* exitOnError */ true
		);
	}
}

function installPythonDevDeps() {
	logInfo('installPythonDevDeps()');

	// Install PIP dev deps into custom location, so we don't depend on system-wide
	// installation.
	executeCmd(
		`"${PYTHON}" -m pip install --upgrade --no-user --target="${PIP_DEV_DEPS_DIR}" flake8 mypy`,
		/* exitOnError */ true
	);
}

function checkRelease() {
	logInfo('checkRelease()');

	installNodeDeps();
	installPythonDeps();
	buildTypescript({ force: true });
	replacePythonVersion();
	lintNode();
	lintPython();

	// Tests fail sometimes due to OS/network stuff.
	if (process.env.SKIP_TEST !== 'true') {
		test();
	}
}

/**
 * Returns true if the command succeeded, 0 otherwise.
 *
 * If exitOnError is set and command fails, then process is terminated with
 * error.
 */
function executeCmd(command, exitOnError = true) {
	logInfo(`executeCmd(): ${command}`);

	try {
		execSync(command, { stdio: ['ignore', process.stdout, process.stderr] });

		return true;
	} catch (error) {
		if (exitOnError) {
			logError(`executeCmd() failed, exiting: ${error}`);

			exitWithError();
		} else {
			logInfo(`executeCmd() failed, ignoring: ${error}`);

			return false;
		}
	}
}

function logInfo(message) {
	// eslint-disable-next-line no-console
	console.log(`npm-scripts \x1b[36m[INFO] [${task}]\x1b[0m`, message);
}

// eslint-disable-next-line no-unused-vars
function logWarn(message) {
	// eslint-disable-next-line no-console
	console.warn(`npm-scripts \x1b[33m[WARN] [${task}]\x1b[0m`, message);
}

function logError(message) {
	// eslint-disable-next-line no-console
	console.error(`npm-scripts \x1b[31m[ERROR] [${task}]\x1b[0m`, message);
}

function exitWithError() {
	process.exit(1);
}
