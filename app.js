var express = require('express');
var app = express();
app.set('port', process.env.PORT || 3005);
var credentials = require('./credentials.js');
var cookieParser = require('cookie-parser')(credentials.cookieSecret);
var bodyParser = require('body-parser');
var request = require('request'); // "Request" library
var querystring = require('querystring');
var formidable = require('formidable');
app.use(cookieParser);
app.use(bodyParser.json() );
app.use(bodyParser.urlencoded({
    extended: true
}));

///Russ Jones: "npm install jaccard" TODO
app.use(require('express-session')({
    resave: false,
    saveUninitialized: false,
    secret: credentials.cookieSecret
}));

var firebase = require("firebase");
var firebaseConfig = {
  apiKey: 			credentials.firebaseApiKey,
  authDomain: 		credentials.firebaseAuthDomain,
  databaseURL: 		credentials.firebaseDatabaseURL,
  storageBucket: 	credentials.firebaseStorageBucket,
};

console.log(credentials.firebaseApiKey);

firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var user;
var loggedInUserLocation= [];
var loggedInUserName;
var matches = [];
var matchIndex = 0;

var userBands = [];

auth.onAuthStateChanged(function(firebaseUser){
	if(firebaseUser){
		console.log("user is logged in as: " + firebaseUser.email);
		user = firebase.auth().currentUser;
	}else{
		user = null;
		//res.locals.user = undefined;
		console.log("not logged in");
		//TODO remove session
	}
});


app.use('/uploads', express.static(__dirname + "/uploads"));

//handlebars:
var handlebars = require('express-handlebars')
    .create({ defaultLayout:'main' });
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

//mongodb:
var MongoClient = require('mongodb').MongoClient;
var URI = process.env.mongoURI_band;
console.log("database location  = " + URI);
var ObjectId = require('mongodb').ObjectID;

var jakesDevLogger = function(req, res, next){
	//var user = auth.currentUser;
	//if(user) user = user.email;
	if(user){
		console.log("\nJake's dev logger:\n   User: " + loggedInUserName + "\n   Date: " + new Date()+"\n   req.url: " + req.url+"\n");
		if(loggedInUserLocation){
			console.log("User location: Longitude: " + loggedInUserLocation[0] + " , Latitude:" + loggedInUserLocation[1]);
		}
	}else{
		console.log("\Jakes's dev logger: not logged in.");
	}
	next();
};
app.use(jakesDevLogger);

app.use(function(req, res, next) {
    if(res && auth.currentUser){
		res.locals.userEmail = auth.currentUser.email;
		if(auth.currentUser.displayName){
			loggedInUserName = auth.currentUser.displayName;
			res.locals.loggedInUserName = loggedInUserName;
		} 		
	} 
    next();
});

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
	'Authorization': 'Basic ' + (new Buffer(credentials.spotifyClientId + ':' + credentials.spotifyClientSecret).toString('base64'))
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
	res.render('home',{user:user});
});

////DEV TESTING ONLY NFP:
app.get('/make-fake', function(req, res){
	res.render('create-fake-profile');
});

app.get('/user-map',function(req,res){
	res.render('map');

});

