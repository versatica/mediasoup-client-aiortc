const process = require('process');
const fs = require('fs');
const { execSync } = require('child_process');
const { version } = require('./package.json');

const task = process.argv.slice(2).join(' ');

// eslint-disable-next-line no-console
console.log(`npm-scripts.js [INFO] running task "${task}"`);

switch (task)
{
	case 'typescript:build':
	{
		execute('rm -rf lib');
		execute('tsc');
		taskReplaceVersion();

		break;
	}

	case 'typescript:watch':
	{
		const TscWatchClient = require('tsc-watch/client');

		execute('rm -rf lib');

		const watch = new TscWatchClient();

		watch.on('success', taskReplaceVersion);
		watch.start('--pretty');

		break;
	}

	case 'lint':
	{
		const PYTHON3 = process.env.PYTHON3 || 'python3';

		execute('MEDIASOUP_NODE_LANGUAGE=typescript eslint -c .eslintrc.js --ext=ts src/');
		execute('MEDIASOUP_NODE_LANGUAGE=javascript eslint -c .eslintrc.js --ext=js --ignore-pattern \'!.eslintrc.js\' .eslintrc.js npm-scripts.js test/');
		execute(`${PYTHON3} -m flake8 worker/`);
		execute(`cd worker && ${PYTHON3} -m mypy . && cd ..`);

		break;
	}

	case 'lint:fix':
	{
		execute('MEDIASOUP_NODE_LANGUAGE=typescript eslint -c .eslintrc.js --fix --ext=ts src/');
		execute('MEDIASOUP_NODE_LANGUAGE=javascript eslint -c .eslintrc.js --fix --ext=js --ignore-pattern \'!.eslintrc.js\' .eslintrc.js npm-scripts.js test/');

		break;
	}

	case 'test':
	{
		taskReplaceVersion();
		// Run tests sequentially.
		execute('jest --runInBand');

		break;
	}

	case 'coverage':
	{
		taskReplaceVersion();
		execute('jest --coverage');
		execute('open-cli coverage/lcov-report/index.html');

		break;
	}

	case 'postinstall':
	{
		const PYP3 = process.env.PIP3 || 'pip3';

		execute(`${PYP3} install --user worker/`);

		break;
	}

	default:
	{
		throw new TypeError(`unknown task "${task}"`);
	}
}

function taskReplaceVersion()
{
	replaceJsVersion();
	replacePyVersion();
}

function replaceJsVersion()
{
	const file = 'lib/index.js';
	const text = fs.readFileSync(file, { encoding: 'utf8' });
	const result = text.replace(/__VERSION__/g, version);

	fs.writeFileSync(file, result, { encoding: 'utf8' });
}

function replacePyVersion()
{
	const file = 'worker/setup.py';
	const text = fs.readFileSync(file, { encoding: 'utf8' });
	const result = text.replace(/version=".*"/g, `version="${version}"`);

	fs.writeFileSync(file, result, { encoding: 'utf8' });
}
function execute(command)
{
	// eslint-disable-next-line no-console
	console.log(`npm-scripts.js [INFO] executing command: ${command}`);

	try
	{
		execSync(command,	{ stdio: [ 'ignore', process.stdout, process.stderr ] });
	}
	catch (error)
	{
		process.exit(1);
	}
}
