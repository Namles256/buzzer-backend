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
  res.send("✅ Buzzer-Backend läuft (v0.4.2.8)");
});

function getDefaultRoomState() {
  return {
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
    showBuzzedPlayerToAll: true,
    inputLocked: false,
    buzzedNamePersistent: null,
    timer: { running: false, endTime: null, paused: false, pausedLeft: 0 }
  };
}

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data = { name, room, isHost };

    if (!rooms[room]) {
      rooms[room] = getDefaultRoomState();
    }

    if (isHost) {
      rooms[room].host = socket.id;
      socket.emit("buzzModeSet", rooms[room].buzzMode);
      socket.emit("inputLockStatus", rooms[room].inputLocked);
      if (rooms[room].buzzMode === "first" && rooms[room].buzzedNamePersistent) {
        socket.emit("buzz", { name: rooms[room].buzzedNamePersistent });
      }
      // Send timer state
      socket.emit("timerUpdate", getRoomTimer(room));
    } else {
      if (!rooms[room].players[name]) {
        rooms[room].players[name] = 0;
        rooms[room].playerTexts[name] = "";
      }
      socket.emit("buzzModeSet", rooms[room].buzzMode);
      socket.emit("inputLockStatus", rooms[room].inputLocked);
      // Send timer state
      socket.emit("timerUpdate", getRoomTimer(room));
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

  socket.on("setPoints", ({ room, name, value }) => {
    const r = rooms[room];
    if (!r || !(name in r.players)) return;
    r.players[name] = value;
    updatePlayers(room);
    io.to(room).emit("scoreUpdateEffects", [{ name, delta: 0 }]);
  });

  socket.on("resetAllPoints", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    Object.keys(r.players).forEach(name => {
      r.players[name] = 0;
    });
    updatePlayers(room);
    io.to(room).emit("scoreUpdateEffects", []);
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
      rooms[room].buzzedNamePersistent = null;
      io.to(room).emit("buzzModeSet", mode);
    }
  });

  socket.on("buzz", ({ room, name }) => {
    const r = rooms[room];
    if (!r || r.buzzBlocked) return;

    if (r.buzzMode === "first") {
      r.buzzBlocked = true;
      r.buzzedNamePersistent = name;
      io.to(room).emit("buzzBlocked");
      io.to(room).emit("buzz", { name });
      if (r.showBuzzedPlayerToAll) {
        io.to(room).emit("buzzNameVisible", name);
      }
    }

    if (r.buzzMode === "multi") {
      if (r.buzzedPlayers.has(name)) return;
      r.buzzedPlayers.add(name);
      r.buzzOrder.push(name);
      io.to(r.host).emit("buzzOrderUpdate", r.buzzOrder);
      io.to(room).emit("buzz", { name });
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
      io.to(room).emit("playAnswerSound", { type: "correct" });
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
      io.to(room).emit("playAnswerSound", { type: "wrong" });
    }

    r.buzzBlocked = false;
    r.buzzOrder = [];
    r.buzzedPlayers.clear();
    r.buzzedNamePersistent = null;
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
    r.buzzedNamePersistent = null;
    updatePlayers(room);
    io.to(room).emit("resetBuzz");
  });

  socket.on("lockTexts", ({ room, locked }) => {
    const r = rooms[room];
    if (!r) return;
    r.inputLocked = locked;
    io.to(room).emit("inputLockStatus", locked);
  });

  socket.on("clearTexts", (room) => {
    const r = rooms[room];
    if (!r) return;
    Object.keys(r.playerTexts).forEach(name => {
      r.playerTexts[name] = "";
    });
    updatePlayers(room);
    io.to(room).emit("clearTexts");
  });

  // === Timer Events ===
  socket.on("timerStart", ({ room, seconds }) => {
    if (!rooms[room]) return;
    const end = Date.now() + seconds * 1000;
    rooms[room].timer = {
      running: true,
      endTime: end,
      paused: false,
      pausedLeft: 0
    };
    broadcastTimer(room);
    startRoomTimer(room);
  });

  socket.on("timerPause", ({ room }) => {
    if (!rooms[room]) return;
    let r = rooms[room];
    if (!r.timer.running || r.timer.paused) return;
    r.timer.paused = true;
    r.timer.pausedLeft = Math.max(0, r.timer.endTime - Date.now());
    r.timer.running = false;
    broadcastTimer(room);
  });

  socket.on("timerResume", ({ room }) => {
    if (!rooms[room]) return;
    let r = rooms[room];
    if (!r.timer.paused) return;
    r.timer.running = true;
    r.timer.endTime = Date.now() + r.timer.pausedLeft;
    r.timer.paused = false;
    broadcastTimer(room);
    startRoomTimer(room);
  });

  socket.on("timerReset", ({ room }) => {
    if (!rooms[room]) return;
    rooms[room].timer = {
      running: false,
      endTime: null,
      paused: false,
      pausedLeft: 0
    };
    broadcastTimer(room);
  });

  // === Raum-Reset Event ===
  socket.on("resetRoom", ({ room }) => {
    // Kick all clients (except host, optional)
    io.to(room).emit("kicked");
    rooms[room] = getDefaultRoomState();
    updatePlayers(room);
    broadcastTimer(room);
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

function getRoomTimer(room) {
  if (!rooms[room]) return { running: false, timeLeft: 0, paused: false };
  let r = rooms[room].timer;
  let timeLeft = 0;
  if (r.running) timeLeft = Math.max(0, Math.round((r.endTime - Date.now()) / 1000));
  else if (r.paused) timeLeft = Math.max(0, Math.round(r.pausedLeft / 1000));
  return { running: r.running, timeLeft, paused: r.paused };
}

// send timer update to all in room
function broadcastTimer(room) {
  const timer = getRoomTimer(room);
  io.to(room).emit("timerUpdate", timer);
}

// host timer ticking function
const timers = {};
function startRoomTimer(room) {
  if (timers[room]) clearInterval(timers[room]);
  timers[room] = setInterval(() => {
    let t = getRoomTimer(room);
    if (!t.running) {
      clearInterval(timers[room]);
      return;
    }
    broadcastTimer(room);
    if (t.timeLeft <= 0) {
      rooms[room].timer.running = false;
      rooms[room].timer.endTime = null;
      rooms[room].timer.paused = false;
      rooms[room].timer.pausedLeft = 0;
      broadcastTimer(room);
      io.to(room).emit("timerEnd");
      clearInterval(timers[room]);
    }
  }, 300);
}

server.listen(3000);
