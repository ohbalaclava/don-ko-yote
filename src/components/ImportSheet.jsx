import m from 'mithril';

function Item() {
  return {
    view({ attrs: { label, sublabel, onclick } }) {
      return (
        <button
          class="w-full flex flex-col text-left px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 active:bg-gray-50 dark:active:bg-gray-800 text-gray-900 dark:text-white"
          onclick={onclick}
        >
          <span class="font-medium">{label}</span>
          {sublabel ? (
            <span class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sublabel}</span>
          ) : null}
        </button>
      );
    },
  };
}

export function ImportSheet() {
  return {
    view({ attrs: { onClose, onImportScore, onImportPatterns } }) {
      function wrap(fn) {
        return () => {
          onClose();
          fn && fn();
        };
      }

      return (
        <div class="fixed inset-0 z-40 bg-black/50 flex flex-col justify-end" onclick={onClose}>
          <div
            class="bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onclick={(e) => e.stopPropagation()}
          >
            <div class="flex justify-center pt-3 pb-2">
              <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>

            <div class="pb-4">
              <Item label="← Back" onclick={onClose} />
              <Item
                label="Import score"
                sublabel="Load score from JSON file"
                onclick={wrap(onImportScore)}
              />
              <Item
                label="Import patterns"
                sublabel="Add patterns from JSON file"
                onclick={wrap(onImportPatterns)}
              />
            </div>
          </div>
        </div>
      );
    },
  };
}
