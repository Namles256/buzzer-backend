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
  res.send("✅ Buzzer-Backend läuft (v0.4.0.9)");
});

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data.name = name;
    socket.data.room = room;
    socket.data.isHost = isHost;

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        hostId: isHost ? socket.id : null,
        showPoints: true,
        pointsRight: 100,
        pointsWrong: -100,
        pointsOthers: 0,
        equalMode: true,
        showBuzzedPlayerToAll: true,
        buzzMode: "first",
        buzzedPlayers: [],
        playerTexts: {},
        textLocked: false
      };
    }

    if (!isHost) {
      rooms[room].players[name] = 0;
      updatePlayers(room);
    }
  });

  socket.on("buzz", ({ room, name }) => {
    const data = rooms[room];
    if (!data) return;
    if (data.buzzMode === "first" && data.buzzedPlayers.length > 0) return;
    if (data.buzzedPlayers.includes(name)) return;

    data.buzzedPlayers.push(name);
    io.to(room).emit("buzz", { name });
    if (data.showBuzzedPlayerToAll) {
      io.to(room).emit("buzzNameVisible", name);
    }
    if (data.buzzMode === "first") {
      io.to(room).emit("buzzBlocked");
    }
    updatePlayers(room);
  });

  socket.on("result", ({ room, name, type }) => {
    const data = rooms[room];
    if (!data || !(name in data.players)) return;

    if (type === "correct") {
      data.players[name] += data.pointsRight;
    } else if (type === "wrong") {
      data.players[name] += data.equalMode ? -data.pointsRight : data.pointsWrong;
      for (const [otherName, _] of Object.entries(data.players)) {
        if (otherName !== name) {
          data.players[otherName] += data.pointsOthers;
        }
      }
    }

    io.to(room).emit("resetBuzz");
    data.buzzedPlayers = [];
    updatePlayers(room);
  });

  socket.on("resetBuzz", (room) => {
    const data = rooms[room];
    if (!data) return;
    data.buzzedPlayers = [];
    io.to(room).emit("resetBuzz");
    updatePlayers(room);
  });

  socket.on("settings", (msg) => {
    const data = rooms[msg.room];
    if (!data) return;

    data.showPoints = msg.showPoints;
    data.pointsRight = msg.pointsRight;
    data.pointsWrong = msg.pointsWrong;
    data.pointsOthers = msg.pointsOthers;
    data.equalMode = msg.equalMode;
    data.showBuzzedPlayerToAll = msg.showBuzzedPlayerToAll;

    updatePlayers(msg.room);
  });

  socket.on("buzzModeChanged", ({ room, mode }) => {
    const data = rooms[room];
    if (!data) return;
    data.buzzMode = mode;
    data.buzzedPlayers = [];
    io.to(room).emit("buzzModeSet", mode);
    io.to(room).emit("resetBuzz");
    updatePlayers(room);
  });

  socket.on("textUpdate", ({ room, name, text }) => {
    const data = rooms[room];
    if (!data) return;
    data.playerTexts[name] = text;
    updatePlayers(room);
  });

  socket.on("adjustPoints", ({ room, name, delta }) => {
    const data = rooms[room];
    if (!data || !(name in data.players)) return;
    data.players[name] += delta;
    updatePlayers(room);
  });

  socket.on("lockTexts", ({ room, locked }) => {
    const data = rooms[room];
    if (!data) return;
    data.textLocked = locked;
    io.to(room).emit("lockTexts", { locked });
  });

  socket.on("clearTexts", (room) => {
    const data = rooms[room];
    if (!data) return;
    data.playerTexts = {};
    io.to(room).emit("clearTexts");
    updatePlayers(room);
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (!room || !rooms[room]) return;
    if (!socket.data.isHost) {
      delete rooms[room].players[name];
    }
    updatePlayers(room);
  });

  function updatePlayers(room) {
    const data = rooms[room];
    if (!data) return;
    const hostSocket = io.sockets.sockets.get(data.hostId);
    const players = data.players;
    const showPoints = data.showPoints;
    const buzzedOrder = data.buzzedPlayers;
    const texts = data.playerTexts;

    io.to(room).emit("playerUpdate", {
      players,
      showPoints,
      buzzOrder: buzzedOrder,
      texts
    });
  }
});

server.listen(3000, () => {
  console.log("Server läuft auf Port 3000 (v0.4.0.9)");
});
