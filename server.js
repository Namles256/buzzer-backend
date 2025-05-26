
let socket = io("https://buzzer-backend-a8ub.onrender.com");
let name = "";
let room = "";
let isHost = false;
let showPoints = true;

const root = document.getElementById("root");

function renderJoinScreen() {
  root.innerHTML = `
    <h2>Spielshow Joinen</h2>
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
  let content = `<h2>Raum: ${room}</h2>`;
  if (isHost) {
    content += `
      <div id="hostPanel">
        <label><input type="checkbox" id="showPointsToggle" ${showPoints ? "checked" : ""}/> Punkte bei Spielern anzeigen</label><br/><br/>
        <ul>
          ${Object.entries(players).map(([p, pts]) => `
            <li>${p}: ${pts.toFixed(1)} Punkte</li>
          `).join("")}
        </ul>
      </div>
    `;
  } else {
    content += `
      <div id="playerPanel">
        <ul>
          ${Object.entries(players).map(([p, pts]) => `
            <li>${p}${showPoints ? ": " + pts.toFixed(1) + " Punkte" : ""}</li>
          `).join("")}
        </ul>
      </div>
    `;
  }
  root.innerHTML = content;

  if (isHost) {
    document.getElementById("showPointsToggle").onchange = (e) => {
      showPoints = e.target.checked;
      socket.emit("settings", { room, showPoints });
      renderGameScreen(players);
    };
  }
}

socket.on("connect", () => {
  renderJoinScreen();
});

socket.on("players", (players) => {
  renderGameScreen(players);
});
