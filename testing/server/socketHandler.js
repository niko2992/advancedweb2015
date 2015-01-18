//var server = require('http').createServer(function (req, res) {
//    res.statusCode = 200;
//    res.end('<script src="/socket.io/socket.io.js"></script>');
//});
//var app = server.listen(1337, '192.168.10.212');
//var io = require('socket.io').listen(app);
//response.setHeader("Content-Type", "text/javascript");

var socketHandler = function (server) {
    var io = require('socket.io')(server);

    var clients = {};

    io.on('connection', function (client) {
        // Server should normaly have users pseudos
        // Generating them for current instance
        var pseudo = "user" + Math.floor((Math.random() * 100000) + 1);
        clients[pseudo] = client;

        client.broadcast.emit('connected', { 'src': pseudo });

        // Streaming
        client.on('callme', function (callback) {
            callback(regCallback());
            client.broadcast.emit('callme', { 'src': pseudo });
        });

        client.on('offer', function (offer, callback) {
            callback(regCallback());
            try {
                clients[offer.dest].emit('offer', { 'offer': offer.offer, 'src': pseudo });
            }
            catch (e) {
                console.log("ERR while sending offer: " + e.message);
            }
        });

        client.on('answer', function (answer, callback) {
            callback(regCallback());
            try {
                clients[answer.dest].emit('answer', { 'answer': answer.answer, 'src': pseudo });
            }
            catch (e) {
                console.log("ERR while sending answer: " + e.message);
            }
        });

        client.on('candidate', function (candidate, callback) {
            callback(regCallback());
            try {
                clients[candidate.dest].emit('candidate', { 'candidate': candidate.candidate, 'src': pseudo });
            }
            catch (e) {
                console.log("ERR while sending candidate: " + e.message);
            }
        });

        client.on('stop', function (callback) {
            callback(regCallback());
            client.broadcast.emit('stoped', { 'src': pseudo });
        });

        // Chat
        client.on('chat', function (chat, callback) {
            callback(regCallback());
            client.broadcast.emit('chat', { 'chat': chat.chat, 'pseudo': pseudo });
        });

        // Others
        client.on('getPseudo', function (callback) {
            callback({ 'received': true, 'pseudo': pseudo });
        });

        client.on('disconnect', function () {
            client.broadcast.emit('disconnected', { 'src': pseudo });
        });
    });

    function regCallback() {
        return ({ 'error': false });
    }
}

module.exports = socketHandler;