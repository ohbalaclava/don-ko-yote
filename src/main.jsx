import './app.css';
import m from 'mithril';
import { Header } from './components/Header.jsx';
import { Score } from './components/Score.jsx';
import { Palette } from './components/Palette.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { patternStore } from './data/patterns.js';
import { piece } from './data/piece.js';
import { settings } from './data/settings.js';

patternStore.load();
settings.load();

function App() {
  let settingsOpen = false;

  return {
    view() {
      return (
        <div class={`flex flex-col h-dvh dark:bg-gray-900 ${piece.selectMode ? 'select-mode' : ''}`}>
          <img
            src="/mitsudomoe.svg"
            class="fixed inset-0 m-auto w-[70vmin] h-[70vmin] opacity-5 pointer-events-none -z-10"
            aria-hidden="true"
          />
          <Header onOpenSettings={() => { settingsOpen = true; }} />
          <Score />
          <Palette />
          {settingsOpen ? <SettingsModal onClose={() => { settingsOpen = false; m.redraw(); }} /> : null}
        </div>
      );
    }
  };
}

m.mount(document.body, App);
