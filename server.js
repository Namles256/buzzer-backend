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
  res.send("✅ Buzzer-Backend läuft (v0.2)");
});

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data = { name, room, isHost };

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        host: null
      };
    }

    if (isHost) {
      rooms[room].host = socket.id;
    } else {
      rooms[room].players[name] = true;
    }

    updatePlayers(room);
  });

  socket.on("buzz", ({ room, name }) => {
    if (rooms[room]) {
      io.to(rooms[room].host).emit("buzz", { name });
    }
  });

  socket.on("resetBuzz", (room) => {
    io.to(room).emit("reset");
  });

  socket.on("disconnect", () => {
    const { room, name, isHost } = socket.data || {};
    if (room && rooms[room]) {
      if (!isHost && rooms[room].players[name]) {
        delete rooms[room].players[name];
        updatePlayers(room);
      }
    }
  });

  function updatePlayers(room) {
    if (rooms[room] && rooms[room].host) {
      io.to(rooms[room].host).emit("players", Object.keys(rooms[room].players));
    }
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});
