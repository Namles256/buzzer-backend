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

const PORT = process.env.PORT || 3001;

let rooms = {};

io.on("connection", (socket) => {
  let thisRoom = "";
  let thisName = "";
  let isHost = false;

  socket.on("join", ({ name, room, isHost: hostFlag }) => {
    thisRoom = room;
    thisName = name;
    isHost = !!hostFlag;

    if (!rooms[thisRoom]) {
      rooms[thisRoom] = {
        players: {},
        hosts: [],
        settings: {
          showPoints: true,
          pointsRight: 100,
          pointsWrong: -100,
          pointsOthers: 0,
          equalMode: true,
          showBuzzedPlayerToAll: true
        },
        texts: {},
        loggedInStatus: {},
        buzzOrder: [],
        buzzMode: "first"
      };
    }
    if (isHost) {
      if (!rooms[thisRoom].hosts.includes(thisName)) {
        rooms[thisRoom].hosts.push(thisName);
      }
    } else {
      rooms[thisRoom].players[thisName] = rooms[thisRoom].players[thisName] || 0;
    }
    socket.join(thisRoom);

    // Initial player update
    io.to(thisRoom).emit("playerUpdate", {
      players: rooms[thisRoom].players,
      showPoints: rooms[thisRoom].settings.showPoints,
      buzzOrder: rooms[thisRoom].buzzOrder,
      texts: rooms[thisRoom].texts
    });
  });

  socket.on("settings", (settings) => {
    if (!rooms[thisRoom]) return;
    rooms[thisRoom].settings = {
      ...rooms[thisRoom].settings,
      ...settings
    };
    io.to(thisRoom).emit("playerUpdate", {
      players: rooms[thisRoom].players,
      showPoints: rooms[thisRoom].settings.showPoints,
      buzzOrder: rooms[thisRoom].buzzOrder,
      texts: rooms[thisRoom].texts
    });
  });

  socket.on("textUpdate", ({ room, name, text }) => {
    if (!rooms[room]) return;
    rooms[room].texts[name] = text;
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts
    });
  });

  socket.on("loginStatus", ({ room, name, loggedIn }) => {
    if (!rooms[room]) return;
    rooms[room].loggedInStatus = rooms[room].loggedInStatus || {};
    rooms[room].loggedInStatus[name] = loggedIn;
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedInStatus);
  });

  socket.on("unlockText", ({ room, targetName }) => {
    if (!rooms[room]) return;
    rooms[room].loggedInStatus[targetName] = false;
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedInStatus);
    io.to(room).emit("unlockText", targetName);
  });

  socket.on("unlockAllTexts", ({ room, clearTexts }) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].loggedInStatus || {}).forEach((name) => {
      rooms[room].loggedInStatus[name] = false;
    });
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedInStatus);
    io.to(room).emit("unlockAllTexts");
    if (clearTexts) {
      Object.keys(rooms[room].texts || {}).forEach((name) => {
        rooms[room].texts[name] = "";
      });
      io.to(room).emit("clearTexts");
      io.to(room).emit("playerUpdate", {
        players: rooms[room].players,
        showPoints: rooms[room].settings.showPoints,
        buzzOrder: rooms[room].buzzOrder,
        texts: rooms[room].texts
      });
    }
  });

  // NEU: Nur ein Textfeld eines Mitspielers leeren
  socket.on("clearSingleText", ({ room, targetName }) => {
    if (!rooms[room]) return;
    rooms[room].texts[targetName] = "";
    io.to(room).emit("clearSingleText", { targetName });
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts
    });
  });

  socket.on("adjustPoints", ({ room, name, delta }) => {
    if (!rooms[room]) return;
    rooms[room].players[name] = (rooms[room].players[name] || 0) + delta;
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts
    });
  });

  socket.on("resetAllPoints", (room) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].players).forEach((p) => {
      rooms[room].players[p] = 0;
    });
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts
    });
  });

  socket.on("resetRoom", (room) => {
    if (!rooms[room]) return;
    rooms[room].players = {};
    rooms[room].texts = {};
    rooms[room].loggedInStatus = {};
    rooms[room].buzzOrder = [];
    io.to(room).emit("roomReset");
  });

  socket.on("clearTexts", (room) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].texts).forEach((n) => {
      rooms[room].texts[n] = "";
    });
    io.to(room).emit("clearTexts");
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts
    });
  });

  socket.on("buzz", ({ room, name }) => {
    if (!rooms[room]) return;
    if (rooms[room].buzzMode === "first" && rooms[room].buzzOrder.length > 0) return;
    if (rooms[room].buzzMode === "multi" && rooms[room].buzzOrder.includes(name)) return;
    rooms[room].buzzOrder.push(name);
    io.to(room).emit("buzz", { name });
    io.to(room).emit("buzzNameVisible", name);
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts
    });
    io.to(room).emit("playBuzzSound");
  });

  socket.on("resetBuzz", (room) => {
    if (!rooms[room]) return;
    rooms[room].buzzOrder = [];
    io.to(room).emit("resetBuzz");
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts
    });
    io.to(room).emit("playUnlockSound");
  });

  socket.on("buzzModeChanged", ({ room, mode }) => {
    if (!rooms[room]) return;
    rooms[room].buzzMode = mode;
    io.to(room).emit("buzzModeSet", mode);
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].settings.showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].texts
    });
  });

  socket.on("lockTexts", ({ room, locked }) => {
    io.to(room).emit("inputLockStatus", locked);
  });

  socket.on("result", ({ room, name, type }) => {
    // type: "correct" | "wrong"
    io.to(room).emit("playAnswerSound", { type });
  });

  socket.on("disconnect", () => {
    // Keine automatische Spieler-Löschung aus dem Raum
  });
});

server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
