// نقطة دخول العميل: الشاشات → الشبكة → Phaser + HUD.

import './ui/styles.css';
import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { getServerUrl, saveServerUrl, loadSettings, saveSettings } from './config.js';
import { ApiClient } from './network/api.js';
import { NetClient } from './network/net.js';
import { GameState } from './game/state.js';
import { InputController } from './game/input.js';
import { getDefaultWorld } from '../../shared/maps/world.js';
import { createScreens } from './ui/screens.js';
import { createHud } from './ui/hud.js';
import { GameScene } from './game/scenes/GameScene.js';

const ui = document.getElementById('ui');
const session = { token: '' };
const world = getDefaultWorld();
const serverUrl = () => getServerUrl(import.meta.env ?? {});
let running = null;

// ApiClient يُعاد إنشاؤه عند تغيير عنوان الخادم؛ الوكيل يمرّر الاستدعاءات للنسخة الحالية.
const makeApi = () => new ApiClient({ baseUrl: serverUrl(), getToken: () => session.token });
let apiRef = makeApi();
const api = new Proxy({}, { get: (_, k) => (...a) => apiRef[k](...a) });

const screens = createScreens(ui, {
  api,
  getServerUrl: serverUrl,
  setServerUrl: (u) => { saveServerUrl(u); apiRef = makeApi(); },
  onEnter: (c) => startGame(c),
  session,
});
screens.showLogin();

function leave() {
  running?.net.close();
  running?.game?.destroy(true);
  document.querySelector('.hud')?.remove();
  running = null;
  apiRef.logout();
  session.token = '';
  screens.show();
  screens.showLogin();
}

function startGame(character) {
  screens.hide();
  const state = new GameState();
  const net = new NetClient({ ioFactory: io, url: serverUrl(), getToken: () => session.token });
  const input = new InputController({ send: (ev, p) => net.send(ev, p) });
  const settings = loadSettings();
  const hud = createHud(ui, { state, world, net, input, settings, onSettings: saveSettings, onLogout: leave });
  hud.onRetry(() => net.connect(character.id));
  const run = { net, game: null };
  running = run;

  net.on('joined', (msg) => state.onJoined(msg));
  net.on('snapshot', (snap) => {
    state.rtt = net.rtt;
    state.applySnapshot(snap);
    // نبدأ Phaser عند أول لقطة: عندها موضع اللاعب معروف
    if (!run.game && state.self) {
      run.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game',
        backgroundColor: '#14110d',
        scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
        render: { antialias: true, powerPreference: 'low-power' },
        scene: [],
      });
      run.game.scene.add('game', GameScene, true, { state, world, input, net, hud });
    }
  });
  net.on('join_failed', (code) => {
    hud.toast(`تعذّر الدخول: ${code}`, 'bad');
    if (code === 'UNAUTHORIZED') leave();
  });
  net.connect(character.id);
}
