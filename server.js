const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

let rooms = {};

function getDefaultSettings() {
  return {
    showPoints: true,
    pointsRight: 100,
    pointsWrong: -100,
    pointsOthers: 0,
    equalMode: true,
    showBuzzedPlayerToAll: true
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
      };
    }
    if (isHost) {
      rooms[room].host = name;
    }
    if (!isHost) {
      rooms[room].players[name] = rooms[room].players[name] || 0;
      rooms[room].loggedIn[name] = false;
    }
    emitPlayerUpdate(room);
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
    socket.emit("buzzModeSet", rooms[room].settings.buzzMode || "first");
  });

  socket.on("settings", (data) => {
    const room = socket.data.room;
    if (!room || !rooms[room]) return;
    rooms[room].settings = {
      ...rooms[room].settings,
      ...data
    };
    emitPlayerUpdate(room);
  });

  socket.on("buzz", ({ room, name }) => {
    if (!rooms[room]) return;
    const buzzMode = rooms[room].settings.buzzMode || "first";
    if (buzzMode === "first") {
      if (rooms[room].buzzed) return;
      rooms[room].buzzed = name;
      rooms[room].buzzOrder = [name];
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
    let equalMode = !!rooms[room].settings.equalMode;
    if (type === "correct") {
      rooms[room].players[name] += pointsRight;
      io.to(room).emit("playAnswerSound", { type: "correct" });
    } else if (type === "wrong") {
      rooms[room].players[name] += equalMode ? pointsWrong : pointsWrong;
      Object.keys(rooms[room].players).forEach(p => {
        if (p !== name) rooms[room].players[p] += pointsOthers;
      });
      io.to(room).emit("playAnswerSound", { type: "wrong" });
    }
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
    io.to(room).emit("resetBuzz");
    emitPlayerUpdate(room);
  });

  socket.on("adjustPoints", ({ room, name, delta }) => {
    if (!rooms[room] || !rooms[room].players[name]) return;
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

  socket.on("loginStatus", ({ room, name, loggedIn }) => {
    if (!rooms[room]) return;
    rooms[room].loggedIn[name] = loggedIn;
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
  });

  socket.on("unlockText", ({ room, targetName }) => {
    if (!rooms[room]) return;
    rooms[room].loggedIn[targetName] = false;
    io.to(room).emit("unlockText", targetName);
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
  });

  socket.on("unlockAllTexts", ({ room }) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].loggedIn).forEach(p => {
      rooms[room].loggedIn[p] = false;
    });
    io.to(room).emit("unlockAllTexts");
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
  });

  socket.on("disconnect", () => {
    const { name, room, isHost } = socket.data || {};
    if (!room || !name || !rooms[room]) return;
    if (!isHost) {
      delete rooms[room].players[name];
      delete rooms[room].loggedIn[name];
      delete rooms[room].texts[name];
    }
    if (rooms[room].host === name) {
      rooms[room].host = null;
    }
    emitPlayerUpdate(room);
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedIn);
  });
});

function emitPlayerUpdate(room) {
  if (!rooms[room]) return;
  io.to(room).emit("playerUpdate", {
    players: rooms[room].players,
    showPoints: rooms[room].settings.showPoints,
    buzzOrder: rooms[room].buzzOrder,
    texts: rooms[room].texts
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {});
