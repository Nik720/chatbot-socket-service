const httpServer = require("http").createServer();
const express = require('express');
const Redis = require("ioredis");
const request = require('request');
const bodyParser = require('body-parser')
const { logger } = require('@project-sunbird/logger');
const { setupWorker } = require("@socket.io/sticky");
const crypto = require("crypto");

const redisClient = new Redis();
var app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json())

const io = require("socket.io")(httpServer, {
  cors: {
    origin: '*',
  },
  adapter: require("socket.io-redis")({
    pubClient: redisClient,
    subClient: redisClient.duplicate(),
  }),
});

const randomId = () => crypto.randomBytes(8).toString("hex");

const { RedisSessionStore } = require("./sessionStore");
const sessionStore = new RedisSessionStore(redisClient);

const chatData = {
  "default": {
    text: "What content would you like to explore?",
    choices: [
      {text: '1.Textbook videos', value: '1'},
      {text: '2.Critical Thinking', value: '2'}
    ]
  },
  "one": {
    text: "Select what you are looking for?",
    choices: [
      {text: '1.Take Course', value: '1'},
      {text: '2.Help for Course', value: '2'},
      {text: 'Go Back', value: '#'},
      {text: 'Main Menu', value: '*'},
    ]
  },
  "two": {
    text: "Congratulation !",
    choices: []
  }
}

io.use(async (socket, next) => {
  if (socket.handshake.auth && socket.handshake.auth.sessionID) {
    const sessionID = socket.handshake.auth.sessionID
    const session = await sessionStore.findSession(sessionID);
    if (session) {
      socket.sessionID = sessionID;
      socket.userID = session.userID;
      return next();
    }
  }

  socket.sessionID = randomId();
  socket.userID = randomId();
  next();
});

io.on("connection", async (socket, req) => {

  logger.info({ msg: `Web socket is connected with ${socket.id} with IP ${socket.request.connection.remoteAddress}` });
  
  // persist session
  sessionStore.saveSession(socket.sessionID, {
    userID: socket.userID,
    connected: true,
  });

  // emit session details
  socket.emit("session", {
    sessionID: socket.sessionID,
    userID: socket.userID,
    socketID: socket.id
  });

  // join the "userID" room
  socket.join(socket.userID);

  socket.on("client to server event", async (toid) => {
    logger.info({ msg: `ReceivedFromClient` });
    logger.info({ msg: `SENDINGTOCLIENT` });
    io.to(toid).emit('server to client event');
  });

  // forward the private message to the right recipient (and to other tabs of the sender)
  socket.on("private message", ({ content, to }) => {
    logger.info({ msg: `Receiving chatbot request with ${JSON.stringify(content)}` });
    const message = {
      content,
      to,
    };
    sendToAdapter(message);
  });

  // notify users upon disconnection
  socket.on("disconnect", async (msg) => {
    logger.info({ msg: `Web socket is disconnected with ${socket.id} => ${msg}` });
  });
});

async function sendToAdapter(req) {

  const adapterEndpoint = "http://localhost:3005/botMsg/adapterInbound";
  try {
      var option = {
          uri: adapterEndpoint,
          body: JSON.stringify(req),
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          }
      }
      request(option, function (error, response) {
          return true;
      });
  } catch (error) {
      if (error) {
          job.moveToFailed({message: `job failed : ${error.message}`});
      }
  }
}

// adapter outbound api call 
// UCI team has to call this api to send responce
app.post("/botMsg/adapterOutbound", async (req, res) => {
  try {
    const {job, botResponse}  = req.body;
    io.to(job.to).emit("botResponse", {content: botResponse, from: job.to});
    res.status(200).json({status: 'OK'});
  } catch (ex) {
    console.log(ex);
  } 
});


// adapter inbound api call
// API endpoint should be given by UCI team
app.post('/botMsg/adapterInbound', async (req, res) => {
  // process req.body to get prepare response
  const content = req.body.content;
  let reply = chatData['default'];
    if(content.body == '1') reply = chatData['one']
    else if(content.body == '2') reply = chatData['two']
  const resData = {
      job: req.body,
      botResponse: reply
  }
  var opt = {
      uri: 'http://localhost:3005/botMsg/adapterOutbound',
      body: JSON.stringify(resData),
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      }
  }
  request(opt, function (error, response) {
    return true;
  });
  res.status(200)
})

setupWorker(io);
