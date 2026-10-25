// شاشات ما قبل اللعب: عنوان الخادم، الدخول/التسجيل، قائمة الشخصيات، إنشاء شخصية.

import { h, clear } from './dom.js';
import { AR, PROFESSION_AR, tError } from '../i18n/ar.js';
import { PROFESSIONS } from '../../../shared/data/professions.js';
import { normalizeServerUrl } from '../config.js';

export function createScreens(root, { api, getServerUrl, setServerUrl, onEnter, session }) {
  const host = h('div', { class: 'screen' });
  root.append(host);
  const msg = h('div', { class: 'msg', role: 'alert' });
  const say = (t, ok = false) => {
    msg.textContent = t ?? '';
    msg.className = `msg${ok ? ' ok' : ''}`;
  };
  const card = (title, ...kids) => {
    clear(host);
    host.append(h('div', { class: 'card' }, h('h1', { text: title }), ...kids, msg));
    say('');
  };

  function serverBox() {
    const input = h('input', { type: 'url', dir: 'ltr', placeholder: AR.serverHint, value: getServerUrl() ?? '', autocomplete: 'off', 'aria-label': AR.serverUrl });
    return h('details', { class: 'server', open: !getServerUrl() },
      h('summary', { text: `${AR.server}: ${getServerUrl() ?? '—'}` }),
      input,
      h('button', {
        class: 'btn small',
        onclick: () => {
          if (!normalizeServerUrl(input.value)) return say('عنوان غير صالح (http:// أو https://)');
          setServerUrl(input.value);
          showLogin();
        },
        text: AR.save,
      }));
  }

  function showLogin() {
    const u = h('input', { name: 'username', autocomplete: 'username', maxlength: 20, dir: 'ltr', 'aria-label': AR.username, placeholder: AR.username });
    const p = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', maxlength: 72, dir: 'ltr', 'aria-label': AR.password, placeholder: AR.password });
    const go = (fn) => async () => {
      say(AR.connecting, true);
      const r = await fn(u.value.trim(), p.value);
      if (!r.ok) return say(tError(r.error));
      session.token = r.token;
      showCharacters();
    };
    card(AR.appName, serverBox(), u, p,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: go((a, b) => api.login(a, b)), text: AR.login }),
        h('button', { class: 'btn', onclick: go((a, b) => api.register(a, b)), text: AR.register })));
  }

  async function showCharacters() {
    card(AR.chooseCharacter, h('p', { text: AR.connecting }));
    const r = await api.characters();
    if (!r.ok) {
      if (r.error === 'UNAUTHORIZED') return showLogin();
      return card(AR.chooseCharacter, h('button', { class: 'btn', onclick: showCharacters, text: AR.retry }), h('button', { class: 'btn', onclick: showLogin, text: AR.back }));
    }
    const list = r.characters.map((c) =>
      h('button', { class: 'char', onclick: () => onEnter(c) },
        h('span', { class: 'dot', style: { background: PROFESSIONS[c.profession]?.color ?? '#999' } }),
        h('b', { text: c.name }),
        h('span', { text: `${PROFESSION_AR[c.profession] ?? c.profession} · ${AR.level} ${c.level}` })));
    card(AR.chooseCharacter,
      ...(list.length ? list : [h('p', { class: 'muted', text: AR.noCharacters })]),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: showCreate, text: AR.newCharacter }),
        h('button', { class: 'btn', onclick: async () => { await api.logout(); session.token = ''; showLogin(); }, text: AR.logout })));
  }

  function showCreate() {
    let chosen = 'trader';
    const name = h('input', { maxlength: 16, 'aria-label': AR.characterName, placeholder: AR.characterName });
    const opts = Object.values(PROFESSIONS).map((p) => {
      const b = h('button', {
        class: `prof${p.id === chosen ? ' sel' : ''}`,
        'data-prof': p.id,
        style: { '--c': p.color },
        onclick: () => {
          chosen = p.id;
          for (const x of opts) x.classList.toggle('sel', x.dataset.prof === chosen);
        },
      }, h('b', { text: p.nameAr }), h('small', { text: p.descAr }),
        h('small', { class: 'stats', text: `${AR.hp} ${p.base.hp} · ⚔ ${p.base.atk} · 🛡 ${p.base.def}` }));
      return b;
    });
    card(AR.newCharacter, name, h('h2', { text: AR.chooseProfession }), h('div', { class: 'profs' }, opts),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn primary',
          text: AR.create,
          onclick: async () => {
            const r = await api.createCharacter(name.value.trim(), chosen);
            if (!r.ok) return say(tError(r.error));
            showCharacters();
          },
        }),
        h('button', { class: 'btn', onclick: showCharacters, text: AR.back })));
  }

  return { showLogin, showCharacters, showCreate, hide: () => (host.hidden = true), show: () => (host.hidden = false) };
}
