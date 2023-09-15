import process from 'process';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PKG = JSON.parse(fs.readFileSync('./package.json').toString());
const MAYOR_VERSION = PKG.version.split('.')[0];

const task = process.argv.slice(2).join(' ');

run();

async function run()
{
	switch (task)
	{
		// As per NPM documentation (https://docs.npmjs.com/cli/v9/using-npm/scripts)
		// `prepare` script:
		//
		// - Runs BEFORE the package is packed, i.e. during `npm publish` and `npm pack`.
		// - Runs on local `npm install` without any arguments.
		// - NOTE: If a package being installed through git contains a `prepare` script,
		//   its dependencies and devDependencies will be installed, and the `prepare`
		//   script will be run, before the package is packaged and installed.
		//
		// So here we compile TypeScript to JavaScript.
		case 'prepare':
		{
			buildTypescript(/* force */ false);

			break;
		}

		case 'postinstall':
		{
			installPythonDeps();

			break;
		}

		case 'typescript:build':
		{
			installNodeDeps();
			buildTypescript(/* force */ true);
			replaceVersion();

			break;
		}

		case 'typescript:watch':
		{
			deleteNodeLib();
			executeCmd('tsc --watch');

			break;
		}

		case 'lint':
		{
			lintNode();
			lintPython();

			break;
		}

		case 'lint:node':
		{
			lintNode();

			break;
		}

		case 'lint:python':
		{
			lintPython();

			break;
		}

		case 'test':
		{
			buildTypescript(/* force */ false);
			replaceVersion();
			test();

			break;
		}

		case 'coverage':
		{
			buildTypescript(/* force */ false);
			replaceVersion();
			executeCmd('jest --coverage');
			executeCmd('open-cli coverage/lcov-report/index.html');

			break;
		}

		case 'release:check':
		{
			checkRelease();

			break;
		}

		case 'release':
		{
			checkRelease();
			executeCmd(`git commit -am '${PKG.version}'`, /* exitOnError */ false);
			executeCmd(`git tag -a ${PKG.version} -m '${PKG.version}'`);
			executeCmd(`git push origin v${MAYOR_VERSION}`);
			executeCmd(`git push origin '${PKG.version}'`);
			executeCmd('npm publish');

			break;
		}

		case 'install-python-deps':
		{
			installPythonDeps();

			break;
		}

		case 'install-python-dev-deps':
		{
			installPythonDevDeps();

			break;
		}

		default:
		{
			logError('unknown task');

			exitWithError();
		}
	}
}

function replaceVersion()
{
	logInfo('replaceVersion()');

	replaceNodeVersion();
	replacePythonVersion();
}

function replaceNodeVersion()
{
	logInfo('replaceNodeVersion()');

	const files = fs.readdirSync('lib',
		{
			withFileTypes : true,
			recursive     : false
		});

	for (const file of files)
	{
		if (!file.isFile())
		{
			continue;
		}

		const filePath = path.join('lib', file.name);
		const text = fs.readFileSync(filePath, { encoding: 'utf8' });
		const result = text.replace(/__MEDIASOUP_CLIENT_AIORTC_VERSION__/g, PKG.version);

		fs.writeFileSync(filePath, result, { encoding: 'utf8' });
	}
}

function replacePythonVersion()
{
	logInfo('replacePythonVersion()');

	const file = 'worker/setup.py';
	const text = fs.readFileSync(file, { encoding: 'utf8' });
	const result = text.replace(/version=".*"/g, `version="${PKG.version}"`);

	fs.writeFileSync(file, result, { encoding: 'utf8' });
}

function deleteNodeLib()
{
	if (!fs.existsSync('lib'))
	{
		return;
	}

	logInfo('deleteNodeLib()');

	executeCmd('rm -rf lib');
}

function buildTypescript(force = false)
{
	if (!force && fs.existsSync('lib'))
	{
		return;
	}

	logInfo('buildTypescript()');

	deleteNodeLib();
	executeCmd('tsc');
}

function lintNode()
{
	logInfo('lintNode()');

	executeCmd('eslint -c .eslintrc.js --max-warnings 0 src .eslintrc.js npm-scripts.mjs');
}

function lintPython()
{
	logInfo('lintPython()');

	const PYTHON = process.env.PYTHON || 'python3';

	executeCmd(`cd worker && ${PYTHON} -m flake8 && cd ..`);
	executeCmd(`cd worker && ${PYTHON} -m mypy . && cd ..`);
}

function test()
{
	logInfo('test()');

	executeCmd('jest --runInBand');
}

function installNodeDeps()
{
	logInfo('installNodeDeps()');

	// Install/update deps.
	executeCmd('npm ci --ignore-scripts');
	// Update package-lock.json.
	executeCmd('npm install --package-lock-only --ignore-scripts');
}

function installPythonDeps()
{
	logInfo('installPythonDeps()');

	const PIP = process.env.PIP || 'pip3';

	executeCmd(`${PIP} install --user worker/`);
}

function installPythonDevDeps()
{
	logInfo('installPythonDevDeps()');

	const PIP = process.env.PIP || 'pip3';

	executeCmd(`${PIP} install flake8 mypy`);
}

function checkRelease()
{
	logInfo('checkRelease()');

	installNodeDeps();
	installPythonDeps();
	buildTypescript(/* force */ true);
	replaceVersion();
	lintNode();
	// TODO: Disabled due to
	// https://github.com/versatica/mediasoup-client-aiortc/issues/25
	// lintPython();
	test();
}

function executeCmd(command, exitOnError = true)
{
	logInfo(`executeCmd(): ${command}`);

	try
	{
		execSync(command, { stdio: [ 'ignore', process.stdout, process.stderr ] });
	}
	catch (error)
	{
		if (exitOnError)
		{
			logError(`executeCmd() failed, exiting: ${error}`);

			exitWithError();
		}
		else
		{
			logInfo(`executeCmd() failed, ignoring: ${error}`);
		}
	}
}

function logInfo(message)
{
	// eslint-disable-next-line no-console
	console.log(`npm-scripts \x1b[36m[INFO] [${task}]\x1b\[0m`, message);
}

// eslint-disable-next-line no-unused-vars
function logWarn(message)
{
	// eslint-disable-next-line no-console
	console.warn(`npm-scripts \x1b[33m[WARN] [${task}]\x1b\[0m`, message);
}

function logError(message)
{
	// eslint-disable-next-line no-console
	console.error(`npm-scripts \x1b[31m[ERROR] [${task}]\x1b\[0m`, message);
}

function exitWithError()
{
	process.exit(1);
}
