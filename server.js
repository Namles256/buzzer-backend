
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

  socket.on("join", ({ name, room, isHost }) => {
    console.log(`✅ ${name} ist Raum '${room}' beigetreten`);
    socket.join(room);
    players[socket.id] = { name, room, isHost, points: 0 };

    broadcastPlayers(room);
  });

  socket.on("buzz", ({ room, name }) => {
    console.log(`🔔 Buzz von ${name} in Raum ${room}`);
    for (let [id, player] of Object.entries(players)) {
      if (player.room === room) {
        const toSocket = io.sockets.sockets.get(id);
        if (!toSocket) continue;
        if (id === socket.id) continue;

        if (player.isHost) {
          toSocket.emit("buzz", { name });
        } else {
          toSocket.emit("buzz", {});
        }
      }
    }
  });

  socket.on("result", ({ room, type, points = 100, minus = false }) => {
    console.log(`📢 Ergebnis in Raum ${room}: ${type}`);
    const buzzerId = Object.entries(players).find(([_, p]) => p.room === room && !p.isHost)?.[0];

    if (buzzerId && players[buzzerId]) {
      if (type === "correct") {
        players[buzzerId].points += points;
      } else if (type === "wrong" && minus) {
        players[buzzerId].points -= points;
      }
    }

    io.to(room).emit("result", { type });
    broadcastPlayers(room);
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
      Object.entries(players)
        .filter(([_, p]) => p.room === room)
        .map(([id, p]) => [p.name, p.points ?? 0])
    );
    io.to(room).emit("players", roomPlayers);
  }
});

server.listen(3001, () => {
  console.log("🚀 Server läuft auf Port 3001");
});
