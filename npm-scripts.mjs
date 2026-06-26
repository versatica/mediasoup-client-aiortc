import process from 'node:process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

const IS_WINDOWS = os.platform() === 'win32';
// Main Git branch is 'v' concatenated with the major SEMVER number of the
// "version" field in package.json.
const MAIN_BRANCH = `v${pkg.version.split('.')[0]}`;
const [PYTHON, PYTHON_VERSION] = getPython();
const PIP_DEPS_DIR = path.resolve('worker/pip_deps');
const PIP_DEV_DEPS_DIR = path.resolve('worker/pip_dev_deps');

// Paths for ESLint to check.
const ESLINT_PATHS = [
	'eslint.config.mjs',
	'jest.config.mjs',
	'npm-scripts.mjs',
	'src',
];

// Paths for ESLint to ignore.
const ESLINT_IGNORE_PATHS = [];

// Paths for Prettier to check/write.
// NOTE: Prettier ignores paths in .gitignore.
const PRETTIER_PATHS = [
	'README.md',
	'eslint.config.mjs',
	'jest.config.mjs',
	'npm-scripts.mjs',
	'package.json',
	'tsconfig.json',
	'src',
];

const task = process.argv[2];
const taskArgs = process.argv.slice(3).join(' ');

// Set PYTHONPATH env since we use custom locations for locally installed PIP
// deps.
if (IS_WINDOWS) {
	process.env.PYTHONPATH = `${PIP_DEPS_DIR};${PIP_DEV_DEPS_DIR};${process.env.PYTHONPATH}`;
} else {
	process.env.PYTHONPATH = `${PIP_DEPS_DIR}:${PIP_DEV_DEPS_DIR}:${process.env.PYTHONPATH}`;
}

void run();

async function run() {
	logInfo(taskArgs ? `[args:"${taskArgs}"]` : '');

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
			installPythonDeps({ args: taskArgs });

			break;
		}

		case 'prepublishOnly': {
			prepublishOnly();

			break;
		}

		case 'typescript:build': {
			buildTypescript({ force: true, args: taskArgs });

			break;
		}

		case 'typescript:watch': {
			watchTypescript({ args: taskArgs });

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
			test();

			break;
		}

		case 'coverage': {
			coverageNode({ args: taskArgs });

			break;
		}

		case 'docker:build': {
			executeCmd(
				'docker build -f Dockerfile --tag mediasoup-client-aiort/docker:latest .'
			);

			break;
		}

		case 'docker:run': {
			executeInteractiveCmd(
				'docker run --name=mediasoupClientAiortcDocker -it --rm --privileged --cap-add SYS_PTRACE -v "./:/mediasoup-client-aiortc" mediasoup-client-aiort/docker:latest'
			);

			break;
		}

		case 'publish:dry-run': {
			publishDryRun();

			break;
		}

		case 'release:check': {
			checkRelease();

			break;
		}

		case 'release': {
			release({ args: taskArgs });

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

	const pythonVersion = execSync(`${python} --version`)
		.toString()
		.match(/\d\S*/)[0];

	return [python, pythonVersion];
}

function replacePythonVersion() {
	logInfo('replacePythonVersion()');

	const file = 'worker/setup.py';
	const text = fs.readFileSync(file, { encoding: 'utf8' });
	const result = text.replace(/version=".*"/g, `version="${pkg.version}"`);

	fs.writeFileSync(file, result, { encoding: 'utf8' });
}

function deleteNodeLib() {
	if (!fs.existsSync('lib')) {
		return;
	}

	logInfo('deleteNodeLib()');

	fs.rmSync('lib', { recursive: true, force: true });
}

function buildTypescript({ force, args = '' }) {
	// Skip JavaScript code generation if the output already exists, unless forced.
	if (!force && fs.existsSync('lib')) {
		return;
	}

	logInfo('buildTypescript()');

	deleteNodeLib();

	// Generate .js CommonJS code and .d.ts TypeScript declaration files in lib/.
	executeCmd(`tsc ${args}`);
}

function watchTypescript({ args = '' } = {}) {
	logInfo('watchTypescript()');

	deleteNodeLib();

	executeCmd(`tsc --watch ${args}`);
}

