let fs = require('fs');
const csv=require('csvtojson');
var request = require('request');
var querystring = require('querystring');
var express = require('express');
var async = require('async');
var path = require('path');
var app = express();

const clientId = 'b32aa421a0e846ebb92431571d984ab0'; // Your client id
const clientSecret = '60e7ab7b159d4225be08e62f5367a4a9'; // Your secret
var redirect_uri = 'http://localhost:8888/loginSpotify'; // Your redirect uri
var scopes = 'user-read-private playlist-read-private playlist-modify-private';
var state;
var access_token;
var refresh_token;
var userId;

app.use(express.static(__dirname + '/public'))

//First of all -> login to get the auth
app.get("/login", function( req, res ){

	state = generateRandomString(16);
	res.redirect('https://accounts.spotify.com/authorize?' +
		querystring.stringify({
			response_type: 'code',
			client_id: clientId,
			scope: scopes,
			redirect_uri: redirect_uri,
			state: state
		}));
});

//When auth finish -> create get the token
app.get("/loginSpotify", function( req, res ){
	console.log("Authenticating...")
	var code = req.query.code || null;
	var newState = req.query.state || null;

	var authOptions = {
		url: 'https://accounts.spotify.com/api/token',
		form: {
			code: code,
			redirect_uri: redirect_uri,
			grant_type: 'authorization_code'
		},
		headers: {
			'Authorization': 'Basic ' + (new Buffer(clientId + ':' + clientSecret).toString('base64'))
		},
		json: true
	};

	request.post(authOptions, function(error, response, body) {
		if ( error){
			res.send("ERROR")
		}
		else{
			access_token = body.access_token;
			refresh_token = body.refresh_token;

			var options = {
				url: 'https://api.spotify.com/v1/me',
				headers: { 'Authorization': 'Bearer ' + access_token },
				json: true
			};

	    // getting the userId
	    request.get(options, function(error, response, body) {
	    	if ( error){
	    		res.send("ERROR")
	    	}
	    	else{
	    		console.log("Authenticated")
	    		userId = body.id;
	    		res.redirect('http://localhost:8888/loginEnd')
	    	}
	    });
	  }
	});
});

app.get("/loginEnd", function( req, res ){
	res.sendFile(path.join(__dirname + '/public/readFile.html'));
});
app.get("/createPlaylist", function( req, res ){

	console.log("Creating playlist...")

	var playlistName = req.query.playlistName;
	var csvPath = req.query.filePath;

	//Creating the playlist
	var playlistOptions = {
		url: 'https://api.spotify.com/v1/users/'+userId+'/playlists',
		headers: { 
			'Authorization': 'Bearer ' + access_token, 
			'Content-Type' : 'application/json'
		},
		body: 	JSON.stringify({'name': playlistName, 'public': false}),
		dataType: 'json'

	};

	//Creating the playlist and getting the id
	var playlistId;	
	request.post(playlistOptions, function(error, response, bodyPl) {
				
		playlistId = JSON.parse(bodyPl).id;
		console.log("Reading file...")
		readFile(access_token, csvPath, function( error, list ){
			var i = 0
			async.whilst(
				function(){ i++; return i < list.length },
				function(cb){
					var createPlaylistOptions = {
						url: 'https://api.spotify.com/v1/users/'+userId+'/playlists/'+playlistId+"/tracks",
						headers: { 'Authorization': 'Bearer ' + access_token, 'Content-Type' : 'application/json' },
						body: {
							uris : list[i]
						},
						json: true
					};

					request.post(createPlaylistOptions, function(error, res, body) {
						console.log( body)
						setTimeout(function(){ cb(error || null ) }, 2000);
					});
				},
				function(err){
					console.log("Playlist created and songs added")
					console.log('End ', err)
					response.send("Playlist created and songs added")
				}
				)
		});
	});

	});


function readFile(access_token, filePath, result){
	var list = [];//"./csv/rock.csv"
	csv({noheader:true}).fromFile(filePath).on('json',(jsonObj)=>{
		list.push( jsonObj["field1"] )

	}).on('done',(error)=>{
		var batchSongs = [];
		var songs = [];
		var i = 0;
		async.whilst(
			function(){ i++; return i < list.length },
			function(callback){
				var artist = list[i].split("-")[0]
				var song = list[i].split("-")[1]
				var options = {
					url: 'https://api.spotify.com/v1/search?type=track&limit=1&q='+querystring.stringify({song}),
					headers: { 'Authorization': 'Bearer ' + access_token },
					json: true
				};
				request.get(options, function(error, response, body) {
					//De 100 en 100 por peticiones de spoti
					if ( i % 100 == 0 ){
						batchSongs.push(songs);
						songs = [];
					}
					if ( body.tracks.items.length > 0 ){
						console.log(i, body.tracks.items[0].name)
						songs.push("spotify:track:"+body.tracks.items[0].id);
					}
					setTimeout(function(){}, 2000);
					callback(null, i)  
				});
			}, function(err) {
						//The last batch
						if ( i % 100 != 0 ){
							batchSongs.push(songs);

						}						
						result( err, batchSongs)
					}
		);		
	})
}

app.listen(8888);

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
 var generateRandomString = function(length) {
 	var text = '';
 	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

 	for (var i = 0; i < length; i++) {
 		text += possible.charAt(Math.floor(Math.random() * possible.length));
 	}
 	return text;
 };

