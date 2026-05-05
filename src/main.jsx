import './app.css';
import m from 'mithril';
import { Header } from './components/Header.jsx';
import { Score } from './components/Score.jsx';
import { Palette } from './components/Palette.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { ScoreSettingsModal } from './components/ScoreSettingsModal.jsx';
import { MenuSheet } from './components/MenuSheet.jsx';
import { NewScoreSheet } from './components/NewScoreSheet.jsx';
import { LoadScoreSheet } from './components/LoadScoreSheet.jsx';
import { patternStore } from './data/patterns.js';
import { scoreStore } from './data/scoreStore.js';
import { piece } from './data/piece.js';
import { settings } from './data/settings.js';

patternStore.load();
scoreStore.init();
scoreStore.load();
settings.load();

function App() {
  let settingsOpen = false;
  let scoreSettingsOpen = false;
  let menuOpen = false;
  let newScoreOpen = false;
  let loadScoreOpen = false;

  return {
    view() {
      return (
        <div class={`flex flex-col h-dvh dark:bg-gray-900 ${piece.selectMode ? 'select-mode' : ''}`}>
          <img
            src="/mitsudomoe.svg"
            class="fixed inset-0 m-auto w-[70vmin] h-[70vmin] opacity-5 pointer-events-none -z-10"
            aria-hidden="true"
          />
          <Header
            onOpenSettings={() => { settingsOpen = true; }}
            onOpenScoreSettings={() => { scoreSettingsOpen = true; }}
            onOpenMenu={() => { menuOpen = true; }}
          />
          <Score />
          <Palette />
          {settingsOpen
            ? <SettingsModal onClose={() => { settingsOpen = false; m.redraw(); }} />
            : null}
          {scoreSettingsOpen
            ? <ScoreSettingsModal onClose={() => { scoreSettingsOpen = false; m.redraw(); }} />
            : null}
          {menuOpen
            ? <MenuSheet
                onClose={() => { menuOpen = false; m.redraw(); }}
                onNew={() => { newScoreOpen = true; }}
                onSave={() => { scoreStore.save(); }}
                onLoad={() => { loadScoreOpen = true; }}
                onExportJson={() => { scoreStore.exportJson(); }}
                onImportJson={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = async e => {
                    const file = e.target.files[0];
                    if (file) scoreStore.importJson(await file.text());
                  };
                  input.click();
                }}
                onClear={() => {
                  if (window.confirm('Clear all content? This cannot be undone.')) {
                    piece.clearLines();
                  }
                }}
                onHelp={null}
              />
            : null}
          {newScoreOpen
            ? <NewScoreSheet onClose={() => { newScoreOpen = false; m.redraw(); }} />
            : null}
          {loadScoreOpen
            ? <LoadScoreSheet onClose={() => { loadScoreOpen = false; m.redraw(); }} />
            : null}
        </div>
      );
    }
  };
}

m.mount(document.body, App);