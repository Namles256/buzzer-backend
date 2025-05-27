// server.js – v0.4.0.6
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
  },
});

const PORT = process.env.PORT || 3000;

let rooms = {};

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data = { name, room, isHost };

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        buzzOrder: [],
        settings: {
          showPoints: true,
          pointsRight: 100,
          pointsWrong: -100,
          pointsOthers: 0,
          equalMode: true,
          showBuzzedPlayerToAll: true,
        },
        texts: {},
      };
    }

    if (!isHost) {
      rooms[room].players[name] = 0;
    }

    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts,
    });

    socket.emit("buzzModeSet", rooms[room].buzzMode || "first");
  });

  socket.on("buzz", ({ room, name }) => {
    if (!rooms[room]) return;
    if (!(name in rooms[room].players)) return;
    if (rooms[room].buzzMode === "first" && rooms[room].buzzOrder.length > 0) return;

    if (!rooms[room].buzzOrder.includes(name)) {
      rooms[room].buzzOrder.push(name);
      io.to(room).emit("buzz", { name });
      if (rooms[room].settings?.showBuzzedPlayerToAll) {
        io.to(room).emit("buzzNameVisible", name);
      }
    }
  });

  socket.on("result", ({ room, name, type }) => {
    if (!rooms[room] || !(name in rooms[room].players)) return;
    let delta = type === "correct" ? rooms[room].settings.pointsRight : rooms[room].settings.pointsWrong;
    rooms[room].players[name] += delta;

    const updates = [{ name, delta }];

    if (type === "wrong" && rooms[room].settings.pointsOthers !== 0) {
      for (let player in rooms[room].players) {
        if (player !== name) {
          rooms[room].players[player] += rooms[room].settings.pointsOthers;
          updates.push({ name: player, delta: rooms[room].settings.pointsOthers });
        }
      }
    }

    io.to(room).emit("scoreUpdateEffects", updates);

    // ⬇️ Buzzer automatisch zurücksetzen nach Bewertung
    rooms[room].buzzOrder = [];
    io.to(room).emit("resetBuzz");

    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts,
    });
  });

  socket.on("resetBuzz", (room) => {
    if (!rooms[room]) return;
    rooms[room].buzzOrder = [];
    io.to(room).emit("resetBuzz");
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts,
    });
  });

  socket.on("settings", ({ room, showPoints, pointsRight, pointsWrong, pointsOthers, equalMode, showBuzzedPlayerToAll }) => {
    if (!rooms[room]) return;
    rooms[room].settings = {
      showPoints,
      pointsRight,
      pointsWrong,
      pointsOthers,
      equalMode,
      showBuzzedPlayerToAll,
    };
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts,
    });
  });

  socket.on("adjustPoints", ({ room, name, delta }) => {
    if (!rooms[room] || !(name in rooms[room].players)) return;
    rooms[room].players[name] += delta;
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts,
    });
  });

  socket.on("textUpdate", ({ room, name, text }) => {
    if (!rooms[room]) return;
    rooms[room].texts[name] = text;
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts,
    });
  });

  socket.on("buzzModeChanged", ({ room, mode }) => {
    if (!rooms[room]) return;
    rooms[room].buzzMode = mode;
    io.to(room).emit("buzzModeSet", mode);
  });

  socket.on("disconnect", () => {
    const { room, name, isHost } = socket.data || {};
    if (!room || !rooms[room]) return;

    if (!isHost) {
      delete rooms[room].players[name];
    }

    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts,
    });
  });
});

app.get("/", (req, res) => {
  res.send("✅ Buzzer-Backend läuft (v0.4.0.7)");
});

http.listen(PORT, () => {
  console.log(`Server gestartet auf Port ${PORT}`);
});