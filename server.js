
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

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        host: null,
        showPoints: true
      };
    }

    if (isHost) {
      rooms[room].host = socket.id;
    } else {
      if (!rooms[room].players[name]) {
        rooms[room].players[name] = 0;
      }
    }

    updatePlayers(room);
  });

  socket.on("settings", ({ room, showPoints }) => {
    if (rooms[room] && showPoints !== undefined) {
      rooms[room].showPoints = showPoints;
      updatePlayers(room);
    }
  });

  socket.on("disconnect", () => {
    // keine Löschung bei Disconnect
  });

  function updatePlayers(room) {
    const hostId = rooms[room]?.host;
    if (hostId) {
      io.to(hostId).emit("players", rooms[room].players);
    }

    for (let [id, s] of io.of("/").sockets) {
      if (s.data.room === room && !s.data.isHost) {
        if (rooms[room].showPoints) {
          io.to(id).emit("players", rooms[room].players);
        } else {
          const emptyPoints = Object.fromEntries(
            Object.keys(rooms[room].players).map(p => [p, 0])
          );
          io.to(id).emit("players", emptyPoints);
        }
      }
    }
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});
