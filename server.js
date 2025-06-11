const express = require("express");
const http = require("http");
const cors = require("cors"); // <--- NEU
const app = express();

// CORS-Freigabe für Netlify-URL
app.use(cors({
  origin: "https://buzzer-show.netlify.app",
  credentials: true
}));

const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "https://buzzer-show.netlify.app",
    methods: ["GET", "POST"],
    credentials: true
  }
});

let rooms = {};

function getDefaultSettings() {
  return {
    showPoints: true,
    pointsRight: 100,
    pointsWrong: -100,
    pointsOthers: 0,
    equalMode: true,
    showBuzzedPlayerToAll: true,
    mcCount: 2,
    mcMulti: false,
    mcHide: false // NEU: MC ausblenden
  };
}

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, isHost }) => {
    socket.join(room);
    socket.data = { name, room, isHost: !!isHost };
    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        host: isHost ? name : null,
        buzzed: null,
        buzzOrder: [],
        settings: getDefaultSettings(),
        texts: {},
        locked: false,
        loggedIn: {},
        multiBuzzedNames: [],
        mcAnswers: {},
      };
    }
    if (isHost) {
      rooms[room].host = name;
    }
    // >>>> NEU: Spielerbox beim Join sofort sichtbar, auch ohne ersten Buzz!
    if (!isHost) {
      if (!(name in rooms[room].players)) {
        rooms[room].players[name] = 0;
      }
      rooms[room].loggedIn[name] = false;
    }
    emitPlayerUpdate(room);
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
    socket.emit("buzzModeSet", rooms[room].settings.buzzMode || "first");
    socket.emit("mcSettings", {
      mcCount: rooms[room].settings.mcCount || 2,
      mcMulti: rooms[room].settings.mcMulti || false,
      mcHide: rooms[room].settings.mcHide || false
    });
    socket.emit("mcAnswers", rooms[room].mcAnswers || {});
  });

  socket.on("settings", (data) => {
    const room = socket.data.room;
    if (!room || !rooms[room]) return;
    rooms[room].settings = {
      ...rooms[room].settings,
      ...data
    };
    io.to(room).emit("mcSettings", {
      mcCount: rooms[room].settings.mcCount || 2,
      mcMulti: rooms[room].settings.mcMulti || false,
      mcHide: rooms[room].settings.mcHide || false
    });
    emitPlayerUpdate(room);
  });

  socket.on("mcAnswer", ({ room, name, answers }) => {
    if (!rooms[room]) return;
    rooms[room].mcAnswers[name] = Array.isArray(answers) ? answers : [];
    emitPlayerUpdate(room);
    io.to(room).emit("mcAnswers", rooms[room].mcAnswers);
  });

  socket.on("unlockText", ({ room, targetName }) => {
    if (!rooms[room]) return;
    rooms[room].loggedIn[targetName] = false;
    if (rooms[room].mcAnswers) rooms[room].mcAnswers[targetName] = [];
    io.to(room).emit("unlockText", targetName);
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
    io.to(room).emit("mcAnswers", rooms[room].mcAnswers || {});
    emitPlayerUpdate(room);
  });

  socket.on("unlockAllTexts", ({ room }) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].loggedIn).forEach(p => {
      rooms[room].loggedIn[p] = false;
      if (rooms[room].mcAnswers) rooms[room].mcAnswers[p] = [];
    });
    io.to(room).emit("unlockAllTexts");
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
    io.to(room).emit("mcAnswers", rooms[room].mcAnswers || {});
    emitPlayerUpdate(room);
  });

  socket.on("clearSingleText", ({ room, targetName }) => {
    if (!rooms[room]) return;
    if (rooms[room].texts && rooms[room].texts[targetName]) {
      rooms[room].texts[targetName] = "";
      io.to(room).emit("clearSingleText", targetName);
      emitPlayerUpdate(room);
    }
  });

  socket.on("buzz", ({ room, name }) => {
    if (!rooms[room]) return;
    const buzzMode = rooms[room].settings.buzzMode || "first";
    if (buzzMode === "first") {
      if (rooms[room].buzzed) return;
      rooms[room].buzzed = name;
      rooms[room].buzzOrder = [name];
      io.to(room).emit("playBuzzSound");
    } else if (buzzMode === "multi") {
      if (!rooms[room].buzzOrder.includes(name)) {
        rooms[room].buzzOrder.push(name);
      }
    }
    io.to(room).emit("buzz", { name });
    emitPlayerUpdate(room);
  });

  socket.on("result", ({ room, name, type }) => {
    if (!rooms[room]) return;
    if (rooms[room].buzzOrder.length === 0) return;
    if (rooms[room].buzzOrder[0] !== name) return;
    let pointsRight = rooms[room].settings.pointsRight || 100;
    let pointsWrong = rooms[room].settings.pointsWrong || -100;
    let pointsOthers = rooms[room].settings.pointsOthers || 0;
    // let equalMode = !!rooms[room].settings.equalMode; // Wird für die Punktezählung nicht mehr gebraucht

    if (type === "correct") {
      rooms[room].players[name] += pointsRight;
      io.to(room).emit("playAnswerSound", { type: "correct" });
    } else if (type === "wrong") {
      // Bugfix: Immer die tatsächlich eingestellten Minuspunkte für ❌ vergeben!
      rooms[room].players[name] += pointsWrong;
      Object.keys(rooms[room].players).forEach(p => {
        if (p !== name) rooms[room].players[p] += pointsOthers;
      });
      io.to(room).emit("playAnswerSound", { type: "wrong" });
    }
    emitPlayerUpdate(room);
    rooms[room].buzzOrder.shift();
    if (rooms[room].buzzOrder.length === 0) {
      rooms[room].buzzed = null;
      io.to(room).emit("resetBuzz");
    } else {
      rooms[room].buzzed = rooms[room].buzzOrder[0];
      emitPlayerUpdate(room);
    }
  });

  socket.on("buzzModeChanged", ({ room, mode }) => {
    if (!rooms[room]) return;
    rooms[room].settings.buzzMode = mode;
    rooms[room].buzzOrder = [];
    rooms[room].buzzed = null;
    io.to(room).emit("buzzModeSet", mode);
    emitPlayerUpdate(room);
  });

  socket.on("resetBuzz", (room) => {
    if (!rooms[room]) return;
    rooms[room].buzzed = null;
    rooms[room].buzzOrder = [];
    io.to(room).emit("playUnlockSound");
    io.to(room).emit("resetBuzz");
    emitPlayerUpdate(room);
  });

  socket.on("adjustPoints", ({ room, name, delta }) => {
    if (!rooms[room] || !(name in rooms[room].players)) return;
    rooms[room].players[name] += delta;
    emitPlayerUpdate(room);
  });

  socket.on("resetAllPoints", (room) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].players).forEach(p => {
      rooms[room].players[p] = 0;
    });
    emitPlayerUpdate(room);
  });

  socket.on("resetRoom", (room) => {
    if (!rooms[room]) return;
    rooms[room] = {
      players: {},
      host: null,
      buzzed: null,
      buzzOrder: [],
      settings: getDefaultSettings(),
      texts: {},
      locked: false,
      loggedIn: {},
      multiBuzzedNames: [],
      mcAnswers: {},
    };
    io.to(room).emit("roomReset");
  });

  socket.on("clearTexts", (room) => {
    if (!rooms[room]) return;
    rooms[room].texts = {};
    io.to(room).emit("clearTexts");
    emitPlayerUpdate(room);
  });

  socket.on("textUpdate", ({ room, name, text }) => {
    if (!rooms[room]) return;
    rooms[room].texts[name] = text;
    emitPlayerUpdate(room);
  });

  socket.on("lockTexts", ({ room, locked }) => {
    if (!rooms[room]) return;
    rooms[room].locked = locked;
    io.to(room).emit("inputLockStatus", locked);
  });

  socket.on("loginStatus", ({ room, name, loggedIn, mcAnswers }) => {
    if (!rooms[room]) return;
    rooms[room].loggedIn[name] = loggedIn;
    if (mcAnswers && Array.isArray(mcAnswers)) {
      rooms[room].mcAnswers[name] = mcAnswers;
      io.to(room).emit("mcAnswers", rooms[room].mcAnswers);
    }
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
    emitPlayerUpdate(room);
  });

  socket.on("disconnect", () => {
    const { name, room, isHost } = socket.data || {};
    if (!room || !name || !rooms[room]) return;
    if (!isHost) {
      delete rooms[room].players[name];
      delete rooms[room].loggedIn[name];
      delete rooms[room].texts[name];
      if (rooms[room].mcAnswers) delete rooms[room].mcAnswers[name];
    }
    if (rooms[room].host === name) {
      rooms[room].host = null;
    }
    emitPlayerUpdate(room);
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
    io.to(room).emit("mcAnswers", rooms[room].mcAnswers || {});
  });
});

function emitPlayerUpdate(room) {
  if (!rooms[room]) return;
  io.to(room).emit("playerUpdate", {
    players: rooms[room].players,
    showPoints: rooms[room].settings.showPoints,
    buzzOrder: rooms[room].buzzOrder,
    texts: rooms[room].texts,
    mcSettings: {
      mcCount: rooms[room].settings.mcCount || 2,
      mcMulti: rooms[room].settings.mcMulti || false,
      mcHide: rooms[room].settings.mcHide || false
    },
    mcAnswers: rooms[room].mcAnswers || {}
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {});
