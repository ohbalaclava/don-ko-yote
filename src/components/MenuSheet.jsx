import m from 'mithril';

function Item() {
  return {
    view({ attrs: { label, sublabel, onclick, danger } }) {
      return m(
        'button',
        {
          class: `w-full flex flex-col text-left px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 active:bg-gray-50 dark:active:bg-gray-800 ${danger ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`,
          onclick,
        },
        [
          m('span', { class: 'font-medium' }, label),
          sublabel
            ? m('span', { class: 'text-xs text-gray-400 dark:text-gray-500 mt-0.5' }, sublabel)
            : null,
        ]
      );
    },
  };
}

export function MenuSheet() {
  return {
    view({ attrs: { onClose, onNew, onSave, onLoad, onExport, onImport, onClear, onHelp } }) {
      function wrap(fn) {
        return () => {
          onClose();
          fn && fn();
        };
      }

      return m(
        'div',
        { class: 'fixed inset-0 z-40 bg-black/50 flex flex-col justify-end', onclick: onClose },
        m(
          'div',
          {
            class:
              'bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto',
            onclick: (e) => e.stopPropagation(),
          },
          [
            m('div', { class: 'flex justify-center pt-3 pb-2' }, [
              m('div', { class: 'w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full' }),
            ]),
            m('div', { class: 'pb-4' }, [
              m(Item, { label: 'New', sublabel: 'Start a fresh score', onclick: wrap(onNew) }),
              m(Item, { label: 'Save', sublabel: 'Save to browser memory', onclick: wrap(onSave) }),
              m(Item, {
                label: 'Load',
                sublabel: 'Load from browser memory',
                onclick: wrap(onLoad),
              }),
              m(Item, {
                label: 'Export',
                sublabel: 'Export as PDF or JSON',
                onclick: () => {
                  onClose();
                  onExport && onExport();
                },
              }),
              m(Item, {
                label: 'Import',
                sublabel: 'Import score or patterns from JSON',
                onclick: () => {
                  onClose();
                  onImport && onImport();
                },
              }),
              m(Item, { label: 'Clear', danger: true, onclick: wrap(onClear) }),
              m(Item, { label: 'Help', onclick: wrap(onHelp) }),
            ]),
          ]
        )
      );
    },
  };
}
