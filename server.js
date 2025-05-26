const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("🔌 Neue Verbindung hergestellt");

  socket.on("join", ({ room, name }) => {
    console.log(`✅ ${name} ist Raum '${room}' beigetreten`);
    socket.join(room);
  });

  socket.on("buzz", ({ room, name }) => {
    console.log(`🔔 Buzz von ${name} in Raum '${room}'`);
    io.to(room).emit("buzz", name);
  });

  socket.on("reset", (room) => {
    console.log(`♻️ Reset in Raum '${room}'`);
    io.to(room).emit("reset");
  });

  socket.on("disconnect", () => {
    console.log("❌ Verbindung getrennt");
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
