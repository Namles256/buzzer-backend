
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
  updatePlayers(room);
    socket.join(room);
    socket.data = { name, room, isHost };

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        buzzLocked: false,
        onlyFirstBuzz: false,
        host: null,
        firstBuzz: null,
        allowMultiple: false,
        hideBuzz: false
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

  socket.on("settings", ({ room, allowMultipleBuzzers, hideBuzzFromPlayers }) => {
    if (rooms[room]) {
      if (allowMultipleBuzzers !== undefined) rooms[room].allowMultiple = allowMultipleBuzzers;
      if (hideBuzzFromPlayers !== undefined) rooms[room].hideBuzz = hideBuzzFromPlayers;
    }
  });

  socket.on("buzz", ({ room, name }) => {
    if (!rooms[room]) return;
    if (rooms[room].onlyFirstBuzz && rooms[room].buzzLocked) return;
    rooms[room].buzzLocked = rooms[room].onlyFirstBuzz;
    if (!rooms[room]) return;
    const roomData = rooms[room];

    if (!roomData.allowMultiple && roomData.firstBuzz) return;

    roomData.firstBuzz = name;

    for (let [id, s] of io.of("/").sockets) {
  if (s.data.room === room && !s.data.isHost) {
    if (rooms[room].showPoints) {
      io.to(id).emit("players", rooms[room].players);
    } else {
      const hidden = Object.fromEntries(
        Object.keys(rooms[room].players).map(p => [p, 0])
      );
      io.to(id).emit("players", hidden);
    }
  }
}

  socket.on("result", ({ room, type, points = 100, minus = false }) => {
    const roomData = rooms[room];
    if (!roomData || !roomData.firstBuzz) return;
    const buzzName = roomData.firstBuzz;
    if (type === "correct") {
      roomData.players[buzzName] += points;
    } else if (type === "wrong" && minus) {
      roomData.players[buzzName] -= points;
    }
    roomData.firstBuzz = null;
    io.to(room).emit("result", { type });
    updatePlayers(room);
  });

  socket.on("resetPoints", (room) => {
    if (rooms[room]) {
      Object.keys(rooms[room].players).forEach(p => rooms[room].players[p] = 0);
      updatePlayers(room);
    }
  });

  socket.on("setPoints", ({ room, playerName, points }) => {
    if (rooms[room]?.players[playerName] !== undefined) {
      rooms[room].players[playerName] = points;
      updatePlayers(room);
    }
  });

  socket.on("resetRoom", (room) => {
    if (rooms[room]) {
      rooms[room].players = {};
      rooms[room].firstBuzz = null;
      updatePlayers(room);
    }
  });

  socket.on("resetBuzz", (room) => {
    if (rooms[room]) {
      rooms[room].firstBuzz = null;
      io.to(room).emit("reset");
    }
  });

  socket.on("settings", ({ room, onlyFirstBuzz }) => {
    if (rooms[room]) {
      rooms[room].onlyFirstBuzz = onlyFirstBuzz;
    }
  });

  socket.on("resetBuzz", (room) => {
    if (rooms[room]) {
      rooms[room].buzzLocked = false;
      io.to(room).emit("reset");
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
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});
