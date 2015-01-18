// Note : Google Chrome will only work if page is hosted on a web server
// On Firefox Nightly, you need to allow the using of webRTC capacities by turning on corresponding flags in about:config
// UPDATE : now on by default if you update your Nightly

// Global variables
// HTML assigned variables
var sourceVid = null;
var startButton = null;
var stopButton = null;
var chatBox = null;
var messInput = null;

// Streaming variables
var remoteData = {};
var socket = null;
var localStream = null;
var started = false;

// Others
var srvIPAddr = window.location.hostname + ":1337";
var myRTCPeerConnection = null;
var pseudo = null;

function initialize() {
    sourceVid = document.getElementById('sourceVid');
    startButton = document.getElementById('startButton');
    stopButton = document.getElementById('stopButton');
    chatBox = document.getElementById('chatBox');
    messInput = document.getElementById('messInput');
    
    try {
        socket = io.connect(srvIPAddr);
    }
    catch (e) {
        console.log(e.message);
        displayChat("Error while connecting: code " + e);
        displayChat("Connection with relaying server failed");
        throw (e);
    }
    
    initSocket();
    
    // The following is located here so that browsers that don't handle the
    // API will only fail here and can use chat, until better solution is found
    navigator.getUserMedia = navigator.getUserMedia ||
	navigator.webkitGetUserMedia ||
	navigator.mozGetUserMedia ||
	navigator.msGetUserMedia; // In case IE handles it one day
    
    window.URL = window.URL || window.webkitURL ||
	window.mozURL || window.msURL;
    
    if (window.webkitURL)
        window.URL = window.webkitURL;
    
    // Only Chrome and Firefox handle this for now
    if (navigator.mozGetUserMedia)
        myRTCPeerConnection = mozRTCPeerConnection;
    else
        myRTCPeerConnection = webkitRTCPeerConnection;
}

function initSocket() {
    // System events
    socket.on('connect', function () {
        displayChat("Connected");
        initConnected();
    });
    
    socket.on('connect_failed', function () {
        displayChat("Connection with relaying server failed");
    });
    
    socket.on('error', function () {
        displayChat("Connection with relaying server failed");
    });
    
    socket.on('connect_timeout', function () {
        displayChat("Connection with relaying server lost");
        startButton.disabled = true;
    });
    
    socket.on('disconnect', function () {
        displayChat("Connection with server lost, attempting reconnection...");
        startButton.disabled = true;
    });
    
    socket.on('reconnect_error', function () {
        displayChat("Reconnection with relaying server failed");
    });
    
    socket.on('reconnect_failed', function () {
        displayChat("Could not reconnect to the server");
    });
    
    socket.on('reconnect', function () {
        displayChat("Successfully reconnected");
        startButton.disabled = started;
    });
    
    // Self-defined events - general
    socket.on('connected', function (connected) {
        displayChat(connected.src + " connected");
    });
    
    socket.on('chat', function (chat) {
        displayChat(chat.chat, chat.pseudo);
    });
    
    socket.on('disconnected', function (disconnected) {
        displayChat(disconnected.src + " disconnected");
        console.log("client " + disconnected.src + " disconnected");
        cleanDisconnected(disconnected.src);
    });
    
    socket.on('stoped', function (stoped) {
        displayChat(stoped.src + " stoped video stream");
        console.log("client " + stoped.src + " stoped video stream");
        cleanDisconnected(stoped.src);
    });
    
    // Self-defined events - streaming
    var constraints = {
        "optional": [],
        "mandatory": {
            "OfferToReceiveAudio": true,
            "OfferToReceiveVideo": true
        }
    };;
    
    socket.on('callme', function (callme) {
        displayChat(callme.src + " joined streaming");
        console.log("callme received from: " + callme.src);
        if (started && !remoteData[callme.src]) {
            initPeerConnection(callme.src);
            
            remoteData[callme.src].pc.createOffer(function (offer) {
                console.log("creating offer for: " + callme.src);
                remoteData[callme.src].pc.setLocalDescription(offer);
                socket.emit('offer', {
                    'offer' : offer,
                    'dest' : callme.src
                }, emitCallback);
            }, errorCallback, constraints);
        }
    });
    
    socket.on('offer', function (offer) {
        console.log("offer received from: " + offer.src);
        if (started && !remoteData[offer.src]) {
            initPeerConnection(offer.src);
            
            remoteData[offer.src].pc.setRemoteDescription(
                new RTCSessionDescription(offer.offer));
            remoteData[offer.src].pc.createAnswer(function (answer) {
                console.log("creating answer");
                remoteData[offer.src].pc.setLocalDescription(answer);
                socket.emit('answer', {
                    'answer' : answer,
                    'dest' : offer.src
                }, emitCallback);
            }, errorCallback, constraints);
        }
        else
            console.log("ERR: offer received from: " + offer.src + " before start");
    });
    
    socket.on('answer', function (answer) {
        if (started) {
            console.log("answer received from: " + answer.src);
            remoteData[answer.src].pc.setRemoteDescription(
                new RTCSessionDescription(answer.answer));
        }
        else
            console.log("ERR: answer received from: " + answer.src + " before start");
    });
    
    socket.on('candidate', function (candidate) {
        if (started) {
            console.log("candidate received from: " + candidate.src + JSON.stringify(candidate.candidate));
            var cdt = new RTCIceCandidate(
                {
                    'sdpMLineIndex' : candidate.candidate.sdpMLineIndex,
                    'candidate' : candidate.candidate.candidate
                });
            remoteData[candidate.src].pc.addIceCandidate(cdt);
        }
        else
            console.log("ERR: candidate received from: " + candidate.src + " before start");
    });
}

