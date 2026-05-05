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
import { HelpSheet } from './components/HelpSheet.jsx';
import { patternStore } from './data/patterns.js';
import { scoreStore } from './data/scoreStore.js';
import { piece } from './data/piece.js';
import { settings } from './data/settings.js';

patternStore.load();
scoreStore.init();
scoreStore.load();
settings.load();

function App() {
  let scoreActive = false;
  let settingsOpen = false;
  let scoreSettingsOpen = false;
  let menuOpen = false;
  let newScoreOpen = false;
  let loadScoreOpen = false;
  let helpOpen = false;

  function openImportJson(onImported) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (file) {
        scoreStore.importJson(await file.text());
        onImported?.();
        m.redraw();
      }
    };
    input.click();
  }

  return {
    view() {
      if (!scoreActive) {
        return (
          <div class="flex flex-col h-dvh items-center justify-center dark:bg-gray-900 p-8">
            <img
              src="/mitsudomoe.svg"
              class="fixed inset-0 m-auto w-[70vmin] h-[70vmin] opacity-5 pointer-events-none -z-10"
              aria-hidden="true"
            />
            <div class="flex flex-col items-center gap-2 mb-10">
              <img src="/mitsudomoe-badge.svg" class="w-20 h-20 mb-2" aria-hidden="true" />
              <h1 class="text-3xl font-bold dark:text-white">don-ko-yote</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400">Taiko sheet music</p>
            </div>
            <div class="flex flex-col w-full max-w-xs gap-3">
              <button
                class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-base font-semibold"
                onclick={() => { newScoreOpen = true; m.redraw(); }}
              >New score</button>
              <button
                class="w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-white text-base font-semibold"
                onclick={() => { loadScoreOpen = true; m.redraw(); }}
              >Load score</button>
              <button
                class="w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-white text-base font-semibold"
                onclick={() => openImportJson(() => { scoreActive = true; })}
              >Import JSON</button>
            </div>
            {newScoreOpen
              ? <NewScoreSheet
                  onClose={() => { newScoreOpen = false; m.redraw(); }}
                  onCreated={() => { scoreActive = true; }}
                />
              : null}
            {loadScoreOpen
              ? <LoadScoreSheet
                  onClose={() => { loadScoreOpen = false; m.redraw(); }}
                  onLoaded={() => { scoreActive = true; }}
                />
              : null}
          </div>
        );
      }

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
                onImportJson={() => openImportJson()}
                onClear={() => {
                  if (window.confirm('Clear all content? This cannot be undone.')) {
                    piece.clearLines();
                  }
                }}
                onHelp={() => { helpOpen = true; }}
              />
            : null}
          {newScoreOpen
            ? <NewScoreSheet onClose={() => { newScoreOpen = false; m.redraw(); }} />
            : null}
          {loadScoreOpen
            ? <LoadScoreSheet onClose={() => { loadScoreOpen = false; m.redraw(); }} />
            : null}
          {helpOpen
            ? <HelpSheet onClose={() => { helpOpen = false; m.redraw(); }} />
            : null}
        </div>
      );
    }
  };
}

m.mount(document.body, App);