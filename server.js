
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
        buzzOrder: [],
        allowMultiple: false,
        hideBuzz: false,
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

  socket.on("settings", ({ room, allowMultipleBuzzers, hideBuzzFromPlayers, showPoints }) => {
    if (rooms[room]) {
      if (allowMultipleBuzzers !== undefined) rooms[room].allowMultiple = allowMultipleBuzzers;
      if (hideBuzzFromPlayers !== undefined) rooms[room].hideBuzz = hideBuzzFromPlayers;
      if (showPoints !== undefined) rooms[room].showPoints = showPoints;
    }
    updatePlayers(room);
  });

  socket.on("buzz", ({ room, name }) => {
    if (!rooms[room]) return;
    const roomData = rooms[room];

    if (!roomData.allowMultiple && roomData.buzzOrder.length > 0) return;

    if (!roomData.buzzOrder.includes(name)) {
      roomData.buzzOrder.push(name);
    }

    for (let [id, s] of io.of("/").sockets) {
      if (s.data.room === room) {
        const isSelf = s.data.name === name;
        const sendBuzz = s.data.isHost
          ? { name, order: [...roomData.buzzOrder] }
          : (isSelf ? { name } : (roomData.hideBuzz ? {} : { name }));
        io.to(id).emit("buzz", sendBuzz);
      }
    }
  });

  socket.on("result", ({ room, type, points = 100, minus = false }) => {
    const roomData = rooms[room];
    if (!roomData || roomData.buzzOrder.length === 0) return;
    const buzzName = roomData.buzzOrder[0];
    if (type === "correct") {
      roomData.players[buzzName] += points;
    } else if (type === "wrong" && minus) {
      roomData.players[buzzName] -= points;
    }
    roomData.buzzOrder = [];
    io.to(room).emit("result", { type });
    io.to(room).emit("reset");
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
      rooms[room].buzzOrder = [];
      updatePlayers(room);
    }
  });

  socket.on("resetBuzz", (room) => {
    if (rooms[room]) {
      rooms[room].buzzOrder = [];
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

    // Punkte für Spieler synchronisieren (wenn erlaubt)
    for (let [id, s] of io.of("/").sockets) {
      if (s.data.room === room && !s.data.isHost) {
        if (rooms[room].showPoints) {
          io.to(id).emit("players", rooms[room].players);
        } else {
          io.to(id).emit("players", {});
        }
      }
    }
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});