function initConnected() {
    socket.emit('getPseudo', function (getPseudo) {
        pseudo = getPseudo.pseudo;
        console.log("pseudo: " + pseudo);
    });
    
    startButton.disabled = false;
    
    console.log("initialization complete");
}

function toggleStart() {
    if (socket.connected) {
        started = !started;
        startButton.disabled = !startButton.disabled;
        stopButton.disabled = !stopButton.disabled;
    }
    else {
        started = false;
        startButton.disabled = true;
        stopButton.disabled = true;
    }
}

// Chat
function sendChat() {
    if (messInput.value !== '') {
        if (socket.connected) {
            displayChat(messInput.value, pseudo);
            socket.emit('chat', { 'chat' : messInput.value }, emitCallback);
            messInput.value = '';
        }
        else {
            displayChat("Error: Connection to server failed");
            console.log("cannot send message, socket error");
        }
    }
    return false;
}

function displayChat(msg, id) {
    var display = '<div class="line">' + getDate() + ' - ';
    
    if (arguments.length == 1)
        display += '<b>' + msg + '</b>';
    else
        display += '<b>' + id + '</b> : ' + msg;
    
    display += '</div>';
    
    chatBox.innerHTML += display;
    chatBox.scrollTop += 40;
}

function getDate() {
    var d = new Date();
    var hours = d.getHours();
    var minutes = d.getMinutes();
    
    hours = (hours < 10 ? '0' + hours : hours);
    minutes = (minutes < 10 ? '0' + minutes : minutes);
    
    var display = hours + ':' + minutes;
    
    return (display);
}

// GetUserMedia
function startVideo() {
    if (!started) {
        try {
            navigator.getUserMedia(
                { 'audio': true, 'video': { "mandatory": {}, "optional": [] } },
		onUserMediaSuccess, errorCallback);
        }
	catch (e) {
            alert("Your browser does not handle the getUserMedia API.\n" +
		  "Please get a compatible browser like Google Chrome v25+.");
            console.log("getUserMedia failed with exception: " + e.message);
        }
    }
    else
        console.log("stream already started");
}

function onUserMediaSuccess(stream) {
    localStream = stream;
    console.log("localStream started");
    
    attachStream(sourceVid, stream);
    
    // Say you are ready
    toggleStart();
    
    // Launch stream !
    socket.emit('callme', emitCallback);
}

