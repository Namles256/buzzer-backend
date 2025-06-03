// server.js – v0.4.6.1 (MC bis 12 Optionen A–L)
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
  res.send("✅ Buzzer-Backend läuft (v0.4.6.1)");
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
        showBuzzedPlayerToAll: true,
        inputLocked: false,
        buzzedNamePersistent: null,
        loginStatus: {},
        // MC-Feature
        mcEnabled: false,
        mcOptions: 4,
        mcAnswers: {}
      };
    }

    if (isHost) {
      rooms[room].host = socket.id;
      socket.emit("buzzModeSet", rooms[room].buzzMode);
      socket.emit("inputLockStatus", rooms[room].inputLocked);
      if (rooms[room].buzzMode === "first" && rooms[room].buzzedNamePersistent) {
        socket.emit("buzz", { name: rooms[room].buzzedNamePersistent });
      }
      socket.emit("loginStatusUpdate", rooms[room].loginStatus || {});
      // MC Settings beim Host direkt synchronisieren
      socket.emit("mcSettingsUpdate", {
        enabled: rooms[room].mcEnabled,
        options: rooms[room].mcOptions
      });
    } else {
      if (!rooms[room].players[name]) {
        rooms[room].players[name] = 0;
        rooms[room].playerTexts[name] = "";
      }
      socket.emit("buzzModeSet", rooms[room].buzzMode);
      socket.emit("inputLockStatus", rooms[room].inputLocked);
      socket.emit("loginStatusUpdate", rooms[room].loginStatus || {});
      // MC Settings direkt an Teilnehmer schicken
      socket.emit("mcSettingsUpdate", {
        enabled: rooms[room].mcEnabled,
        options: rooms[room].mcOptions
      });
      // Wenn Antwort schon gesetzt, sofort updaten
      if (rooms[room].mcAnswers[name]) {
        socket.emit("mcAnswerUpdate", rooms[room].mcAnswers[name]);
      }
    }

    updatePlayers(room);
  });

  socket.on("settings", ({ room, showPoints, pointsRight, pointsWrong, pointsOthers, equalMode, showBuzzedPlayerToAll }) => {
    const r = rooms[room];
    if (!r) return;
    if (showPoints !== undefined) r.showPoints = showPoints;
    if (pointsRight !== undefined) r.pointsRight = pointsRight;
    if (pointsWrong !== undefined) r.pointsWrong = pointsWrong;
    if (pointsOthers !== undefined) r.pointsOthers = pointsOthers;
    if (equalMode !== undefined) r.equalMode = equalMode;
    if (showBuzzedPlayerToAll !== undefined) r.showBuzzedPlayerToAll = showBuzzedPlayerToAll;
    updatePlayers(room);
  });

  // --- Multiple Choice Settings (vom Host) ---
  socket.on("mcSettings", ({ room, enabled, options }) => {
    const r = rooms[room];
    if (!r) return;
    // Begrenzen auf 2 bis 12
    r.mcEnabled = !!enabled;
    r.mcOptions = Math.max(2, Math.min(12, options || 4));
    // Wenn deaktiviert: alle Antworten zurücksetzen!
    if (!r.mcEnabled) {
      r.mcAnswers = {};
    }
    io.to(room).emit("mcSettingsUpdate", { enabled: r.mcEnabled, options: r.mcOptions });
    updatePlayers(room);
  });

  // --- Teilnehmer antwortet ---
  socket.on("mcAnswer", ({ room, name, answer }) => {
    const r = rooms[room];
    if (!r) return;
    // Nur zulässige Werte setzen!
    const allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").slice(0, 12); // A-L
    if (!r.mcEnabled) return;
    if (!allowed.slice(0, r.mcOptions).includes(answer)) return;
    if (!r.mcAnswers) r.mcAnswers = {};
    r.mcAnswers[name] = answer;
    // Antwort an Host live übertragen
    updatePlayers(room);
    // Feedback an Teilnehmer
    io.to(socket.id).emit("mcAnswerUpdate", answer);
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
      updatePlayers(room);
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
    io.to(room).emit("resetBuzz", { manual: true });
  });

  socket.on("resetRoom", (room) => {
    const r = rooms[room];
    if (!r) return;
    io.to(room).emit("roomReset");
    delete rooms[room];
  });

  socket.on("resetAllPoints", (room) => {
    const r = rooms[room];
    if (!r) return;
    Object.keys(r.players).forEach((player) => {
      r.players[player] = 0;
    });
    updatePlayers(room);
    io.to(room).emit("scoreUpdateEffects", Object.keys(r.players).map(name => ({ name, delta: 0 })));
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

  socket.on("textUpdate", ({ room, name, text }) => {
    const r = rooms[room];
    if (!r) return;
    r.playerTexts[name] = text;
    updatePlayers(room);
  });

  socket.on("loginStatus", ({ room, name, loggedIn }) => {
    const r = rooms[room];
    if (!r) return;
    if (!r.loginStatus) r.loginStatus = {};
    r.loginStatus[name] = !!loggedIn;
    io.to(room).emit("loginStatusUpdate", r.loginStatus);
  });

  socket.on("unlockText", ({ room, targetName }) => {
    const r = rooms[room];
    if (!r) return;
    if (!r.loginStatus) r.loginStatus = {};
    r.loginStatus[targetName] = false;
    io.to(room).emit("unlockText", targetName);
    io.to(room).emit("loginStatusUpdate", r.loginStatus);
    // Auch MC-Antwort bei diesem Spieler zurücksetzen!
    if (r.mcAnswers && r.mcAnswers[targetName]) {
      delete r.mcAnswers[targetName];
      updatePlayers(room);
    }
    io.to(room).emit("mcAnswerUpdateAll", r.mcAnswers);
  });

  socket.on("unlockAllTexts", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    if (!r.loginStatus) r.loginStatus = {};
    Object.keys(r.loginStatus).forEach(name => {
      r.loginStatus[name] = false;
    });
    io.to(room).emit("unlockAllTexts");
    io.to(room).emit("loginStatusUpdate", r.loginStatus);
    // Auch alle MC-Antworten zurücksetzen!
    if (r.mcAnswers) {
      r.mcAnswers = {};
      updatePlayers(room);
    }
    io.to(room).emit("mcAnswerUpdateAll", r.mcAnswers);
  });
});

// Spieler-Info an alle Clients (Host & Teilnehmer)
function updatePlayers(room) {
  const r = rooms[room];
  if (!r) return;
  io.to(room).emit("playerUpdate", {
    players: r.players,
    showPoints: r.showPoints,
    buzzOrder: r.buzzOrder,
    texts: r.playerTexts || {},
    mcEnabled: r.mcEnabled || false,
    mcOptions: r.mcOptions || 4,
    mcAnswers: r.mcAnswers || {}
  });
}

server.listen(3000);
