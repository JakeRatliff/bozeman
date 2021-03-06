var express = require('express');
var app = express();
app.set('port', process.env.PORT || 3005);
var credentials = require('./credentials.js');
var cookieParser = require('cookie-parser')(credentials.cookieSecret);
var bodyParser = require('body-parser');
var request = require('request'); // "Request" library
var querystring = require('querystring');
var formidable = require('formidable');
var jaccard = require('jaccard');
// Generate a v1 UUID (time-based) 
var uuidV1 = require('uuid/v1');
app.use(cookieParser);
app.use(bodyParser.json() );
app.use(bodyParser.urlencoded({
    extended: true
}));
var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: credentials.cloud_name, 
  api_key: credentials.cloud_api_key, 
  api_secret: credentials.cloud_api_secret 
});

var environment = process.env.environment;
console.log("environment = " + environment);

//mongodb:
var MongoClient = require('mongodb').MongoClient;
var URI = process.env.mongoURI_band;
if(environment == 'production') URI = process.env.MONGODB_URI;
var db;
var coll;

console.log("database location  = " + URI);
var ObjectId = require('mongodb').ObjectID;

MongoClient.connect(URI, function(err, database){
	if(!err){
		db = database;
		coll = db.collection('bandyUsers');
	}else{
		console.log(err)
	}
});

var session = require('express-session');
var MongoDBStore = require('connect-mongodb-session')(session);
var store; 
if(environment == "production"){
	store = new MongoDBStore(
    {
		uri: URI,
        collection: 'sessions'
    });
}else{
	store = new MongoDBStore(
    {
		uri: 'mongodb://localhost:27017/connect_mongodb_session_test' || URI,
        collection: 'sessions'
    });
}; 
    // Catch errors 
store.on('error', function(error) {
    console.log(error);
});
 
app.use(require('express-session')({
    secret: credentials.cookieSecret,
    cookie: {
		maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week 
    },
	genid: function(req) {
		return uuidV1();
	},
    store: store,
    // Boilerplate options, see: 
    // * https://www.npmjs.com/package/express-session#resave 
    // * https://www.npmjs.com/package/express-session#saveuninitialized 
    resave: true,
    saveUninitialized: true
}));

var firebase = require("firebase");
var firebaseConfig = {
  apiKey: 			credentials.firebaseApiKey,
  authDomain: 		credentials.firebaseAuthDomain,
  databaseURL: 		credentials.firebaseDatabaseURL,
  storageBucket: 	credentials.firebaseStorageBucket,
};
firebase.initializeApp(firebaseConfig);
/*
var admin = require("firebase-admin");
//var serviceAccount = require("path/to/serviceAccountKey.json");
var privKey = "-----BEGIN PRIVATE KEY-----\n"+credentials.firebaseAdminPrivateKeyP1+credentials.firebaseAdminPrivateKeyP2+"\n-----END PRIVATE KEY-----\n";
console.log(typeof privKey);
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: "bandfriends-e7868",
    clientEmail: credentials.firebaseAdminClientEmail,
    privateKey: privKey
  }),
  databaseURL: credentials.firebaseDatabaseURL
});
*/
var spotify = {
	clientId: credentials.spotifyClientId,
	clientSecret: credentials.spotifyClientSecret
};

//handlebars:
var handlebars = require('express-handlebars')
    .create({ defaultLayout:'main' });
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

