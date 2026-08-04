const config = {
	$schema: 'https://unpkg.com/knip@5/schema.json',
	project: ['src/**/*.ts'],
	ignoreDependencies: ['open-cli'],
	typescript: {
		config: ['tsconfig.json'],
	},
	jest: {
		config: ['jest.config.mjs'],
		entry: ['src/test/**/*.ts'],
	},
};

export default config;
