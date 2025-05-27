
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
  res.send("✅ Buzzer-Backend läuft (v0.3.8.2)");
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
        equalMode: true,
        buzzMode: "first",
        buzzBlocked: false,
        buzzOrder: [],
        buzzedPlayers: new Set()
      };
    }

    if (isHost) {
      rooms[room].host = socket.id;
      socket.emit("buzzModeSet", rooms[room].buzzMode);
    } else {
      if (!rooms[room].players[name]) {
        rooms[room].players[name] = 0;
      }
      socket.emit("buzzModeSet", rooms[room].buzzMode);
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
    }

    if (r.buzzMode === "multi") {
      if (r.buzzedPlayers.has(name)) return;
      r.buzzedPlayers.add(name);
      r.buzzOrder.push(name);
      io.to(r.host).emit("buzzOrderUpdate", r.buzzOrder);
    }
  });

  socket.on("result", ({ room, name, type }) => {
    const r = rooms[room];
    if (!r) return;
    const delta = type === "correct" ? r.pointsRight : r.pointsWrong;
    if (r.players[name] !== undefined) {
      r.players[name] += delta;
    }
    r.buzzBlocked = false;
    r.buzzOrder = [];
    r.buzzedPlayers.clear();
    updatePlayers(room);
    io.to(room).emit("resetBuzz");
  });

  socket.on("resetBuzz", (room) => {
    const r = rooms[room];
    if (!r) return;
    r.buzzBlocked = false;
    r.buzzOrder = [];
    r.buzzedPlayers.clear();
    io.to(room).emit("resetBuzz");
    updatePlayers(room);
  });
});

function updatePlayers(room) {
  const r = rooms[room];
  if (!r) return;
  io.to(room).emit("playerUpdate", {
    players: r.players,
    showPoints: r.showPoints
  });
}

server.listen(3000);
