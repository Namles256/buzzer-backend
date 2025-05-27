// Version 0.3.8.5
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

app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("Ein Teilnehmer ist verbunden:", socket.id);

  socket.on("join", (name, isHost) => {
    if (isHost) {
      gamemasterId = socket.id;
      console.log("Gamemaster ist verbunden.");
      return;
    }

    participants[socket.id] = { name, points: 0 };
    io.to(gamemasterId).emit("participantsUpdate", participants);
    updateAllClients();
  });

  socket.on("buzz", () => {
    if (buzzerLocked && buzzMode === "first") return;

    if (!buzzedOrder.includes(socket.id)) {
      buzzedOrder.push(socket.id);

      if (buzzMode === "first") {
        buzzerLocked = true;
      }

      updateAllClients();
    }
  });

  socket.on("setBuzzMode", (mode) => {
    buzzMode = mode;
    console.log("Buzzmodus geändert zu:", mode);
  });

  socket.on("resetBuzzer", () => {
    buzzerLocked = false;
    buzzedOrder = [];
    updateAllClients();
  });

  socket.on("disconnect", () => {
    console.log("Verbindung getrennt:", socket.id);
    delete participants[socket.id];
    buzzedOrder = buzzedOrder.filter((id) => id !== socket.id);
    io.to(gamemasterId).emit("participantsUpdate", participants);
    updateAllClients();
  });

  function updateAllClients() {
    const buzzInfo = buzzedOrder.map((id) => participants[id]?.name || "Unbekannt");
    for (const id in participants) {
      const isBuzzed = buzzedOrder.includes(id);
      const buzzIndex = buzzedOrder.indexOf(id);
      const data = {
        locked: buzzMode === "first" ? buzzerLocked : isBuzzed,
        buzzOrder: buzzedOrder,
        points: participants[id].points,
        showBuzzRank: buzzIndex >= 0 ? buzzIndex + 1 : null,
      };
      io.to(id).emit("buzzUpdate", data);
    }
    io.to(gamemasterId).emit("participantsUpdate", participants);
    io.to(gamemasterId).emit("buzzedList", buzzInfo);
  }
});

http.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
