// server.js – v0.4.7.0

const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);

const port = process.env.PORT || 3000;
app.use(express.static("."));

let rooms = {};

app.get("/", (req, res) => {
  res.send("✅ Buzzer-Backend läuft (v0.4.7.0)");
});

io.on("connection", (socket) => {
  let joinedRoom = "";
  let playerName = "";
  let isHost = false;

  socket.on("join", ({ name, room, isHost: host }) => {
    joinedRoom = room;
    playerName = name;
    isHost = !!host;
    socket.join(room);

    if (!rooms[room]) rooms[room] = {
      players: {},
      host: "",
      showPoints: true,
      pointsRight: 100,
      pointsWrong: -100,
      pointsOthers: 0,
      equalMode: true,
      showBuzzedPlayerToAll: true,
      showAnswerOptions: false,
      answerOptionCount: 4,
      answerOptionMulti: false,
      buzzMode: "first",
      buzzOrder: [],
      playerTexts: {},
      loggedInStatus: {},
      playerAnswers: {}
    };

    rooms[room].players[name] = 0;
    if (isHost) rooms[room].host = name;

    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedInStatus);
    io.to(room).emit("answerSelectionUpdate", rooms[room].playerAnswers);
  });

  socket.on("settings", (data) => {
    if (!rooms[data.room]) return;
    rooms[data.room].showPoints = data.showPoints;
    rooms[data.room].pointsRight = data.pointsRight;
    rooms[data.room].pointsWrong = data.pointsWrong;
    rooms[data.room].pointsOthers = data.pointsOthers;
    rooms[data.room].equalMode = data.equalMode;
    rooms[data.room].showBuzzedPlayerToAll = data.showBuzzedPlayerToAll;
    rooms[data.room].showAnswerOptions = data.showAnswerOptions;
    rooms[data.room].answerOptionCount = data.answerOptionCount;
    rooms[data.room].answerOptionMulti = data.answerOptionMulti;
    io.to(data.room).emit("settings", data);
  });

  socket.on("buzz", ({ room, name }) => {
    if (!rooms[room]) return;
    if (!rooms[room].buzzOrder.includes(name)) rooms[room].buzzOrder.push(name);
    io.to(room).emit("buzz", { name });
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
  });

  socket.on("buzzModeChanged", ({ room, mode }) => {
    if (!rooms[room]) return;
    rooms[room].buzzMode = mode;
    io.to(room).emit("buzzModeSet", mode);
    rooms[room].buzzOrder = [];
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
  });

  socket.on("result", ({ room, name, type }) => {
    if (!rooms[room] || !rooms[room].players[name]) return;
    let pointsDelta = 0;
    if (type === "correct") pointsDelta = rooms[room].pointsRight;
    if (type === "wrong") pointsDelta = rooms[room].equalMode ? rooms[room].pointsWrong : rooms[room].pointsWrong;
    rooms[room].players[name] += pointsDelta;
    if (type === "wrong" && !rooms[room].equalMode) {
      Object.keys(rooms[room].players).forEach(n => {
        if (n !== name) rooms[room].players[n] += rooms[room].pointsOthers;
      });
    }
    rooms[room].buzzOrder = [];
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
  });

  socket.on("resetBuzz", (room) => {
    if (!rooms[room]) return;
    rooms[room].buzzOrder = [];
    io.to(room).emit("resetBuzz");
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
  });

  socket.on("resetAllPoints", (room) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].players).forEach(n => rooms[room].players[n] = 0);
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
  });

  socket.on("clearTexts", (room) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].playerTexts).forEach(n => rooms[room].playerTexts[n] = "");
    io.to(room).emit("clearTexts");
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
  });

  socket.on("resetRoom", (room) => {
    if (!rooms[room]) return;
    rooms[room] = undefined;
    io.to(room).emit("roomReset");
  });

  socket.on("adjustPoints", ({ room, name, delta }) => {
    if (!rooms[room] || !rooms[room].players[name]) return;
    rooms[room].players[name] += delta;
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
  });

  socket.on("textUpdate", ({ room, name, text }) => {
    if (!rooms[room]) return;
    rooms[room].playerTexts[name] = text;
    // Sende gezielt für Host eine eigene Live-Update-Message (vermeidet Flackern bei Teilnehmern)
    io.to(room).emit("playerTextsUpdate", rooms[room].playerTexts);
    io.to(room).emit("playerUpdate", {
      players: rooms[room].players,
      showPoints: rooms[room].showPoints,
      buzzOrder: rooms[room].buzzOrder,
      texts: rooms[room].playerTexts
    });
  });

  socket.on("lockTexts", ({ room, locked }) => {
    if (!rooms[room]) return;
    rooms[room].inputLocked = !!locked;
    io.to(room).emit("inputLockStatus", !!locked);
  });

  socket.on("loginStatus", ({ room, name, loggedIn }) => {
    if (!rooms[room]) return;
    if (!rooms[room].loggedInStatus) rooms[room].loggedInStatus = {};
    rooms[room].loggedInStatus[name] = !!loggedIn;
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedInStatus);
  });

  socket.on("unlockText", ({ room, targetName }) => {
    if (!rooms[room]) return;
    if (!rooms[room].loggedInStatus) rooms[room].loggedInStatus = {};
    rooms[room].loggedInStatus[targetName] = false;
    io.to(room).emit("unlockText", targetName);
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedInStatus);
  });

  socket.on("unlockAllTexts", ({ room }) => {
    if (!rooms[room]) return;
    Object.keys(rooms[room].loggedInStatus || {}).forEach(n => rooms[room].loggedInStatus[n] = false);
    io.to(room).emit("unlockAllTexts");
    io.to(room).emit("loginStatusUpdate", rooms[room].loggedInStatus);
  });

  socket.on("answerSelection", ({ room, name, sel }) => {
    if (!rooms[room]) return;
    if (!rooms[room].playerAnswers) rooms[room].playerAnswers = {};
    rooms[room].playerAnswers[name] = sel;
    io.to(room).emit("answerSelectionUpdate", rooms[room].playerAnswers);
  });

  socket.on("disconnect", () => {
    if (joinedRoom && rooms[joinedRoom]) {
      delete rooms[joinedRoom].players[playerName];
      delete rooms[joinedRoom].playerTexts[playerName];
      delete rooms[joinedRoom].loggedInStatus[playerName];
      delete rooms[joinedRoom].playerAnswers[playerName];
      rooms[joinedRoom].buzzOrder = rooms[joinedRoom].buzzOrder.filter(n => n !== playerName);
      io.to(joinedRoom).emit("playerUpdate", {
        players: rooms[joinedRoom].players,
        showPoints: rooms[joinedRoom].showPoints,
        buzzOrder: rooms[joinedRoom].buzzOrder,
        texts: rooms[joinedRoom].playerTexts
      });
      io.to(joinedRoom).emit("loginStatusUpdate", rooms[joinedRoom].loggedInStatus);
      io.to(joinedRoom).emit("answerSelectionUpdate", rooms[joinedRoom].playerAnswers);
    }
  });
});

http.listen(port, () => {
  console.log("Server läuft auf Port " + port);
});