app.get('/user-locs', function(req, res){
	var userLocs = [];
	MongoClient.connect(URI, function(err, db){
		if(!err){
			db.collection('bandyUsers').find({},{_id:0,loc:1,name:1}).toArray(function(err, docs){
				if(!err){
					docs.forEach(function(doc){
						userLocs.push([doc.loc, doc.name]);
					});
					res.send(userLocs);
				}else{
					console.log(err);
				}
			});
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
	processedBands = 0;
	
	fakeUserBands.forEach(function(band){
		bandIds.push(band.spotifyId);
		allBandIds.push(band.spotifyId);
	});


	var form = new formidable.IncomingForm();	
	form.uploadDir = __dirname + '/uploads';
    console.log("--FORM--");	
	
	form.on('fileBegin', function(name, file) {
		var date = +new Date();
		file.path = form.uploadDir + "/" + date + "-" + file.name;
	})

	form.parse(req, function(err, fields, files){
		if(err) return res.redirect(303, '/');
		
		console.log('recieved fields: ');
		console.log(fields);
		/*
		console.log('recieved files: ');
		console.log(files);
		*/
		
		fakeUserBands.forEach(function(band){
			getRelated(band)
		});
	
		
		var userLocation;
		
		var fakedCoords = function(){ //{"lon": -79.0558, "lat": 35.9132};
			function posNeg(){
				var plusOrMinus = Math.random() < 0.5 ? -1 : 1; return plusOrMinus
				};		
			var lon = -79.00 + (Math.random()*.1*posNeg());
			var lat = 35.94 + (Math.random()*.1*posNeg());
			return {type: "Point", coordinates:[lon,lat]};		
		}
		
		if(fields.specificCoords){
			console.log("there are specified coords");
			userLocation = {type : "Point", coordinates: fields.specificCoords.split(", ")};
			userLocation.coordinates[0] = +userLocation.coordinates[0];
			userLocation.coordinates[1] = +userLocation.coordinates[1];
		}else{
			userLocation = fakedCoords();
		};
		
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
				}
			});
		};

		function sendData(){
			MongoClient.connect(URI, function(err, db){
				if(!err){
					console.log('connected to db, inserting fake profile...');
					try{
						db.collection('bandyUsers').insertOne(				
						{
							"name" : fields.name,
							"photo" : files.photo,
							"bio" : fields.bio,
							"age" : fields.age,
							"gender" : fields.gender,
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
				}else{
					console.log(err);
				}
			})		
			res.redirect(303,'/list-profiles');
		}
	});
});

//NOT FOR PRODUCTION:
app.get('/list-profiles', function(req, res){
	var profiles = [];
		MongoClient.connect(URI, function(err, db){
			if(!err){			
				db.collection('bandyUsers').find({}, {_id:0, name:1}).toArray(function(err,docs){
					if(!err){
						docs.forEach(function(doc){
							profiles.push(doc);
						});
						console.log(profiles);
						res.render('list-profiles',{
							profiles:profiles
						});
					}else{
						console.log(err);
					}
				}); 
			}
		});
});

app.get('/profile/:userName', function(req, res){
console.log(loggedInUserLocation);	
	if(user){
		var imageSrc;
		var userName = req.params.userName;
		var otherUserLocation;
		var distance;
		var bio;
		var age;
		var gender;
		var bands;
		MongoClient.connect(URI, function(err, db){
			if(!err){			
				db.collection('bandyUsers').findOne({"name" : userName}, function(err,doc){
					if(!err){
						imageSrc = doc.photo.path.slice(doc.photo.path.indexOf('uploads'));						
						userName = doc.name;
						bio = doc.bio;
						age = doc.age;
						gender = doc.gender;
						bands = doc.bands;
						otherUserLocation = doc.loc.coordinates;
						distance = haversineDistance(loggedInUserLocation, otherUserLocation, true);
						//TODO. user distance in view is DEV only. they dont need to see exact distance from each other.
						
						if(userName == loggedInUserName){
							res.render('self',{
								imgUrl:imageSrc,
								userName:userName,
								bio: bio,
								age: age,
								gender: gender,
								bands: bands
							});
						}else{
							res.render('profile',{
								imgUrl:imageSrc,
								userName:userName,
								bio: bio,
								age: age,
								gender: gender,
								bands: bands,
								distance: distance
							});											
						}
					}else{
						console.log(err);
					}
				}); 
			}
		});
	}else{
		console.log("log in to view other user profiles");
		res.redirect('/')
	};
	console.log("res.locals.user = " + res.locals.user);
});

app.get('/edit', function(req,res){
	MongoClient.connect(URI, function(err, db){
		if(!err){
			console.log('connected to db');
		}else{
			console.log(err);
		}
	});
	res.render('edit');
});

app.get('/browse', function(req, res){
	console.log("userBands = " + userBands);
	if(user){
		console.log("your location = " + loggedInUserLocation);
		console.log("matches.length = " + matches.length);
		MongoClient.connect(URI, function(err,db){
			if(!err){
				db.collection('bandyUsers').find(
				{
					loc: {$geoWithin:{$centerSphere:[loggedInUserLocation,10/3963.2]}}, ///10 mile radius
					allBandIds: {$in: userBands}
				}, 
				{_id:0,name:1}).toArray(function(err, docs){
					if(!err){
						docs.forEach(function(doc){
							if(doc.name !== loggedInUserName) matches.push(doc.name);
						});
						console.log("matches.length = " + matches.length);
						res.redirect(302,'/profile/' + matches[0]);
					}else{
						console.log(err)
					};
				});
			}else{
				console.log(err);
			};
		});
	}else{
	res.redirect('/')
	console.log("need to be logged in to browse");
	};
});

app.get('/next-profile', function(req,res){
	matchIndex ++;
	//if(loggedInUserName == matches[matchIndex]) matchIndex ++; //loggedInUserName is not being added to matches array now
	if(matchIndex < matches.length){
		res.send('/profile/' + matches[matchIndex]);	
	}else{
		matches = [];
		matchIndex = 0;
		res.send('/browse')
	}
});


app.post('/user-locale', function(req,res){
	loggedInUserLocation[0] = +req.body.longitude;
	loggedInUserLocation[1] = +req.body.latitude;
	console.log(loggedInUserLocation);
	if(loggedInUserLocation){
		MongoClient.connect(URI, function(err, db){
			if(!err){
				console.log('connected to db, updating document...');
				try{
					db.collection('bandyUsers').updateOne({"userEmail":auth.currentUser.email},				
					{$set:{
						"loc" : {type: "Point", coordinates: loggedInUserLocation}
					}});					
				}catch(e){
					console.log(e)
				};
			}else{
				console.log(err);
			}
		});		
	}
});

app.get('/add-bands', function(req, res){
	if(user){
		res.render('add-spotify-artists'); //was: add-bands
	}else{
		res.redirect('/')
	};
})

app.post('/add-bands', function(req, res){
	var bands = req.body.bands;
	console.log(bands);
	var bandIds = [];
	var relBandIds = [];
	var allBandIds = [];
	var processedBands = 0;

	bands.forEach(function(band){getRelated(band)});

	function getRelated(band){
		bandIds.push(band.spotifyId);
		allBandIds.push(band.spotifyId);
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
						if(processedBands === bands.length){
							sendData();
						}
					}else{
						console.log(err);
					}
				});
			}
		});
	};


	function sendData(){ /// TODO: check if email already there, if so, update that document instead of making a new one.
		MongoClient.connect(URI, function(err,db){
			console.log("inserting into db...");
			if(!err){
				db.collection('bandyUsers').insertOne({
					"userEmail" : auth.currentUser.email,
					"bands" : bands,
					"bandIds": bandIds,
					"relBandIds": relBandIds,
					"allBandIds": allBandIds
				})
			}else{
				console.log(err);
			}
		})
	};	
	
});