function lintNode() {
	logInfo('lintNode()');

	// Ensure there are no rules that are unnecessary or conflict with Prettier
	// rules.
	executeCmd('eslint-config-prettier eslint.config.mjs');

	const eslintIgnorePatternArgs = ESLINT_IGNORE_PATHS.map(
		entry => `--ignore-pattern ${entry}`
	).join(' ');
	const eslintFiles = ESLINT_PATHS.join(' ');

	executeCmd(
		`eslint -c eslint.config.mjs --max-warnings 0 ${eslintIgnorePatternArgs} ${eslintFiles}`
	);

	const prettierFiles = PRETTIER_PATHS.join(' ');

	executeCmd(`prettier --check ${prettierFiles}`);

	executeCmd('knip --config knip.config.mjs --treat-config-hints-as-errors');
}

function lintPython() {
	logInfo(`lintPython() [python version:${PYTHON_VERSION}]`);

	installPythonDevDeps();

	executeCmd(`cd worker && "${PYTHON}" -m flake8 --filename *.py && cd ..`);

	executeCmd(
		`cd worker && "${PYTHON}" -m mypy --exclude pip_deps --exclude pip_dev_deps . && cd ..`
	);
}

function formatNode() {
	logInfo('formatNode()');

	const prettierFiles = PRETTIER_PATHS.join(' ');

	executeCmd(`prettier --write ${prettierFiles}`);
}

function test({ args = '' } = {}) {
	logInfo('test()');

	executeCmd(`jest --silent false --detectOpenHandles ${args}`);
}

function coverageNode({ args = '' } = {}) {
	logInfo('coverageNode()');

	executeCmd(`jest --coverage ${args}`);
	executeCmd('open-cli coverage/lcov-report/index.html');
}

function installNodeDeps() {
	logInfo('installNodeDeps()');

	// Install/update deps.
	executeCmd('npm ci --ignore-scripts');

	// Update package-lock.json.
	executeCmd('npm install --package-lock-only --ignore-scripts');

	// Check vulnerabilities in deps.
	executeCmd('npm audit --omit dev');
}

function installPythonDeps({ args = '' } = {}) {
	logInfo(`installPythonDeps() [python version:${PYTHON_VERSION}]`);

	// Install PIP deps into custom location, so we don't depend on system-wide
	// installation.
	// However this may fail due to different PIP and OS versions, so let's do a
	// best effort.
	const res = executeCmd(
		`"${PYTHON}" -m pip install --upgrade --no-user --target="${PIP_DEPS_DIR}" ${args} worker/`,
		{ exitOnError: false }
	);

	if (!res) {
		executeCmd(
			`"${PYTHON}" -m pip install --upgrade --no-user --target="${PIP_DEPS_DIR}" ${args} --break-system-packages worker/`,
			{ exitOnError: true }
		);
	}
}

function installPythonDevDeps() {
	logInfo('installPythonDevDeps()');

	// Install PIP dev deps into custom location, so we don't depend on system-wide
	// installation.
	executeCmd(
		`"${PYTHON}" -m pip install --upgrade --no-user --target="${PIP_DEV_DEPS_DIR}" flake8 mypy`
	);
}

/**
 * `prepublishOnly` is run by NPM only on `npm publish` (not on `npm pack`,
 * `npm install` or `npm ci`). We use it to forbid publishing
 * mediasoup-client-aiortc from a local machine. The package must only be
 * published by the `mediasoup-client-aiortc-npm-publish` workflow, which runs
 * inside GitHub Actions (where GITHUB_ACTIONS environment variable is set to
 * 'true') and uses OIDC trusted publishing.
 */
function prepublishOnly() {
	logInfo('prepublishOnly()');

	if (process.env.GITHUB_ACTIONS !== 'true') {
		logError(
			"prepublishOnly() | refusing to 'npm publish' outside of GitHub Actions: mediasoup-client-aiortc is published only by the mediasoup-client-aiortc-npm-publish workflow (triggered by pushing a release tag via 'npm run release')"
		);

		exitWithError();
	}
}

function publishDryRun() {
	logInfo('publishDryRun()');

	// NOTE: We use `npm pack --dry-run` rather than `npm publish --dry-run`
	// because the latter contacts the registry and fails with "You cannot
	// publish over the previously published versions" whenever the version in
	// package.json is already published (which is the usual state between
	// releases), making it useless in CI.
	//
	// `npm pack --dry-run` still runs the `prepare` script (TypeScript build)
	// and assembles the tarball exactly as a real publish would, reporting its
	// contents without writing any file or contacting the registry. Useful to
	// validate the `files` list in package.json and that the package builds
	// before tagging a release.
	executeCmd('npm pack --dry-run --loglevel warn');
}

