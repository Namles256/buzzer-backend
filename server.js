
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

const players = {};

app.get("/", (req, res) => {
  res.send("✅ Buzzer-Backend läuft.");
});

io.on("connection", (socket) => {
  console.log("🔌 Neue Verbindung:", socket.id);

  socket.on("join", ({ name, room }) => {
    console.log(`✅ ${name} ist Raum '${room}' beigetreten`);
    socket.join(room);
    players[socket.id] = { name, room };

    broadcastPlayers(room);
  });

  socket.on("buzz", ({ room, name }) => {
    console.log(`🔔 Buzz von ${name} in Raum ${room}`);
    for (let [id, player] of Object.entries(players)) {
      if (player.room === room) {
        const toSocket = io.sockets.sockets.get(id);
        if (!toSocket) continue;
        if (id === socket.id) continue; // nicht an sich selbst senden

        if (player.isHost) {
          toSocket.emit("buzz", { name }); // Host sieht den Namen
        } else {
          toSocket.emit("buzz", {}); // Teilnehmer bekommen nur Signal
        }
      }
    }
  });

  socket.on("reset", (room) => {
    io.to(room).emit("reset");
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];
    if (player) {
      const room = player.room;
      delete players[socket.id];
      broadcastPlayers(room);
    }
  });

  function broadcastPlayers(room) {
    const roomPlayers = Object.fromEntries(
      Object.entries(players).filter(([_, p]) => p.room === room)
    );
    io.to(room).emit("players", roomPlayers);
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});
