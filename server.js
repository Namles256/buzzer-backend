
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
        showPoints: true,
        allowMultipleBuzzers: false,
        hideBuzzFromPlayers: false,
        onlyFirstBuzz: false,
        buzzLocked: false
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

  socket.on("settings", ({ room, showPoints, allowMultipleBuzzers, hideBuzzFromPlayers, onlyFirstBuzz }) => {
    if (rooms[room]) {
      if (showPoints !== undefined) rooms[room].showPoints = showPoints;
      if (allowMultipleBuzzers !== undefined) rooms[room].allowMultipleBuzzers = allowMultipleBuzzers;
      if (hideBuzzFromPlayers !== undefined) rooms[room].hideBuzzFromPlayers = hideBuzzFromPlayers;
      if (onlyFirstBuzz !== undefined) rooms[room].onlyFirstBuzz = onlyFirstBuzz;
      updatePlayers(room);
    }
  });

  socket.on("buzz", ({ room, name }) => {
    if (!rooms[room]) return;
    const roomData = rooms[room];
    if (roomData.onlyFirstBuzz && roomData.buzzLocked) return;
    roomData.buzzLocked = roomData.onlyFirstBuzz;
    io.to(room).emit("buzz", { name });
  });

  socket.on("result", ({ room }) => {
    if (rooms[room]) {
      rooms[room].buzzLocked = false;
      io.to(room).emit("reset");
    }
  });

  socket.on("resetBuzz", (room) => {
    if (rooms[room]) {
      rooms[room].buzzLocked = false;
      io.to(room).emit("reset");
    }
  });

  socket.on("resetPoints", (room) => {
    if (rooms[room]) {
      for (const name in rooms[room].players) {
        rooms[room].players[name] = 0;
      }
      updatePlayers(room);
    }
  });

  socket.on("setPoints", ({ room, playerName, points }) => {
    if (rooms[room] && rooms[room].players[playerName] !== undefined) {
      rooms[room].players[playerName] = points;
      updatePlayers(room);
    }
  });

  socket.on("resetRoom", (room) => {
    if (rooms[room]) {
      rooms[room].players = {};
      updatePlayers(room);
    }
  });

  socket.on("disconnect", () => {
    const { room, name } = socket.data || {};
    if (rooms[room] && rooms[room].players[name]) {
      delete rooms[room].players[name];
      updatePlayers(room);
    }
  });

  function updatePlayers(room) {
    const roomData = rooms[room];
    const players = roomData.players;

    // Host bekommt immer alles
    if (roomData.host) {
      io.to(roomData.host).emit("players", players);
    }

    for (const [id, socket] of io.of("/").sockets) {
      if (socket.data.room === room && !socket.data.isHost) {
        if (roomData.showPoints) {
          io.to(id).emit("players", players);
        } else {
          const empty = Object.fromEntries(Object.keys(players).map((p) => [p, 0]));
          io.to(id).emit("players", empty);
        }
      }
    }
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});
