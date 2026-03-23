import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
	appId: 'com.waving.pals',
	appName: 'Pals',
	server: {
		url: 'https://pals-rho.vercel.app',
		cleartext: true,
	},
	plugins: {
		CapacitorHttp: {
			enabled: true,
		},
	},
	android: {
		allowMixedContent: true,
	},
}

export default config
