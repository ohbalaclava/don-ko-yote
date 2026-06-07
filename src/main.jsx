import './app.css';
import m from 'mithril';
import { Header } from './components/Header.jsx';
import { Watermark } from './components/Watermark.jsx';
import { Score } from './components/Score.jsx';
import { Palette } from './components/Palette.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { ScoreSettingsModal } from './components/ScoreSettingsModal.jsx';
import { MetronomeSettingsModal } from './components/MetronomeSettingsModal.jsx';
import { MenuSheet } from './components/MenuSheet.jsx';
import { ExportSheet } from './components/ExportSheet.jsx';
import { ImportSheet } from './components/ImportSheet.jsx';
import { NewScoreSheet } from './components/NewScoreSheet.jsx';
import { LoadScoreSheet } from './components/LoadScoreSheet.jsx';
import { HelpSheet } from './components/HelpSheet.jsx';
import { JiuchiPatternsSheet } from './components/JiuchiPatternsSheet.jsx';
import { patternStore } from './data/patterns.js';
import { scoreStore } from './data/scoreStore.js';
import { piece } from './data/piece.js';
import { settings } from './data/settings.js';
import { player } from './audio/player.js';
import { VERSION } from './version.js';

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    scoreStore.save();
  } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault();
    piece.undo();
  } else if (
    (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
    (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
  ) {
    e.preventDefault();
    piece.redo();
  }
});

scoreStore.init();
scoreStore.load();
settings.load();

