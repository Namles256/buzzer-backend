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
  res.send("✅ Buzzer-Backend läuft (v0.4.0.3)");
});

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data = { name, room, isHost };

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        playerTexts: {},
        host: null,
        showPoints: true,
        pointsRight: 100,
        pointsWrong: -100,
        pointsOthers: 0,
        equalMode: true,
        buzzMode: "first",
        buzzBlocked: false,
        buzzOrder: [],
        buzzedPlayers: new Set(),
        showBuzzedPlayerToAll: true
      };
    }

    if (isHost) {
      rooms[room].host = socket.id;
      socket.emit("buzzModeSet", rooms[room].buzzMode);
    } else {
      if (!rooms[room].players[name]) {
        rooms[room].players[name] = 0;
        rooms[room].playerTexts[name] = "";
      }
      socket.emit("buzzModeSet", rooms[room].buzzMode);
    }

    updatePlayers(room);
  });

  socket.on("settings", ({ room, showPoints, pointsRight, pointsWrong, pointsOthers, equalMode, showBuzzedPlayerToAll }) => {
    if (!rooms[room]) return;
    if (showPoints !== undefined) rooms[room].showPoints = showPoints;
    if (pointsRight !== undefined) rooms[room].pointsRight = pointsRight;
    if (pointsWrong !== undefined) rooms[room].pointsWrong = pointsWrong;
    if (pointsOthers !== undefined) rooms[room].pointsOthers = pointsOthers;
    if (equalMode !== undefined) rooms[room].equalMode = equalMode;
    if (showBuzzedPlayerToAll !== undefined) rooms[room].showBuzzedPlayerToAll = showBuzzedPlayerToAll;
    updatePlayers(room);
  });

  socket.on("adjustPoints", ({ room, name, delta }) => {
    const r = rooms[room];
    if (!r) return;
    if (!(name in r.players)) {
      r.players[name] = 0;
    }
    r.players[name] += delta;
    updatePlayers(room);
    io.to(room).emit("scoreUpdateEffects", [{ name, delta }]);
  });

  socket.on("textUpdate", ({ room, name, text }) => {
    const r = rooms[room];
    if (!r || !(name in r.players)) return;
    r.playerTexts[name] = text;
    updatePlayers(room);
  });

  socket.on("buzzModeChanged", ({ room, mode }) => {
    if (rooms[room]) {
      rooms[room].buzzMode = mode;
      io.to(room).emit("buzzModeSet", mode);
    }
  });

  socket.on("buzz", ({ room, name }) => {
    const r = rooms[room];
    if (!r || r.buzzBlocked) return;

    if (r.buzzMode === "first") {
      r.buzzBlocked = true;
      io.to(room).emit("buzzBlocked");
      io.to(r.host).emit("buzz", { name });
      if (r.showBuzzedPlayerToAll) {
        io.to(room).emit("buzzNameVisible", name);
      }
    }

    if (r.buzzMode === "multi") {
      if (r.buzzedPlayers.has(name)) return;
      r.buzzedPlayers.add(name);
      r.buzzOrder.push(name);
      io.to(r.host).emit("buzzOrderUpdate", r.buzzOrder);
      io.to(r.host).emit("buzz", { name });
      io.to(socket.id).emit("buzzBlocked");
    }
  });

  socket.on("result", ({ room, name, type }) => {
    const r = rooms[room];
    if (!r) return;

    const updates = [];

    if (type === "correct") {
      if (r.players[name] !== undefined) {
        r.players[name] += r.pointsRight;
        updates.push({ name, delta: r.pointsRight });
      }
    } else if (type === "wrong") {
      if (r.players[name] !== undefined) {
        r.players[name] += r.pointsWrong;
        updates.push({ name, delta: r.pointsWrong });
      }
      Object.keys(r.players).forEach((p) => {
        if (p !== name) {
          r.players[p] += r.pointsOthers;
          updates.push({ name: p, delta: r.pointsOthers });
        }
      });
    }

    r.buzzBlocked = false;
    r.buzzOrder = [];
    r.buzzedPlayers.clear();
    updatePlayers(room);
    io.to(room).emit("resetBuzz");
    io.to(room).emit("scoreUpdateEffects", updates);
  });

  socket.on("resetBuzz", (room) => {
    const r = rooms[room];
    if (!r) return;
    r.buzzBlocked = false;
    r.buzzOrder = [];
    r.buzzedPlayers.clear();
    updatePlayers(room);
    io.to(room).emit("resetBuzz");
  });
});

function updatePlayers(room) {
  const r = rooms[room];
  if (!r) return;
  io.to(room).emit("playerUpdate", {
    players: r.players,
    showPoints: r.showPoints,
    buzzOrder: r.buzzOrder,
    texts: r.playerTexts || {}
  });
}

server.listen(3000);
