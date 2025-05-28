// server.js – v0.4.1.2
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

let rooms = {};

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data = { name, room, isHost };

    if (!rooms[room]) {
      rooms[room] = {
        hostId: isHost ? socket.id : null,
        players: {},
        buzzed: [],
        settings: {
          showPoints: true,
          pointsRight: 100,
          pointsWrong: -100,
          pointsOthers: 0,
          equalMode: true,
          showBuzzedPlayerToAll: true
        },
        buzzMode: "first",
        inputLocked: false
      };
    }

    rooms[room].players[socket.id] = { name, score: 0, text: "" };

    io.to(room).emit("players", rooms[room].players);
    io.to(socket.id).emit("settings", rooms[room].settings);
    io.to(socket.id).emit("buzzModeSet", rooms[room].buzzMode);
    io.to(room).emit("inputLockStatus", rooms[room].inputLocked);
  });

  socket.on("buzz", ({ room, name }) => {
    const r = rooms[room];
    if (!r) return;
    if (r.buzzMode === "first" && r.buzzed.length > 0) return;
    if (r.buzzMode === "multi" && r.buzzed.includes(socket.id)) return;

    r.buzzed.push(socket.id);

    io.to(room).emit("buzz", { name });

    if (r.settings.showBuzzedPlayerToAll) {
      io.to(room).emit("buzzNameVisible", name);
    }

    const buzzOrderNames = r.buzzed.map(id => r.players[id]?.name).filter(Boolean);
    io.to(room).emit("buzzOrderUpdate", buzzOrderNames);

    if (r.buzzMode === "first") {
      io.to(room).emit("buzzBlocked");
    }
  });

  socket.on("resetBuzz", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    r.buzzed = [];
    io.to(room).emit("resetBuzz");
  });

  socket.on("answerResult", ({ room, correct }) => {
    const r = rooms[room];
    if (!r || r.buzzed.length === 0) return;
    const settings = r.settings;

    if (r.buzzMode === "first") {
      const firstId = r.buzzed[0];
      if (r.players[firstId]) {
        if (correct) {
          r.players[firstId].score += settings.pointsRight;
        } else {
          r.players[firstId].score += settings.pointsWrong;
          Object.keys(r.players).forEach(id => {
            if (id !== firstId) {
              r.players[id].score += settings.pointsOthers;
            }
          });
        }
      }
    }

    r.buzzed = [];
    io.to(room).emit("players", r.players);
    io.to(room).emit("resetBuzz");
  });

  socket.on("textUpdate", ({ room, name, text }) => {
    const r = rooms[room];
    if (!r) return;
    const player = Object.values(r.players).find(p => p.name === name);
    if (player) {
      player.text = text;
      io.to(room).emit("players", r.players);
    }
  });

  socket.on("clearTexts", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    Object.values(r.players).forEach(p => p.text = "");
    io.to(room).emit("clearTexts");
    io.to(room).emit("players", r.players);
  });

  socket.on("lockTexts", ({ room, locked }) => {
    const r = rooms[room];
    if (!r) return;
    r.inputLocked = locked;
    io.to(room).emit("inputLockStatus", locked);
  });

  socket.on("buzzModeChanged", ({ room, mode }) => {
    const r = rooms[room];
    if (!r) return;
    r.buzzMode = mode;
    r.buzzed = [];
    io.to(room).emit("buzzModeSet", mode);
    io.to(room).emit("resetBuzz");
  });

  socket.on("settings", ({ room, showPoints, pointsRight, pointsWrong, pointsOthers, equalMode, showBuzzedPlayerToAll }) => {
    const r = rooms[room];
    if (!r) return;
    r.settings = {
      showPoints,
      pointsRight,
      pointsWrong,
      pointsOthers,
      equalMode,
      showBuzzedPlayerToAll
    };
    io.to(room).emit("settings", r.settings);
  });

  socket.on("disconnect", () => {
    const { room } = socket.data || {};
    if (!room || !rooms[room]) return;

    delete rooms[room].players[socket.id];

    if (Object.keys(rooms[room].players).length === 0) {
      delete rooms[room];
    } else {
      io.to(room).emit("players", rooms[room].players);
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