var newMiddleware = function(req,res,next){
	res.locals.userEmail = req.session.userEmail;
	res.locals.loggedInUserName = req.session.loggedInUserName;
	res.locals.navPhoto = req.session.navPhoto;	
	next();
};
app.use(newMiddleware);
var tinyFace = function(x){
	var index = x.indexOf("/upload")+7;
	return x.slice(0,index) + "/w_50,h_50,c_thumb,g_face" + x .slice(index)
}
//calculates distance "as the crow flies" between two coordinates
function haversineDistance(coords1, coords2, isMiles) {
	function toRad(x) {
		return x * Math.PI / 180;
	}
	var lon1 = coords1[0];
	var lat1 = coords1[1];
	var lon2 = coords2[0];
	var lat2 = coords2[1];
		var R = 6371; // km
		var x1 = lat2 - lat1;
	var dLat = toRad(x1);
	var x2 = lon2 - lon1;
	var dLon = toRad(x2)
	var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
		Math.sin(dLon / 2) * Math.sin(dLon / 2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	var d = R * c;
	if(isMiles) d /= 1.60934;
	d = Math.floor(d*100)/100;
	return d;
}

//for Spotify client credentials auth:
var authOptions = {
  url: 'https://accounts.spotify.com/api/token',
  headers: {
	'Authorization': 'Basic ' + (new Buffer(spotify.clientId + ':' + spotify.clientSecret).toString('base64'))
  },
  form: {
	grant_type: 'client_credentials'
  },
  json: true
};

//////////
//ROUTES//
//////////
app.get('/', function(req,res){
	var email = req.session.userEmail;
	var user = req.session.loggedInUserName;
	var msgCount;
	var errMsg;
	if(req.session.errMsg){
		errMsg = req.session.errMsg;
	}
	if(req.session.completedProfile){
		//console.log("loggedInUserName = " + loggedInUserName);
		coll.findOne({"userEmail":email},function(err,doc){
			if(doc.messages){
				msgCount = doc.messages.length;
				console.log(msgCount);
			}
			res.render('home',{
				user:user,
				msgCount: msgCount,
				//navPhoto: navPhoto
			});
		});
	}else{
		res.render('home',{errMsg:errMsg});
	}
	req.session.errMsg = undefined;
});

app.get('/redirector', function(req, res){
	res.redirect(303, '/');
});

////DEV TESTING ONLY NFP:
app.get('/make-fake', function(req, res){
	res.render('create-fake-profile');
});

app.get('/user-map',function(req,res){
	if(environment == 'local'){
		res.render('map');
	}else{
		res.render('map-PROD');
	}
});

app.get('/user-locs', function(req, res){
	var userLocs = [];
	coll.find({},{_id:0,loc:1,name:1}).toArray(function(err, docs){
		if(!err){
			docs.forEach(function(doc){
				userLocs.push([doc.loc, doc.name]);
			});
			res.send(userLocs);
		}else{
			console.log(err);
		}
	});
});

app.post('/make-fake', function(req,res){
	var fakeUserBands = JSON.parse(req.cookies.fakeUserBands);
	var bandIds = [];
	var relBandIds = [];
	var allBandIds = [];
	var processedBands = 0;
	var name, bio, age, gender, image, imgUrl, userLocation;
	var form = new formidable.IncomingForm();	
	fakeUserBands.forEach(function(band){
		bandIds.push(band.spotifyId);
		allBandIds.push(band.spotifyId);
	});	
    console.log("--FORM--");	
	form.parse(req, function(err, fields, files){
		if(err) return res.redirect(303, '/');
		/*		
		console.log('recieved fields: ');
		console.log(fields);
		console.log('recieved files: ');
		console.log(files);
		*/
		name = fields.name;
		age = fields.age;
		gender = fields.gender;
		bio = fields.bio;
		image = files.photo.path;
		
		sendToCloud(image)
		.then(getRelatedIds);
		
		if(fields.specificCoords){
			console.log("there are specified coords");
			userLocation = {type : "Point", coordinates: fields.specificCoords.split(", ")};
			userLocation.coordinates[0] = +userLocation.coordinates[0];
			userLocation.coordinates[1] = +userLocation.coordinates[1];
		}else{
			userLocation = fakedCoords();
		};
	});
	function getRelatedIds(){
		fakeUserBands.forEach(function(band){
			getRelated(band)
		});
	};
	var fakedCoords = function(){ //{"lon": -79.0558, "lat": 35.9132};
		function posNeg(){
			var plusOrMinus = Math.random() < 0.5 ? -1 : 1; return plusOrMinus
			};		
		var lon = -79.00 + (Math.random()*.1*posNeg());
		var lat = 35.94 + (Math.random()*.1*posNeg());
		return {type: "Point", coordinates:[lon,lat]};		
	}
	function getRelated(band){
		request.post(authOptions, function(error, response, body) {
			if (!error && response.statusCode === 200) {
				var token = body.access_token;
				var options = {
					url: 'https://api.spotify.com/v1/artists/' + band.spotifyId + '/related-artists', 
					headers: {
						'Authorization': 'Bearer ' + token
					},
					json: true
				};
				request.get(options, function(err, response, body) {
					if(!err){
						var artists = body.artists;						
						artists.forEach(function(artist){
							relBandIds.push(artist.id);
							allBandIds.push(artist.id);
						})
						processedBands++;
						if(processedBands === fakeUserBands.length){
							sendData();
						}
					}else{
						console.log(err);
					}
				});
			}else{
				console.log(response.statusCode);
			}
		});
	};
	function sendToCloud(file){
		console.log("sending to cloudinary");
		return new Promise(function(resolve, reject){
			cloudinary.uploader.upload(file, function(result){
				console.log(result);
				imgUrl = result.secure_url;
				resolve();
			});
		});
	};
	function sendData(){
		try{
			coll.insertOne({
				"name" : name,
				"photo" : imgUrl,
				"bio" : bio,
				"age" : age,
				"gender" : gender,
				"bands": fakeUserBands,
				"bandIds": bandIds,
				"relBandIds": relBandIds,
				"allBandIds": allBandIds,
				"loc" : userLocation,
				"fake" : true
			});					
		}catch(e){
			console.log(e)
		};		
		res.redirect(303,'/list-profiles');
	}
});

//NOT FOR PRODUCTION:
app.get('/list-profiles', function(req, res){
	var jake;
	if(req.session.loggedInUserName == "jake"){
		jake = true;
	}
	var profiles = [];		
	coll.find({}, {_id:0, name:1}).toArray(function(err,docs){
		if(!err){
			docs.forEach(function(doc){
				profiles.push(doc);
			});
			res.render('list-profiles',{
				profiles:profiles,
				jake: jake
			});
		}else{
			console.log(err);
		}
	}); 
});

app.post('/adminKill', function(req, res){
	var userName = req.body.userName;
	console.log(userName);
	///****delete in Firebase and Cloudinary, too. Delete session also.
	coll.findOne({"name": userName},{"_id":0, "userEmail":1, "photo":1}, function(err, doc){
		if(!err){
			var email = doc.userEmail;
			admin.auth().getUserByEmail(email)
				.then(function(userRecord) {
					// See the tables above for the contents of userRecord
					console.log("Successfully fetched user data:", userRecord.toJSON());
				})
				.catch(function(error) {
					console.log("Error fetching user data:", error);
				});
		}else{
			console.log(err)
		};
	});
	coll.remove({"name": userName});
});

app.get('/profile/:userName', function(req, res){
//console.log(loggedInUserLocation);	
	if(req.session.loggedInUserName){
		var imageSrc, snippet, otherUserLocation, otherUserAllBandIds, distance, bio, age, gender, bands, musicMatch;
		var userName = req.params.userName;	
		coll.findOne({"name" : userName}, function(err,doc){
			if(!err){
				imageSrc = doc.photo;//photo.path.slice(doc.photo.path.indexOf('uploads'));						
				userName = doc.name;
				snippet = doc.snippet;
				bio = doc.bio;
				age = doc.age;
				gender = doc.gender;
				bands = doc.bands;
				otherUserAllBandIds = doc.allBandIds;
				musicMatch = Math.floor(jaccard.index(req.session.userAllBandIds, otherUserAllBandIds)*100)/100;
				console.log("musicMatch = " + musicMatch);
				if(musicMatch < .06){
					musicMatch = "different";
				}else if(.06 < musicMatch < .10){
					musicMatch = "somewhat similar";
				}else if(.10 < musicMatch < 1){
					musicMatch = "similar";
				}else{
					musicMatch = "quite similar";
				}
				otherUserLocation = doc.loc.coordinates;
				distance = haversineDistance(req.session.loggedInUserLocation, otherUserLocation, true);
				///TODO. exact user distance in view is DEV only. they dont need to see exact distance from each other.
				if(userName == req.session.loggedInUserName){
					res.render('self',{
					imgUrl:imageSrc,
						userName:userName,
						snippet: snippet,
						bio: bio,
						age: age,
						gender: gender,
						bands: bands
					});
				}else{
					res.render('profile',{
						imgUrl:imageSrc,
						userName:userName,
						snippet: snippet,
						bio: bio,
						age: age,
						gender: gender,
						bands: bands,
						distance: distance,
						musicMatch: musicMatch
					});											
				}
			}else{
				console.log(err);
			}
		}); 
	}else{
		console.log("log in to view other user profiles");
		res.redirect('/')
	};
	console.log("res.locals.loggedInUserName = " + res.locals.loggedInUserName);
});

app.get('/edit', function(req,res){
	/*MongoClient.connect(URI, function(err, db){
		if(!err){
			console.log('connected to db');
		}else{
			console.log(err);
		}
	}); */
	res.render('edit');
});

app.get('/browse', function(req, res){
	console.log("top of /browse");
	var matches = [];
	console.log("userBands = " + req.session.userBands);
	if(req.session.loggedInUserName){
		console.log("your location = " + req.session.loggedInUserLocation);
		console.log("matches.length = " + matches.length);
		coll.find(
		{
			loc: {$geoWithin:{$centerSphere:[req.session.loggedInUserLocation,20/3963.2]}}, ///20 mile radius
			allBandIds: {$in: req.session.userBands}
		}, 
		{_id:0,name:1}).toArray(function(err, docs){
			if(!err){
				docs.forEach(function(doc){
					if(doc.name != req.session.loggedInUserName) matches.push(doc.name);
					console.log(doc.name + "  " + req.session.loggedInUserName);
				});
				console.log("matches.length = " + matches.length);
				req.session.matches =  matches;
				req.session.matchIndex = 0;
				if(matches.length > 0){
					res.redirect(302,'/profile/' + matches[0]);
				}else{
					res.send("<h3>No matches at this time, check back later.</h3>");
				}
			}else{
				console.log(err)
			};
		});
	}else{
	res.redirect('/')
	console.log("need to be logged in to browse");
	};
});

app.get('/next-profile', function(req,res){
	var matches = req.session.matches;
	req.session.matchIndex++;
	if(req.session.matchIndex < matches.length){
		res.send('/profile/' + matches[req.session.matchIndex]);	
	}else{
		console.log("condition met");
		//req.session.matches = undefined;
		//req.session.matchIndex = 0;
		res.send('/browse');
	}
});

app.post('/user-locale', function(req,res){
	var loggedInUserLocation = [];
	loggedInUserLocation[0] = +req.body.longitude;
	loggedInUserLocation[1] = +req.body.latitude;
	req.session.loggedInUserLocation = loggedInUserLocation;
	//if(loggedInUserLocation){
		try{
			coll.updateOne({"userEmail":req.session.userEmail},				
			{$set:{
				"loc" : {type: "Point", coordinates: loggedInUserLocation}
			}});
			res.send("locale updated");
		}catch(e){
			console.log(e)
		};	
	//}
});

app.get('/add-bands', function(req, res){
	if(environment == "production"){
		res.render('add-spotify-artists-PROD');
	}else{
		res.render('add-spotify-artists'); //was: add-bands
	}
});

app.post('/add-bands', function(req, res){
	var bands = req.body.bands;
	console.log(bands);
	var bandIds = [];
	var relBandIds = [];
	var allBandIds = [];
	var processedBands = 0;
	var userBands = [];
	var userAllBandIds = [];

	bands.forEach(function(band){getRelated(band)});
	console.log("app.post('/add-bands'....");
	console.log(userBands);
	console.log(userAllBandIds);
	console.log("userAllBandIds.length = " + userAllBandIds.length);
	console.log("userBands in /add-bands post route = " + userBands);
	req.session.userBands = userBands;	
	
	///	doc.bandIds.forEach(function(id){userBands.push(id)});
	///	doc.allBandIds.forEach(function(id){userAllBandIds.push(id)});	
	
	function getRelated(band){
		bandIds.push(band.spotifyId);
		userBands.push(band.spotifyId); ///for browsing after sign up
		allBandIds.push(band.spotifyId);
		userAllBandIds.push(band.spotifyId); ///for browsing after sign up
		request.post(authOptions, function(error, response, body) {
			if (!error && response.statusCode === 200) {
				var token = body.access_token;
				var options = {
					url: 'https://api.spotify.com/v1/artists/' + band.spotifyId + '/related-artists', 
					headers: {
						'Authorization': 'Bearer ' + token
					},
					json: true
				};
				request.get(options, function(err, response, body) {
					if(!err){
						var artists = body.artists;						
						artists.forEach(function(artist){
							relBandIds.push(artist.id);
							allBandIds.push(artist.id);
							userAllBandIds.push(artist.id);
						})
						processedBands++;
						if(processedBands === bands.length){
							req.session.userAllBandIds = userAllBandIds; ///just moved to here
							sendData();
						}
					}else{
						console.log(err);
					}
				});
			}else{
				console.log(response.statusCode);
				res.send("<h4>Spotify Request Failed.</h4>");
			}
		});
	};

	function sendData(){ /// TODO: check if email already there, if so, update that document instead of making a new one.
		console.log("current user email = " + req.session.userEmail);
		console.log("inserting into db...");
		coll.insertOne({
			"userEmail" : req.session.userEmail,
			"bands" : bands,
			"bandIds": bandIds,
			"relBandIds": relBandIds,
			"allBandIds": allBandIds
		});
		res.send({redirect : '/complete-profile'});
	};	
});

app.get('/complete-profile', function(req,res){
	if(req.session.userEmail){
		res.render('complete-profile');
	}else{
		res.redirect('/')
	};
});
app.get('/terms-of-service', function(req, res){
	res.render('terms-of-service');
});
app.post('/complete-profile', function(req,res){
    console.log("--FORM--");
	var form = new formidable.IncomingForm();
	var name, snippet, bio, age, gender, image, imgUrl;	
	form.parse(req, function(err, fields, files){
		if(err) console.log(err);
		name = fields.name;
		snippet = fields.snippet;
		bio = fields.bio;
		age = fields.age;
		gender = fields.gender;
		image = files.photo.path;
		sendToCloud(image).then(sendData);
	});		
	function sendToCloud(file){
		console.log("sending to cloudinary");
		return new Promise(function(resolve, reject){
			cloudinary.uploader.upload(file, function(result){
				console.log(result);
				if(result.error){
					res.send("There was an error uploading your image.");
				}
				imgUrl = result.secure_url;
				resolve();
			});
		});
	};	
	function sendData(){
		var user = firebase.auth().currentUser;
		req.session.loggedInUserName = name; ///TODO: make sure name is unique in db
		var iconPhoto = tinyFace(imgUrl);
		req.session.navPhoto = iconPhoto;
		try{
			coll.updateOne({"userEmail":req.session.userEmail},				
			{$set:{
				"name" : name,
				"photo" : imgUrl,
				"snippet" : snippet,
				"iconPhoto": iconPhoto,
				"bio" : bio,
				"age" : age,
				"gender" : gender,
				"completedProfile": true
			}}, function(err, result){
				if(err) console.log(err);
				req.session.completedProfile = true;
				req.session.signUpFlow = true;
			});
			user.updateProfile({
				displayName: name
			}).then(res.redirect(303,'/redirector'));
		}catch(e){
			console.log(e)
		};		
	}
});

app.post('/check-name', function(req, res){
	var name = req.body.name;
	coll.findOne({name:name}, function(err,doc){
		if(doc){
			res.send({"taken":true});
			res.end();
		}else{
			res.send({"taken":false});
			res.end();
		}
	});
});

app.post('/check-loc', function(req, res){
	var loc = req.session.loggedInUserLocation;
	console.log(loc);
	if(loc){
		res.send({"located":true});
		res.end();
	}else{
		res.send({"located":false});
		res.end();
	};
});

app.get('/messages', function(req, res){
	var messages;
	coll.findOne({name: req.session.loggedInUserName}, {messages:1}, function(err, doc){
		messages = doc.messages;
		res.render('messages', {messages:messages});
	});
});

app.post('/send-message', function(req, res){
	var date = new Date();
	var message = req.body.message;
	var reciever = req.body.reciever;
	coll.findOneAndUpdate(
		{"name": reciever}, 
		{$addToSet: 
			{ "messages": {
				"tinyFace": req.session.navPhoto,
				"date": date, 
				"sender": req.session.loggedInUserName, 
				"message": message, 
				"seen": false
			}}
		}
	);
	res.send("success");
});

//Authentication. TODO: optimize sign up and login flow, add FB login.

app.post('/google-sign-in', function(req, res){
	var auth = firebase.auth();
	var id_token = req.body.id_token;
	// Build Firebase credential with the Google ID token.
	var credential = firebase.auth.GoogleAuthProvider.credential(id_token);
	console.log("credential = " + credential);
	// Sign in with credential from the Google user.
	auth.signInWithCredential(credential)
	.then(function(){
		var email = auth.currentUser.email;
		req.session.userEmail = email;
		coll.findOne({"userEmail" : email}, function(err,doc){
			if(doc && doc.userEmail){
				console.log("this user email is already in the db...");
				if(doc.name){
					req.session.loggedInUserName = doc.name;
					req.session.completedProfile = true;
					req.session.navPhoto = doc.iconPhoto;
					if(doc.bandIds){
						req.session.userBands = doc.bandIds;
						req.session.userAllBandIds = doc.allBandIds;
					}
					res.send({"newUser": false});
				}else{
					res.send({"incompleteProfile": true});
				}				
			}else{
				console.log("this user email is new to the db...");
				res.send({"newUser": true});
			}
		});
	})
	.catch(function(error) {
		// Handle Errors here.
		var errorCode = error.code;
		var errorMessage = error.message;
		// The email of the user's account used.
		var email = error.email;
		// The firebase.auth.AuthCredential type that was used.
		var credential = error.credential;
		// ...
	});
});

app.post('/facebook-sign-in', function(req, res){
	var auth = firebase.auth();
	var authResponse = req.body.authResponse;
	var credential = firebase.auth.FacebookAuthProvider.credential(authResponse.accessToken)
	auth.signInWithCredential(credential)
	.then(function(){
		var email = auth.currentUser.email;
		req.session.userEmail = email;
		coll.findOne({"userEmail" : email}, function(err,doc){
			if(doc && doc.userEmail){
				console.log("this user email is already in the db...");
				if(doc.name){
					req.session.loggedInUserName = doc.name;
					req.session.completedProfile = true;
					req.session.navPhoto = doc.iconPhoto;
					if(doc.bandIds){
						req.session.userBands = doc.bandIds;
						req.session.userAllBandIds = doc.allBandIds;
					}
					res.send({"newUser": false});
				}else{
					res.send({"incompleteProfile": true});
				}				
			}else{
				console.log("this user email is new to the db...");
				res.send({"newUser": true});
			}
		});
	})	
	.catch(function(error) {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        // The email of the user's account used.
        var email = error.email;
        // The firebase.auth.AuthCredential type that was used.
        var credential = error.credential;
        // ...
		console.log("errorCode: " + errorCode);
	});
	console.log(authResponse);
});

app.post('/login', function(req, res) {
	var loginFlow = function(){
		var userBands = [];
		var userAllBandIds = [];
		var loggedInUserLocation = [];
		var email = auth.currentUser.email;
		req.session.userEmail = email;
		coll.findOne({"userEmail" : email}, function(err,doc){
			if(!err){
				if(doc){
					if(doc.bandIds){
					doc.bandIds.forEach(function(id){userBands.push(id)});
					doc.allBandIds.forEach(function(id){userAllBandIds.push(id)});					
					}else{
						res.redirect(303, '/add-bands');
					}
					if(doc.bandIds && doc.completedProfile){
						console.log("This user has completed their profile.");
						req.session.completedProfile = true;
						req.session.navPhoto = doc.iconPhoto;
						req.session.loggedInUserName = doc.name;
					}else{
						res.redirect(303, '/complete-profile');
					}
					if(doc.loc){
						loggedInUserLocation[0] = doc.loc.coordinates[0];
						loggedInUserLocation[1] = doc.loc.coordinates[1];
						console.log("added user\'s last location");							
					};
					req.session.userBands = userBands;
					req.session.userAllBandIds = userAllBandIds;
					req.session.loggedInUserLocation = loggedInUserLocation;
					res.redirect('/');
				}else{
					req.session.userEmail = email;
					res.redirect('/add-bands');
				}				
			}else{
				console.log(err)
			};
		});
	}
	/*if(req.body.id_token){
		var id_token = req.body.id_token;
		// Build Firebase credential with the Google ID token.
		var credential = firebase.auth.GoogleAuthProvider.credential(id_token);
		// Sign in with credential from the Google user.
		firebase.auth().signInWithCredential(credential).then(loginFlow);
	}*/
	var auth = firebase.auth();
	console.log("logging user in...");
	var email = req.body.email;
	var pass = req.body.pass;
	var signIn = auth.signInWithEmailAndPassword(email, pass);
	var errorMsg = function(e){
		console.log(e.code);
		req.session.errMsg = e.message;
		res.redirect(303, '/');
	};
	signIn.then(loginFlow).catch(errorMsg);
});

app.get('/check-session', function(req, res) {
    res.send(JSON.stringify(req.session));
});
  
app.post('/sign-up', function(req, res) {
	console.log("signing user up...");
	var auth = firebase.auth();
	var email = req.body.email;
	var pass = req.body.pass;
	var signUp = auth.createUserWithEmailAndPassword(email, pass);
	var errorMsg = function(e){
		console.log(e.code);
		req.session.errMsg = e.message;
		res.redirect(303, '/');
	};
	signUp.then(function(){
		req.session.userEmail = email;
		res.redirect(303, '/add-bands');
	}).catch(errorMsg);    
});

app.get('/logout', function(req, res) {
	var auth = firebase.auth();
	console.log("logging user out...");
	signUpFlow = false;
	auth.signOut().then(function() {
		console.log("signed out firebase");
		req.session.destroy(function(err) {
			// cannot access session here
			console.log("session destoyed.");
			res.redirect('/');
		})
	}).catch(function(error) {
		console.log(error);
	});
});

app.post('/logout', function(req, res) {
	var auth = firebase.auth();
	console.log("logging user out...");
	signUpFlow = false;
	auth.signOut().then(function() {
		console.log("signed out firebase");
		req.session.destroy(function(err) {
			// cannot access session here
			console.log("session destoyed.");
			res.redirect('/');
		})
	}).catch(function(error) {
		console.log(error);
	});
});

//404 page:
app.use(function(req, res, next){
    res.status(404);
    res.render('404',{404:true});
});

//500 page:
app.use(function(err, req, res, next){
    console.error(err.stack);
    res.status(500);
    res.send('500 - server error');
});

app.listen(app.get('port'), function(){
	if(environment == "local") console.log('Express started on http://localhost:'+ app.get('port') + '; Press ctrl-C to terminate.')
});