function App() {
  let scoreActive = false;
  let settingsOpen = false;
  let scoreSettingsOpen = false;
  let metronomeSettingsOpen = false;
  let menuOpen = false;
  let exportSheetOpen = false;
  let importSheetOpen = false;
  let newScoreOpen = false;
  let loadScoreOpen = false;
  let helpOpen = false;
  let jiuchiPatternsOpen = false;

  /**
   * Opens a file picker for JSON import and loads the selected score.
   * @param {(() => void) | undefined} onImported - Called after the score is loaded.
   */
  function openImportJson(onImported) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        scoreStore.importJson(await file.text());
        onImported?.();
        m.redraw();
      }
    };
    input.click();
  }

  /** Opens a file picker for JSON import and merges patterns into the store. */
  function openImportPatterns() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) await patternStore.importJson(await file.text());
    };
    input.click();
  }

  return {
    view() {
      if (!scoreActive) {
        return (
          <div class="flex flex-col h-dvh items-center justify-center p-8">
            <Watermark />
            <button
              class="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              onclick={() => {
                settingsOpen = true;
                m.redraw();
              }}
              title="App settings"
            >
              <img
                src="/assets/image/app-settings.png"
                alt=""
                class="w-[1.25rem] h-[1.25rem] dark:invert"
                aria-hidden="true"
              />
            </button>
            <div class="flex flex-col items-center gap-2 mb-10">
              <img src="/mitsudomoe-badge.svg" class="w-20 h-20 mb-2" aria-hidden="true" />
              <h1 class="text-3xl font-bold dark:text-white">kuchi·shoga</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400">Taiko composition</p>
            </div>
            <div class="flex flex-col w-full max-w-xs gap-3">
              <button
                class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-base font-semibold"
                onclick={() => {
                  newScoreOpen = true;
                  m.redraw();
                }}
              >
                New score
              </button>
              <button
                class="w-full py-3 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-base font-semibold"
                onclick={() => {
                  loadScoreOpen = true;
                  m.redraw();
                }}
              >
                Load score
              </button>
              <button
                class="w-full py-3 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-base font-semibold"
                onclick={() =>
                  openImportJson(() => {
                    scoreActive = true;
                  })
                }
              >
                Import score
              </button>
              {scoreStore.autosaveData ? (
                <div class="mt-2 rounded-xl border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950 p-3">
                  <p class="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    Unsaved work found
                  </p>
                  <p class="text-xs text-amber-600 dark:text-amber-500 mb-2 truncate">
                    {scoreStore.autosaveData.title || 'Untitled'}
                    {' — '}
                    {new Date(scoreStore.autosaveData.savedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                  <div class="flex gap-2">
                    <button
                      class="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold"
                      onclick={() => {
                        scoreStore.loadAutosave();
                        scoreActive = true;
                        m.redraw();
                      }}
                    >
                      Continue
                    </button>
                    <button
                      class="py-2 px-3 rounded-lg border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900"
                      onclick={() => {
                        if (window.confirm('Discard unsaved work?')) {
                          scoreStore.clearAutosave();
                          m.redraw();
                        }
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {newScoreOpen ? (
              <NewScoreSheet
                onClose={() => {
                  newScoreOpen = false;
                  m.redraw();
                }}
                onCreated={() => {
                  scoreStore.clearAutosave();
                  scoreActive = true;
                }}
              />
            ) : null}
            {loadScoreOpen ? (
              <LoadScoreSheet
                onClose={() => {
                  loadScoreOpen = false;
                  m.redraw();
                }}
                onLoaded={() => {
                  scoreActive = true;
                }}
              />
            ) : null}
            {settingsOpen ? (
              <SettingsModal
                onClose={() => {
                  settingsOpen = false;
                  m.redraw();
                }}
              />
            ) : null}
            <p class="absolute bottom-3 text-xs text-gray-400 dark:text-gray-500">v{VERSION}</p>
          </div>
        );
      }

      return (
        <div class={`flex flex-col h-dvh ${piece.selectMode ? 'select-mode' : ''}`}>
          <Watermark />
          <Header
            onSave={() => scoreStore.save()}
            onOpenSettings={() => {
              settingsOpen = true;
            }}
            onOpenScoreSettings={() => {
              scoreSettingsOpen = true;
            }}
            onOpenMetronomeSettings={() => {
              metronomeSettingsOpen = true;
            }}
            onOpenMenu={() => {
              menuOpen = true;
            }}
          />
          <Score />
          <Palette
            onOpenJiuchiPatterns={() => {
              jiuchiPatternsOpen = true;
              m.redraw();
            }}
          />
          {settingsOpen ? (
            <SettingsModal
              onClose={() => {
                settingsOpen = false;
                m.redraw();
              }}
            />
          ) : null}
          {scoreSettingsOpen ? (
            <ScoreSettingsModal
              onClose={() => {
                scoreSettingsOpen = false;
                m.redraw();
              }}
            />
          ) : null}
          {metronomeSettingsOpen ? (
            <MetronomeSettingsModal
              onClose={() => {
                metronomeSettingsOpen = false;
                m.redraw();
              }}
            />
          ) : null}
          {menuOpen ? (
            <MenuSheet
              onClose={() => {
                menuOpen = false;
                m.redraw();
              }}
              onNew={() => {
                newScoreOpen = true;
              }}
              onSave={() => {
                scoreStore.save();
              }}
              onLoad={() => {
                loadScoreOpen = true;
              }}
              onExport={() => {
                exportSheetOpen = true;
                m.redraw();
              }}
              onImport={() => {
                importSheetOpen = true;
                m.redraw();
              }}
              onClear={() => {
                if (window.confirm('Clear all lines?')) {
                  player.stop();
                  piece.clearLines();
                }
              }}
              onHelp={() => {
                helpOpen = true;
              }}
            />
          ) : null}
          {exportSheetOpen ? (
            <ExportSheet
              onClose={() => {
                exportSheetOpen = false;
                m.redraw();
              }}
              onExportJson={() => scoreStore.exportJson()}
              onExportPatterns={() => patternStore.exportJson()}
            />
          ) : null}
          {importSheetOpen ? (
            <ImportSheet
              onClose={() => {
                importSheetOpen = false;
                m.redraw();
              }}
              onImportScore={() => openImportJson()}
              onImportPatterns={() => openImportPatterns()}
            />
          ) : null}
          {newScoreOpen ? (
            <NewScoreSheet
              onClose={() => {
                newScoreOpen = false;
                m.redraw();
              }}
              onCreated={() => {
                scoreStore.clearAutosave();
              }}
            />
          ) : null}
          {loadScoreOpen ? (
            <LoadScoreSheet
              onClose={() => {
                loadScoreOpen = false;
                m.redraw();
              }}
            />
          ) : null}
          {helpOpen ? (
            <HelpSheet
              onClose={() => {
                helpOpen = false;
                m.redraw();
              }}
            />
          ) : null}
          {jiuchiPatternsOpen ? (
            <JiuchiPatternsSheet
              onClose={() => {
                jiuchiPatternsOpen = false;
                m.redraw();
              }}
            />
          ) : null}
        </div>
      );
    },
  };
}

m.mount(document.body, App);
