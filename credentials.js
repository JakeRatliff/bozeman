module.exports = {
	//cookieSecret
	cookieSecret: process.ENV.cookieSecret,
	//Spotify
	spotifyClientId: process.ENV.spotifyClientId,
	spotifyClientSecret: process.ENV.spotifyClientSecret,
	spotifyRedirect_URI: 'http://localhost:3005/spotify-bands',

	//Firebase
	firebaseApiKey: process.ENV.firebaseApiKey,
	firebaseAuthDomain: process.ENV.firebaseAuthDomain,	
	firbaseDatabaseURL: process.ENV.firbaseDatabaseURL,
	firebaseStorageBucket: process.ENV.firebaseStorageBucket,	
}