function checkRelease() {
	logInfo('checkRelease()');

	installNodeDeps();
	installPythonDeps();
	buildTypescript({ force: true });
	lintNode();
	lintPython();

	// Tests fail sometimes due to OS/network stuff.
	if (process.env.SKIP_TEST !== 'true') {
		test();
	}

	// Validate packaging (the `files` list in package.json) before the
	// irreversible release steps (git push, GitHub release, npm publish).
	publishDryRun();
}

function release({ args = '' } = {}) {
	logInfo('release()');

	const version = args.trim();

	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		logError(
			`release() | a SEMVER 'x.y.z' argument is required, but got '${version}'`
		);

		exitWithError();
	}

	// Must be on the main branch.
	const branch = execSync('git rev-parse --abbrev-ref HEAD', {
		encoding: 'utf-8',
	}).trim();

	if (branch !== MAIN_BRANCH) {
		logError(
			`release() | must be on '${MAIN_BRANCH}' branch, but it is on '${branch}' branch`
		);

		exitWithError();
	}

	// Clean working tree required before bumping the version.
	checkGitClean();

	// Lint, test, build, publish dry-run.
	checkRelease();

	// Bump the version in package.json + package-lock.json.
	executeCmd(`npm version ${version} --no-git-tag-version`);

	// Also replace the version in the transpiled JS.
	replacePythonVersion();

	// Commit the bump, tag it, and push both. The pushed tag triggers
	// `mediasoup-client-aiortc-npm-publish` workflow, which checks, creates the
	// GitHub release and publishes to NPM.
	//
	// The commit message carries a "[no-ci]" marker so the regular branch CI
	// workflow skips this commit.
	//
	// NOTE: "[no-ci]" (with a hyphen) is a custom marker, NOT GitHub's native
	// "[skip ci]"/"[no ci]" (which would also skip
	// `mediasoup-client-aiortc-npm-publish` workflow, since the tag push shares
	// this same commit).
	executeCmd(`git commit -am 'release ${version} [no-ci]'`);
	executeCmd(`git tag -a ${version} -m '${version}'`);
	executeCmd(`git push origin ${MAIN_BRANCH}`);
	executeCmd(`git push origin '${version}'`);
}

function checkGitClean() {
	logInfo('checkGitClean()');

	const status = execSync('git status --porcelain', {
		encoding: 'utf-8',
		stdio: ['ignore', 'pipe', 'ignore'],
	});

	if (status.trim()) {
		logError(
			'checkGitClean() | Git working tree is not clean, commit or stash your changes first'
		);

		exitWithError();
	}
}

function executeCmd(command, { cwd, exitOnError = true } = {}) {
	logInfo(
		`executeCmd(): ${command} [exitOnError:${exitOnError}${cwd ? `, cwd:${cwd}` : ''}]`
	);

	try {
		execSync(command, {
			cwd,
			stdio: ['ignore', process.stdout, process.stderr],
		});

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

function executeInteractiveCmd(command, { cwd, exitOnError = true } = {}) {
	logInfo(
		`executeInteractiveCmd(): ${command} [exitOnError:${exitOnError}${cwd ? `, cwd:${cwd}` : ''}]`
	);

	try {
		execSync(command, { cwd, stdio: 'inherit', env: process.env });

		return true;
	} catch (error) {
		if (exitOnError) {
			logError(`executeInteractiveCmd() failed, exiting: ${error}`);

			exitWithError();
		} else {
			logInfo(`executeInteractiveCmd() failed, ignoring: ${error}`);

			return false;
		}
	}
}

function logInfo(...args) {
	// eslint-disable-next-line no-console
	console.log(`npm-scripts.mjs \x1b[36m[INFO] [${task}]\x1b[0m`, ...args);
}

// eslint-disable-next-line no-unused-vars
function logWarn(...args) {
	// eslint-disable-next-line no-console
	console.warn(`npm-scripts.mjs \x1b[33m[WARN] [${task}]\x1b\0m`, ...args);
}

function logError(...args) {
	// eslint-disable-next-line no-console
	console.error(`npm-scripts.mjs \x1b[31m[ERROR] [${task}]\x1b[0m`, ...args);
}

function exitWithError() {
	process.exit(1);
}
