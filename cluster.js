const cluster = require("cluster");
const http = require("http");
const { setupMaster } = require("@socket.io/sticky");
const path = require('path');

const WORKERS_COUNT = 10;
const logLevel = 'debug';
const { enableLogger, logger, enableDebugMode } = require('@project-sunbird/logger');
enableLogger({
  logBasePath: path.join(__dirname, 'logs'),
  logLevel: logLevel,
  eid: "LOG",
  context: {
    "channel": 'web',
    "env": 'uci-socket-service-env',
    "pdata": {
      id: 'uci.websocket.bot',
      ver: '1.0.0',
      pid: 'UCI-websocket-service'
    },
  },
  adopterConfig: {
    adopter: 'winston'
  }
});

const timeInterval = 1000 * 60 * 10;
console.log("enable debug mode called", logLevel, timeInterval);
enableDebugMode(timeInterval, logLevel)

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  for (let i = 0; i < WORKERS_COUNT; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });

  const httpServer = http.createServer();
  setupMaster(httpServer, {
    loadBalancingMethod: "least-connection", // either "random", "round-robin" or "least-connection"
  });
  const PORT = process.env.PORT || 3005;

  httpServer.listen(PORT, () =>
    // console.log(`server listening at http://localhost:${PORT}`)
    logger.info({ msg: `Web socket is running on http://localhost:${PORT}` })
  );
} else {
  console.log(`Worker ${process.pid} started`);
  require("./index");
}
