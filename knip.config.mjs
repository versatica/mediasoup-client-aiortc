const config = {
	$schema: 'https://unpkg.com/knip@5/schema.json',
	project: ['src/**/*.ts'],
	ignoreDependencies: ['open-cli'],
	ignoreBinaries: ['python3'],
	typescript: {
		config: ['tsconfig.json'],
	},
	jest: {
		config: ['jest.config.mjs'],
		entry: ['src/test/**/*.ts'],
	},
};

export default config;
