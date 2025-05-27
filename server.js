// Version 0.3.8.6
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
  },
});
const PORT = process.env.PORT || 3000;

let participants = {};
let buzzedOrder = [];
let buzzerLocked = false;
let gamemasterId = null;
let buzzMode = "first"; // "first" or "multi"
let showPointsToParticipants = true;
let pointsRight = 1;
let pointsWrong = 0;
let useNegativePoints = false;

app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("Teilnehmer verbunden:", socket.id);

  socket.on("join", (name, isHost) => {
    if (isHost) {
      gamemasterId = socket.id;
      console.log("Host ist verbunden:", socket.id);
      sendFullState();
      return;
    }

    participants[socket.id] = { name, points: 0 };
    io.to(gamemasterId).emit("participantsUpdate", participants);
    sendFullState();
  });

  socket.on("setBuzzMode", (mode) => {
    buzzMode = mode;
    console.log("Buzzmodus gesetzt auf:", mode);
    io.to(gamemasterId).emit("buzzModeSet", buzzMode);
  });

  socket.on("buzz", () => {
    if (buzzMode === "first" && buzzerLocked) return;
    if (!participants[socket.id]) return;
    if (buzzedOrder.includes(socket.id)) return;

    buzzedOrder.push(socket.id);
    if (buzzMode === "first") buzzerLocked = true;

    sendFullState();
  });

  socket.on("resetBuzzer", () => {
    buzzedOrder = [];
    buzzerLocked = false;
    sendFullState();
  });

  socket.on("setPointOptions", (data) => {
    pointsRight = parseInt(data.right) || 1;
    pointsWrong = parseInt(data.wrong) || 0;
    useNegativePoints = !!data.allowNegative;
    sendFullState();
  });

  socket.on("awardPoints", ({ correct }) => {
    if (buzzedOrder.length === 0) return;

    const firstId = buzzedOrder[0];
    if (!participants[firstId]) return;

    if (correct) {
      participants[firstId].points += pointsRight;
    } else {
      const penalty = useNegativePoints ? -Math.abs(pointsWrong) : 0;
      participants[firstId].points += penalty;
    }

    buzzedOrder = [];
    buzzerLocked = false;
    sendFullState();
  });

  socket.on("togglePointsVisibility", (show) => {
    showPointsToParticipants = show;
    sendFullState();
  });

  socket.on("disconnect", () => {
    console.log("Verbindung getrennt:", socket.id);
    delete participants[socket.id];
    buzzedOrder = buzzedOrder.filter((id) => id !== socket.id);
    sendFullState();
  });

  function sendFullState() {
    const buzzList = buzzedOrder.map((id) => participants[id]?.name || "Unbekannt");

    // Für Host
    io.to(gamemasterId).emit("participantsUpdate", participants);
    io.to(gamemasterId).emit("buzzedList", buzzList);

    // Für alle Teilnehmer
    Object.entries(participants).forEach(([id, info]) => {
      const isBuzzed = buzzedOrder.includes(id);
      const locked = buzzMode === "first" ? buzzerLocked : isBuzzed;
      const buzzRank = buzzedOrder.indexOf(id);
      io.to(id).emit("buzzUpdate", {
        locked,
        showBuzzRank: buzzRank >= 0 ? buzzRank + 1 : null,
        points: info.points,
        showPoints: showPointsToParticipants,
        participants: showPointsToParticipants
          ? getParticipantList()
          : getNameList(),
      });
    });
  }

  function getParticipantList() {
    return Object.values(participants).map((p) => ({
      name: p.name,
      points: p.points,
    }));
  }

  function getNameList() {
    return Object.values(participants).map((p) => ({
      name: p.name,
    }));
  }
});

http.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
