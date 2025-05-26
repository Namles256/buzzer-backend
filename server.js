
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

app.get("/", (req, res) => {
  res.send("✅ Buzzer-Backend läuft.");
});

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data = { name, room, isHost };
    if (!rooms[room]) rooms[room] = { players: {}, host: null };
    if (isHost) rooms[room].host = socket.id;
    if (!isHost) {
      if (!rooms[room].players[name]) rooms[room].players[name] = 0;
    }
    updatePlayers(room);
  });

  socket.on("buzz", ({ room, name }) => {
    io.to(room).emit("buzz", { name });
  });

  socket.on("result", ({ room, type, points, minus }) => {
    const buzzed = Object.keys(rooms[room].players)[0];
    if (buzzed) {
      if (type === "correct") {
        rooms[room].players[buzzed] += points;
      } else if (type === "wrong" && minus) {
        rooms[room].players[buzzed] -= points;
      }
    }
    io.to(room).emit("result", { type });
    updatePlayers(room);
  });

  socket.on("resetPoints", (room) => {
    Object.keys(rooms[room].players).forEach(p => rooms[room].players[p] = 0);
    updatePlayers(room);
  });

  socket.on("setPoints", ({ room, playerName, points }) => {
    if (rooms[room].players[playerName] !== undefined) {
      rooms[room].players[playerName] = points;
      updatePlayers(room);
    }
  });

  socket.on("resetRoom", (room) => {
    rooms[room].players = {};
    updatePlayers(room);
  });

  socket.on("disconnect", () => {
    // keine Löschung für Rejoin-Logik
  });

  function updatePlayers(room) {
    io.to(rooms[room].host).emit("players", rooms[room].players);
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});
