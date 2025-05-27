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
  res.send("✅ Buzzer-Backend läuft (v0.3.7.6)");
});

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data = { name, room, isHost };

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        host: null,
        showPoints: true,
        pointsRight: 100,
        pointsWrong: -100,
        equalMode: true
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

  socket.on("settings", ({ room, showPoints, pointsRight, pointsWrong, equalMode }) => {
    if (!rooms[room]) return;
    if (showPoints !== undefined) rooms[room].showPoints = showPoints;
    if (pointsRight !== undefined) rooms[room].pointsRight = pointsRight;
    if (pointsWrong !== undefined) rooms[room].pointsWrong = pointsWrong;
    if (equalMode !== undefined) rooms[room].equalMode = equalMode;
    updatePlayers(room);
  });

  socket.on("buzz", ({ room, name }) => {
    if (rooms[room] && rooms[room].host) {
      io.to(rooms[room].host).emit("buzz", { name });
    }
  });

  socket.on("result", ({ room, name, type }) => {
    if (!rooms[room]) return;
    const r = rooms[room];
    const delta = type === "correct" ? r.pointsRight : r.pointsWrong;
    if (r.players[name] !== undefined) {
      r.players[name] += delta;
    }
    updatePlayers(room);
  });

  socket.on("resetBuzz", (room) => {
    io.to(room).emit("resetBuzz");
    const players = rooms[room] ? rooms[room].players : {};
    io.to(room).emit("playerUpdate", { players, showPoints: rooms[room]?.showPoints });
});

  socket.on("disconnect", () => {
    const { room, name, isHost } = socket.data || {};
    if (room && rooms[room] && !isHost) {
      delete rooms[room].players[name];
      updatePlayers(room);
    }
  });

  function updatePlayers(room) {
    const r = rooms[room];
    const data = r.showPoints ? r.players : Object.fromEntries(Object.keys(r.players).map(p => [p, null]));
    if (r.host) {
      io.to(r.host).emit("players", r.players);
    }
    for (const [id, s] of io.of("/").sockets) {
      if (s.data.room === room && !s.data.isHost) {
        io.to(id).emit("players", data);
      }
    }
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});