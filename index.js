require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const express = require("express");
app.set("trust proxy", 1);
const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
require("./src/startups/db")();
require("./src/startups/prod")(app);
require("./src/startups/routes")(app);
require("./src/startups/socket")(io);

server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