function initPeerConnection(src) {
    var pcConfig;
    var pcConstraints;
    
    remoteData[src] = { 'pc' : null, 'vid' : null };
    
    //pcConfig = {"iceServers":[{"url":"stun:74.125.31.127"}]};
    pcConfig = { "iceServers": [{ "url": "stun:stun.l.google.com:19302" }] };
    pcConstraints = { "optional": [{ "DtlsSrtpKeyAgreement": true }] };
    
    try {
        remoteData[src].pc = new myRTCPeerConnection(pcConfig, pcConstraints);
        console.log("created RTCPeerConnnection for client: " + src +
		    ", config: " + JSON.stringify(pcConfig) +
		    JSON.stringify(pcConstraints));
    }
    catch (e) {
        console.log("failed to create PeerConnection : " + e.message);
        alert("Cannot create RTCPeerConnection object.\n" +
	      "Maybe WebRTC is not supported by this browser ?");
        throw (e);
    }
    
    remoteData[src].pc.onicecandidate = function (evt) {
        if (evt.candidate) {
            console.log("new candidate: sending");
            socket.emit('candidate', {
                'candidate' : evt.candidate,
                'dest' : src
            }, emitCallback);
        }
        else {
            console.log("end of candidates");
        }
    };
    
    if (!localStream)
        console.log("ERR: trying to attach unstarted localStream...");
    remoteData[src].pc.addStream(localStream);
    
    remoteData[src].pc.onaddstream = function (evt) {
        console.log("attaching remote stream");
        attachRemoteStream(evt.stream, src);
    };
}

function attachStream(vid, stream) {
    try {
        if (window.URL)
            vid.src = window.URL.createObjectURL(stream);
        else // Opera
            vid.src = stream;
    }
    catch (e) {
        console.log(e.message);
    }
    
    vid.play();
    vid.style.opacity = 1;
}

function attachRemoteStream(stream, src) {
    remoteData[src].vid = document.createElement("video");
    remoteData[src].vid.width = 320;
    remoteData[src].vid.height = 240;
    remoteData[src].vid.poster = "/images/loading.gif"
    document.body.insertBefore(remoteData[src].vid, sourceVid);
    
    attachStream(remoteData[src].vid, stream);
}

function detachStream(vid) {
    try {
        vid.style.opacity = 0;
        vid.pause();
        if (window.URL)
            window.URL.revokeObjectURL(vid.src);
    }
    catch (e) {
        console.log(e.message);
    }
}

function cleanDisconnected(src) {
    if (remoteData[src]) {
        if (remoteData[src].pc) {
            remoteData[src].pc.close();
            delete (remoteData[src].pc);
        }
        
        if (remoteData[src].vid) {
            detachStream(remoteData[src].vid);
            remoteData[src].vid.parentNode.removeChild(remoteData[src].vid);
            delete (remoteData[src].vid);
        }
        
        delete (remoteData[src]);
    }
}

function stopVideo() {
    // if (sourceVid.networkState != HTMLMediaElement.NETWORK_NO_SOURCE)
    if (started) {
        toggleStart();
        
        socket.emit('stop', emitCallback);
        
        try {
            detachStream(sourceVid);
            localStream.stop();
            localStream = null;
            console.log("sourcevid stopped");
        }
	catch (e) {
            console.log(e.message);
        }
        
        for (var i in remoteData) {
            cleanDisconnected(i);
        }
        remoteData = {};
        console.log("remoteVids and peerConnections stopped");
    }
}

function unInitialize() {
    stopVideo();
    
    if (socket.connected) {
        socket.disconnect();
        console.log("socket closed");
    }
}

function errorCallback(error) {
    console.log("an error occurred: " + error.message);
}

// Callback from emit()
function emitCallback(callback) {
    // Not sure if that is the proper way callback is meant
    if (callback.error === false) {
        console.log("packet correctly handled by server");
    }
    else {
        console.log("packet was not handled correctly by server");
    }
}