// main.js – v0.3.8.2
const socket = io("https://buzzer-backend-a8ub.onrender.com");

let name = "";
let room = "";
let isHost = false;
let showPoints = true;
let pointsRight = 100;
let pointsWrong = -100;
let equalMode = true;
let lastBuzz = null;
let buzzMode = "first";
let hasBuzzed = false;
let buzzDisabled = false;

const root = document.getElementById("root");

function renderJoinScreen() {
  root.innerHTML = `
    <h2>Buzzer v0.3.8.2</h2>
    <input id="nameInput" placeholder="Dein Name"><br/><br/>
    <input id="roomInput" placeholder="Raum-Code"><br/><br/>
    <label><input type="checkbox" id="hostCheck"/> Ich bin Host</label><br/><br/>
    <button id="joinBtn">Beitreten</button>
  `;
  document.getElementById("joinBtn").onclick = () => {
    name = document.getElementById("nameInput").value;
    room = document.getElementById("roomInput").value;
    isHost = document.getElementById("hostCheck").checked;
    socket.emit("join", { name, room, isHost });
    renderGameScreen();
  };
}

function renderGameScreen(players = {}) {
  if (isHost) {
    root.innerHTML = `
      <h2>Host – Raum: ${room}</h2>
      <label><input type="checkbox" id="togglePoints" ${showPoints ? "checked" : ""}/> Punkteliste für Teilnehmer anzeigen</label><br/>
      <label><input type="checkbox" id="equalMode" ${equalMode ? "checked" : ""}/> ✅ und ❌ gleich bewerten</label><br/>
      <label>Punkte für ✅: <input id="pointsRight" type="number" value="${pointsRight}" /></label><br/>
      <label id="wrongLabel" style="display:${equalMode ? "none" : "inline"}">
        Punkte für ❌: <input id="pointsWrong" type="number" value="${pointsWrong}" />
      </label><br/>
      <label>Buzz-Modus:
        <select id="buzzModeSelect">
          <option value="first" ${buzzMode === "first" ? "selected" : ""}>Nur erster darf buzzern</option>
          <option value="multi" ${buzzMode === "multi" ? "selected" : ""}>Mehrere dürfen buzzern</option>
        </select>
      </label><br/><br/>
      <button id="correctBtn">✅ Richtig</button>
      <button id="wrongBtn">❌ Falsch</button>
      <button id="resetBtn">🔁 Buzzer freigeben</button>
      <div id="buzzInfo">${lastBuzz ? "🔔 " + lastBuzz + " hat gebuzzert!" : ""}</div>
      <div id="playerHeader"><strong>Teilnehmer:</strong></div><div style="margin-bottom:10px;"></div><div id="playerList"></div>
    `;
    document.getElementById("togglePoints").onchange = (e) => {
      showPoints = e.target.checked;
      sendSettings();
    };
    document.getElementById("equalMode").onchange = (e) => {
      equalMode = e.target.checked;
      document.getElementById("wrongLabel").style.display = equalMode ? "none" : "inline";
      sendSettings();
    };
    document.getElementById("pointsRight").onchange = (e) => {
      pointsRight = parseFloat(e.target.value);
      sendSettings();
    };
    document.getElementById("pointsWrong").onchange = (e) => {
      pointsWrong = parseFloat(e.target.value);
      sendSettings();
    };
    document.getElementById("buzzModeSelect").onchange = (e) => {
      buzzMode = e.target.value;
      socket.emit("buzzModeChanged", { room, mode: buzzMode });
    };
    document.getElementById("correctBtn").onclick = () => {
      if (lastBuzz) {
        socket.emit("result", { room, name: lastBuzz, type: "correct" });
        lastBuzz = null;
      }
    };
    document.getElementById("wrongBtn").onclick = () => {
      if (lastBuzz) {
        socket.emit("result", { room, name: lastBuzz, type: "wrong" });
        lastBuzz = null;
      }
    };
    document.getElementById("resetBtn").onclick = () => {
      socket.emit("resetBuzz", room);
      lastBuzz = null;
    };
  } else {
    root.innerHTML = `
      <h2>Raum: ${room}</h2>
      <button id="buzzBtn">🔔 Buzz!</button>
      <div id="buzzInfo"></div>
      <div id="playerHeader"><strong>Teilnehmer:</strong></div><div style="margin-bottom:10px;"></div><div id="playerList"></div>
    `;
    document.getElementById("buzzBtn").onclick = () => {
      if (buzzDisabled || hasBuzzed) return;
      socket.emit("buzz", { room, name });
      if (buzzMode === "multi") hasBuzzed = true;
    };
  }
}

function sendSettings() {
  socket.emit("settings", {
    room,
    showPoints,
    pointsRight,
    pointsWrong,
    equalMode
  });
}

socket.on("playerUpdate", ({ players, showPoints: sp }) => {
  const playerList = document.getElementById("playerList");
  if (!playerList) return;
  playerList.innerHTML = "";
  Object.entries(players).forEach(([name, points]) => {
    const div = document.createElement("div");
    div.textContent = sp ? `${name}: ${points} Punkte` : name;
    playerList.appendChild(div);
  });
});

socket.on("buzzBlocked", () => {
  buzzDisabled = true;
  const btn = document.getElementById("buzzBtn");
  if (btn) btn.disabled = true;
});

socket.on("buzzOrderUpdate", (orderList) => {
  const infoDiv = document.getElementById("buzzInfo");
  if (infoDiv) infoDiv.innerHTML = "🔔 Buzz-Reihenfolge:<br/>" + orderList.map((n, i) => `${i + 1}. ${n}`).join("<br/>");
});

socket.on("buzzModeSet", (mode) => {
  buzzMode = mode;
  hasBuzzed = false;
  buzzDisabled = false;
});

renderJoinScreen();
