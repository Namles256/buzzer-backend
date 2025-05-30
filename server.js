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
  res.send("✅ Buzzer-Backend läuft (v0.4.5.3)");
});

io.on("connection", (socket) => {
  socket.on("startTimer", ({ room, duration, label, disableSound }) => {
  socket.on("pauseTimer", (room) => {
  socket.on("resetTimer", (room) => {
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
        buzzedNamePersistent: null
      };
    if (isHost) {
      rooms[room].host = socket.id;
      socket.emit("buzzModeSet", rooms[room].buzzMode);
      socket.emit("inputLockStatus", rooms[room].inputLocked);
      if (rooms[room].buzzMode === "first" && rooms[room].buzzedNamePersistent) {
        socket.emit("buzz", { name: rooms[room].buzzedNamePersistent });
    } else {
      if (!rooms[room].players[name]) {
        rooms[room].players[name] = 0;
        rooms[room].playerTexts[name] = "";
      socket.emit("buzzModeSet", rooms[room].buzzMode);
      socket.emit("inputLockStatus", rooms[room].inputLocked);
    updatePlayers(room);
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
  socket.on("adjustPoints", ({ room, name, delta }) => {
    const r = rooms[room];
    if (!r) return;
    if (!(name in r.players)) {
      r.players[name] = 0;
    r.players[name] += delta;
    updatePlayers(room);
    socket.to(room).emit("scoreUpdateEffects", [{ name, delta }]);
  socket.on("setPoints", ({ room, name, points }) => {
    const r = rooms[room];
    if (!r) return;
    if (!(name in r.players)) return;
    r.players[name] = points;
    updatePlayers(room);
  socket.on("buzzModeChanged", ({ room, mode }) => {
    if (rooms[room]) {
      rooms[room].buzzMode = mode;
      rooms[room].buzzedNamePersistent = null;
      socket.to(room).emit("buzzModeSet", mode);
  socket.on("buzz", ({ room, name }) => {
    const r = rooms[room];
    if (!r || r.buzzBlocked) return;
    if (r.buzzMode === "first") {
      r.buzzBlocked = true;
      r.buzzedNamePersistent = name;
      socket.to(room).emit("buzzBlocked");
      socket.to(room).emit("buzz", { name });
      if (r.showBuzzedPlayerToAll) {
        socket.to(room).emit("buzzNameVisible", name);
    if (r.buzzMode === "multi") {
      if (r.buzzedPlayers.has(name)) return;
      r.buzzedPlayers.add(name);
      r.buzzOrder.push(name);
      updatePlayers(room);
      socket.to(r.host).emit("buzzOrderUpdate", r.buzzOrder);
      socket.to(room).emit("buzz", { name });
      socket.to(socket.id).emit("buzzBlocked");
  socket.on("result", ({ room, name, type }) => {
    const r = rooms[room];
    if (!r) return;
    const updates = [];
    if (type === "correct") {
      if (r.players[name] !== undefined) {
        r.players[name] += r.pointsRight;
        updates.push({ name, delta: r.pointsRight });
      socket.to(room).emit("playAnswerSound", { type: "correct" });
    } else if (type === "wrong") {
      if (r.players[name] !== undefined) {
        r.players[name] += r.pointsWrong;
        updates.push({ name, delta: r.pointsWrong });
      Object.keys(r.players).forEach((p) => {
        if (p !== name) {
          r.players[p] += r.pointsOthers;
          updates.push({ name: p, delta: r.pointsOthers });
      socket.to(room).emit("playAnswerSound", { type: "wrong" });
    r.buzzBlocked = false;
    r.buzzOrder = [];
    r.buzzedPlayers.clear();
    r.buzzedNamePersistent = null;
    updatePlayers(room);
    socket.to(room).emit("resetBuzz");
    socket.to(room).emit("scoreUpdateEffects", updates);
  socket.on("resetBuzz", (room) => {
    const r = rooms[room];
    if (!r) return;
    r.buzzBlocked = false;
    r.buzzOrder = [];
    r.buzzedPlayers.clear();
    r.buzzedNamePersistent = null;
    updatePlayers(room);
    socket.to(room).emit("resetBuzz");
  socket.on("resetRoom", (room) => {
    const r = rooms[room];
    if (!r) return;
    socket.to(room).emit("roomReset");
    delete rooms[room];
  socket.on("resetAllPoints", (room) => {
    const r = rooms[room];
    if (!r) return;
    Object.keys(r.players).forEach((player) => {
      r.players[player] = 0;
    updatePlayers(room);
    socket.to(room).emit("scoreUpdateEffects", Object.keys(r.players).map(name => ({ name, delta: 0 })));
  socket.on("lockTexts", ({ room, locked }) => {
    const r = rooms[room];
    if (!r) return;
    r.inputLocked = locked;
    socket.to(room).emit("inputLockStatus", locked);
  socket.on("clearTexts", (room) => {
    const r = rooms[room];
    if (!r) return;
    Object.keys(r.playerTexts).forEach(name => {
      r.playerTexts[name] = "";
    updatePlayers(room);
    socket.to(room).emit("clearTexts");
  socket.on("textUpdate", ({ room, name, text }) => {
    const r = rooms[room];
    if (!r) return;
    r.playerTexts[name] = text;
    updatePlayers(room);
});
function updatePlayers(room) {
  const r = rooms[room];
  if (!r) return;
  socket.to(room).emit("playerUpdate", {
    players: r.players,
    showPoints: r.showPoints,
    buzzOrder: r.buzzOrder,
    texts: r.playerTexts || {}

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

server.listen(3000);
