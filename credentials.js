module.exports = {
	//cookieSecret
	cookieSecret: process.env.cookieSecret,
	
	//Spotify
	spotifyClientId: process.env.spotifyClientId,
	spotifyClientSecret: process.env.spotifyClientSecret,
	//spotifyRedirect_URI: 'http://localhost:3005/spotify-bands',

	//Firebase
	firebaseApiKey: process.env.firebaseApiKey,
	firebaseAuthDomain: process.env.firebaseAuthDomain,	
	firbaseDatabaseURL: process.env.firbaseDatabaseURL,
	firebaseStorageBucket: process.env.firebaseStorageBucket,
	
	//Firebase admin
	firebaseAdminPrivateKeyP1: process.env.firebaseAdminPrivateKeyP1,
	firebaseAdminPrivateKeyP2: process.env.firebaseAdminPrivateKeyP2,
	firebaseAdminClientEmail: process.env.firebaseAdminClientEmail,
	
	
	//Cloudinary
	cloud_name: process.env.cloud_name,
	cloud_api_key: process.env.cloud_api_key,
	cloud_api_secret: process.env.cloud_api_secret
	
}