app.get('/complete-profile', function(req,res){
	if(user){
		res.render('complete-profile');
	}else{
		res.redirect('/')
	};
});

app.post('/complete-profile', function(req,res){
	// ...
	var form = new formidable.IncomingForm();
	
	form.uploadDir = __dirname + '/uploads';
    console.log("--FORM--");
	
	form.on('fileBegin', function(name, file) {
		var date = +new Date();
		file.path = form.uploadDir + "/" + date + "-" + file.name;
	});

	form.parse(req, function(err, fields, files){
		if(err) return res.redirect(303, '/');
		/*
		console.log('recieved fields: ');
		console.log(fields);
		console.log('recieved files: ');
		console.log(files);
		*/	
		
		user.updateProfile({
			displayName: fields.name,
		}).then(function() {
			// Update successful.
			console.log("user display name updated in Firebase, now adding to MongoDB and redirecting...");
				MongoClient.connect(URI, function(err, db){
					if(!err){
						console.log('connected to db, updating document...');
						try{
							db.collection('bandyUsers').updateOne({"userEmail":auth.currentUser.email},				
							{$set:{
								"name" : fields.name,
								"photo" : files.photo,
								"bio" : fields.bio,
								"age" : fields.age,
								"gender" : fields.gender
							}});					
						}catch(e){
							console.log(e)
						};
					}else{
						console.log(err);
					}
				})		
				res.redirect(303,'/edit');
			}, function(error) {
			  // An error happened.
			  console.log(error);
		});
		

	});
});

//Authentication. TODO: optimize sign up and login flow, add Google and FB login as first options.
app.post('/login', function(req, res) {
	console.log("logging user in...");
	var email = req.body.email;
	var pass = req.body.pass;
	var signIn = auth.signInWithEmailAndPassword(email, pass);
	var errorMsg = function(e){
		console.log(e.message);
	};
	signIn.then(function(){
		MongoClient.connect(URI, function(err, db){
			if(!err){
				db.collection('bandyUsers').findOne({"userEmail" : email}, function(err,doc){
					if(!err){
						doc.bandIds.forEach(function(id){userBands.push(id)});
						//doc.relatedBands.forEach(function(band){userBands.push(band)});
						loggedInUserLocation[0] = doc.loc.coordinates[0];
						loggedInUserLocation[1] = doc.loc.coordinates[1];
						console.log("added user\'s last location");
					}else{
						console.log(err)
					};
					res.redirect('/browse');
				});
			}else{
				console.log(err)
			};
		});
		//redirect to /browse was here...
	}).catch(errorMsg);    
});
  
app.post('/sign-up', function(req, res) {
	console.log("signing user up...");
	var email = req.body.email;
	var pass = req.body.pass;
	var signUp = auth.createUserWithEmailAndPassword(email, pass);
	var errorMsg = function(e){
		console.log(e.message);
	};
	signUp.then(function(){
		res.redirect('/add-bands');
	}).catch(errorMsg);
    
});

app.post('/logout', function(req, res) {
	console.log("logging user out...");
	auth.signOut().then(function(){
		res.redirect('/');
	});
});

//404 page:
app.use(function(req, res, next){
    res.status(404);
    res.render('404');
});

//500 page:
app.use(function(err, req, res, next){
    console.error(err.stack);
    res.status(500);
    res.send('500 - server error');
});

app.listen(app.get('port'), function(){
    console.log('Express started on http://localhost:'+ app.get('port') + '; Press ctrl-C to terminate.')
});
